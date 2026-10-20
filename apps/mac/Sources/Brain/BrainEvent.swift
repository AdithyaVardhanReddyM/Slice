import Foundation

/// A JSON frame from the brain (apps/agent/slice_mac/routes.py). Audio arrives as binary frames instead.
struct BrainEvent: Decodable, Sendable {
    enum Kind: String, Decodable, Sendable {
        case ready, transcript, activity, interrupted, error, task, profile
        case toolCall = "tool_call"
        case turnComplete = "turn_complete"
        case operatorStatus = "operator"
        case unknown

        init(from decoder: Decoder) throws {
            self = Kind(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
        }
    }

    let type: Kind
    // transcript
    let role: String?
    let text: String?
    let partial: Bool?
    // tool_call
    let id: String?
    let name: String?
    let args: JSONValue?
    // activity
    let kind: String?
    let label: String?
    let detail: String?
    // activity, operator: the task it belongs to
    let taskId: String?
    // operator
    let active: Bool?
    // task
    let task: TaskItem?
    // profile
    let profile: JSONValue?
    // ready, error
    let model: String?
    let message: String?

    enum CodingKeys: String, CodingKey {
        case type, role, text, partial, id, name, args, kind, label, detail, active, task, profile, model, message
        case taskId = "task_id"
    }
}

/// A background task, as the brain reports it (slice_mac/tasks.py `Task.snapshot`).
struct TaskItem: Decodable, Sendable, Identifiable, Equatable {
    struct Confirm: Decodable, Sendable, Equatable {
        let title: String
        let detail: String?
    }

    struct Card: Decodable, Sendable, Equatable, Identifiable {
        let title: String
        let subtitle: String?
        let image: String?
        let url: String?
        let reason: String?
        var id: String { title + (subtitle ?? "") }
    }

    let id: String
    let title: String
    let status: String
    let steps: [String]
    let question: String?
    let confirm: Confirm?
    let say: String?
    let cards: [Card]
    let error: String?

    var isRunning: Bool { status == "running" }
    var needsYou: Bool { status == "needs_input" || status == "needs_confirmation" }
    var isOver: Bool { status == "done" || status == "failed" || status == "cancelled" }
}
