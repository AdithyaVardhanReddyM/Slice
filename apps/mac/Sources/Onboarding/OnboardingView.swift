import AppKit
import SwiftUI

/// The first-run window: Slice gets to know the user's taste before it picks anything.
/// Welcome, home, three picking steps (music, film and TV, brands and books) whose tiles
/// follow the picks so far (slice_mac/onboarding.py), six quick questions that become plain
/// facts, the permissions with a try-it-now for talking, and the taste it read.
@MainActor
final class OnboardingWindow {
    static let shared = OnboardingWindow()
    private(set) var window: NSWindow?
    private(set) var model: OnboardingModel?

    func show(agent: AgentSession) {
        if window == nil {
            let model = OnboardingModel(agent: agent)
            self.model = model
            let view = OnboardingView(model: model) { [weak self] in self?.close() }
            let window = NSWindow(contentViewController: NSHostingController(rootView: view))
            window.styleMask = [.titled, .closable, .fullSizeContentView]
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.isMovableByWindowBackground = true
            // The brand is light: the window stays light in dark mode too.
            window.appearance = NSAppearance(named: .aqua)
            window.setContentSize(NSSize(width: OnboardingView.size.width, height: OnboardingView.size.height))
            window.isReleasedWhenClosed = false
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
struct Tile: Identifiable, Equatable {
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

struct Question: Identifiable {
    struct Option: Identifiable {
        let label: String
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
            Option(label: "Dinner and a show", fact: "Loves dinner and a show on a free night"),
            Option(label: "Friends over", fact: "Likes having friends over"),
            Option(label: "A quiet night in", fact: "Prefers a quiet night in with a film"),
            Option(label: "Somewhere new", fact: "Likes trying somewhere new"),
        ]),
        Question(id: "eat", title: "When you eat out, you go for", multi: false, options: [
            Option(label: "A neighbourhood spot", fact: "Prefers relaxed neighbourhood places"),
            Option(label: "Somewhere with a buzz", fact: "Likes lively places with a buzz"),
            Option(label: "A special occasion", fact: "Enjoys special-occasion restaurants"),
            Option(label: "Cheap and very good", fact: "Likes cheap, very good food"),
        ]),
        Question(id: "diet", title: "Anything you don't eat or drink?", multi: true, options: [
            Option(label: "I eat everything", fact: nil),
            Option(label: "Meat", fact: "Doesn't eat meat"),
            Option(label: "Anything from animals", fact: "Vegan"),
            Option(label: "Pork", fact: "Doesn't eat pork"),
            Option(label: "Alcohol", fact: "Doesn't drink alcohol"),
            Option(label: "Gluten", fact: "Avoids gluten"),
        ]),
        Question(id: "move", title: "How do you get around?", multi: false, options: [
            Option(label: "On foot", fact: "Gets around on foot"),
            Option(label: "Subway and buses", fact: "Takes public transport"),
            Option(label: "Bike", fact: "Gets around by bike"),
            Option(label: "Car", fact: "Drives"),
        ]),
        Question(id: "new", title: "New things or old favourites?", multi: false, options: [
            Option(label: "Show me new things", fact: "Wants new discoveries over safe picks"),
            Option(label: "A mix of both", fact: "Likes a mix of new and familiar"),
            Option(label: "Mostly what I know", fact: "Sticks mostly to what they know"),
        ]),
        Question(id: "time", title: "Mornings or nights?", multi: false, options: [
            Option(label: "Early riser", fact: "Early riser"),
            Option(label: "Night owl", fact: "Night owl"),
            Option(label: "Depends on the day", fact: nil),
        ]),
    ]
}

@MainActor
@Observable
final class OnboardingModel {
    enum Step: Int, CaseIterable {
        case welcome, home, music, screen, everyday, questions, setup, reveal
    }

    let agent: AgentSession
    var step: Step = .welcome
    var name = ""
    var city = ""
    /// Everything picked, in the order picked.
    private(set) var picked: [Tile] = []
    private(set) var starters: [Step: [Tile]] = [:]
    private(set) var more: [Step: [Tile]] = [:]
    private(set) var results: [Tile] = []
    var query = ""
    var answers: [String: Set<String>] = [:]
    private(set) var building = false
    private(set) var problem: String?
    private(set) var graph = GraphLayout()
    private(set) var nextUp: [GraphNode] = []

    @ObservationIgnored private var moreJob: Task<Void, Never>?

    init(agent: AgentSession) {
        self.agent = agent
        name = agent.profile["name"]?.string ?? ""
        city = agent.profile["city"]?.string ?? ""
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
        withAnimation(.snappy) { step = to }
        if isPicking {
            loadStarters(to)
            refreshMore()
        }
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
                starters[step] = (res["tiles"]?.array ?? []).compactMap(Tile.init)
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
                let fresh = (res["tiles"]?.array ?? []).compactMap(Tile.init)
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
        case .music: "artist"
        case .screen: "movie,tv_show"
        default: "brand,book"
        }
        Task {
            do {
                let res = try await BrainHTTP.get("search", query: ["q": q, "kind": kind])
                results = (res["results"]?.array ?? []).compactMap(Tile.init)
                if results.isEmpty { problem = "Qloo has nothing called \(q)." } else { problem = nil }
            } catch {
                problem = "Slice can't reach its brain. Is the agent server running?"
            }
        }
    }

    func addFromMusic() {
        Task {
            guard let names = await MusicLibrary.topArtists(6), !names.isEmpty else {
                problem = "Couldn't read your Music library. Is Slice allowed to control Music?"
                return
            }
            for name in names {
                guard let hit = try? await BrainHTTP.get("search", query: ["q": name, "kind": "artist"])["results"]?.array.first,
                      let tile = Tile(hit), !isPicked(tile) else { continue }
                picked.append(tile)
            }
            refreshMore()
        }
    }

    // MARK: Questions

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
        let body: JSONValue = [
            "entities": .array(picked.map(\.json)), "city": .string(city.trimmingCharacters(in: .whitespaces)),
            "base": agent.profile, "facts": .array(facts.map(JSONValue.string)), "prefs": .object(prefs),
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
                let (nodes, edges) = TasteSpace.parse(graph)
                // The reveal shows the loves and their threads; people and dislikes wait for Settings.
                let keep = nodes.filter { [.you, .love, .tag, .pick].contains($0.style) }
                self.graph.update(nodes: keep, edges: edges, animate: true)
                nextUp = nodes.filter { $0.style == .pick }
            } catch {
                problem = "Couldn't read your taste: \(error.localizedDescription)"
            }
        }
    }

    #if DEBUG
    /// -renderSettings: every step filled in, as if someone had picked a few things.
    func prepareForRender() async {
        if name.isEmpty { name = "Alex" }
        if city.isEmpty { city = "Williamsburg, Brooklyn" }
        for step in [Step.music, .screen, .everyday] {
            let res = try? await BrainHTTP.get("onboarding/starters", query: ["step": Self.stepName(step)])
            starters[step] = (res?["tiles"]?.array ?? []).compactMap(Tile.init)
        }
        let want: Set<String> = ["Mitski", "Frank Ocean", "Bon Iver", "Past Lives", "Aftersun", "Polaroid"]
        picked = [Step.music, .screen, .everyday].flatMap { starters[$0] ?? [] }.filter { want.contains($0.name) }
        for step in [Step.music, .screen, .everyday] {
            let res = try? await BrainHTTP.post("onboarding/more", body: [
                "step": .string(Self.stepName(step)), "picked": .array(picked.map { .string($0.id) }),
                "exclude": .array(picked.map { .string($0.id) }),
            ])
            more[step] = (res?["tiles"]?.array ?? []).compactMap(Tile.init)
        }
        answers = ["night": ["A quiet night in"], "eat": ["A neighbourhood spot"], "diet": ["Meat"], "move": ["On foot"],
                   "new": ["Show me new things"]]
        if let graph = try? await BrainHTTP.post("profile/graph", body: ["profile": agent.profile]) {
            let (nodes, edges) = TasteSpace.parse(graph)
            self.graph.update(nodes: nodes.filter { [.you, .love, .tag, .pick].contains($0.style) }, edges: edges, animate: false)
            nextUp = nodes.filter { $0.style == .pick }
        }
    }

    var renderImages: [String] {
        (starters.values.flatMap { $0 } + more.values.flatMap { $0 }).compactMap(\.image) + graph.nodes.compactMap(\.image)
    }
    #endif

    func finish() {
        agent.show(Nudge(id: "welcome", kind: "learn", title: "Slice is ready",
                         line: "Hover the notch to type, or hold fn and control to talk."))
    }
}

struct OnboardingView: View {
    static let size = CGSize(width: 860, height: 640)

    @Bindable var model: OnboardingModel
    let close: () -> Void
    @Environment(\.renderingForPreview) private var rendering

    static let paper = Color(red: 0.984, green: 0.973, blue: 0.945)
    static let ink = Color(red: 0.11, green: 0.1, blue: 0.09)

    var body: some View {
        VStack(spacing: 0) {
            progress
                .padding(.top, 34)
                .padding(.horizontal, 48)
            Group {
                switch model.step {
                case .welcome: welcome
                case .home: home
                case .music: picking(title: "Pick a few artists you love", subtitle: "Three or more is a good start. Slice finds what ties them together.")
                case .screen: picking(title: "Films and shows you love", subtitle: "The ones you'd watch again, or tell a friend about.")
                case .everyday: picking(title: "Brands and books you like", subtitle: "What you'd buy, wear or read. Slice uses these for gifts and shopping.")
                case .questions: questions
                case .setup: setup
                case .reveal: reveal
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.horizontal, 48)
            .padding(.top, 22)
            footer
                .padding(.horizontal, 48)
                .padding(.vertical, 22)
        }
        .frame(width: Self.size.width, height: Self.size.height)
        .background(Self.paper)
        .foregroundStyle(Self.ink)
        .environment(\.colorScheme, .light)
        .onAppear { model.prefetch() }
    }

    // MARK: Chrome

    private var progress: some View {
        HStack(spacing: 6) {
            ForEach(OnboardingModel.Step.allCases, id: \.self) { step in
                Capsule()
                    .fill(step.rawValue <= model.step.rawValue ? AnyShapeStyle(Brand.squeeze) : AnyShapeStyle(Self.ink.opacity(0.08)))
                    .frame(height: 4)
            }
        }
    }

    private var footer: some View {
        HStack {
            if model.step != .welcome, model.step != .reveal {
                Button("Back") { model.back() }
                    .buttonStyle(QuietButton())
            }
            if let problem = model.problem {
                Text(problem).font(.callout).foregroundStyle(.red).lineLimit(2)
            }
            Spacer()
            switch model.step {
            case .welcome:
                Button("Let's start") { model.next() }.buttonStyle(SqueezeButton())
            case .reveal:
                Button("Start using Slice") {
                    model.finish()
                    close()
                }
                .buttonStyle(SqueezeButton())
                .disabled(model.building)
            case .setup:
                Button(model.building ? "Reading your taste" : "See my taste") { model.next() }.buttonStyle(SqueezeButton())
            default:
                let skipping = model.isPicking && model.picks(on: model.step).isEmpty
                Button(skipping ? "Skip" : "Continue") { model.next() }
                    .buttonStyle(skipping ? AnyButtonStyle(QuietButton()) : AnyButtonStyle(SqueezeButton()))
            }
        }
    }

    private func heading(_ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 28, weight: .bold))
            Text(subtitle).font(.system(size: 15)).foregroundStyle(Self.ink.opacity(0.6))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Steps

    private var welcome: some View {
        VStack(spacing: 22) {
            Spacer(minLength: 20)
            SliceMark(height: 54)
            VStack(spacing: 10) {
                Text("Hi, I'm Slice.").font(.system(size: 38, weight: .bold))
                Text("I live in your notch and pick things the way a friend with great taste would: what to watch, where to eat, what to give. First, tell me what you love.")
                    .font(.system(size: 16))
                    .foregroundStyle(Self.ink.opacity(0.65))
                    .multilineTextAlignment(.center)
                    .frame(width: 520)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("What should I call you?").font(.system(size: 13, weight: .semibold))
                TextField("Your first name", text: $model.name)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(.white))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Self.ink.opacity(0.12)))
                    .onSubmit { model.next() }
            }
            .frame(width: 320)
            Text("About two minutes. Everything stays on this Mac.")
                .font(.system(size: 12.5))
                .foregroundStyle(Self.ink.opacity(0.45))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var home: some View {
        VStack(alignment: .leading, spacing: 22) {
            heading(model.name.isEmpty ? "Where's home?" : "Where's home, \(model.name)?",
                    "Places, plans and dinner picks start around here. A neighbourhood works best.")
            TextField("Williamsburg, Brooklyn", text: $model.city)
                .textFieldStyle(.plain)
                .font(.system(size: 18))
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Self.ink.opacity(0.12)))
                .frame(maxWidth: 460)
                .onSubmit { model.next() }
            FlowLayout(spacing: 8) {
                ForEach(["Williamsburg, Brooklyn", "West Village, New York", "Shoreditch, London", "Silver Lake, Los Angeles",
                         "Chiado, Lisbon", "Le Marais, Paris"], id: \.self) { place in
                    Button(place) { model.city = place }
                        .buttonStyle(ChoiceChip(on: model.city == place))
                }
            }
            .frame(maxWidth: 620, alignment: .leading)
        }
    }

    private func picking(title: String, subtitle: String) -> some View {
        let step = model.step
        let mine = model.picks(on: step)
        let grid = VStack(alignment: .leading, spacing: 16) {
            if !model.results.isEmpty {
                section("Results", tiles: model.results)
            }
            if let more = model.more[step], !more.isEmpty {
                section(step == .music ? "More like your picks" : "Because of your picks", tiles: more, highlight: true)
            }
            if let starters = model.starters[step] {
                if starters.isEmpty {
                    HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Finding a few to start with").foregroundStyle(Self.ink.opacity(0.5)) }
                } else {
                    section("Popular to start with", tiles: starters.filter { s in !(model.more[step] ?? []).contains { $0.id == s.id } })
                }
            }
        }
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .bottom) {
                heading(title, subtitle)
                if !mine.isEmpty {
                    Text("\(mine.count) picked")
                        .font(.system(size: 13, weight: .semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Brand.yellow))
                        .fixedSize()
                }
            }
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Self.ink.opacity(0.4))
                    TextField(step == .music ? "Search any artist" : (step == .screen ? "Search any film or show" : "Search any brand or book"),
                              text: $model.query)
                        .textFieldStyle(.plain)
                        .onSubmit { model.search() }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(.white))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Self.ink.opacity(0.12)))
                .frame(maxWidth: 360)
                if step == .music {
                    Button("Add my most played from Music") { model.addFromMusic() }
                        .buttonStyle(QuietButton())
                }
            }
            if rendering {
                grid.frame(maxHeight: .infinity, alignment: .top).clipped()
            } else {
                ScrollView { grid.padding(.bottom, 8) }.scrollIndicators(.never)
            }
        }
    }

    private func section(_ title: String, tiles: [Tile], highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                if highlight { Image(systemName: "arrow.triangle.branch").foregroundStyle(Brand.orange) }
                Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Self.ink.opacity(highlight ? 0.85 : 0.5))
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: 6), alignment: .leading, spacing: 16) {
                ForEach(rendering ? Array(tiles.prefix(6)) : tiles) { tile in
                    TileView(tile: tile, picked: model.isPicked(tile)) { model.toggle(tile) }
                }
            }
        }
    }

    private var questions: some View {
        let cards = LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
            ForEach(Question.all) { q in
                VStack(alignment: .leading, spacing: 10) {
                    Text(q.title).font(.system(size: 14.5, weight: .semibold))
                    FlowLayout(spacing: 6) {
                        ForEach(q.options) { option in
                            Button(option.label) { model.choose(option, in: q) }
                                .buttonStyle(ChoiceChip(on: model.answers[q.id]?.contains(option.label) == true))
                        }
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Self.ink.opacity(0.07)))
            }
        }
        return VStack(alignment: .leading, spacing: 16) {
            heading("A few quick ones", "So plans fit how you live. Skip any you like.")
            if rendering { cards } else { ScrollView { cards }.scrollIndicators(.never) }
        }
    }

    private var setup: some View {
        SetupStep(agent: model.agent)
    }

    private var reveal: some View {
        let profile = model.agent.profile
        return VStack(alignment: .leading, spacing: 14) {
            heading(model.name.isEmpty ? "Here's your taste" : "Here's your taste, \(model.name)",
                    model.building ? "Reading what ties your picks together…" : (profile["summary"]?.string ?? ""))
            let words = (profile["tags"]?.array ?? []).compactMap { $0["name"]?.string }.prefix(8)
            if !words.isEmpty, !model.building {
                FlowLayout(spacing: 6) {
                    ForEach(Array(words), id: \.self) { word in
                        Text(word)
                            .font(.system(size: 12.5, weight: .semibold))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(Brand.orange.opacity(0.14)))
                    }
                }
            }
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    GraphCanvas(layout: model.graph, selection: .constant(nil), interactive: !rendering, showLegend: false)
                    if model.building {
                        VStack(spacing: 8) {
                            ProgressView()
                            Text("Finding the threads").font(.callout).foregroundStyle(.white.opacity(0.7))
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                if !model.nextUp.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Next for you").font(.system(size: 13, weight: .semibold))
                        ForEach(model.nextUp.prefix(4)) { pick in
                            HStack(spacing: 10) {
                                RemoteImage(url: pick.image)
                                    .frame(width: 44, height: 44)
                                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(pick.label).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                                    let because = pick.raw["because"]?.array.compactMap(\.string) ?? []
                                    Text(because.isEmpty ? (pick.kind.map(TasteSpace.kindWord) ?? "") : "Because of \(because.joined(separator: " and "))")
                                        .font(.system(size: 11.5)).foregroundStyle(Self.ink.opacity(0.55)).lineLimit(2)
                                }
                            }
                        }
                        Spacer(minLength: 0)
                        Text("Slice keeps learning from what you play, watch and say. See it all in Settings > Memory.")
                            .font(.system(size: 11.5)).foregroundStyle(Self.ink.opacity(0.5)).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(width: 220)
                }
            }
        }
    }
}

// MARK: The setup step: permissions, then talk once

private struct SetupStep: View {
    let agent: AgentSession
    @State private var granted: [Permissions.Kind: Bool] = [:]
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Let Slice help").font(.system(size: 28, weight: .bold))
                Text("While Slice reads your taste, allow what it needs. macOS asks once for each.")
                    .font(.system(size: 15)).foregroundStyle(OnboardingView.ink.opacity(0.6))
            }
            HStack(alignment: .top, spacing: 18) {
                VStack(spacing: 8) {
                    ForEach(Permissions.Kind.allCases) { kind in
                        HStack(spacing: 10) {
                            Image(systemName: granted[kind] == true ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(granted[kind] == true ? Color.green : OnboardingView.ink.opacity(0.3))
                                .font(.system(size: 16))
                            VStack(alignment: .leading, spacing: 1) {
                                Text(kind.title).font(.system(size: 13.5, weight: .semibold))
                                Text(kind.reason).font(.system(size: 12)).foregroundStyle(OnboardingView.ink.opacity(0.55))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer()
                            if granted[kind] != true {
                                Button("Allow") { Permissions.request(kind) }.buttonStyle(QuietButton())
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white))
                    }
                }
                .frame(maxWidth: .infinity)
                TryTalking(agent: agent)
                    .frame(width: 300)
            }
        }
        .onAppear(perform: refresh)
        .onReceive(tick) { _ in refresh() }
    }

    private func refresh() {
        for kind in Permissions.Kind.allCases {
            let now = Permissions.isGranted(kind)
            if granted[kind] != now { granted[kind] = now }
        }
    }
}

/// "Hold fn and control and say…": the first real try of push-to-talk, with what Slice heard.
private struct TryTalking: View {
    let agent: AgentSession

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Try talking").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
            HStack(spacing: 6) {
                KeyCap("fn")
                Text("+").foregroundStyle(.white.opacity(0.5))
                KeyCap("control")
                Text("hold, then say").font(.system(size: 12.5)).foregroundStyle(.white.opacity(0.6))
            }
            Text("\u{201C}What should I watch tonight?\u{201D}")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Brand.yellow)
            Divider().overlay(.white.opacity(0.15))
            HStack(spacing: 8) {
                Circle().fill(statusColor).frame(width: 8, height: 8)
                Text(status).font(.system(size: 12.5, weight: .medium)).foregroundStyle(.white.opacity(0.8))
            }
            if let heard = agent.turns.last(where: { $0.role == .user })?.text {
                Text("You: \(heard)").font(.system(size: 12)).foregroundStyle(.white.opacity(0.6)).lineLimit(2)
            }
            if let said = agent.turns.last(where: { $0.role == .agent })?.text {
                Text(said).font(.system(size: 13)).foregroundStyle(.white).lineLimit(4).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 250, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.black))
    }

    private var status: String {
        if agent.connection != .online { return "Slice can't reach its brain yet" }
        switch agent.phase {
        case .listening: return "Listening"
        case .thinking: return "Thinking"
        case .speaking: return "Talking"
        case .idle: return agent.turns.isEmpty ? "Ready when you are" : "It works"
        }
    }

    private var statusColor: Color {
        if agent.connection != .online { return .red }
        return agent.phase == .idle ? (agent.turns.isEmpty ? .white.opacity(0.4) : .green) : Brand.yellow
    }
}

private struct KeyCap: View {
    let label: String
    init(_ label: String) { self.label = label }

    var body: some View {
        Text(label)
            .font(.system(size: 11.5, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(.white.opacity(0.15)))
    }
}

// MARK: Tiles and buttons

private struct TileView: View {
    let tile: Tile
    let picked: Bool
    let toggle: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: toggle) {
            VStack(alignment: .leading, spacing: 6) {
                Color.clear
                    .aspectRatio(1, contentMode: .fit)
                    .overlay { RemoteImage(url: tile.image) }
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(picked ? Brand.orange : .clear, lineWidth: 3))
                    .overlay(alignment: .topTrailing) {
                        if picked {
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .heavy))
                                .foregroundStyle(.white)
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(Brand.orange))
                                .padding(6)
                        }
                    }
                    .scaleEffect(hovering && !picked ? 1.03 : 1)
                Text(tile.name)
                    .font(.system(size: 12.5, weight: picked ? .semibold : .medium))
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.12), value: hovering)
        .help(tile.description ?? tile.name)
    }
}

struct SqueezeButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(OnboardingView.ink)
            .padding(.horizontal, 22)
            .padding(.vertical, 10)
            .background(Capsule().fill(Brand.squeeze))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct QuietButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(OnboardingView.ink.opacity(0.75))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Capsule().fill(OnboardingView.ink.opacity(configuration.isPressed ? 0.12 : 0.06)))
    }
}

struct ChoiceChip: ButtonStyle {
    let on: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: on ? .semibold : .medium))
            .foregroundStyle(OnboardingView.ink.opacity(on ? 1 : 0.75))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Capsule().fill(on ? AnyShapeStyle(Brand.yellow) : AnyShapeStyle(OnboardingView.ink.opacity(0.05))))
            .overlay(Capsule().strokeBorder(on ? Brand.orange.opacity(0.6) : OnboardingView.ink.opacity(0.1)))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct AnyButtonStyle: ButtonStyle {
    private let make: (Configuration) -> AnyView

    init<S: ButtonStyle>(_ style: S) {
        make = { AnyView(style.makeBody(configuration: $0)) }
    }

    func makeBody(configuration: Configuration) -> some View {
        make(configuration)
    }
}
