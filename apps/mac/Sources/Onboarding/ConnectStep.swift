import Combine
import SwiftUI

/// The last step: connect a few apps now, so Slice can plan around the user's week from the
/// first ask. Same catalog and sign-ins as Settings > Integrations (IntegrationsModel); the
/// rest of the apps wait there.
struct ConnectStep: View {
    @State private var model = IntegrationsModel()
    private let tick = Timer.publish(every: IntegrationsModel.pollEvery, on: .main, in: .common).autoconnect()

    /// The ones most people want first: what's on this Mac, then the usual accounts.
    static let suggested = ["calendar", "contacts", "reminders", "notes", "googlecalendar", "gmail", "slack", "notion", "googledrive"]

    private var apps: [IntegrationApp] {
        Self.suggested.compactMap { slug in model.apps.first { $0.slug == slug } }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            StepHeader(title: "Bring in your apps",
                       subtitle: "Connect a few now, so Slice can plan around your week. The rest are in Settings > Integrations.") {
                let on = model.apps.filter(\.isOn).count
                if on > 0 {
                    StatusPill(text: "\(on) connected", color: Sky.good, symbol: "checkmark", soft: Sky.goodSoft)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            if !model.loaded {
                HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Checking your apps").foregroundStyle(Sky.ink2) }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: 3), spacing: 12) {
                ForEach(apps) { app in
                    ConnectTile(app: app, usable: app.onMac || model.configured, pending: model.pending[app.slug] != nil) {
                        Task { await model.connect(app) }
                    } cancel: {
                        model.pending[app.slug] = nil
                    }
                }
            }
            if let problem = model.problem ?? apps.lazy.compactMap({ model.notes[$0.slug] }).first {
                Label(problem, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Sky.bad)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 6) {
                if model.loaded, !model.configured {
                    Label("Account sign-ins need the brain's Composio key. The apps on this Mac work now.", systemImage: "key.fill")
                }
                Label("Sign-ins run through Composio, so Slice never sees your passwords. It asks before it sends or changes anything.",
                      systemImage: "lock.fill")
            }
            .font(.system(size: 12))
            .foregroundStyle(Sky.ink3)
        }
        .padding(.horizontal, 40)
        .padding(.top, 6)
        .animation(.snappy(duration: 0.2), value: model.apps.filter(\.isOn).count)
        .task { await model.load() }
        .onReceive(tick) { _ in Task { await model.tick() } }
    }
}

/// One app: its logo, what Slice does with it, and Connect (or Allow, for the apps on this Mac).
private struct ConnectTile: View {
    let app: IntegrationApp
    let usable: Bool
    let pending: Bool
    let connect: () -> Void
    let cancel: () -> Void
    @State private var hovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                AppLogo(app: app, size: 38)
                Spacer(minLength: 6)
                action
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(app.name).font(.system(size: 13.5, weight: .semibold)).lineLimit(1)
                Text(app.blurb)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Sky.ink2)
                    .lineLimit(1)
            }
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .skyCard(radius: 16, shadow: !app.isOn)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(app.isOn ? Sky.good.opacity(0.35) : .clear, lineWidth: 1))
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.15), value: hovering)
    }

    @ViewBuilder private var action: some View {
        if pending {
            Button(action: cancel) {
                HStack(spacing: 6) { ProgressView().controlSize(.mini); Text("Waiting") }
            }
            .buttonStyle(ConnectPill(look: .waiting))
            .help("Finish signing in in your browser. Click to stop waiting.")
        } else if app.isOn {
            Image(systemName: "checkmark")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Sky.good)
                .frame(height: 28)
                .help(app.onMac ? "Allowed" : "Connected")
        } else {
            Button(app.onMac ? (app.status == .denied ? "Turn on" : "Allow") : (app.status == .expired ? "Reconnect" : "Connect"), action: connect)
                .buttonStyle(ConnectPill(look: hovering ? .hot : .quiet))
                .disabled(!usable)
        }
    }
}
