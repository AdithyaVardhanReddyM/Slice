import Foundation
import Observation

/// The conversation with the brain: talk-key audio up, voice and transcripts down,
/// the Mac tools the brain asks for, and the background tasks it runs. The island
/// draws itself from this.
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
    /// Background tasks, newest first (the brain's `task` frames).
    private(set) var tasks: [TaskItem] = []
    /// The user's taste profile (local-first, see TasteStore).
    private(set) var profile: JSONValue = TasteStore.load()

    /// The task that needs an answer or a yes, if any: the island opens for it.
    var taskNeedingYou: TaskItem? { tasks.first { $0.needsYou } }
    var runningTask: TaskItem? { tasks.first { $0.isRunning } }

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
        brain.hello = { [weak self] in
            [
                "type": "hello",
                "user_id": .string(TasteStore.userID),
                "profile": self?.profile ?? [:],
                "timezone": .string(TimeZone.current.identifier),
            ]
        }
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

    func loadSampleTasks() {
        tasks = [
            TaskItem(id: "s1", title: "Friday dinner with Sam", status: "needs_confirmation",
                     steps: ["Checked your calendar", "Compared your taste with Sam's (10 shared threads)", "Place picks for your taste near Williamsburg (5 from Qloo)"],
                     question: nil, confirm: .init(title: "Book Land to Sea for 2 on Friday at 8 PM, under Sam Lee?", detail: "402 Graham Ave, Brooklyn. Cozy wine bar with comfort food."),
                     say: nil, cards: [], error: nil),
            TaskItem(id: "s2", title: "Records for Maya", status: "done",
                     steps: ["Saved what Maya loves", "Artist picks for your taste (5 from Qloo)", "Showed 3 picks"],
                     question: nil, confirm: nil,
                     say: "Maya's into moody, cinematic stuff, so I'd start with Radiohead's In Rainbows on vinyl. Frank Ocean's Blonde is the safe second pick.",
                     cards: [
                        .init(title: "Radiohead", subtitle: "Artist", image: "https://images.qloo.com/i/70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C-420x-auto.jpg", url: nil, reason: "Her Aftersun streak, in record form"),
                        .init(title: "Frank Ocean", subtitle: "Artist", image: "https://images.qloo.com/i/2B134C93-39EB-4A08-A72D-5F8F1167FDAA-420x-auto.jpg", url: nil, reason: "Tender and slow, like Past Lives"),
                        .init(title: "Land to Sea", subtitle: "402 Graham Ave, Brooklyn", image: nil, url: nil, reason: "For after the record shop"),
                     ], error: nil),
        ]
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
        tasks.removeAll { $0.isOver }
        brain.send(["type": "reset"])
    }

    // MARK: Tasks

    /// The island's buttons on a task that wants a yes or no.
    func confirm(_ task: TaskItem, approved: Bool) {
        brain.send(["type": "task_confirm", "id": .string(task.id), "approved": .bool(approved)])
    }

    /// A typed answer to a task's question.
    func answer(_ task: TaskItem, text: String) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        brain.send(["type": "task_reply", "id": .string(task.id), "text": .string(text)])
    }

    func cancel(_ task: TaskItem) {
        brain.send(["type": "task_cancel", "id": .string(task.id)])
    }

    func dismiss(_ task: TaskItem) {
        tasks.removeAll { $0.id == task.id }
    }

    // MARK: Taste profile

    /// Settings built or edited the profile: keep it, and tell the brain.
    func setProfile(_ profile: JSONValue) {
        self.profile = profile
        TasteStore.save(profile)
        brain.send(["type": "profile", "profile": profile])
    }

    // MARK: From the brain

    private func handle(_ event: BrainEvent) {
        switch event.type {
        case .transcript:
            guard let text = event.text else { return }
            transcript(role: event.role == "user" ? .user : .agent, text: text, partial: event.partial ?? false)
        case .activity:
            // A task's steps show on its card; only the talker's own lookups list here.
            guard event.taskId == nil else { return }
            activities.append(Activity(kind: event.kind ?? "tool", label: event.label ?? "", detail: event.detail))
        case .task:
            guard let task = event.task else { return }
            if let i = tasks.firstIndex(where: { $0.id == task.id }) {
                tasks[i] = task
            } else {
                tasks.insert(task, at: 0)
            }
            tasks = Array(tasks.prefix(6))
        case .profile:
            guard let profile = event.profile else { return }
            self.profile = profile
            TasteStore.save(profile)
        case .operatorStatus:
            AgentCursor.shared.setOperating(event.active ?? false)
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
