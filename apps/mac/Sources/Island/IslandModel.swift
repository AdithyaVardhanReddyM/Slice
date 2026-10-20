import AppKit
import Observation

/// What the island shows and how big it is.
///
/// - closed: exactly the hardware notch, so it's invisible.
/// - compact: the notch with ears (the Slice mark, and a live status), while listening.
/// - captioned: compact plus a line of what the agent is doing or saying.
/// - open: the full panel (conversation, activity, a text field) while hovered.
@MainActor
@Observable
final class IslandModel {
    enum Mode: String, Equatable { case closed, compact, captioned, open }

    static let shoulder: CGFloat = 6
    static let ear: CGFloat = 36
    static let captionWidth: CGFloat = 400
    static let openWidth: CGFloat = 500
    static let openHeight: CGFloat = 340

    let agent: AgentSession
    var notch = CGSize(width: 185, height: 32)
    var hasNotch = true
    var hovering = false
    var draft = ""
    /// Keeps the last words (or an error) up for a moment after the agent goes quiet.
    var lingering = false
    /// Debug builds: pins a mode for screenshots (`-islandPreview open`).
    var preview: Mode?

    init(agent: AgentSession) {
        self.agent = agent
    }

    var mode: Mode {
        if let preview { return preview }
        if hovering || !draft.isEmpty { return .open }
        switch agent.phase {
        case .listening: return .compact
        case .thinking: return agent.activities.isEmpty ? .compact : .captioned
        case .speaking: return .captioned
        case .idle: return lingering && captionText != nil ? .captioned : .closed
        }
    }

    var captionText: String? {
        if let error = agent.lastError { return error }
        switch agent.phase {
        case .thinking:
            return agent.activities.last.map { [$0.label, $0.detail].compactMap(\.self).joined(separator: ", ") }
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
        case .captioned: return CGSize(width: max(withEars, Self.captionWidth), height: barHeight + 56)
        case .open: return CGSize(width: max(withEars + 80, Self.openWidth), height: Self.openHeight)
        }
    }
}
