import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let agent = AgentSession()
    private var island: IslandController?
    private let talkKeys = TalkKeyMonitor()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Light unless the user picked dark in Settings > General (the island stays black).
        Theme.apply()
        island = IslandController(agent: agent)

        talkKeys.onPress = { [agent] in agent.startTalking() }
        talkKeys.onRelease = { [agent] in agent.stopTalking() }
        talkKeys.onCancel = { [agent] in agent.cancelTalking() }
        talkKeys.start()

        #if DEBUG
        // Drawing Settings for a check: no brain connection, so a sample profile stays on screen only.
        let checking = UserDefaults.standard.string(forKey: "renderSettings") != nil
            || UserDefaults.standard.string(forKey: "snapshotWindows") != nil
        #else
        let checking = false
        #endif
        if !checking { agent.connect() }

        #if DEBUG
        // Launch arguments for working on the island without touching it:
        //   -islandPreview open|captioned|compact   pin a mode, with a sample conversation
        //   -ask "…"                                 type this once the brain is connected
        //   -sampleTasks YES                         two sample task cards
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: "sampleTasks") {
            agent.loadSampleTasks()
        }
        //   -sampleViews person|gifts|timeline|map|note|file|why|pill   one rich card (SampleViews)
        if let type = defaults.string(forKey: "sampleViews") {
            agent.loadSampleView(type)
        }
        //   -renderLens <screenshot.jpg> <badges.json> <out.png>         the lens badges over a picture
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-renderLens"), args.count > i + 3 {
            LensOverlay.render(screenshot: URL(fileURLWithPath: args[i + 1]), badgesJSON: URL(fileURLWithPath: args[i + 2]),
                               to: URL(fileURLWithPath: args[i + 3]))
            NSApp.terminate(nil)
        }
        if let mode = defaults.string(forKey: "islandPreview").flatMap(IslandModel.Mode.init(rawValue:)) {
            agent.loadSampleConversation()
            island?.model.preview = mode
        }
        //   -renderIsland /some/dir                   write each island mode as a PNG, then quit
        if let dir = defaults.string(forKey: "renderIsland") {
            if agent.turns.isEmpty { agent.loadSampleConversation() }
            Task { @MainActor in
                // Pictures and maps load first: ImageRenderer can't wait for them.
                await self.agent.prepareForRender()
                try? await Task.sleep(for: .milliseconds(800))
                self.island?.renderPreviews(to: URL(fileURLWithPath: dir))
                NSApp.terminate(nil)
            }
        }
        if let question = defaults.string(forKey: "ask") {
            agent.ask(question, whenOnline: true)
        }
        //   -previewOperator /some/dir                the operator overlay (glow, cursor, pill) as PNGs, then quit
        if let dir = defaults.string(forKey: "previewOperator") {
            Task { @MainActor in
                await AgentCursor.shared.preview(to: URL(fileURLWithPath: dir))
                NSApp.terminate(nil)
            }
        }
        #endif

        #if DEBUG
        //   -renderSettings /some/dir                 the taste graph, memory and onboarding as PNGs, then quit
        if let dir = defaults.string(forKey: "renderSettings") {
            Task { @MainActor in
                await SettingsRender.write(agent: self.agent, to: URL(fileURLWithPath: dir))
                NSApp.terminate(nil)
            }
            return
        }
        //   -snapshotWindows /some/dir                the real Settings and onboarding windows, as drawn
        if let dir = defaults.string(forKey: "snapshotWindows") {
            Task { @MainActor in
                await SettingsRender.snapshotWindows(agent: self.agent, to: URL(fileURLWithPath: dir))
                NSApp.terminate(nil)
            }
            return
        }
        #endif

        // First run: get to know the user's taste (and ask for permissions on the way).
        // Later, a permission that was turned off opens Settings to show what's missing.
        if !TasteStore.isOnboarded(agent.profile) || UserDefaults.standard.bool(forKey: "onboarding") {
            OnboardingWindow.shared.show(agent: agent)
        } else if !Permissions.allGranted {
            SettingsWindow.shared.show(agent: agent)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        talkKeys.stop()
    }
}
