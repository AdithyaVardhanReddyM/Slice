import AppKit
import Combine
import SwiftUI

/// Settings > Integrations: the apps Slice reads and acts in (the brain's catalog, accounts.py).
/// Cloud apps sign in through Composio (/mac/accounts routes); Reminders and Notes are on this
/// Mac and only need macOS's permission. Laid out like polly-ai's Integrations page: search,
/// filter pills, a card per app grouped by what it's for, and a side panel for one app.
struct IntegrationsSpace: View {
    @State private var model = IntegrationsModel()
    @State private var query = ""
    @State private var filter = "all"
    @Environment(\.renderingForPreview) private var rendering
    private let tick = Timer.publish(every: IntegrationsModel.pollEvery, on: .main, in: .common).autoconnect()
    /// SettingsView pads every tab this much from the top; the scrim and the panel reach over it.
    private static let tabInset: CGFloat = 18

    var body: some View {
        ZStack(alignment: .trailing) {
            if rendering { page.frame(maxHeight: .infinity, alignment: .top) } else { ScrollView { page }.scrollIndicators(.never) }
            if let open = model.open {
                Color.black.opacity(0.16)
                    .padding(.top, -Self.tabInset)
                    .contentShape(Rectangle())
                    .onTapGesture { model.openSlug = nil }
                    .transition(.opacity)
                IntegrationDetail(app: open, model: model, group: model.label(of: open.group)) { model.openSlug = nil }
                    .padding(.top, -Self.tabInset)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.25), value: model.openSlug)
        .task {
            await model.load()
#if DEBUG
            // -integrationsOpen <slug>: start with that app's panel open (for -snapshotWindows).
            if let slug = UserDefaults.standard.string(forKey: "integrationsOpen") { model.openSlug = slug }
#endif
        }
        .onReceive(tick) { _ in Task { await model.tick() } }
    }

    private var page: some View {
        VStack(alignment: .leading, spacing: 22) {
            header
            if model.loaded, !model.configured { KeyBanner(key: model.keyName) }
            if let problem = model.problem {
                Label(problem, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Sky.bad)
            }
            BuiltInTaste()
            if !model.apps.isEmpty { filters }
            if !model.loaded {
                HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Checking your apps").foregroundStyle(Sky.ink2) }
            }
            list
            footer
        }
        .padding(.horizontal, 28)
        .padding(.top, 22)
        .padding(.bottom, 28)
        .frame(maxWidth: 980, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Integrations").font(.system(size: 28, weight: .bold)).tracking(-0.6)
                Text("Connect your apps once. Slice reads them to help you, and asks before it sends or changes anything.")
                    .font(.system(size: 14))
                    .foregroundStyle(Sky.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 12)
            SkyField(placeholder: "Search apps", text: $query, symbol: "magnifyingglass")
                .frame(width: 230)
        }
    }

    private var filters: some View {
        HStack(spacing: 2) {
            FilterPill(title: "All apps", count: model.apps.count, on: filter == "all") { filter = "all" }
            FilterPill(title: "Connected", count: model.apps.filter(\.isOn).count, on: filter == "connected") { filter = "connected" }
            Rectangle().fill(Sky.line).frame(width: 1, height: 16).padding(.horizontal, 8)
            ForEach(model.groups) { group in
                FilterPill(title: group.label, on: filter == group.id) { filter = group.id }
            }
        }
    }

    private var shown: [IntegrationApp] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return model.apps.filter { app in
            if !q.isEmpty, !"\(app.name) \(app.blurb) \(app.slug)".lowercased().contains(q) { return false }
            switch filter {
            case "all": return true
            case "connected": return app.isOn || app.status == .expired
            default: return app.group == filter
            }
        }
    }

    /// Browsing everything reads best by group; a search or a filter is one flat list.
    @ViewBuilder private var list: some View {
        let shown = self.shown
        if model.loaded, !model.apps.isEmpty, shown.isEmpty {
            Text(filter == "connected" && query.isEmpty ? "Nothing connected yet. Pick an app to get started." : "No apps match that.")
                .font(.system(size: 13.5))
                .foregroundStyle(Sky.ink2)
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity)
        } else if filter == "all", query.trimmingCharacters(in: .whitespaces).isEmpty {
            ForEach(model.groups) { group in
                let apps = shown.filter { $0.group == group.id }
                if !apps.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(group.label).font(.system(size: 17, weight: .bold)).tracking(-0.3)
                            Text("\(apps.count)").font(.system(size: 13, weight: .medium)).foregroundStyle(Sky.ink3)
                        }
                        grid(apps)
                    }
                }
            }
        } else {
            grid(shown)
        }
    }

    private func grid(_ apps: [IntegrationApp]) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 12, alignment: .top)], spacing: 12) {
            ForEach(apps) { app in
                IntegrationCard(app: app, usable: app.onMac || model.configured, pending: model.pending[app.slug] != nil,
                                open: { model.openSlug = app.slug },
                                connect: { Task { await model.connect(app) } },
                                cancel: { model.pending[app.slug] = nil })
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Sign-ins run through Composio, so Slice never sees your passwords or tokens. You can disconnect an app at any time.",
                  systemImage: "lock.fill")
                .font(.system(size: 12))
                .foregroundStyle(Sky.ink3)
            Text("Avatars are \u{201C}Dylan\u{201D} by Natalia Spivak (CC BY 4.0), drawn by DiceBear.")
                .font(.system(size: 11))
                .foregroundStyle(Sky.ink3)
        }
        .padding(.top, 4)
    }
}

// MARK: Model

struct IntegrationApp: Identifiable, Equatable {
    enum Status: Equatable {
        // Cloud apps (Composio)
        case connected, expired, available
        // Reminders and Notes (macOS permission)
        case allowed, notAsked, denied
    }

    struct Ability: Equatable, Hashable {
        let text: String
        let asks: Bool
    }

    let slug: String
    let name: String
    let group: String
    let blurb: String
    let say: String
    let onMac: Bool
    let can: [Ability]
    var status: Status
    var since: Date?

    var id: String { slug }
    /// Usable right now.
    var isOn: Bool { status == .connected || status == .allowed }
    /// Who the user signs in with.
    var provider: String { slug.hasPrefix("google") || slug == "gmail" ? "Google" : name }
    var subline: String { onMac ? "On this Mac" : "\(provider) sign-in" }
    /// The app it lives in on this Mac; its real icon is the logo.
    var macApp: String? { onMac ? "/System/Applications/\(name).app" : nil }
    /// Its System Settings > Privacy & Security pane.
    var privacyAnchor: String { slug == "reminders" ? "Privacy_Reminders" : "Privacy_Automation" }
}

struct IntegrationGroup: Identifiable, Equatable {
    let id: String
    let label: String
}

@MainActor @Observable
final class IntegrationsModel {
    struct Pending {
        var url: URL?
        let since: Date
    }

    static let pollEvery: TimeInterval = 2.5
    static let giveUpAfter: TimeInterval = 5 * 60

    var apps: [IntegrationApp] = []
    var groups: [IntegrationGroup] = []
    var configured = true
    var keyName = "COMPOSIO_MAC_API_KEY"
    var loaded = false
    var problem: String?
    /// Sign-ins open in the browser, by app.
    var pending: [String: Pending] = [:]
    /// The last thing that went wrong for an app, shown in its panel.
    var notes: [String: String] = [:]
    var disconnecting: Set<String> = []
    var openSlug: String?

    var open: IntegrationApp? { apps.first { $0.slug == openSlug } }

    func label(of group: String) -> String { groups.first { $0.id == group }?.label ?? "" }

    func load() async {
        do {
            let res = try await BrainHTTP.get("accounts", query: ["user": TasteStore.userID])
            apply(res)
            problem = res["error"]?.string
        } catch {
            problem = "Can't reach the brain: \(error.localizedDescription)"
        }
        loaded = true
        await refreshMac()
    }

    /// Every few seconds: ask the brain again while a sign-in is open, and re-read macOS's answers.
    func tick() async {
        let now = Date()
        pending = pending.filter { now.timeIntervalSince($0.value.since) < Self.giveUpAfter }
        if pending.isEmpty { await refreshMac() } else { await load() }
    }

    private func apply(_ res: JSONValue) {
        configured = res["configured"]?.bool ?? false
        keyName = res["key"]?.string ?? keyName
        groups = (res["groups"]?.array ?? []).compactMap { g in
            g["id"]?.string.map { IntegrationGroup(id: $0, label: g["label"]?.string ?? $0) }
        }
        let known = Dictionary(apps.map { ($0.slug, $0.status) }, uniquingKeysWith: { a, _ in a })
        apps = (res["apps"]?.array ?? []).compactMap { item in
            guard let slug = item["slug"]?.string else { return nil }
            let onMac = item["on_mac"]?.bool ?? false
            let status: IntegrationApp.Status = if onMac { known[slug] ?? .notAsked } else {
                switch item["state"]?.string {
                case "connected": .connected
                case "expired": .expired
                default: .available
                }
            }
            return IntegrationApp(
                slug: slug, name: item["name"]?.string ?? slug, group: item["group"]?.string ?? "",
                blurb: item["blurb"]?.string ?? "", say: item["say"]?.string ?? "", onMac: onMac,
                can: (item["can"]?.array ?? []).map { .init(text: $0["text"]?.string ?? "", asks: $0["asks"]?.bool ?? false) },
                status: status, since: item["since"]?.string.flatMap(Self.date))
        }
        // A sign-in is over once the account shows up.
        for app in apps where app.status == .connected { pending[app.slug] = nil }
    }

    /// Reminders from EventKit; Notes from Apple Events, off the main thread (asking can block).
    func refreshMac() async {
        let reminders: IntegrationApp.Status = switch RemindersTool.status {
        case .fullAccess: .allowed
        case .notDetermined: .notAsked
        default: .denied
        }
        let notes: IntegrationApp.Status = switch await Task.detached(priority: .utility, operation: { NotesTool.access() }).value {
        case .allowed: .allowed
        case .denied: .denied
        case .notAsked: .notAsked
        }
        for (slug, status) in [("reminders", reminders), ("notes", notes)] {
            if let i = apps.firstIndex(where: { $0.slug == slug }), apps[i].status != status { apps[i].status = status }
        }
    }

    func connect(_ app: IntegrationApp) async {
        notes[app.slug] = nil
        if app.onMac {
            await allow(app)
            return
        }
        pending[app.slug] = Pending(url: nil, since: Date())
        do {
            let res = try await BrainHTTP.post("accounts/connect", body: ["user": .string(TasteStore.userID), "app": .string(app.slug)])
            guard let link = res["url"]?.string, let url = URL(string: link) else {
                throw BrainHTTP.Failure(message: "The brain didn't send a sign-in link.")
            }
            pending[app.slug] = Pending(url: url, since: Date())
            NSWorkspace.shared.open(url)
        } catch {
            pending[app.slug] = nil
            notes[app.slug] = error.localizedDescription
            openSlug = app.slug
        }
    }

    /// macOS's prompt the first time; System Settings once the user has said no.
    func allow(_ app: IntegrationApp) async {
        if app.status == .denied {
            openPrivacy(app)
            return
        }
        switch app.slug {
        case "reminders": if !(await RemindersTool.access()) { openPrivacy(app) }
        case "notes": if await NotesTool.requestAccess() == .denied { openPrivacy(app) }
        default: break
        }
        await refreshMac()
    }

    func disconnect(_ app: IntegrationApp) async {
        notes[app.slug] = nil
        disconnecting.insert(app.slug)
        defer { disconnecting.remove(app.slug) }
        do {
            apply(try await BrainHTTP.post("accounts/disconnect", body: ["user": .string(TasteStore.userID), "app": .string(app.slug)]))
            await refreshMac()
        } catch {
            notes[app.slug] = error.localizedDescription
        }
    }

    func openPrivacy(_ app: IntegrationApp) {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(app.privacyAnchor)") {
            NSWorkspace.shared.open(url)
        }
    }

    private static func date(_ text: String) -> Date? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: text) { return date }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: text)
    }
}

// MARK: Pieces

/// The app's mark on a small raised tile; Reminders and Notes show their real macOS icons.
struct AppLogo: View {
    let app: IntegrationApp
    var size: CGFloat = 34

    var body: some View {
        if let path = app.macApp {
            // macOS app icons carry a margin around the squircle; scale it to the tile's size.
            Image(nsImage: Self.icon(path))
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size * 1.24, height: size * 1.24)
                .frame(width: size, height: size)
        } else {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(Sky.raised)
                .overlay(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).strokeBorder(Sky.line, lineWidth: 0.5))
                .overlay(Image("logo-\(app.slug)").resizable().interpolation(.high).scaledToFit().padding(size * 0.2))
                .frame(width: size, height: size)
                .shadow(color: Sky.shadow, radius: size * 0.12, y: size * 0.05)
        }
    }

    private static var icons: [String: NSImage] = [:]

    private static func icon(_ path: String) -> NSImage {
        if let icon = icons[path] { return icon }
        let icon = NSWorkspace.shared.icon(forFile: path)
        icons[path] = icon
        return icon
    }
}

private struct FilterPill: View {
    let title: String
    var count: Int?
    let on: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(title).font(.system(size: 12.5, weight: .medium))
                if let count { Text("\(count)").font(.system(size: 11.5, weight: .medium)).monospacedDigit().opacity(0.6) }
            }
            .foregroundStyle(on ? Sky.onPrimary : (hovering ? Sky.ink : Sky.ink2))
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(Capsule().fill(on ? Sky.primary : (hovering ? Sky.fill : .clear)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

/// Taste is built in, so it sits apart from the apps you connect.
private struct BuiltInTaste: View {
    var body: some View {
        HStack(spacing: 14) {
            IconTile(icon: "heart", size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text("Taste \(Text("by Qloo").font(.system(size: 14)).foregroundStyle(Sky.ink2))")
                    .font(.system(size: 14, weight: .semibold))
                Text("Every pick Slice makes runs through Qloo's taste graph. Built in, nothing to connect.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Sky.ink2)
            }
            Spacer(minLength: 12)
            StatusPill(text: "Ready", color: Sky.good, symbol: "checkmark", soft: Sky.goodSoft)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(LinearGradient(colors: [Sky.accentSoft, Sky.fill], startPoint: .leading, endPoint: .trailing)))
    }
}

private struct KeyBanner: View {
    let key: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "key.fill").font(.system(size: 14)).foregroundStyle(Sky.warn).padding(.top, 2)
            VStack(alignment: .leading, spacing: 3) {
                Text("Add a Composio key to connect apps").font(.system(size: 13.5, weight: .semibold))
                Text("Put \(Text(key).font(.system(size: 12, design: .monospaced))) in \(Text("apps/agent/.env").font(.system(size: 12, design: .monospaced))); the brain picks it up without a restart. Composio keeps the sign-ins and tokens, so nothing sensitive is stored on this Mac. Reminders and Notes work without it.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Sky.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Sky.warnSoft))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Sky.warn.opacity(0.3), lineWidth: 1))
    }
}

/// A horizontal hairline, dashed.
private struct DashedLine: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.minX, y: rect.midY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        }
    }
}

// MARK: A card

private struct IntegrationCard: View {
    let app: IntegrationApp
    let usable: Bool
    let pending: Bool
    let open: () -> Void
    let connect: () -> Void
    let cancel: () -> Void
    @State private var hovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                AppLogo(app: app)
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 7) {
                        Text(app.name).font(.system(size: 14, weight: .semibold)).tracking(-0.1).lineLimit(1)
                        if app.isOn { Circle().fill(Sky.good).frame(width: 7, height: 7) }
                    }
                    Text(app.subline).font(.system(size: 12)).foregroundStyle(Sky.ink3).lineLimit(1)
                }
                Spacer(minLength: 8)
                action
            }
            Text(app.blurb)
                .font(.system(size: 13))
                .foregroundStyle(Sky.ink2)
                .lineLimit(2, reservesSpace: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: 10) {
                DashedLine().stroke(Sky.line, style: StrokeStyle(lineWidth: 1, dash: [3, 3])).frame(height: 1)
                HStack(spacing: 6) {
                    let asks = app.can.contains(where: \.asks)
                    Image(systemName: asks ? "hand.raised" : "eye").font(.system(size: 11, weight: .medium))
                    Text(asks ? "Asks before it changes anything" : "Only reads").font(.system(size: 12))
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 11, weight: .semibold))
                        .opacity(hovering ? 1 : 0)
                        .offset(x: hovering ? 0 : -3, y: hovering ? 0 : 3)
                }
                .foregroundStyle(Sky.ink3)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 12)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Sky.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(hovering ? Sky.ink.opacity(0.14) : Sky.line, lineWidth: 1))
        .shadow(color: Sky.shadow.opacity(hovering ? 1.6 : 0.7), radius: hovering ? 16 : 8, y: hovering ? 6 : 3)
        .offset(y: hovering ? -1 : 0)
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onTapGesture(perform: open)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.15), value: hovering)
    }

    /// Quiet until the card is hovered, then the one thing to click.
    @ViewBuilder private var action: some View {
        if pending {
            Button(action: cancel) {
                HStack(spacing: 6) { ProgressView().controlSize(.mini); Text("Waiting") }
            }
            .buttonStyle(ConnectPill(look: .waiting))
            .help("Stop waiting for the sign-in")
        } else if app.isOn {
            Button(action: open) {
                Label(app.onMac ? "Allowed" : "Connected", systemImage: "checkmark")
            }
            .buttonStyle(ConnectPill(look: .live))
        } else {
            Button(action: connect) {
                Text(app.onMac ? (app.status == .denied ? "Turn on" : "Allow") : (app.status == .expired ? "Reconnect" : "Connect"))
            }
            .buttonStyle(ConnectPill(look: hovering ? .hot : .quiet))
            .disabled(!usable)
        }
    }
}

private struct ConnectPill: ButtonStyle {
    enum Look { case quiet, hot, live, waiting }
    let look: Look
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .labelStyle(PillLabel())
            .font(.system(size: 12.5, weight: .medium))
            .foregroundStyle(look == .hot ? Sky.onPrimary : (look == .live ? Sky.good : (look == .waiting ? Sky.ink2 : Sky.ink)))
            .padding(.horizontal, 13)
            .frame(height: 28)
            .background(Capsule().fill(look == .hot ? Sky.primary : (look == .live ? Sky.goodSoft : Sky.fill)))
            .opacity(enabled ? (configuration.isPressed ? 0.8 : 1) : 0.45)
            .animation(.easeOut(duration: 0.15), value: look)
    }

    private struct PillLabel: LabelStyle {
        func makeBody(configuration: Configuration) -> some View {
            HStack(spacing: 5) {
                configuration.icon.font(.system(size: 10.5, weight: .bold))
                configuration.title
            }
        }
    }
}

// MARK: The side panel

private struct IntegrationDetail: View {
    let app: IntegrationApp
    let model: IntegrationsModel
    let group: String
    let close: () -> Void
    @Environment(\.renderingForPreview) private var rendering

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                AppLogo(app: app, size: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(app.name).font(.system(size: 20, weight: .bold)).tracking(-0.4)
                    Text(group).font(.system(size: 12.5)).foregroundStyle(Sky.ink2)
                }
            }
            .padding(.trailing, 40)
            Text(app.blurb + ".").font(.system(size: 13.5)).foregroundStyle(Sky.ink2)
            connection
            abilities
            if !app.say.isEmpty { tryIt }
        }
        .padding(.horizontal, 24)
        .padding(.top, 30)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, alignment: .leading)

        Group {
            if rendering { content.frame(maxHeight: .infinity, alignment: .top) } else { ScrollView { content }.scrollIndicators(.never) }
        }
        .frame(width: 420)
        .frame(maxHeight: .infinity)
        .background(Sky.canvas)
        .overlay(alignment: .leading) { Rectangle().fill(Sky.line).frame(width: 1) }
        .overlay(alignment: .topTrailing) { CloseButton(action: close).padding(14) }
        .shadow(color: Sky.shadow, radius: 20, x: -4)
        .background {
            Button("", action: close).keyboardShortcut(.cancelAction).opacity(0)
        }
    }

    // MARK: Connection

    private var connection: some View {
        Panel(title: "Connection", trailing: AnyView(badge)) {
            Text(how).font(.system(size: 12.5)).foregroundStyle(Sky.ink2).fixedSize(horizontal: false, vertical: true)
            if app.status == .connected, let since = app.since {
                Text("Connected on \(since.formatted(.dateTime.day().month(.abbreviated).year())).")
                    .font(.system(size: 12.5)).foregroundStyle(Sky.ink2)
            }
            actions.padding(.top, 2)
            if let note = model.notes[app.slug] {
                Text(note).font(.system(size: 12.5)).foregroundStyle(Sky.bad).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var how: String {
        switch app.slug {
        case "reminders": "Reminders is on this Mac, so there's no account to connect. macOS asks once whether Slice may use your lists."
        case "notes": "Notes is on this Mac, so there's no account to connect. macOS asks once whether Slice may use the Notes app."
        default: "You sign in with \(app.provider) on its own page. Slice never sees your password, and you can disconnect at any time."
        }
    }

    private var badge: some View {
        let (text, color, soft): (String, Color, Color) = switch app.status {
        case .connected: ("Connected", Sky.good, Sky.goodSoft)
        case .allowed: ("Allowed", Sky.good, Sky.goodSoft)
        case .expired: ("Sign in again", Sky.warn, Sky.warnSoft)
        case .denied: ("Turned off", Sky.warn, Sky.warnSoft)
        case .available: ("Not connected", Sky.ink2, Sky.fill)
        case .notAsked: ("Not allowed yet", Sky.ink2, Sky.fill)
        }
        return StatusPill(text: text, color: color, symbol: app.isOn ? "checkmark" : nil, soft: soft)
    }

    @ViewBuilder private var actions: some View {
        if let pending = model.pending[app.slug] {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Waiting for you to finish in your browser").font(.system(size: 12.5)).foregroundStyle(Sky.ink2)
                }
                HStack(spacing: 10) {
                    if let url = pending.url {
                        Button("Open the page again") { NSWorkspace.shared.open(url) }
                            .buttonStyle(SecondaryButton(symbol: "arrow.up.forward.square", compact: true))
                    }
                    Button("Cancel") { model.pending[app.slug] = nil }.buttonStyle(InlineAction(color: Sky.ink2, size: 12.5))
                }
            }
        } else {
            switch app.status {
            case .connected:
                let removing = model.disconnecting.contains(app.slug)
                Button(removing ? "Disconnecting" : "Disconnect") { Task { await model.disconnect(app) } }
                    .buttonStyle(SecondaryButton(symbol: "minus.circle", compact: true))
                    .disabled(removing)
            case .available, .expired:
                Button("\(app.status == .expired ? "Reconnect" : "Connect") \(app.name)") { Task { await model.connect(app) } }
                    .buttonStyle(PrimaryButton(arrow: false, compact: true))
                    .disabled(!model.configured)
            case .notAsked:
                Button("Allow Slice to use \(app.name)") { Task { await model.allow(app) } }
                    .buttonStyle(PrimaryButton(arrow: false, compact: true))
            case .denied:
                VStack(alignment: .leading, spacing: 10) {
                    Text("You turned this off. Switch Slice back on in System Settings, Privacy & Security.")
                        .font(.system(size: 12.5)).foregroundStyle(Sky.ink2)
                    Button("Open System Settings") { model.openPrivacy(app) }
                        .buttonStyle(SecondaryButton(symbol: "gear", compact: true))
                }
            case .allowed:
                Button("Change in System Settings") { model.openPrivacy(app) }
                    .buttonStyle(SecondaryButton(symbol: "gear", compact: true))
            }
        }
    }

    // MARK: What Slice can do

    private var abilities: some View {
        Panel(title: "What Slice can do") {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(app.can, id: \.self) { ability in
                    HStack(spacing: 10) {
                        Image(systemName: ability.asks ? "hand.raised" : "eye")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(ability.asks ? Sky.warn : Sky.accent)
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(ability.asks ? Sky.warnSoft : Sky.accentSoft))
                        Text(ability.text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 6)
                        if ability.asks {
                            Text("Asks first")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Sky.ink2)
                                .padding(.horizontal, 8)
                                .frame(height: 20)
                                .background(Capsule().fill(Sky.fill))
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
            if !app.isOn {
                Text(app.onMac ? "Slice can use it as soon as you allow it." : "Slice can use it as soon as the account is connected.")
                    .font(.system(size: 12)).foregroundStyle(Sky.ink3)
            }
        }
    }

    private var tryIt: some View {
        Panel(title: "Try saying") {
            Text("\u{201C}\(app.say)\u{201D}").font(.system(size: 15, weight: .semibold)).tracking(-0.2)
            Text("Hold fn and control and say it, or hover over the notch to type.")
                .font(.system(size: 12)).foregroundStyle(Sky.ink3)
        }
    }
}

private struct Panel<Content: View>: View {
    let title: String
    var trailing: AnyView?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title).font(.system(size: 13.5, weight: .semibold))
                Spacer()
                if let trailing { trailing }
            }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .skyCard(radius: 18, shadow: false)
    }
}
