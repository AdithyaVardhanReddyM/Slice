import Foundation

/// The WebSocket to the brain (`/mac/live`). Reconnects on its own with backoff and
/// hands frames to its owner in the order they arrive.
@MainActor
final class BrainClient {
    enum State: Equatable { case offline, connecting, online }

    var onState: ((State) -> Void)?
    var onEvent: ((BrainEvent) -> Void)?
    var onAudio: ((Data) -> Void)?

    private(set) var state: State = .offline {
        didSet { if state != oldValue { onState?(state) } }
    }

    private let session = URLSession(configuration: .default)
    private var task: URLSessionWebSocketTask?
    /// Bumped on every (re)connect so a stale receive loop stops instead of reconnecting.
    private var generation = 0
    private var retryDelay: Double = 1
    private var url: URL?
    private var token: String?

    func connect(url: URL, token: String?) {
        self.url = url
        self.token = token
        open()
    }

    func disconnect() {
        generation += 1
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        state = .offline
    }

    func send(_ json: JSONValue) {
        guard let task, state == .online,
              let data = try? JSONEncoder().encode(json),
              let text = String(data: data, encoding: .utf8) else { return }
        task.send(.string(text)) { _ in }
    }

    func send(audio: Data) {
        guard let task, state == .online else { return }
        task.send(.data(audio)) { _ in }
    }

    private func open() {
        guard let url else { return }
        generation += 1
        let gen = generation
        task?.cancel(with: .goingAway, reason: nil)

        var request = URLRequest(url: url)
        if let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let task = session.webSocketTask(with: request)
        task.maximumMessageSize = 16 << 20
        self.task = task
        state = .connecting
        task.resume()
        Task { await receiveLoop(task, gen) }
    }

    private func receiveLoop(_ task: URLSessionWebSocketTask, _ gen: Int) async {
        do {
            while gen == generation {
                let message = try await task.receive()
                guard gen == generation else { return }
                retryDelay = 1
                switch message {
                case .data(let data):
                    onAudio?(data)
                case .string(let text):
                    guard let event = try? JSONDecoder().decode(BrainEvent.self, from: Data(text.utf8)) else { continue }
                    if event.type == .ready { state = .online }
                    onEvent?(event)
                @unknown default:
                    break
                }
            }
        } catch {
            guard gen == generation else { return }
            state = .offline
            let delay = retryDelay
            retryDelay = min(retryDelay * 2, 10)
            try? await Task.sleep(for: .seconds(delay))
            if gen == generation { open() }
        }
    }
}
