import AppKit
import Combine
import SwiftUI

/// The settings window. An AppKit window, since a menu bar app has no SwiftUI window
/// to open it from (and it should come to the front over whatever app is active).
@MainActor
final class SettingsWindow {
    static let shared = SettingsWindow()
    private var window: NSWindow?

    func show(agent: AgentSession, tab: SettingsView.Tab = .general) {
        if window == nil {
            let window = NSWindow(contentViewController: NSHostingController(rootView: SettingsView(agent: agent)))
            window.title = "Slice Settings"
            window.styleMask = [.titled, .closable]
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
    enum Tab: Hashable { case general, taste, accounts }
    static let selectTab = Notification.Name("SliceSettingsSelectTab")

    let agent: AgentSession
    @State private var tab: Tab = .general

    var body: some View {
        TabView(selection: $tab) {
            GeneralSettings(agent: agent)
                .tabItem { Label("General", systemImage: "gearshape") }
                .tag(Tab.general)
            TasteSettings(agent: agent)
                .tabItem { Label("Taste", systemImage: "heart") }
                .tag(Tab.taste)
            AccountsSettings()
                .tabItem { Label("Accounts", systemImage: "person.crop.circle.badge.checkmark") }
                .tag(Tab.accounts)
        }
        .frame(width: 560, height: 620)
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
                Toggle("Say when something is very you", isOn: $suggest)
                    .onChange(of: suggest) { UserDefaults.standard.set(suggest, forKey: Watchers.suggestKey) }
            } header: {
                Text("Suggestions")
            } footer: {
                Text("When what's playing, or the film, show or book page in front, fits your taste very well, a pill drops from the notch with why. At most once an hour.")
                    .foregroundStyle(.secondary)
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

// MARK: Taste

/// The things the user loves, as Qloo entities, and what Qloo reads from them.
private struct TasteSettings: View {
    let agent: AgentSession

    @State private var city = ""
    @State private var loves: [String] = []
    @State private var query = ""
    @State private var results: [JSONValue] = []
    @State private var busy: String?
    @State private var problem: String?
    @State private var edited = false

    private var profile: JSONValue { agent.profile }

    var body: some View {
        Form {
            Section {
                TextField("City or neighbourhood", text: $city, prompt: Text("Williamsburg, Brooklyn"))
                    .onChange(of: city) { edited = true }
            } header: {
                Text("Where you live")
            } footer: {
                Text("Places are picked around here unless you say otherwise.").foregroundStyle(.secondary)
            }

            Section {
                if loves.isEmpty {
                    Text("Add films, artists, books, places or brands you love. Five is a good start.")
                        .foregroundStyle(.secondary)
                }
                ForEach(loves, id: \.self) { name in
                    HStack {
                        Text(name)
                        Spacer()
                        Button {
                            loves.removeAll { $0 == name }
                            edited = true
                        } label: {
                            Image(systemName: "minus.circle")
                        }
                        .buttonStyle(.borderless)
                    }
                }
                HStack {
                    TextField("Search Qloo", text: $query, prompt: Text("Past Lives, Radiohead, Lilia…"))
                        .onSubmit(search)
                    Button("Search", action: search)
                        .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                ForEach(Array(results.enumerated()), id: \.offset) { _, hit in
                    let name = hit["name"]?.string ?? ""
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(name)
                            Text([hit["kind"]?.string, hit["description"]?.string].compactMap { $0 }.joined(separator: ", "))
                                .font(.callout)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        Button("Add") {
                            if !loves.contains(name) { loves.append(name) }
                            results = []
                            query = ""
                            edited = true
                        }
                    }
                }
                HStack {
                    Button("Add my most played artists from Music", action: importMusic)
                    Spacer()
                    Menu("Try a taste") {
                        ForEach(Self.presets, id: \.name) { preset in
                            Button(preset.name) {
                                loves = preset.loves
                                city = preset.city
                                edited = true
                            }
                        }
                    }
                    .fixedSize()
                    .help("Fill in a ready-made taste, then build it")
                }
            } header: {
                Text("Things you love")
            }

            Section {
                if let summary = profile["summary"]?.string, !summary.isEmpty {
                    Text(summary)
                } else {
                    Text("No taste profile yet.").foregroundStyle(.secondary)
                }
                let tags = profile["tags"]?.array.compactMap { $0["name"]?.string } ?? []
                if !tags.isEmpty {
                    Text(tags.joined(separator: ", "))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                let people = profile["people"]?.object ?? [:]
                let info = profile["people_info"]?.object ?? [:]
                ForEach(people.keys.sorted(), id: \.self) { person in
                    LabeledContent {
                        Text((people[person]?.array ?? []).compactMap { $0["name"]?.string }.joined(separator: ", "))
                    } label: {
                        Text(person)
                        if let about = Self.about(info[person]) {
                            Text(about)
                        }
                    }
                }
                HStack {
                    if let busy { ProgressView().controlSize(.small); Text(busy).foregroundStyle(.secondary) }
                    if let problem { Text(problem).foregroundStyle(.red) }
                    Spacer()
                    Button(profile["summary"] == nil ? "Build my taste profile" : "Update my taste profile", action: build)
                        .disabled(busy != nil || loves.isEmpty)
                        .keyboardShortcut(.defaultAction)
                }
            } header: {
                Text("Your taste, as Qloo reads it")
            } footer: {
                Text("Kept on this Mac. Slice adds to it when you tell it what you or your friends love.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .onAppear(perform: load)
        .onChange(of: agent.profile) { if !edited { load() } }
    }

    /// "Dad, 74, Lincoln Park, step-free" for a saved person.
    static func about(_ info: JSONValue?) -> String? {
        guard let info else { return nil }
        var bits = [info["relation"]?.string?.capitalized, info["home"]?.string].compactMap { $0 }
        if case .number(let age)? = info["age"] { bits.insert("\(Int(age))", at: min(1, bits.count)) }
        if info["step_free"] == .bool(true) { bits.append("step-free") }
        if let birthday = info["birthday"]?.string { bits.append("birthday \(birthday)") }
        return bits.isEmpty ? nil : bits.joined(separator: ", ")
    }

    /// Two very different tastes, so a demo can be re-run to show the answers come from Qloo.
    static let presets: [(name: String, city: String, loves: [String])] = [
        ("Indie, Brooklyn", "Williamsburg, Brooklyn", ["Mitski", "Frank Ocean", "Phoebe Bridgers", "Aftersun", "Lady Bird", "Past Lives"]),
        ("Country, Nashville", "East Nashville, Nashville", ["Morgan Wallen", "Luke Combs", "Yellowstone", "Top Gun: Maverick", "Patagonia", "Zach Bryan"]),
    ]

    private func load() {
        city = profile["city"]?.string ?? ""
        loves = profile["seeds"]?.array.compactMap { $0["name"]?.string } ?? []
        edited = false
    }

    private func search() {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        problem = nil
        Task {
            do {
                results = try await BrainHTTP.get("search", query: ["q": q])["results"]?.array ?? []
                if results.isEmpty { problem = "Qloo has nothing called that." }
            } catch {
                problem = "Can't reach the brain: \(error.localizedDescription)"
            }
        }
    }

    private func build() {
        busy = "Reading your taste…"
        problem = nil
        // People and their notes carry over; seeds and tags are rebuilt from the list.
        var base = profile.object
        base["seeds"] = nil
        base["tags"] = nil
        Task {
            defer { busy = nil }
            do {
                let res = try await BrainHTTP.post("profile/build", body: [
                    "seeds": .array(loves.map(JSONValue.string)), "city": .string(city), "base": .object(base),
                ])
                if let built = res["profile"] {
                    agent.setProfile(built)
                    edited = false
                    load()
                }
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    private func importMusic() {
        busy = "Reading your Music library…"
        Task {
            defer { busy = nil }
            let script = """
            tell application "Music"
                set out to ""
                repeat with t in (get every track of library playlist 1 whose played count > 2)
                    set out to out & (artist of t) & linefeed
                end repeat
                return out
            end tell
            """
            guard let text = await OSAScript.run(script) else {
                problem = "Couldn't read Music. Is Slice allowed to control it (System Settings > Privacy > Automation)?"
                return
            }
            var counts: [String: Int] = [:]
            for artist in text.components(separatedBy: "\n") where !artist.isEmpty { counts[artist, default: 0] += 1 }
            let top = counts.sorted { $0.value > $1.value }.prefix(8).map(\.key)
            if top.isEmpty { problem = "Music has no play history to go on." }
            for name in top where !loves.contains(name) { loves.append(name) }
            edited = true
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
