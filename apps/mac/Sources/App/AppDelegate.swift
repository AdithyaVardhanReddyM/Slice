import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let agent = AgentSession()
    private var island: IslandController?
    private let talkKeys = TalkKeyMonitor()

    func applicationDidFinishLaunching(_ notification: Notification) {
        island = IslandController(agent: agent)

        talkKeys.onPress = { [agent] in agent.startTalking() }
        talkKeys.onRelease = { [agent] in agent.stopTalking() }
        talkKeys.onCancel = { [agent] in agent.cancelTalking() }
        talkKeys.start()

        agent.connect()

        #if DEBUG
        // Launch arguments for working on the island without touching it:
        //   -islandPreview open|captioned|compact   pin a mode, with a sample conversation
        //   -ask "…"                                 type this once the brain is connected
        let defaults = UserDefaults.standard
        if let mode = defaults.string(forKey: "islandPreview").flatMap(IslandModel.Mode.init(rawValue:)) {
            agent.loadSampleConversation()
            island?.model.preview = mode
        }
        if let question = defaults.string(forKey: "ask") {
            agent.ask(question, whenOnline: true)
        }
        #endif

        // First run, or a permission was turned off: show what's missing.
        if !Permissions.allGranted {
            SettingsWindow.shared.show(agent: agent)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        talkKeys.stop()
    }
}
