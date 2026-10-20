import Foundation
import Observation

/// The conversation with the brain: talk-key audio up, voice and transcripts down,
/// and the Mac tools the brain asks for. The island draws itself from this.
@MainActor
@Observable
final class AgentSession {
    enum Connection {
        case offline, connecting, online

        var label: String {
            switch self {
            case .offline: "Slice is offline"
            case .connecting: "Connecting…"
            case .online: "Slice is ready"
            }
        }
    }

    enum Phase { case idle, listening, thinking, speaking }

    enum Role { case user, agent }

    struct Turn: Identifiable {
        let id = UUID()
        let role: Role
        var text: String
        var done: Bool
    }

    struct Activity: Identifiable {
        let id = UUID()
        let kind: String
        let label: String
        let detail: String?
    }

    private(set) var connection: Connection = .offline
    private(set) var phase: Phase = .idle
    private(set) var turns: [Turn] = []
    /// What the agent did for the current request (tool calls, Qloo lookups).
    private(set) var activities: [Activity] = []
    /// Mic loudness 0…1 while listening, for the waveform.
    private(set) var micLevel: Float = 0
    private(set) var lastError: String?

    /// The agent's words for the current reply, for the compact island's caption.
    var caption: String? {
        guard let last = turns.last, last.role == .agent else { return nil }
        return last.text
    }

    private let brain = BrainClient()
    private let mic = MicCapture()
    private let voice = VoicePlayer()
    private let tools = LocalTools()

    private enum Talk { case off, pending, streaming }
    private var talk: Talk = .off
    /// Audio from the first moments of a press, sent once the press counts as a hold.
    private var heldBack: [Data] = []
    private var holdTimer: Task<Void, Never>?
    private var thinkingTimeout: Task<Void, Never>?
    /// Mic chunks come from an audio thread; this stream keeps them in order.
    private var micItems: AsyncStream<MicItem>.Continuation?

    private enum MicItem: Sendable { case chunk(Data, Float), end }

    /// A press shorter than this is a tap, not talk.
    private static let holdThreshold: Duration = .milliseconds(180)

    init() {
        brain.onState = { [weak self] state in self?.brainStateChanged(state) }
        brain.onEvent = { [weak self] event in self?.handle(event) }
        brain.onAudio = { [weak self] data in self?.play(data) }
        voice.onIdle = { [weak self] in
            Task { @MainActor in self?.voiceFinished() }
        }
    }

    // MARK: Connection

    func connect() {
        brain.connect(url: BrainSettings.url, token: BrainSettings.token)
    }

    func reconnect() {
        brain.disconnect()
        connect()
    }

    private func brainStateChanged(_ state: BrainClient.State) {
        switch state {
        case .offline: connection = .offline
        case .connecting: connection = .connecting
        case .online: connection = .online
        }
        if state == .offline, phase != .idle {
            stopEverything()
        }
    }

    // MARK: Talking (fn + control)

    func startTalking() {
        guard talk == .off else { return }
        voice.stop()
        lastError = nil
        guard connection == .online else {
            lastError = "Slice can't reach its brain. Is the agent server running?"
            return
        }
        let (stream, continuation) = AsyncStream<MicItem>.makeStream()
        micItems = continuation
        do {
            try mic.start { data, level in continuation.yield(.chunk(data, level)) }
        } catch {
            lastError = "No microphone is available."
            micItems = nil
            return
        }
        talk = .pending
        heldBack = []
        phase = .listening
        Task { await pumpMic(stream) }

        holdTimer = Task {
            try? await Task.sleep(for: Self.holdThreshold)
            guard !Task.isCancelled, talk == .pending else { return }
            activities = []
            brain.send(["type": "talk_start"])
            heldBack.forEach { brain.send(audio: $0) }
            heldBack = []
            talk = .streaming
        }
    }

    func stopTalking() {
        guard talk != .off else { return }
        holdTimer?.cancel()
        mic.stop()
        if talk == .pending {
            // Too short to be speech: drop it.
            talk = .off
            micItems?.finish()
            micItems = nil
            heldBack = []
            phase = .idle
            return
        }
        micItems?.yield(.end)
        micItems?.finish()
        micItems = nil
    }

    /// Another key was pressed with the talk keys: it was a shortcut, not talk. A press still
    /// under the hold threshold is dropped; audio already sent can't be taken back, so it ends.
    func cancelTalking() {
        stopTalking()
    }

    private func pumpMic(_ stream: AsyncStream<MicItem>) async {
        for await item in stream {
            switch item {
            case .chunk(let data, let level):
                micLevel = min(1, level * 6)
                switch talk {
                case .pending: heldBack.append(data)
                case .streaming: brain.send(audio: data)
                case .off: break
                }
            case .end:
                if talk == .streaming {
                    brain.send(["type": "talk_end"])
                    beginThinking()
                }
                talk = .off
                micLevel = 0
            }
        }
    }

    // MARK: Typing

    func send(text: String) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard connection == .online else {
            lastError = "Slice can't reach its brain. Is the agent server running?"
            return
        }
        voice.stop()
        lastError = nil
        activities = []
        turns.append(Turn(role: .user, text: text, done: true))
        brain.send(["type": "text", "text": .string(text)])
        beginThinking()
    }

    #if DEBUG
    func loadSampleConversation() {
        turns = [
            Turn(role: .user, text: "I loved Past Lives. What should I watch tonight?", done: true),
            Turn(role: .agent, text: "Try Aftersun. It has the same quiet ache about memory, and you'll want to sit with it after.", done: true),
        ]
        activities = [
            Activity(kind: "qloo", label: "Search \"Past Lives\"", detail: "5 results"),
            Activity(kind: "qloo", label: "Films for your taste", detail: "20 results"),
        ]
        phase = .speaking
    }

    func ask(_ question: String, whenOnline: Bool) {
        Task {
            while connection != .online { try? await Task.sleep(for: .milliseconds(200)) }
            send(text: question)
        }
    }
    #endif

    func clearError() {
        lastError = nil
    }

    func reset() {
        stopEverything()
        turns = []
        activities = []
        lastError = nil
        brain.send(["type": "reset"])
    }

    // MARK: From the brain

    private func handle(_ event: BrainEvent) {
        switch event.type {
        case .transcript:
            guard let text = event.text else { return }
            transcript(role: event.role == "user" ? .user : .agent, text: text, partial: event.partial ?? false)
        case .activity:
            activities.append(Activity(kind: event.kind ?? "tool", label: event.label ?? "", detail: event.detail))
        case .toolCall:
            guard let id = event.id, let name = event.name else { return }
            Task {
                let outcome = await tools.run(name, args: event.args)
                var reply: [String: JSONValue] = ["type": "tool_result", "id": .string(id)]
                switch outcome {
                case .success(let result): reply["result"] = result
                case .failure(let error): reply["error"] = .string(error.message)
                }
                brain.send(.object(reply))
            }
        case .interrupted:
            voice.stop()
        case .turnComplete:
            if phase == .speaking, !voice.isPlaying { phase = .idle }
        case .error:
            lastError = event.message
            if phase == .thinking { phase = .idle }
        case .ready, .unknown:
            break
        }
    }

    private func transcript(role: Role, text: String, partial: Bool) {
        if let i = turns.indices.last, turns[i].role == role, !turns[i].done {
            // Partials are pieces to append; the final one is the whole text.
            turns[i].text = partial ? turns[i].text + text : text
            turns[i].done = !partial
        } else {
            turns.append(Turn(role: role, text: text, done: !partial))
        }
        if role == .agent, phase == .thinking { phase = .speaking }
    }

    private func play(_ data: Data) {
        thinkingTimeout?.cancel()
        if phase == .thinking || phase == .idle { phase = .speaking }
        voice.enqueue(pcm16: data)
    }

    private func voiceFinished() {
        if phase == .speaking { phase = .idle }
    }

    private func beginThinking() {
        phase = .thinking
        thinkingTimeout?.cancel()
        thinkingTimeout = Task {
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled, phase == .thinking else { return }
            phase = .idle
            lastError = "No answer came back. Try again?"
        }
    }

    private func stopEverything() {
        holdTimer?.cancel()
        thinkingTimeout?.cancel()
        mic.stop()
        micItems?.finish()
        micItems = nil
        talk = .off
        heldBack = []
        micLevel = 0
        voice.stop()
        phase = .idle
    }
}
