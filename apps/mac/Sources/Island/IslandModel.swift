import AppKit
import Observation

/// What the island shows and how big it is.
///
/// - closed: exactly the hardware notch, so it's invisible.
/// - compact: the notch with ears (the Slice mark, and a live status), while listening.
/// - captioned: compact plus a line of what the agent is doing or saying, or what a
///   background task is up to.
/// - nudge: compact plus a pill line when Slice brings something up by itself ("very
///   you", a birthday); hovering it opens the island on the full card.
/// - open: the full panel (tasks, conversation, a text field) while hovered, whenever
///   a task needs an answer or a yes (its buttons must be clickable), and while
///   showing a card the user asked for (a why card).
@MainActor
@Observable
final class IslandModel {
    enum Mode: String, Equatable { case closed, compact, captioned, nudge, open }

    static let shoulder: CGFloat = 6
    static let ear: CGFloat = 36
    static let captionWidth: CGFloat = 400
    static let openWidth: CGFloat = 500
    static let openHeight: CGFloat = 340
    static let openHeightWithTasks: CGFloat = 470
    /// Room for a rich card (a day's timeline, a map, a why card) above the conversation.
    static let openHeightWithCards: CGFloat = 620

    let agent: AgentSession
    var notch = CGSize(width: 185, height: 32)
    var hasNotch = true
    var hovering = false
    var draft = ""
    /// Keeps the last words (or an error) up for a moment after the agent goes quiet.
    var lingering = false
    /// Debug builds: pins a mode for screenshots (`-islandPreview open`).
    var preview: Mode?
    /// Drawing for -renderIsland: ImageRenderer leaves ScrollViews blank, so lay out plainly.
    var rendering = false

    init(agent: AgentSession) {
        self.agent = agent
    }

    var mode: Mode {
        if let preview { return preview }
        if hovering || !draft.isEmpty || agent.taskNeedingYou != nil || agent.presenting { return .open }
        if agent.nudge != nil, agent.phase == .idle { return .nudge }
        switch agent.phase {
        case .listening: return .compact
        case .thinking: return agent.activities.isEmpty ? .compact : .captioned
        case .speaking: return .captioned
        case .idle:
            if lingering && agent.caption != nil { return .captioned }
            return agent.runningTask != nil || agent.lastError != nil ? .captioned : .closed
        }
    }

    var captionText: String? {
        if let error = agent.lastError { return error }
        switch agent.phase {
        case .thinking:
            return agent.activities.last.map { [$0.label, $0.detail].compactMap(\.self).joined(separator: ", ") }
        case .idle where !lingering:
            guard let task = agent.runningTask else { return agent.caption }
            return task.steps.last.map { "\(task.title): \($0)" } ?? task.title
        default:
            return agent.caption
        }
    }

    /// The island's body size (the shoulders add `shoulder` on each side).
    func size(_ mode: Mode) -> CGSize {
        let barHeight = max(notch.height, 26)
        let withEars = notch.width + 2 * Self.ear
        switch mode {
        case .closed: return CGSize(width: notch.width, height: hasNotch ? notch.height : 0)
        case .compact: return CGSize(width: withEars, height: barHeight)
        case .captioned, .nudge: return CGSize(width: max(withEars, Self.captionWidth), height: barHeight + 56)
        case .open:
            let height = hasCards ? Self.openHeightWithCards : agent.tasks.isEmpty ? Self.openHeight : Self.openHeightWithTasks
            return CGSize(width: max(withEars + 80, Self.openWidth), height: height)
        }
    }

    /// A nudge or a task with a rich card or picks is on show, so the open island grows.
    var hasCards: Bool {
        agent.nudge != nil || agent.tasks.prefix(2).contains { !$0.views.isEmpty || !$0.cards.isEmpty }
    }
}
