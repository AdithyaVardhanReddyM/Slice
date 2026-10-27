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
            window.styleMask = [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView]
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.backgroundColor = NSColor(name: nil) { appearance in
                appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? NSColor(hex: 0x0A0D14) : NSColor(hex: 0xF3F6FB)
            }
            window.setContentSize(NSSize(width: 1180, height: 780))
            window.contentMinSize = NSSize(width: 980, height: 640)
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
        case general, taste, accounts
        var id: Self { self }

        var title: String {
            switch self {
            case .general: "General"
            case .taste: "You"
            case .accounts: "Integrations"
            }
        }

        /// Its glossy icon (Assets > Glossy).
        var icon: String {
            switch self {
            case .general: "gear"
            case .taste: "heart"
            case .accounts: "apps"
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
        HStack(spacing: 0) {
            SettingsSidebar(agent: agent, tab: $tab)
                .frame(width: 240)
            Rectangle().fill(Sky.line).frame(width: 1)
            Group {
                switch tab {
                case .general: GeneralSettings(agent: agent)
                case .taste: TasteSpace(agent: agent)
                case .accounts: IntegrationsSpace()
                }
            }
            .padding(.top, 18)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Sky.canvas)
        }
        .ignoresSafeArea()
        .foregroundStyle(Sky.ink)
        .frame(minWidth: 980, minHeight: 640)
        .onReceive(NotificationCenter.default.publisher(for: Self.selectTab)) { note in
            if let tab = note.object as? Tab { self.tab = tab }
        }
    }
}

// MARK: Sidebar

private struct SettingsSidebar: View {
    let agent: AgentSession
    @Binding var tab: SettingsView.Tab

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 9) {
                SliceMark(height: 16)
                Text("Slice").font(.system(size: 17, weight: .bold)).tracking(-0.3)
            }
            .padding(.horizontal, 8)
            .padding(.top, 52)
            .padding(.bottom, 16)
            profile
                .padding(.bottom, 16)
            ForEach(SettingsView.Tab.allCases) { item in
                NavRow(tab: item, selected: tab == item) { withAnimation(.snappy(duration: 0.25)) { tab = item } }
            }
            Spacer()
            talkHint
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 16)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(alignment: .top) {
            ZStack(alignment: .top) {
                Sky.card
                SkyMesh(mood: .sky).frame(height: 260)
            }
        }
    }

    private var profile: some View {
        let name = agent.profile["name"]?.string ?? ""
        let home = agent.profile["city"]?.string
        return HStack(spacing: 11) {
            Avatar(seed: name.isEmpty ? TasteStore.userID : name, size: 44)
            VStack(alignment: .leading, spacing: 1) {
                Text(Self.greeting).font(.system(size: 11.5)).foregroundStyle(Sky.ink2)
                Text(name.isEmpty ? "Welcome" : name).font(.system(size: 15, weight: .bold)).lineLimit(1)
                if let home, !home.isEmpty {
                    Label(home, systemImage: "mappin")
                        .font(.system(size: 11))
                        .foregroundStyle(Sky.ink2)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .skyCard(radius: 18)
    }

    private var talkHint: some View {
        VStack(alignment: .leading, spacing: 8) {
            TalkKeys(keySize: 36)
                .frame(height: 104)
            Text("Hold to talk, or hover over the notch to type.")
                .font(.system(size: 11.5))
                .foregroundStyle(Sky.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Sky.canvas))
    }

    static var greeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5..<12: "Good morning,"
        case 12..<18: "Good afternoon,"
        default: "Good evening,"
        }
    }
}

private struct NavRow: View {
    let tab: SettingsView.Tab
    let selected: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 11) {
                Glossy(tab.icon).frame(width: 26, height: 26)
                Text(tab.title).font(.system(size: 14, weight: selected ? .semibold : .medium))
                Spacer()
            }
            .foregroundStyle(selected ? Sky.ink : Sky.ink2)
            .padding(.horizontal, 10)
            .frame(height: 42)
            .background(RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(selected ? Sky.accentSoft : (hovering ? Sky.fill : .clear)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

// MARK: A page and its cards

private struct SettingsPage<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var content: Content
    @Environment(\.renderingForPreview) private var rendering

    var body: some View {
        let page = VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.system(size: 28, weight: .bold)).tracking(-0.6)
                Text(subtitle).font(.system(size: 14)).foregroundStyle(Sky.ink2)
            }
            content
        }
        .padding(.horizontal, 28)
        .padding(.top, 22)
        .padding(.bottom, 28)
        .frame(maxWidth: 940, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        if rendering { page.frame(maxHeight: .infinity, alignment: .top) } else { ScrollView { page }.scrollIndicators(.never) }
    }
}

private struct SettingsCard<Content: View>: View {
    let icon: String
    let title: String
    var subtitle: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                IconTile(icon: icon, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 15.5, weight: .semibold))
                    if let subtitle { Text(subtitle).font(.system(size: 12.5)).foregroundStyle(Sky.ink2) }
                }
            }
            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .skyCard(radius: 22)
    }
}

// MARK: General

private struct GeneralSettings: View {
    let agent: AgentSession

    @State private var statuses: [Permissions.Kind: Permissions.Status] = [:]
    @State private var suggest = Watchers.suggestVeryYou
    @State private var learn = Watchers.learnFromPlays
    @State private var useTaste = true
    @State private var address = BrainSettings.urlString
    @State private var token = BrainSettings.token ?? ""
    @State private var appearance = Theme.current
    @State private var home: HomePicker
    @State private var savingHome = false
    @State private var problem: String?
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(agent: AgentSession) {
        self.agent = agent
        _home = State(initialValue: HomePicker(place: HomePicker.saved(agent.profile)))
    }

    var body: some View {
        SettingsPage(title: "General", subtitle: "How Slice looks, what it can use, and where it lives.") {
            HStack(alignment: .top, spacing: 16) {
                SettingsCard(icon: "screen", title: "Look", subtitle: "Slice is light unless you pick dark.") {
                    HStack(spacing: 14) {
                        ForEach(Appearance.allCases) { option in
                            AppearanceOption(option: option, selected: appearance == option) {
                                appearance = option
                                Theme.apply(option)
                            }
                        }
                    }
                }
                SettingsCard(icon: "mic", title: "Talking to Slice", subtitle: "From any app, any time.") {
                    VStack(alignment: .leading, spacing: 12) {
                        TalkKeys(keySize: 48)
                            .frame(height: 140)
                        Text("Hold both, say what you need, let go. Or hover over the notch to type.")
                            .font(.system(size: 12.5)).foregroundStyle(Sky.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(width: 330)
            }
            SettingsCard(icon: "pin", title: "Home", subtitle: "Places, walks and plans start from here.") {
                HStack(alignment: .top, spacing: 18) {
                    HomeCard(place: home.place, name: agent.profile["name"]?.string ?? "", size: CGSize(width: 440, height: 320)) { home.choose(named: $0) }
                    VStack(alignment: .leading, spacing: 10) {
                        HomePickerPanel(picker: home, suggestions: Array(HomeStep.suggestions.prefix(4)))
                        if savingHome {
                            HStack(spacing: 6) { ProgressView().controlSize(.mini); Text("Saving").font(.system(size: 12)).foregroundStyle(Sky.ink2) }
                        }
                    }
                }
            }
            .onChange(of: home.place) { saveHome() }
            SettingsCard(icon: "shield", title: "Permissions", subtitle: "What Slice can use on this Mac. Change any of them here.") {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(Permissions.listed) { kind in
                        PermissionCard(kind: kind, status: statuses[kind] ?? .notYet, compact: true)
                    }
                }
            }
            SettingsCard(icon: "heart", title: "Taste", subtitle: useTaste ? "Every pick comes from Qloo's taste graph and what Slice knows about you."
                                                                           : "Taste is off: Slice answers with the popular picks anyone would get, and says so.") {
                VStack(spacing: 0) {
                    ToggleRow(title: "Use my taste", detail: "Turn it off to see how a plain assistant answers the same thing.", isOn: $useTaste)
                        .onChange(of: useTaste) { if useTaste != agent.useTaste { agent.setUseTaste(useTaste) } }
                    Divider().overlay(Sky.line)
                    ToggleRow(title: "Learn from what I play and watch", detail: "It adds up in Memory, and Slice asks before adding anything to your taste.", isOn: $learn)
                        .onChange(of: learn) { UserDefaults.standard.set(learn, forKey: Watchers.learnKey) }
                    Divider().overlay(Sky.line)
                    ToggleRow(title: "Say when something is very you", detail: "A pill drops from the notch when what's playing or open fits you very well, at most once an hour.", isOn: $suggest)
                        .onChange(of: suggest) { UserDefaults.standard.set(suggest, forKey: Watchers.suggestKey) }
                    Divider().overlay(Sky.line)
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Get to know me again").font(.system(size: 13.5, weight: .semibold))
                            Text("Run the setup from the start: picks, questions and permissions.").font(.system(size: 12)).foregroundStyle(Sky.ink2)
                        }
                        Spacer()
                        Button("Start setup") {
                            // From the start, as it says: not where an earlier setup was left.
                            TasteStore.clearOnboarding()
                            OnboardingWindow.shared.show(agent: agent)
                        }
                        .buttonStyle(SecondaryButton(symbol: "arrow.counterclockwise", compact: true))
                    }
                    .padding(.vertical, 12)
                }
            }
            SettingsCard(icon: "apps", title: "Brain", subtitle: "Where Slice thinks. While developing, run the agent server and keep \(BrainSettings.localURL).") {
                VStack(alignment: .leading, spacing: 10) {
                    SkyField(placeholder: "Address", text: $address, symbol: "network")
                    SkyField(placeholder: "Token (only a hosted brain needs one)", text: $token, symbol: "key", secure: true)
                    HStack {
                        StatusPill(text: agent.connection.label, color: agent.connection == .online ? Sky.good : (agent.connection == .connecting ? Sky.warn : Sky.bad))
                        Spacer()
                        Button("Connect") {
                            BrainSettings.urlString = address.trimmingCharacters(in: .whitespaces)
                            BrainSettings.token = token
                            agent.reconnect()
                        }
                        .buttonStyle(PrimaryButton(arrow: false, compact: true))
                    }
                }
            }
            if let problem {
                Text(problem).font(.system(size: 12.5)).foregroundStyle(Sky.bad)
            }
        }
        .onAppear {
            useTaste = agent.useTaste
            refresh()
        }
        .onReceive(tick) { _ in refresh() }
    }

    private func refresh() {
        for kind in Permissions.listed {
            let now = Permissions.status(kind)
            if statuses[kind] != now { statuses[kind] = now }
        }
    }

    /// A new home from the map goes into the profile with its exact point.
    private func saveHome() {
        guard let place = home.place, let point = home.json,
              place.name != agent.profile["city"]?.string || HomePicker.saved(agent.profile) != place else { return }
        savingHome = true
        problem = nil
        Task {
            defer { savingHome = false }
            do {
                agent.setProfile(try await TasteStore.edit(agent.profile, op: "city", ["city": .string(place.name), "home": point]))
            } catch {
                problem = "Couldn't save your home: \(error.localizedDescription)"
            }
        }
    }
}

/// A mini window in light or dark, picked like the system's own appearance setting.
private struct AppearanceOption: View {
    let option: Appearance
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let dark = option == .dark
        Button(action: action) {
            VStack(spacing: 9) {
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(hex: dark ? 0x131823 : 0xFFFFFF))
                    LinearGradient(colors: SkyMood.sky.colors(dark: dark).prefix(3).map { $0 }, startPoint: .leading, endPoint: .trailing)
                        .frame(height: 30)
                        .mask(LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom))
                    VStack(alignment: .leading, spacing: 5) {
                        RoundedRectangle(cornerRadius: 3).fill(Color(hex: dark ? 0xF1F4FA : 0x0D1220)).frame(width: 56, height: 7)
                        RoundedRectangle(cornerRadius: 3).fill(Color(hex: dark ? 0x6A7388 : 0x98A1B3)).frame(width: 84, height: 5)
                        HStack(spacing: 5) {
                            ForEach(0..<3, id: \.self) { _ in
                                RoundedRectangle(cornerRadius: 5).fill(Color(hex: dark ? 0x1B2131 : 0xF3F6FB)).frame(width: 30, height: 22)
                            }
                        }
                        .padding(.top, 3)
                    }
                    .padding(12)
                    .padding(.top, 6)
                }
                .frame(width: 140, height: 92)
                // The sky strip is a plain rectangle: without this its square corners show past the border.
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(selected ? Sky.accent : Sky.line, lineWidth: selected ? 2.5 : 1))
                .shadow(color: Sky.shadow, radius: 8, y: 4)
                HStack(spacing: 6) {
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(selected ? Sky.accent : Sky.ink3)
                    Text(option.title).font(.system(size: 13, weight: selected ? .semibold : .medium))
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private struct ToggleRow: View {
    let title: String
    let detail: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13.5, weight: .semibold))
                Text(detail).font(.system(size: 12)).foregroundStyle(Sky.ink2).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .toggleStyle(.switch)
        .tint(Sky.accent)
        .padding(.vertical, 12)
    }
}
