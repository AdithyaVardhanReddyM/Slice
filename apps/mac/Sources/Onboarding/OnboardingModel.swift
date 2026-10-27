import AppKit
import SwiftUI

/// The first-run window: Slice gets to know the user before it picks anything. Welcome, home
/// (on a map), three picking steps (music, film and TV, brands and books) whose tiles follow
/// the picks so far (slice_mac/onboarding.py), six quick questions that become plain facts,
/// the permissions, a first try at talking, the taste it read, and the apps to connect.
@MainActor
final class OnboardingWindow {
    static let shared = OnboardingWindow()
    private(set) var window: NSWindow?
    private(set) var model: OnboardingModel?

    func show(agent: AgentSession) {
        if window == nil {
            let model = OnboardingModel(agent: agent)
            self.model = model
            let view = OnboardingView(model: model) { [weak self] in
                self?.model?.closed()
                self?.close()
            }
            let window = SkyWindow(size: OnboardingView.size, content: view)
            window.center()
            self.window = window
        }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    func close() {
        window?.close()
        window = nil
        model = nil
    }
}

/// One thing to pick (a Qloo entity with its picture).
struct Tile: Identifiable, Equatable, Codable {
    let id: String
    let name: String
    let kind: String?
    let image: String?
    let description: String?

    init?(_ json: JSONValue) {
        guard let id = json["id"]?.string, let name = json["name"]?.string else { return nil }
        self.id = id
        self.name = name
        kind = json["kind"]?.string
        image = json["image"]?.string
        description = json["description"]?.string
    }

    var json: JSONValue {
        .object(["id": .string(id), "name": .string(name), "kind": kind.map(JSONValue.string) ?? .null,
                 "image": image.map(JSONValue.string) ?? .null])
    }
}

/// What an unfinished setup has so far, kept in Application Support/Slice/onboarding.json
/// (TasteStore) so a relaunch in the middle carries on where it was.
struct OnboardingProgress: Codable {
    /// Whose it is (TasteStore.userID): a reset Mac gets a new id and starts over.
    var user: String
    var step: Int
    var name: String
    var home: HomePicker.Place?
    var picked: [Tile]
    var answers: [String: Set<String>]
    var questionIndex: Int
}

struct Question: Identifiable {
    struct Option: Identifiable {
        let label: String
        let symbol: String
        /// What Slice remembers when it's picked (nil: nothing to remember).
        let fact: String?
        var id: String { label }
    }

    let id: String
    let title: String
    let multi: Bool
    let options: [Option]

    /// Each answer becomes a plain fact the agent follows ("Doesn't eat meat"), never a score.
    static let all: [Question] = [
        Question(id: "night", title: "A free Saturday night looks like", multi: false, options: [
            Option(label: "Dinner and a show", symbol: "theatermasks", fact: "Loves dinner and a show on a free night"),
            Option(label: "Friends over", symbol: "person.3", fact: "Likes having friends over"),
            Option(label: "A quiet night in", symbol: "sofa", fact: "Prefers a quiet night in with a film"),
            Option(label: "Somewhere new", symbol: "map", fact: "Likes trying somewhere new"),
        ]),
        Question(id: "eat", title: "When you eat out, you go for", multi: false, options: [
            Option(label: "A neighbourhood spot", symbol: "house", fact: "Prefers relaxed neighbourhood places"),
            Option(label: "Somewhere with a buzz", symbol: "speaker.wave.2", fact: "Likes lively places with a buzz"),
            Option(label: "A special occasion", symbol: "wineglass", fact: "Enjoys special-occasion restaurants"),
            Option(label: "Cheap and very good", symbol: "takeoutbag.and.cup.and.straw", fact: "Likes cheap, very good food"),
        ]),
        Question(id: "diet", title: "Anything you don't eat or drink?", multi: true, options: [
            Option(label: "I eat everything", symbol: "fork.knife", fact: nil),
            Option(label: "Meat", symbol: "leaf", fact: "Doesn't eat meat"),
            Option(label: "Anything from animals", symbol: "carrot", fact: "Vegan"),
            Option(label: "Pork", symbol: "nosign", fact: "Doesn't eat pork"),
            Option(label: "Alcohol", symbol: "wineglass", fact: "Doesn't drink alcohol"),
            Option(label: "Gluten", symbol: "allergens", fact: "Avoids gluten"),
        ]),
        Question(id: "move", title: "How do you get around?", multi: false, options: [
            Option(label: "On foot", symbol: "figure.walk", fact: "Gets around on foot"),
            Option(label: "Subway and buses", symbol: "tram", fact: "Takes public transport"),
            Option(label: "Bike", symbol: "bicycle", fact: "Gets around by bike"),
            Option(label: "Car", symbol: "car", fact: "Drives"),
        ]),
        Question(id: "new", title: "New things or old favourites?", multi: false, options: [
            Option(label: "Show me new things", symbol: "binoculars", fact: "Wants new discoveries over safe picks"),
            Option(label: "A mix of both", symbol: "shuffle", fact: "Likes a mix of new and familiar"),
            Option(label: "Mostly what I know", symbol: "heart", fact: "Sticks mostly to what they know"),
        ]),
        Question(id: "time", title: "Mornings or nights?", multi: false, options: [
            Option(label: "Early riser", symbol: "sunrise", fact: "Early riser"),
            Option(label: "Night owl", symbol: "moon.stars", fact: "Night owl"),
            Option(label: "Depends on the day", symbol: "calendar", fact: nil),
        ]),
    ]
}

@MainActor
@Observable
final class OnboardingModel {
    enum Step: Int, CaseIterable {
        case welcome, home, music, screen, everyday, questions, access, talk, reveal, connect
    }

    let agent: AgentSession
    var step: Step = .welcome
    var name = ""
    let home: HomePicker
    /// Everything picked, in the order picked.
    private(set) var picked: [Tile] = []
    private(set) var starters: [Step: [Tile]] = [:]
    private(set) var more: [Step: [Tile]] = [:]
    private(set) var results: [Tile] = []
    var query = ""
    var answers: [String: Set<String>] = [:]
    /// The question on screen (they come one at a time).
    var questionIndex = 0
    /// "music", "podcasts" or "books" while that library is being read.
    private(set) var importing: String?
    private(set) var building = false
    private(set) var problem: String?
    private(set) var graph = GraphLayout()
    private(set) var nextUp: [GraphNode] = []

    @ObservationIgnored private var moreJob: Task<Void, Never>?
    @ObservationIgnored private var savedCity: String
    /// Off while drawing for a check and once the setup is done, so nothing is kept to resume.
    @ObservationIgnored private var keeping = true
    @ObservationIgnored private var done = false

    init(agent: AgentSession) {
        self.agent = agent
        name = agent.profile["name"]?.string ?? ""
        savedCity = agent.profile["city"]?.string ?? ""
        home = HomePicker(place: HomePicker.saved(agent.profile))
        // Left part-way last time (or macOS relaunched the app for a permission): same step, same picks.
        if let saved = TasteStore.loadOnboarding() {
            step = Step(rawValue: saved.step) ?? .welcome
            if !saved.name.isEmpty { name = saved.name }
            if let place = saved.home { home.place = place }
            picked = saved.picked
            answers = saved.answers
            questionIndex = min(max(saved.questionIndex, 0), Question.all.count - 1)
            resume()
        }
    }

    static func stepName(_ step: Step) -> String {
        switch step {
        case .music: "music"
        case .screen: "screen"
        case .everyday: "everyday"
        default: ""
        }
    }

    var isPicking: Bool { [.music, .screen, .everyday].contains(step) }

    func picks(on step: Step) -> [Tile] {
        let kinds: Set<String> = switch step {
        case .music: ["artist", "album", "podcast"]
        case .screen: ["movie", "tv_show"]
        default: ["brand", "book", "author", "place"]
        }
        return picked.filter { kinds.contains($0.kind ?? "") }
    }

    func isPicked(_ tile: Tile) -> Bool { picked.contains { $0.id == tile.id } }

    func toggle(_ tile: Tile) {
        if let i = picked.firstIndex(where: { $0.id == tile.id }) {
            picked.remove(at: i)
        } else {
            picked.append(tile)
        }
        refreshMore()
        persist()
    }

    // MARK: Moving between steps

    func next() {
        if step == .questions { build() }
        guard let following = Step(rawValue: step.rawValue + 1) else { return }
        go(following)
    }

    func back() {
        guard let previous = Step(rawValue: step.rawValue - 1) else { return }
        go(previous)
    }

    private func go(_ to: Step) {
        query = ""
        results = []
        problem = nil
        withAnimation(.snappy(duration: 0.35)) { step = to }
        if to == .home, home.place == nil, !savedCity.isEmpty {
            home.choose(named: savedCity)
        }
        if isPicking {
            loadStarters(to)
            refreshMore()
        }
        persist()
    }

    // MARK: Carrying on after a quit

    /// Picks up the saved step: tiles for a picking step, or the taste the brain read before.
    private func resume() {
        if isPicking {
            loadStarters(step)
            refreshMore()
        } else if step.rawValue >= Step.access.rawValue {
            restoreTaste()
        }
    }

    /// The taste built on the way to the access step: from the graph kept on disk, else read
    /// again (or built now, if the brain was away the first time).
    private func restoreTaste() {
        let profile = agent.profile
        guard !(profile["seeds"]?.array.isEmpty ?? true) else {
            build()
            return
        }
        if let saved = TasteStore.loadGraph(), saved.key == TasteStore.graphKey(profile) {
            showTaste(saved.graph)
            return
        }
        building = true
        Task {
            defer { building = false }
            do {
                let graph = try await BrainHTTP.post("profile/graph", body: ["profile": profile])
                TasteStore.saveGraph(graph, key: TasteStore.graphKey(profile))
                showTaste(graph)
            } catch {
                problem = "Couldn't read your taste: \(error.localizedDescription)"
            }
        }
    }

    /// Everything entered so far, so a quit (macOS asks for one after Screen Recording and
    /// Accessibility are allowed) doesn't lose it. Called on every change, and when the app quits.
    func persist() {
        guard keeping else { return }
        TasteStore.saveOnboarding(OnboardingProgress(
            user: TasteStore.userID, step: step.rawValue, name: name.trimmingCharacters(in: .whitespaces),
            home: home.place, picked: picked, answers: answers, questionIndex: questionIndex))
    }

    /// The setup is over: the profile says so (TasteStore.isOnboarded) and nothing is kept to resume.
    func markDone() {
        guard !done else { return }
        done = true
        keeping = false
        TasteStore.clearOnboarding()
        var fields = agent.profile.object
        fields["onboarding"] = ["done": true, "at": .string(ISO8601DateFormatter().string(from: Date()))]
        agent.setProfile(.object(fields))
    }

    /// The window was closed with its X. Once the taste has been shown that is the end of the
    /// setup; before that, the next launch comes back to this step.
    func closed() {
        if step.rawValue >= Step.reveal.rawValue { markDone() } else { persist() }
    }

    /// The opening tiles for every picking step, fetched while the user reads the welcome.
    func prefetch() {
        for step in [Step.music, .screen, .everyday] { loadStarters(step) }
    }

    private func loadStarters(_ step: Step) {
        guard starters[step] == nil else { return }
        starters[step] = []
        Task {
            do {
                let res = try await BrainHTTP.get("onboarding/starters", query: ["step": Self.stepName(step)])
                starters[step] = res["tiles"]?.array.compactMap(Tile.init) ?? []
            } catch {
                starters[step] = nil
                problem = "Slice can't reach its brain. Is the agent server running?"
            }
        }
    }

    /// "Because of your picks": what Qloo says fits everything picked so far, on this step.
    private func refreshMore() {
        guard isPicking, !picked.isEmpty else { return }
        let step = step
        moreJob?.cancel()
        moreJob = Task {
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            do {
                let res = try await BrainHTTP.post("onboarding/more", body: [
                    "step": .string(Self.stepName(step)), "picked": .array(picked.map { .string($0.id) }),
                    "exclude": .array(picked.map { .string($0.id) }),
                ])
                guard !Task.isCancelled else { return }
                let fresh = res["tiles"]?.array.compactMap(Tile.init) ?? []
                // Keep what was already picked from this row; add the new ones after.
                let kept = (more[step] ?? []).filter(isPicked)
                withAnimation(.snappy) { more[step] = kept + fresh.filter { t in !kept.contains { $0.id == t.id } } }
            } catch {}
        }
    }

    func search() {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        let kind: String = switch step {
        case .music: "artist,podcast"
        case .screen: "movie,tv_show"
        default: "brand,book"
        }
        Task {
            do {
                let res = try await BrainHTTP.get("search", query: ["q": q, "kind": kind])
                results = res["results"]?.array.compactMap(Tile.init) ?? []
                problem = results.isEmpty ? "Nothing called \(q) in Qloo's taste graph." : nil
            } catch {
                problem = "Slice can't reach its brain. Is the agent server running?"
            }
        }
    }

    // MARK: What's already on this Mac

    func addFromMusic() {
        importing = "music"
        Task {
            defer { importing = nil }
            guard let names = await MusicLibrary.topArtists(6), !names.isEmpty else {
                problem = "Couldn't read your Music library. Is Slice allowed to control Music?"
                return
            }
            await add(names, kind: "artist")
        }
    }

    func addFromPodcasts() {
        guard Permissions.isGranted(.fullDiskAccess) else {
            problem = "Reading Podcasts needs Full Disk Access. Turn it on for Slice, then try again."
            Permissions.openSettings(.fullDiskAccess)
            return
        }
        importing = "podcasts"
        Task {
            defer { importing = nil }
            let names = await Task.detached { LocalLibrary.podcasts(8) }.value
            guard let names, !names.isEmpty else {
                problem = "Didn't find any podcasts you follow."
                return
            }
            await add(names, kind: "podcast")
        }
    }

    func addFromBooks() {
        importing = "books"
        Task {
            defer { importing = nil }
            let books = await Task.detached { LocalLibrary.books(8) }.value
            guard let books, !books.isEmpty else {
                problem = "Didn't find any books in Apple Books."
                return
            }
            await add(books.map(\.title), kind: "book")
        }
    }

    /// Names to Qloo tiles, kept only when the name really matches (Qloo search is loose).
    private func add(_ names: [String], kind: String) async {
        var added = 0
        for name in names {
            guard let hits = try? await BrainHTTP.get("search", query: ["q": name, "kind": kind])["results"]?.array,
                  let tile = hits.compactMap(Tile.init).first(where: { Self.sameName($0.name, name) }),
                  !isPicked(tile) else { continue }
            withAnimation(.snappy) { picked.append(tile) }
            added += 1
        }
        problem = added == 0 ? "Qloo didn't know those. Search for a few instead." : nil
        refreshMore()
        persist()
    }

    private static func sameName(_ a: String, _ b: String) -> Bool {
        func norm(_ s: String) -> String {
            s.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: " ")
        }
        let x = norm(a), y = norm(b)
        return !x.isEmpty && (x == y || x.hasPrefix(y + " ") || y.hasPrefix(x + " "))
    }

    // MARK: Questions

    var question: Question { Question.all[min(questionIndex, Question.all.count - 1)] }

    func choose(_ option: Question.Option, in question: Question) {
        var chosen = answers[question.id] ?? []
        if question.multi {
            if chosen.contains(option.label) {
                chosen.remove(option.label)
            } else if option.fact == nil {
                chosen = [option.label]
            } else {
                chosen.insert(option.label)
                chosen = chosen.filter { label in question.options.first { $0.label == label }?.fact != nil }
            }
        } else {
            chosen = chosen.contains(option.label) ? [] : [option.label]
        }
        answers[question.id] = chosen
        persist()
        // One answer is enough for a single-choice question: move on by itself.
        if !question.multi, !chosen.isEmpty {
            let at = questionIndex
            Task {
                try? await Task.sleep(for: .milliseconds(380))
                if step == .questions, questionIndex == at { nextQuestion() }
            }
        }
    }

    func nextQuestion() {
        if questionIndex < Question.all.count - 1 {
            withAnimation(.snappy) { questionIndex += 1 }
            persist()
        } else {
            next()
        }
    }

    func previousQuestion() {
        if questionIndex > 0 {
            withAnimation(.snappy) { questionIndex -= 1 }
            persist()
        } else {
            back()
        }
    }

    var facts: [String] {
        Question.all.flatMap { q in q.options.filter { answers[q.id]?.contains($0.label) == true }.compactMap(\.fact) }
    }

    // MARK: Building the taste

    private func build() {
        building = true
        problem = nil
        var prefs: [String: JSONValue] = [:]
        if let new = answers["new"]?.first {
            prefs["discovery"] = .string(new.hasPrefix("Show") ? "new" : (new.hasPrefix("Mostly") ? "known" : "mix"))
        }
        // The exact point of home rides along in the profile, so places start from the real spot.
        var base = agent.profile
        if case .object(var fields) = base, let point = home.json {
            fields["home"] = point
            base = .object(fields)
        }
        let body: JSONValue = [
            "entities": .array(picked.map(\.json)), "city": .string(home.place?.name ?? savedCity),
            "base": base, "facts": .array(facts.map(JSONValue.string)), "prefs": .object(prefs),
            "name": .string(name.trimmingCharacters(in: .whitespaces)), "onboarding": true,
        ]
        Task {
            defer { building = false }
            do {
                let res = try await BrainHTTP.post("profile/build", body: body)
                guard let built = res["profile"] else { return }
                agent.setProfile(built)
                let graph = try await BrainHTTP.post("profile/graph", body: ["profile": built])
                TasteStore.saveGraph(graph, key: TasteStore.graphKey(built))
                showTaste(graph)
            } catch {
                problem = "Couldn't read your taste: \(error.localizedDescription)"
            }
        }
    }

    /// The reveal shows the loves and their strongest threads; people and dislikes wait for Settings.
    private func showTaste(_ graph: JSONValue) {
        let (nodes, edges) = TasteSpace.parse(graph)
        let (keep, links) = TasteSpace.trim((nodes.filter { [.you, .love, .tag].contains($0.style) }, edges), threads: 6, picks: 0)
        self.graph.update(nodes: keep, edges: links, animate: true)
        nextUp = nodes.filter { $0.style == .pick }
    }

    #if DEBUG
    /// -renderSettings: every step filled in, as if someone had picked a few things.
    func prepareForRender() async {
        keeping = false
        if name.isEmpty { name = "Alex" }
        if home.place == nil {
            home.place = HomePicker.Place(name: "Williamsburg, Brooklyn", detail: "New York, United States", lat: 40.7142, lon: -73.9614)
        }
        for step in [Step.music, .screen, .everyday] {
            let res = try? await BrainHTTP.get("onboarding/starters", query: ["step": Self.stepName(step)])
            starters[step] = res?["tiles"]?.array.compactMap(Tile.init) ?? []
        }
        let want: Set<String> = ["Mitski", "Frank Ocean", "Bon Iver", "Past Lives", "Aftersun", "Polaroid"]
        picked = [Step.music, .screen, .everyday].flatMap { starters[$0] ?? [] }.filter { want.contains($0.name) }
        for step in [Step.music, .screen, .everyday] {
            let res = try? await BrainHTTP.post("onboarding/more", body: [
                "step": .string(Self.stepName(step)), "picked": .array(picked.map { .string($0.id) }),
                "exclude": .array(picked.map { .string($0.id) }),
            ])
            more[step] = res?["tiles"]?.array.compactMap(Tile.init) ?? []
        }
        answers = ["night": ["A quiet night in"], "eat": ["A neighbourhood spot"], "diet": ["Meat"], "move": ["On foot"],
                   "new": ["Show me new things"]]
        questionIndex = 2
        if let graph = try? await BrainHTTP.post("profile/graph", body: ["profile": agent.profile]) {
            let (nodes, edges) = TasteSpace.parse(graph)
            let (keep, links) = TasteSpace.trim((nodes.filter { [.you, .love, .tag].contains($0.style) }, edges), threads: 6, picks: 0)
            self.graph.update(nodes: keep, edges: links, animate: false)
            nextUp = nodes.filter { $0.style == .pick }
        }
    }

    var renderImages: [String] {
        (starters.values.flatMap { $0 } + more.values.flatMap { $0 }).compactMap(\.image) + graph.nodes.compactMap(\.image)
    }
    #endif

    func finish() {
        markDone()
        agent.show(Nudge(id: "welcome", kind: "learn", title: "Slice is ready",
                         line: "Hover the notch to type, or hold fn and control to talk."))
    }
}
