import AppKit
import Combine
import SwiftUI

/// The settings window. An AppKit window, since a menu bar app has no SwiftUI window
/// to open it from (and it should come to the front over whatever app is active).
@MainActor
final class SettingsWindow {
    static let shared = SettingsWindow()
    private(set) var window: NSWindow?

    func show(agent: AgentSession, tab: SettingsView.Tab = .general) {
        if window == nil {
            let window = NSWindow(contentViewController: NSHostingController(rootView: SettingsView(agent: agent, initial: tab)))
            window.title = "Slice Settings"
            window.styleMask = [.titled, .closable, .resizable, .miniaturizable]
            window.setContentSize(NSSize(width: 1180, height: 760))
            window.contentMinSize = NSSize(width: 900, height: 600)
            window.isReleasedWhenClosed = false
            window.center()
            self.window = window
        }
        NotificationCenter.default.post(name: SettingsView.selectTab, object: tab)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }
}

struct SettingsView: View {
    enum Tab: String, Hashable, CaseIterable, Identifiable {
        case general, taste, memory, accounts
        var id: Self { self }

        var title: String {
            switch self {
            case .general: "General"
            case .taste: "Your taste"
            case .memory: "Memory"
            case .accounts: "Accounts"
            }
        }

        var symbol: String {
            switch self {
            case .general: "gearshape"
            case .taste: "heart.circle"
            case .memory: "brain.head.profile"
            case .accounts: "person.crop.circle.badge.checkmark"
            }
        }
    }

    static let selectTab = Notification.Name("SliceSettingsSelectTab")

    let agent: AgentSession
    @State private var tab: Tab

    init(agent: AgentSession, initial: Tab = .general) {
        self.agent = agent
        _tab = State(initialValue: initial)
    }

    var body: some View {
        NavigationSplitView {
            List(Tab.allCases, selection: $tab) { tab in
                Label(tab.title, systemImage: tab.symbol).tag(tab)
            }
            .navigationSplitViewColumnWidth(min: 170, ideal: 180, max: 220)
        } detail: {
            switch tab {
            case .general: GeneralSettings(agent: agent)
            case .taste: TasteSpace(agent: agent)
            case .memory: MemorySpace(agent: agent)
            case .accounts: AccountsSettings()
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .onReceive(NotificationCenter.default.publisher(for: Self.selectTab)) { note in
            if let tab = note.object as? Tab { self.tab = tab }
        }
    }
}

// MARK: General

private struct GeneralSettings: View {
    let agent: AgentSession

    @State private var granted: [Permissions.Kind: Bool] = [:]
    @State private var suggest = Watchers.suggestVeryYou
    @State private var learn = Watchers.learnFromPlays
    @State private var useTaste = true
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
                Toggle("Use my taste", isOn: $useTaste)
                    .onChange(of: useTaste) { if useTaste != agent.useTaste { agent.setUseTaste(useTaste) } }
                Toggle("Learn from what I play and watch", isOn: $learn)
                    .onChange(of: learn) { UserDefaults.standard.set(learn, forKey: Watchers.learnKey) }
                Toggle("Say when something is very you", isOn: $suggest)
                    .onChange(of: suggest) { UserDefaults.standard.set(suggest, forKey: Watchers.suggestKey) }
                HStack {
                    Text("Get to know me again")
                    Spacer()
                    Button("Start setup") { OnboardingWindow.shared.show(agent: agent) }
                }
            } header: {
                Text("Taste")
            } footer: {
                Text(useTaste
                     ? "Every pick comes from Qloo's taste graph and what Slice knows about you. Turn it off to see how a plain assistant answers the same thing. What you play and watch adds up in Memory, and Slice asks before adding anything to your taste. A pill can also drop from the notch when something fits you very well, at most once an hour."
                     : "Taste is off: Slice answers with the popular picks anyone would get, and says so. Turn it back on to compare.")
                    .foregroundStyle(useTaste ? Color.secondary : Color.orange)
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
                Text("While developing, run the agent server (pnpm --filter @slice/agent dev) and keep \(BrainSettings.localURL).")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .onAppear {
            useTaste = agent.useTaste
            refresh()
        }
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

// MARK: Accounts

/// Cloud accounts through Composio (the brain's /mac/accounts routes).
private struct AccountsSettings: View {
    @State private var apps: [(slug: String, name: String)] = []
    @State private var connected: [String: Bool] = [:]
    @State private var problem: String?
    @State private var waitingFor: String?
    private let tick = Timer.publish(every: 3, on: .main, in: .common).autoconnect()

    var body: some View {
        Form {
            Section {
                if apps.isEmpty, problem == nil {
                    HStack { ProgressView().controlSize(.small); Text("Checking your accounts…").foregroundStyle(.secondary) }
                }
                ForEach(apps, id: \.slug) { app in
                    HStack {
                        Text(app.name)
                        Spacer()
                        if connected[app.slug] == true {
                            Label("Connected", systemImage: "checkmark.circle.fill")
                                .labelStyle(.titleAndIcon)
                                .foregroundStyle(.green)
                        } else if waitingFor == app.slug {
                            Text("Finish signing in in your browser").foregroundStyle(.secondary)
                        } else {
                            Button("Connect") { connect(app.slug) }
                        }
                    }
                }
                if let problem { Text(problem).foregroundStyle(.red) }
            } header: {
                Text("Your accounts")
            } footer: {
                Text("Sign-in goes through Composio; Slice never sees your passwords. Slice asks before it sends, posts or changes anything.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .task { await refresh() }
        .onReceive(tick) { _ in if waitingFor != nil { Task { await refresh() } } }
    }

    private func refresh() async {
        do {
            let res = try await BrainHTTP.get("accounts", query: ["user": TasteStore.userID])
            let names = res["apps"]?.object ?? [:]
            apps = names.keys.sorted().map { ($0, names[$0]?.string ?? $0) }
            connected = (res["connected"]?.object ?? [:]).mapValues { $0 == .bool(true) }
            if let waiting = waitingFor, connected[waiting] == true { waitingFor = nil }
            problem = res["error"]?.string
        } catch {
            problem = "Can't reach the brain: \(error.localizedDescription)"
        }
    }

    private func connect(_ slug: String) {
        Task {
            do {
                let res = try await BrainHTTP.post("accounts/connect", body: ["user": .string(TasteStore.userID), "app": .string(slug)])
                if let link = res["url"]?.string, let url = URL(string: link) {
                    waitingFor = slug
                    NSWorkspace.shared.open(url)
                }
            } catch {
                problem = error.localizedDescription
            }
        }
    }
}
