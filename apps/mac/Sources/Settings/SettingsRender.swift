#if DEBUG
import AppKit
import SwiftUI

/// -renderSettings <dir>: the taste graph, memory and every onboarding step as PNGs, drawn with
/// ImageRenderer (the screen can't be captured from here). Needs the brain running for the
/// graph and the onboarding tiles. -renderProfile <taste.json> draws another profile.
@MainActor
enum SettingsRender {
    static func write(agent: AgentSession, to dir: URL) async {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let path = UserDefaults.standard.string(forKey: "renderProfile"),
           let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
           let profile = try? JSONDecoder().decode(JSONValue.self, from: data) {
            agent.useProfileForRender(profile)
        }
        let graph = (try? await BrainHTTP.post("profile/graph", body: ["profile": agent.profile])) ?? .null
        let (nodes, edges) = TasteSpace.parse(graph)
        let model = OnboardingModel(agent: agent)
        await model.prepareForRender()
        for url in Set(nodes.compactMap(\.image) + model.renderImages + memoryImages(agent.profile)) { _ = await ImageCache.load(url) }

        func taste(_ selection: String?) -> TasteSpace {
            let layout = GraphLayout()
            layout.update(nodes: nodes, edges: edges, animate: false)
            return TasteSpace(agent: agent, layout: layout, selection: selection)
        }
        let detail = CGSize(width: 1000, height: 760)
        render(taste(nil), size: detail, to: dir.appendingPathComponent("taste.png"))
        if let love = nodes.first(where: { $0.style == .love }) {
            render(taste(love.id), size: detail, to: dir.appendingPathComponent("taste-love.png"))
        }
        if let pick = nodes.first(where: { $0.style == .pick }) {
            render(taste(pick.id), size: detail, to: dir.appendingPathComponent("taste-pick.png"))
        }
        let memory = GraphLayout()
        let (mNodes, mEdges) = MemorySpace.graph(agent.profile)
        memory.update(nodes: mNodes, edges: mEdges, animate: false)
        render(MemorySpace(agent: agent, layout: memory), size: detail, to: dir.appendingPathComponent("memory.png"))
        if let person = mNodes.first(where: { $0.style == .person }) {
            render(MemorySpace(agent: agent, layout: memory, selection: person.id), size: detail, to: dir.appendingPathComponent("memory-person.png"))
        }
        for step in OnboardingModel.Step.allCases {
            model.step = step
            render(OnboardingView(model: model, close: {}), size: OnboardingView.size,
                   to: dir.appendingPathComponent("onboarding-\(step.rawValue)-\(step).png"))
        }
    }

    /// The real windows (text fields, scroll views and all), each captured from inside the app.
    static func snapshotWindows(agent: AgentSession, to dir: URL) async {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let path = UserDefaults.standard.string(forKey: "renderProfile"),
           let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
           let profile = try? JSONDecoder().decode(JSONValue.self, from: data) {
            agent.useProfileForRender(profile)
        }
        for tab in SettingsView.Tab.allCases {
            SettingsWindow.shared.show(agent: agent, tab: tab)
            try? await Task.sleep(for: .seconds(tab == .taste || tab == .accounts ? 7 : 3))
            snapshot(SettingsWindow.shared.window, to: dir.appendingPathComponent("window-settings-\(tab.rawValue).png"))
        }
        SettingsWindow.shared.window?.close()
        OnboardingWindow.shared.show(agent: agent)
        try? await Task.sleep(for: .seconds(2))
        if let model = OnboardingWindow.shared.model {
            await model.prepareForRender()
            for step in OnboardingModel.Step.allCases {
                model.step = step
                try? await Task.sleep(for: .seconds(step == .music || step == .screen ? 3 : 1))
                snapshot(OnboardingWindow.shared.window, to: dir.appendingPathComponent("window-onboarding-\(step.rawValue)-\(step).png"))
            }
        }
    }

    private static func snapshot(_ window: NSWindow?, to url: URL) {
        guard let view = window?.contentView?.superview ?? window?.contentView,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
        view.cacheDisplay(in: view.bounds, to: rep)
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
    }

    private static func memoryImages(_ profile: JSONValue) -> [String] {
        let rows = (profile["suggested"]?.array ?? []) + (profile["dislikes"]?.array ?? []) + Array((profile["evidence"]?.object ?? [:]).values)
        return rows.compactMap { $0["image"]?.string }
    }

    static func render<V: View>(_ view: V, size: CGSize, to url: URL) {
        let content = view
            .frame(width: size.width, height: size.height)
            .background(Color(nsColor: .windowBackgroundColor))
            .environment(\.renderingForPreview, true)
        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        if let image = renderer.nsImage, let tiff = image.tiffRepresentation,
           let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
            try? png.write(to: url)
        }
    }
}
#endif
