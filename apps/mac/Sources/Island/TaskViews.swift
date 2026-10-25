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

    /// Rich cards: the newest while the task works, all of them (up to six) once it's done.
    @ViewBuilder
    private var views: some View {
        let shown = task.isOver ? task.views : Array(task.views.suffix(1))
        ForEach(shown) { view in
            TaskViewCard(view: view, agent: agent, taskTitle: task.title)
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white.opacity(0.05)))
                .transition(.opacity)
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
            views
        case "needs_confirmation":
            views
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
            views
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
                PicksRow(cards: task.cards, agent: agent)
            }
            views
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

/// A pick from a task (a place, a film, a gift), with its image when Qloo has one. Picks for the
/// user get a thumbs up and down on hover: up adds it to their taste, down means not for them.
struct CardTile: View {
    let card: TaskItem.Card
    var agent: AgentSession?
    @State private var hovering = false

    var body: some View {
        Button {
            if let link = card.url, let url = URL(string: link) { NSWorkspace.shared.open(url) }
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                ZStack(alignment: .topLeading) {
                    RemoteImage(url: card.image)
                        .frame(width: 132, height: 78)
                    if let tag = card.tag {
                        Text(tag)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Brand.yellow))
                            .padding(6)
                    }
                }
                .frame(width: 132, height: 78)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(alignment: .bottomTrailing) {
                    if let agent, card.forPerson == nil { Thumbs(card: card, agent: agent, hovering: hovering).padding(5) }
                }
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
        .onHover { hovering = $0 }
    }
}

/// Thumbs on a pick: shown on hover, and kept once given ("Added" or "Not for you").
private struct Thumbs: View {
    let card: TaskItem.Card
    let agent: AgentSession
    let hovering: Bool

    var body: some View {
        let given = agent.feedback[card.title]
        if let given {
            let up = given.hasPrefix("up")
            Label(given.hasSuffix("saved") ? (up ? "In your taste" : "Not for you") : "Saving", systemImage: up ? "hand.thumbsup.fill" : "hand.thumbsdown.fill")
                .font(.system(size: 9.5, weight: .bold))
                .foregroundStyle(up ? Color.black : Color.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Capsule().fill(up ? AnyShapeStyle(Brand.yellow) : AnyShapeStyle(Color.black.opacity(0.7))))
        } else if hovering {
            HStack(spacing: 3) {
                thumb("hand.thumbsup.fill", "up", help: "I love this: add it to my taste")
                thumb("hand.thumbsdown.fill", "down", help: "Not for me")
            }
        }
    }

    private func thumb(_ symbol: String, _ verdict: String, help: String) -> some View {
        Button { agent.give(verdict, to: card) } label: {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 20)
                .background(Capsule().fill(.black.opacity(0.7)))
        }
        .buttonStyle(.plain)
        .help(help)
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
