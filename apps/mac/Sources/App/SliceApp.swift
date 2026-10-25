import SwiftUI

@main
struct SliceApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        MenuBarExtra {
            MenuBarMenu(agent: delegate.agent)
        } label: {
            Image(nsImage: SliceMark.menuBarImage)
        }
    }
}

private struct MenuBarMenu: View {
    let agent: AgentSession

    var body: some View {
        Text(agent.connection.label)
        Divider()
        Button("New conversation") { agent.reset() }
        Button("Your taste…") { SettingsWindow.shared.show(agent: agent, tab: .taste) }
        Button("Memory…") { SettingsWindow.shared.show(agent: agent, tab: .memory) }
        Button("Settings…") { SettingsWindow.shared.show(agent: agent) }
            .keyboardShortcut(",")
        Divider()
        Button("Quit Slice") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }
}
