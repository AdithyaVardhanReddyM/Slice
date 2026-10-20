import Foundation

/// A JSON frame from the brain (apps/agent/slice_mac/routes.py). Audio arrives as binary frames instead.
struct BrainEvent: Decodable, Sendable {
    enum Kind: String, Decodable, Sendable {
        case ready, transcript, activity, interrupted, error
        case toolCall = "tool_call"
        case turnComplete = "turn_complete"
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
    // ready, error
    let model: String?
    let message: String?
}
