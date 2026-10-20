import AppKit
import SwiftUI

/// The open island's task cards: the ones that need the user first, then the one
/// running, then the latest finished. Two at most, so the conversation keeps room.
struct TasksArea: View {
    let agent: AgentSession

    private var shown: [TaskItem] {
        let ordered = agent.tasks.filter(\.needsYou) + agent.tasks.filter(\.isRunning) + agent.tasks.filter(\.isOver)
        return Array(ordered.prefix(2))
    }

    var body: some View {
        if !shown.isEmpty {
            VStack(spacing: 8) {
                ForEach(shown) { TaskCardView(task: $0, agent: agent) }
            }
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }
}

struct TaskCardView: View {
    let task: TaskItem
    let agent: AgentSession
    @State private var reply = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                statusIcon
                    .frame(width: 18, height: 16)
                Text(task.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if task.isOver {
                    IconButton(symbol: "xmark", help: "Dismiss") { agent.dismiss(task) }
                } else {
                    Button("Stop") { agent.cancel(task) }
                        .buttonStyle(.plain)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
            content
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(task.needsYou ? 0.1 : 0.06)))
        .overlay {
            if task.needsYou {
                RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Brand.orange.opacity(0.7), lineWidth: 1)
            }
        }
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch task.status {
        case "running":
            Bars(level: { t in 0.18 + 0.12 * sin(t * 4) }, spread: 1.2)
                .scaleEffect(0.8)
        case "needs_input", "needs_confirmation":
            Image(systemName: "hand.raised.fill").font(.system(size: 12)).foregroundStyle(Brand.orange)
        case "done":
            Image(systemName: "checkmark.circle.fill").font(.system(size: 13)).foregroundStyle(Brand.yellow)
        case "failed":
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 12)).foregroundStyle(Brand.orange)
        default:
            Image(systemName: "xmark.circle").font(.system(size: 13)).foregroundStyle(.white.opacity(0.4))
        }
    }

    @ViewBuilder
    private var content: some View {
        switch task.status {
        case "running":
            if let step = task.steps.last {
                Text(step)
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
                    .contentTransition(.opacity)
            }
        case "needs_confirmation":
            if let confirm = task.confirm {
                Text(confirm.title)
                    .font(.system(size: 13))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = confirm.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.6))
                        .lineLimit(4)
                }
                HStack(spacing: 8) {
                    Text("Or just say yes")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.4))
                    Spacer()
                    Button("Not now") { agent.confirm(task, approved: false) }
                        .buttonStyle(IslandButtonStyle(primary: false))
                    Button("Go ahead") { agent.confirm(task, approved: true) }
                        .buttonStyle(IslandButtonStyle(primary: true))
                        .keyboardShortcut(.defaultAction)
                }
            }
        case "needs_input":
            if let question = task.question {
                Text(question)
                    .font(.system(size: 13))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    TextField("Type your answer, or just say it", text: $reply)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .foregroundStyle(.white)
                        .onSubmit(send)
                    Button("Send", action: send)
                        .buttonStyle(IslandButtonStyle(primary: true))
                        .disabled(reply.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(.white.opacity(0.08)))
            }
        case "done":
            if let say = task.say {
                Text(say)
                    .font(.system(size: 12.5))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !task.cards.isEmpty {
                let row = HStack(alignment: .top, spacing: 8) {
                    ForEach(task.cards) { CardTile(card: $0) }
                }
                // A plain row when the picks fit, a scrolling one when there are more.
                ViewThatFits(in: .horizontal) {
                    row
                    ScrollView(.horizontal) { row }.scrollIndicators(.never)
                }
            }
        case "failed":
            Text("That didn't work. Ask me to try again.")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.7))
        default:
            EmptyView()
        }
    }

    private func send() {
        agent.answer(task, text: reply)
        reply = ""
    }
}

/// A pick from a task (a place, a film, a gift), with its image when Qloo has one.
private struct CardTile: View {
    let card: TaskItem.Card

    var body: some View {
        Button {
            if let link = card.url, let url = URL(string: link) { NSWorkspace.shared.open(url) }
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(.white.opacity(0.08))
                    if let image = card.image, let url = URL(string: image) {
                        AsyncImage(url: url) { phase in
                            if let picture = phase.image { picture.resizable().scaledToFill() }
                        }
                    } else {
                        SliceMark(height: 14).opacity(0.5)
                    }
                }
                .frame(width: 132, height: 78)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(card.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let line = card.reason ?? card.subtitle {
                    Text(line)
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(width: 132, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(card.reason ?? card.title)
    }
}

struct IslandButtonStyle: ButtonStyle {
    let primary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(primary ? Color.black : Color.white.opacity(0.85))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(primary ? AnyShapeStyle(Brand.yellow) : AnyShapeStyle(Color.white.opacity(0.12))))
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}
