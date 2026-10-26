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
    /// Something Slice brings up: a "very you" pill, a birthday, or a why card the user asked for.
    private(set) var nudge: Nudge?
    /// The island is open to show `nudge` (asked for by voice), not because it's hovered.
    private(set) var presenting = false
    /// Thumbs given on cards this session, by card title ("up" or "down"; "saving" while it's sent).
    private(set) var feedback: [String: String] = [:]
    /// Settings > General > "Use my taste". Off, Slice answers like any assistant (for comparing).
    private(set) var useTaste: Bool = UserDefaults.standard.object(forKey: AgentSession.useTasteKey) as? Bool ?? true
    static let useTasteKey = "useTaste"

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
    private var watchers: Watchers?
    private var nudgeTimer: Task<Void, Never>?

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
                "taste": .bool(self?.useTaste ?? true),
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
        case .online:
            connection = .online
            if watchers == nil {
                watchers = Watchers(agent: self)
                watchers?.start()
            }
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
    /// -renderSettings -renderProfile <file>: draw Settings for a given profile, keeping the real one.
    func useProfileForRender(_ profile: JSONValue) {
        self.profile = profile
    }

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

    /// Fetch every picture and map the sample cards draw, so -renderIsland shows them.
    func prepareForRender() async {
        let views = tasks.flatMap(\.views)
        var urls = tasks.flatMap(\.cards).compactMap(\.image) + views.flatMap { $0.cards ?? [] }.compactMap(\.image)
        urls += [views.compactMap(\.why).first?.thing.image, nudge?.why?.thing.image].compactMap { $0 }
        // People's faces (Avatar asks for 2.5 times the size it draws at).
        urls += views.compactMap(\.name).map { Avatar.url($0, pixels: 110) }
        for url in urls { _ = await ImageCache.load(url) }
        await MapShots.prepare(views)
    }

    /// One task per rich card, for `-sampleViews person|gifts|timeline|map|note|why|file`.
    func loadSampleView(_ type: String) {
        guard let data = SampleViews.json[type]?.data(using: .utf8),
              let view = try? JSONDecoder().decode(TaskView.self, from: data) else { return }
        let say = type == "gifts" ? "Four ideas for Maya, from Polaroid to a Nick Drake record. Want me to put one in your cart?" : nil
        tasks = [TaskItem(id: "v-\(type)", title: SampleViews.titles[type] ?? type.capitalized, status: "done", steps: ["Done"],
                          question: nil, confirm: nil, say: say, cards: [], views: [view], error: nil)]
        if type == "why", let why = view.why {
            tasks = []
            show(Nudge(id: "n1", kind: "why", title: why.thing.name, line: why.line, show: true, why: why))
        }
        if type == "pill", let why = view.why {
            tasks = []
            show(Nudge(id: "n2", kind: "why", title: "Very you", line: "Shares 'dreamy' and 'nostalgic' with Lady Bird", why: why))
        }
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

    // MARK: Nudges

    /// Show a nudge: a pill under the notch for a while, or the open island when it was asked for.
    func show(_ nudge: Nudge) {
        self.nudge = nudge
        presenting = nudge.show
        nudgeTimer?.cancel()
        nudgeTimer = Task {
            try? await Task.sleep(for: .seconds(nudge.show ? 25 : 14))
            guard !Task.isCancelled else { return }
            // Unread, it goes away; hovering holds it (holdNudge) until the island closes.
            if self.nudge?.id == nudge.id {
                self.presenting = false
                self.nudge = nil
            }
        }
    }

    /// The pointer opened the island: keep the nudge up while it's read.
    func holdNudge() {
        nudgeTimer?.cancel()
    }

    /// The island closed: a nudge the user has seen is done.
    func islandClosed() {
        presenting = false
        nudge = nil
    }

    func dismissNudge() {
        nudgeTimer?.cancel()
        nudge = nil
        presenting = false
    }

    /// A nudge's button ("Sort it"): ask Slice in words.
    func act(on nudge: Nudge) {
        dismissNudge()
        if let prompt = nudge.prompt { send(text: prompt) }
    }

    /// A frame from one of the watchers (`noticed`, `run_routine`).
    func sendFrame(_ frame: JSONValue) {
        brain.send(frame)
    }

    // MARK: Learning (slice_mac/learning.py)

    /// A thumbs up or down on a card: up adds it to the user's taste, down means not for them.
    func give(_ verdict: String, to card: TaskItem.Card) {
        guard connection == .online else {
            lastError = "Slice can't reach its brain. Is the agent server running?"
            return
        }
        feedback[card.title] = verdict
        var frame: [String: JSONValue] = ["type": "feedback", "title": .string(card.title), "verdict": .string(verdict)]
        if let tag = card.tag { frame["tag"] = .string(tag) }
        brain.send(.object(frame))
    }

    /// The answer to "Add it to your taste?".
    func answerLearn(_ nudge: Nudge, accept: Bool) {
        dismissNudge()
        guard let learn = nudge.learn else { return }
        brain.send(["type": "learn_answer", "id": .string(learn.id), "accept": .bool(accept)])
    }

    /// Settings switched taste on or off: the brain starts a fresh conversation that knows.
    func setUseTaste(_ on: Bool) {
        useTaste = on
        UserDefaults.standard.set(on, forKey: Self.useTasteKey)
        stopEverything()
        turns = []
        activities = []
        brain.send(["type": "settings", "taste": .bool(on)])
    }

    /// A Mac tool run from the app itself (the why card's play button).
    func runTool(_ name: String, args: JSONValue) {
        Task { _ = await tools.run(name, args: args) }
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
        case .nudge:
            guard let nudge = event.nudge else { return }
            show(nudge)
        case .feedbackAck:
            guard let title = event.title else { return }
            if event.ok == true {
                feedback[title] = (event.verdict ?? "up") + "-saved"
            } else {
                feedback[title] = nil
                lastError = event.message ?? "Couldn't save that."
            }
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
