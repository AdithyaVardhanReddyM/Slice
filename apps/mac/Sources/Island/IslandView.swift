import SwiftUI

struct IslandView: View {
    @Bindable var model: IslandModel

    var body: some View {
        let mode = model.mode
        let size = model.size(mode)
        let width = size.width + 2 * IslandModel.shoulder

        ZStack(alignment: .top) {
            IslandShell(shape: NotchShape(shoulder: IslandModel.shoulder, bottomRadius: Self.radius(mode)), height: size.height,
                        solidTop: max(model.notch.height, 26) + 2, glass: mode != .closed && mode != .compact, rendering: model.rendering)
                .shadow(color: .black.opacity(mode == .open ? 0.35 : 0), radius: 18, y: 10)

            content(mode)
                .padding(.horizontal, IslandModel.shoulder)
                .frame(width: width, height: size.height, alignment: .top)
                .clipShape(NotchShape(shoulder: IslandModel.shoulder, bottomRadius: Self.radius(mode)))
        }
        .frame(width: width, height: size.height)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .animation(.spring(response: 0.38, dampingFraction: 0.82), value: mode)
        .environment(\.colorScheme, .dark)
    }

    private static func radius(_ mode: IslandModel.Mode) -> CGFloat {
        switch mode {
        case .closed: 10
        case .compact: 12
        case .captioned, .nudge: 20
        case .open: 26
        }
    }

    @ViewBuilder
    private func content(_ mode: IslandModel.Mode) -> some View {
        switch mode {
        case .closed:
            Color.clear
        case .compact:
            Ears(model: model)
                .transition(.opacity)
        case .captioned:
            VStack(spacing: 0) {
                Ears(model: model)
                Caption(text: model.captionText ?? "", isError: model.agent.lastError != nil)
            }
            .transition(.opacity)
        case .nudge:
            VStack(spacing: 0) {
                Ears(model: model)
                if let nudge = model.agent.nudge { NudgePill(nudge: nudge) }
            }
            .transition(.opacity)
        case .open:
            OpenIsland(model: model)
                .transition(.opacity)
        }
    }
}

/// One line under the notch for something Slice brings up by itself; hover to open it.
struct NudgePill: View {
    let nudge: Nudge

    /// A nudge's symbol: a gift for a birthday, a heart for taste ("very you", "add it to your taste?").
    static func symbol(_ kind: String) -> String {
        switch kind {
        case "birthday": "gift.fill"
        case "learn": "heart.circle.fill"
        default: "heart.fill"
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: Self.symbol(nudge.kind))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(IslandStyle.accent)
            Text(nudge.kind == "why" ? "\(nudge.title): \(nudge.line)" : nudge.title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.92))
                .lineLimit(2)
            Spacer(minLength: 0)
            Image(systemName: "chevron.down")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.4))
        }
        .padding(.horizontal, 20)
        .padding(.top, 6)
        .padding(.bottom, 12)
    }
}

/// The notch row: the Slice mark on the left, what the agent is doing on the right.
private struct Ears: View {
    let model: IslandModel

    var body: some View {
        HStack(spacing: 0) {
            SliceMark(height: 12)
                .frame(width: IslandModel.ear)
            Spacer(minLength: model.notch.width)
            StatusGlyph(agent: model.agent)
                .frame(width: IslandModel.ear)
        }
        .padding(.horizontal, 4)
        .frame(height: max(model.notch.height, 26))
    }
}

private struct Caption: View {
    let text: String
    let isError: Bool

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(isError ? IslandStyle.bad : IslandStyle.text)
            .lineLimit(2)
            .truncationMode(.head)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 12)
            .contentTransition(.opacity)
    }
}

/// Live bars while listening or speaking, a slow wave while thinking, a dot otherwise.
struct StatusGlyph: View {
    let agent: AgentSession

    var body: some View {
        switch agent.phase {
        case .listening:
            Bars(level: { _ in Double(agent.micLevel) })
        case .speaking:
            Bars(level: { t in 0.35 + 0.35 * sin(t * 9) })
        case .thinking:
            Bars(level: { t in 0.18 + 0.12 * sin(t * 4) }, spread: 1.2)
        case .idle:
            Circle()
                .fill(agent.connection == .online ? IslandStyle.good : Color.white.opacity(0.3))
                .frame(width: 6, height: 6)
        }
    }
}

struct Bars: View {
    /// Loudness 0…1 at a time, before each bar's own offset.
    let level: (Double) -> Double
    var spread: Double = 0.7

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            HStack(spacing: 2.5) {
                ForEach(0..<5, id: \.self) { i in
                    let wobble = 0.55 + 0.45 * sin(t * 7 + Double(i) * spread)
                    let h = max(0.15, min(1, level(t + Double(i) * 0.08) * wobble * 1.6))
                    Capsule()
                        .fill(IslandStyle.accent)
                        .frame(width: 2.5, height: 4 + 12 * h)
                }
            }
            .frame(height: 16)
        }
    }
}

// MARK: Open

private struct OpenIsland: View {
    @Bindable var model: IslandModel
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 10) {
            header
            if model.hasCards {
                // Cards scroll on their own so the conversation always keeps a few lines.
                let cards = VStack(spacing: 8) {
                    if let nudge = model.agent.nudge { NudgeCard(nudge: nudge, agent: model.agent) }
                    TasksArea(agent: model.agent)
                }
                if model.rendering {
                    cards.frame(maxHeight: 420, alignment: .top)
                } else {
                    ScrollView { cards }
                        .scrollIndicators(.never)
                        .frame(maxHeight: 420)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                TasksArea(agent: model.agent)
            }
            Conversation(agent: model.agent, plain: model.rendering)
                .frame(minHeight: 50, maxHeight: .infinity)
            input
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
        .onAppear { focused = false }
    }

    private var header: some View {
        HStack(spacing: 8) {
            SliceMark(height: 12)
            Text("Slice")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
            Spacer(minLength: model.notch.width + 16)
            StatusGlyph(agent: model.agent)
                .frame(width: 24)
            IconButton(symbol: "square.and.pencil", help: "New conversation") { model.agent.reset() }
            IconButton(symbol: "gearshape", help: "Settings") { SettingsWindow.shared.show(agent: model.agent) }
        }
        .frame(height: max(model.notch.height, 26))
    }

    private var input: some View {
        HStack(spacing: 10) {
            TextField("Ask Slice anything", text: $model.draft)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .foregroundStyle(.white)
                .focused($focused)
                .onSubmit {
                    model.agent.send(text: model.draft)
                    model.draft = ""
                }
            HStack(spacing: 4) {
                Text("Hold")
                KeyCap(label: "fn")
                KeyCap(label: "⌃")
                Text("to talk")
            }
            .font(.system(size: 11))
            .foregroundStyle(.white.opacity(0.45))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(IslandStyle.card))
    }
}

private struct Conversation: View {
    let agent: AgentSession
    var plain = false

    var body: some View {
        if plain {
            turns.frame(maxHeight: .infinity, alignment: .bottom)
        } else {
            scrolling
        }
    }

    private var turns: some View {
        VStack(alignment: .leading, spacing: 10) {
            cards(after: nil)
            ForEach(Array(agent.turns.enumerated()), id: \.element.id) { index, turn in
                TurnRow(turn: turn)
                if endsExchange(index) { cards(after: exchange(index)) }
            }
        }
    }

    /// The user turn that the turn at `index` belongs to.
    private func exchange(_ index: Int) -> UUID? {
        agent.turns[...index].last { $0.role == .user }?.id
    }

    /// The last turn before the user speaks again: an exchange's cards go under its whole reply.
    private func endsExchange(_ index: Int) -> Bool {
        index == agent.turns.count - 1 || agent.turns[index + 1].role == .user
    }

    @ViewBuilder
    private func cards(after turn: UUID?) -> some View {
        ForEach(agent.attachments.filter { $0.after == turn }) { attachment in
            PicksCard(picks: attachment.picks, agent: agent)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }

    private var scrolling: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if agent.turns.isEmpty {
                        Text("Ask about anything on your screen, or what to watch, eat or listen to tonight.")
                            .font(.system(size: 13))
                            .foregroundStyle(.white.opacity(0.55))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 4)
                    }
                    let lastUser = agent.turns.lastIndex { $0.role == .user }
                    cards(after: nil)
                    ForEach(Array(agent.turns.enumerated()), id: \.element.id) { index, turn in
                        TurnRow(turn: turn)
                        if index == lastUser {
                            ForEach(agent.activities) { ActivityRow(activity: $0) }
                        }
                        if endsExchange(index) { cards(after: exchange(index)) }
                    }
                    if let error = agent.lastError {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundStyle(IslandStyle.bad)
                    }
                    Color.clear.frame(height: 1).id("end")
                }
            }
            .scrollIndicators(.never)
            .onChange(of: agent.turns.last?.text) { proxy.scrollTo("end", anchor: .bottom) }
            .onChange(of: agent.activities.count) { proxy.scrollTo("end", anchor: .bottom) }
            .onChange(of: agent.attachments.count) {
                withAnimation(.snappy) { proxy.scrollTo("end", anchor: .bottom) }
            }
        }
    }
}

private struct TurnRow: View {
    let turn: AgentSession.Turn

    var body: some View {
        switch turn.role {
        case .user:
            HStack {
                Spacer(minLength: 60)
                Text(turn.text)
                    .font(.system(size: 13))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(IslandStyle.raised))
            }
        case .agent:
            Text(turn.text)
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.95))
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
    }
}

private struct ActivityRow: View {
    let activity: AgentSession.Activity

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(activity.kind == "qloo" ? IslandStyle.accent : .white.opacity(0.6))
                .frame(width: 16)
            Text(activity.label)
                .foregroundStyle(.white.opacity(0.8))
            if let detail = activity.detail {
                Text(detail)
                    .foregroundStyle(.white.opacity(0.4))
                    .lineLimit(1)
            }
        }
        .font(.system(size: 12))
    }

    private var symbol: String {
        switch activity.kind {
        case "qloo": "point.3.connected.trianglepath.dotted"
        case "mac": "macwindow"
        default: "wrench.and.screwdriver"
        }
    }
}

struct IconButton: View {
    let symbol: String
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

private struct KeyCap: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.white.opacity(0.75))
            .padding(.horizontal, 5)
            .frame(minWidth: 18, minHeight: 16)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(.white.opacity(0.12)))
    }
}
