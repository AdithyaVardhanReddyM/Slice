import AppKit
import Combine
import SwiftUI

/// The settings window. An AppKit window, since a menu bar app has no SwiftUI window
/// to open it from (and it should come to the front over whatever app is active).
@MainActor
final class SettingsWindow {
    static let shared = SettingsWindow()
    private var window: NSWindow?

    func show(agent: AgentSession) {
        if window == nil {
            let window = NSWindow(contentViewController: NSHostingController(rootView: SettingsView(agent: agent)))
            window.title = "Slice Settings"
            window.styleMask = [.titled, .closable]
            window.isReleasedWhenClosed = false
            window.center()
            self.window = window
        }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }
}

struct SettingsView: View {
    let agent: AgentSession

    @State private var granted: [Permissions.Kind: Bool] = [:]
    @State private var address = BrainSettings.urlString
    @State private var token = BrainSettings.token ?? ""
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Form {
            Section("Permissions") {
                ForEach(Permissions.Kind.allCases) { kind in
                    PermissionRow(kind: kind, granted: granted[kind] ?? false)
                }
            }
            Section("Talking to Slice") {
                LabeledContent("Talk", value: "Hold fn and control")
                LabeledContent("Type", value: "Hover over the notch")
            }
            Section {
                TextField("Address", text: $address)
                SecureField("Token", text: $token, prompt: Text("Only a hosted brain needs one"))
                HStack {
                    Text(agent.connection.label)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Connect") {
                        BrainSettings.urlString = address.trimmingCharacters(in: .whitespaces)
                        BrainSettings.token = token
                        agent.reconnect()
                    }
                }
            } header: {
                Text("Brain")
            } footer: {
                Text("While developing, run the agent server (pnpm --filter @slice/agent dev) and keep \(BrainSettings.defaultURL).")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 500)
        .fixedSize(horizontal: false, vertical: true)
        .onAppear(perform: refresh)
        .onReceive(tick) { _ in refresh() }
    }

    private func refresh() {
        for kind in Permissions.Kind.allCases {
            let now = Permissions.isGranted(kind)
            if granted[kind] != now { granted[kind] = now }
        }
    }
}

private struct PermissionRow: View {
    let kind: Permissions.Kind
    let granted: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(kind.title)
                Text(kind.reason)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if granted {
                Label("Allowed", systemImage: "checkmark.circle.fill")
                    .labelStyle(.titleAndIcon)
                    .foregroundStyle(.green)
            } else {
                Button("Allow") { Permissions.request(kind) }
            }
        }
    }
}
