import Combine
import SwiftUI

/// The permissions Slice asks for: the two it needs to hear you, then the ones that let it help
/// on screen. Location comes with home, and Calendar and Contacts with the apps at the end.
struct AccessStep: View {
    @State private var statuses: [Permissions.Kind: Permissions.Status] = [:]
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            StepHeader(title: "Let Slice help",
                       subtitle: "Allow what it needs. macOS asks once for each, and you can change them any time in Settings.") {
                EmptyView()
            }
            group("To hear you") {
                HStack(spacing: 14) {
                    ForEach([Permissions.Kind.microphone, .accessibility]) { card($0) }
                }
            }
            group("To help with what's on your screen") {
                HStack(alignment: .top, spacing: 14) {
                    ForEach([Permissions.Kind.screenRecording, .automation, .fullDiskAccess]) { card($0, stacked: true) }
                }
                // All three as tall as the tallest.
                .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 6) {
                Label("Your calendar, contacts and accounts come last, with the apps you connect.", systemImage: "calendar")
                Label("Slice only looks or acts when you ask, and checks with you before it sends, books or buys anything.", systemImage: "lock.fill")
            }
            .font(.system(size: 12))
            .foregroundStyle(Sky.ink3)
        }
        .padding(.horizontal, 40)
        .padding(.top, 6)
        .onAppear(perform: refresh)
        .onReceive(tick) { _ in refresh() }
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Sky.ink2)
            content()
        }
    }

    private func card(_ kind: Permissions.Kind, stacked: Bool = false) -> some View {
        PermissionCard(kind: kind, status: statuses[kind] ?? .notYet, stacked: stacked)
    }

    private func refresh() {
        for kind in Permissions.listed {
            let now = Permissions.status(kind)
            if statuses[kind] != now { withAnimation(.snappy) { statuses[kind] = now } }
        }
    }
}

/// One permission: its glossy icon, what it's for, and Allow (or a green tick). `stacked` puts
/// the words under the icon, for three across.
struct PermissionCard: View {
    let kind: Permissions.Kind
    let status: Permissions.Status
    var compact = false
    var stacked = false

    var body: some View {
        Group {
            if stacked {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top) {
                        IconTile(icon: kind.icon, size: 44)
                        Spacer(minLength: 6)
                        action
                    }
                    words
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                HStack(spacing: 13) {
                    IconTile(icon: kind.icon, size: compact ? 40 : 50)
                    words
                    Spacer(minLength: 6)
                    action
                }
                .frame(maxWidth: .infinity, minHeight: compact ? 66 : 84, alignment: .leading)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, stacked ? 14 : 12)
        .skyCard(radius: 18, shadow: status != .granted)
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .strokeBorder(status == .granted ? Sky.good.opacity(0.35) : .clear, lineWidth: 1))
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(kind.title).font(.system(size: 14, weight: .semibold))
                switch kind.need {
                case .needed: tag("Needed", Sky.accent, Sky.accentSoft)
                case .optional: tag("Optional", Sky.ink2, Sky.fill)
                case .recommended: EmptyView()
                }
            }
            Text(kind.reason)
                .font(.system(size: 12))
                .foregroundStyle(Sky.ink2)
                .lineLimit(stacked ? 3 : 2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var action: some View {
        switch status {
        case .granted:
            Image(systemName: "checkmark")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Sky.good)
                .help("On")
        case .denied:
            Button("Open Settings") { Permissions.openSettings(kind) }.buttonStyle(SecondaryButton(compact: true))
        case .onFirstUse:
            Button("Ask now") { Permissions.request(kind) }.buttonStyle(SecondaryButton(compact: true))
                .help("Each app asks the first time Slice uses it. This asks the ones that are open now.")
        case .notYet:
            if kind.isSwitchInSettings {
                Button("Open Settings") { Permissions.request(kind) }.buttonStyle(PrimaryButton(arrow: false, compact: true))
            } else {
                Button("Allow") { Permissions.request(kind) }.buttonStyle(PrimaryButton(arrow: false, compact: true))
            }
        }
    }

    private func tag(_ text: String, _ color: Color, _ fill: Color) -> some View {
        Text(text)
            .font(.system(size: 10.5, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .frame(height: 18)
            .background(Capsule().fill(fill))
    }
}

/// "Hold fn and control and say…": the first real try at push-to-talk, with what Slice heard
/// and said. The two keys sink while they're held.
struct TalkStep: View {
    let agent: AgentSession
    @State private var canTalk = Permissions.isGranted(.microphone) && Permissions.isGranted(.accessibility)
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        let held = agent.phase == .listening
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            TalkKeys(pressed: held, keySize: 64)
                .frame(width: 560, height: 200)
            .padding(.top, 2)
            Text("Try talking")
                .font(.system(size: 30, weight: .bold))
                .tracking(-0.6)
                .padding(.top, 18)
            Text("Hold fn and control, ask something, then let go. Or hover over the notch to type.")
                .font(.system(size: 14.5))
                .foregroundStyle(Sky.ink2)
                .padding(.top, 6)
            HStack(spacing: 8) {
                ForEach(["What should I watch tonight?", "Find dinner near me", "Why do I love Frank Ocean?"], id: \.self) { line in
                    Text("\u{201C}\(line)\u{201D}")
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(Sky.accent)
                        .padding(.horizontal, 12)
                        .frame(height: 28)
                        .background(Capsule().fill(Sky.accentSoft))
                }
            }
            .padding(.top, 16)
            conversation
                .frame(width: 600)
                .padding(.top, 18)
            Spacer(minLength: 0)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .onReceive(tick) { _ in
            let now = Permissions.isGranted(.microphone) && Permissions.isGranted(.accessibility)
            if now != canTalk { canTalk = now }
        }
    }

    private var conversation: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Glossy("orb").frame(width: 30, height: 30)
                    .scaleEffect(agent.phase == .idle ? 1 : 1.12)
                    .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: agent.phase == .idle)
                Text(status.text).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(status.color)
                Spacer()
                if !canTalk {
                    Button("Allow the microphone and keys") {
                        if !Permissions.isGranted(.microphone) { Permissions.request(.microphone) } else { Permissions.request(.accessibility) }
                    }
                    .buttonStyle(PrimaryButton(arrow: false, compact: true))
                }
            }
            if let heard = agent.turns.last(where: { $0.role == .user })?.text {
                bubble("You", heard, mine: true)
            }
            if let said = agent.turns.last(where: { $0.role == .agent })?.text {
                bubble("Slice", said, mine: false)
            }
        }
        .padding(16)
        .skyCard(radius: 20)
    }

    private func bubble(_ who: String, _ text: String, mine: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(who).font(.system(size: 11.5, weight: .bold)).foregroundStyle(mine ? Sky.ink3 : Sky.accent).frame(width: 40, alignment: .leading)
            Text(text).font(.system(size: 13)).foregroundStyle(mine ? Sky.ink2 : Sky.ink).lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var status: (text: String, color: Color) {
        if agent.connection != .online { return ("Slice can't reach its brain yet", Sky.bad) }
        if !canTalk { return ("Slice needs the microphone and Accessibility to hear you", Sky.warn) }
        switch agent.phase {
        case .listening: return ("Listening", Sky.accent)
        case .thinking: return ("Thinking", Sky.accent)
        case .speaking: return ("Talking", Sky.accent)
        case .idle: return agent.turns.isEmpty ? ("Ready when you are", Sky.ink2) : ("It works", Sky.good)
        }
    }
}
