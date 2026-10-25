import AppKit
import SwiftUI

/// Settings > Your taste: the taste graph (slice_mac/graph.py), an inspector for whatever is
/// clicked, filters, and the ways to add to it. Every change goes through the brain
/// (TasteStore.edit), so it lands in the journal and the taste is re-read.
struct TasteSpace: View {
    let agent: AgentSession

    @State private var layout: GraphLayout
    @State private var selection: String?
    @State private var hiddenGroups: Set<String> = []
    @State private var showPeople = true
    @State private var showNext = true
    @State private var loading = false
    @State private var busy: String?
    @State private var problem: String?
    @State private var graphKey: String?
    @State private var query = ""
    @State private var results: [JSONValue] = []
    @State private var showResults = false
    @State private var city = ""
    @Environment(\.renderingForPreview) private var rendering

    private var profile: JSONValue { agent.profile }

    init(agent: AgentSession, layout: GraphLayout = GraphLayout(), selection: String? = nil) {
        self.agent = agent
        _layout = State(initialValue: layout)
        _selection = State(initialValue: selection)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            filters
            HStack(alignment: .top, spacing: 12) {
                ZStack(alignment: .topTrailing) {
                    GraphCanvas(layout: layout, selection: $selection, hidden: hidden, interactive: !rendering)
                    if layout.nodes.count <= 1 { emptyState }
                    if loading {
                        HStack(spacing: 6) {
                            ProgressView().controlSize(.small)
                            Text("Reading your taste").font(.caption).foregroundStyle(.white.opacity(0.7))
                        }
                        .padding(8)
                        .background(Capsule().fill(.black.opacity(0.6)))
                        .padding(10)
                    }
                }
                .frame(minWidth: 420, maxWidth: .infinity, maxHeight: .infinity)
                inspector
                    .frame(width: 272)
                    .frame(maxHeight: .infinity, alignment: .top)
            }
            addBar
        }
        .padding(18)
        .onAppear {
            city = profile["city"]?.string ?? ""
            if !rendering { load(fresh: false) }
        }
        .onChange(of: TasteStore.graphKey(agent.profile)) { load(fresh: false) }
        .onChange(of: profile["city"]?.string) { city = profile["city"]?.string ?? "" }
    }

    // MARK: Header and filters

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Your taste").font(.system(size: 22, weight: .bold))
                Text(profile["summary"]?.string ?? "Add a few things you love and Slice will read your taste from them.")
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                let words = (profile["tags"]?.array ?? []).compactMap { $0["name"]?.string }.prefix(8)
                if !words.isEmpty {
                    HStack(spacing: 6) {
                        Text("Reads as").font(.caption).foregroundStyle(.secondary)
                        ForEach(Array(words), id: \.self) { word in
                            Text(word)
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Brand.orange.opacity(0.14)))
                                .foregroundStyle(Color.primary.opacity(0.85))
                        }
                    }
                }
            }
            Spacer()
            HStack(spacing: 8) {
                Menu("Try a taste") {
                    ForEach(Self.presets, id: \.name) { preset in
                        Button(preset.name) { tryPreset(preset) }
                    }
                }
                .fixedSize()
                .help("Swap in a ready-made taste, to see how every answer changes")
                Button {
                    load(fresh: true)
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Read the graph again")
                .disabled(loading)
            }
        }
    }

    private var filters: some View {
        HStack(spacing: 6) {
            let present = Set(layout.nodes.compactMap(\.group))
            ForEach(GraphPalette.groups.filter { present.contains($0.id) }, id: \.id) { group in
                FilterChip(title: group.name, color: GraphPalette.color(group: group.id), on: !hiddenGroups.contains(group.id)) {
                    if hiddenGroups.contains(group.id) { hiddenGroups.remove(group.id) } else { hiddenGroups.insert(group.id) }
                }
            }
            Divider().frame(height: 16).padding(.horizontal, 4)
            FilterChip(title: "People", color: .white, on: showPeople) { showPeople.toggle() }
            FilterChip(title: "Next for you", color: Brand.yellow, on: showNext) { showNext.toggle() }
            Spacer()
            if let busy {
                ProgressView().controlSize(.small)
                Text(busy).font(.callout).foregroundStyle(.secondary)
            }
            if let problem {
                Text(problem).font(.callout).foregroundStyle(.red).lineLimit(1)
            }
        }
    }

    private var hidden: Set<String> {
        var out = Set<String>()
        for n in layout.nodes {
            let groupHidden = n.group.map(hiddenGroups.contains) ?? false
            switch n.style {
            case .love, .dislike: if groupHidden { out.insert(n.id) }
            case .pick: if !showNext || groupHidden { out.insert(n.id) }
            case .person: if !showPeople { out.insert(n.id) }
            case .theirLove:
                // A person's own loves show when they're selected; otherwise the picture gets busy.
                let owner = "person:" + (n.raw["owner"]?.string ?? "")
                if !showPeople || groupHidden || (selection != owner && selection != n.id) { out.insert(n.id) }
            default: break
            }
        }
        // A thread with none of its loves left showing goes too.
        for n in layout.nodes where n.style == .tag {
            let around = layout.neighbours[n.id, default: []]
            if !around.contains(where: { !out.contains($0) && layout.node($0)?.style == .love }) { out.insert(n.id) }
        }
        return out
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Text("Your taste graph starts here")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
            Text("Add a few films, artists, books or places you love below, or set Slice up from the start.")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .frame(width: 280)
            Button("Set up my taste") { OnboardingWindow.shared.show(agent: agent) }
                .buttonStyle(.borderedProminent)
                .tint(Brand.orange)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Inspector

    @ViewBuilder private var inspector: some View {
        let node = selection.flatMap(layout.node)
        let content = VStack(alignment: .leading, spacing: 12) {
            if let node {
                details(node)
            } else {
                overview
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        Group {
            if rendering { content } else { ScrollView { content } }
        }
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.primary.opacity(0.04)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.primary.opacity(0.08)))
    }

    private var overview: some View {
        let loves = layout.nodes.filter { $0.style == .love }
        let people = layout.nodes.filter { $0.style == .person }
        let threads = layout.nodes.filter { $0.style == .tag }
        return VStack(alignment: .leading, spacing: 12) {
            Text("How to read it").font(.headline)
            InspectorLine(symbol: "circle.fill", color: Brand.orange, text: "You're in the middle, with what you love around you. Bigger means it steers your picks more.")
            InspectorLine(symbol: "capsule.fill", color: Brand.sand, text: "The words between them are what Qloo finds they share: the threads of your taste.")
            InspectorLine(symbol: "circle.dashed", color: Brand.yellow, text: "Dashed circles are what Slice would suggest next, tied to the loves behind them.")
            InspectorLine(symbol: "person.2.fill", color: .secondary, text: "People you've saved sit on the outside, linked to what you share.")
            Text("Drag anything to move it. Click to see more and change it.")
                .font(.callout)
                .foregroundStyle(.secondary)
            Divider()
            HStack(spacing: 18) {
                Stat(number: loves.count, label: loves.count == 1 ? "love" : "loves")
                Stat(number: threads.count, label: threads.count == 1 ? "thread" : "threads")
                Stat(number: people.count, label: people.count == 1 ? "person" : "people")
            }
            Divider()
            VStack(alignment: .leading, spacing: 4) {
                Text("Home").font(.subheadline.weight(.semibold))
                TextField("Williamsburg, Brooklyn", text: $city)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit {
                        let place = city.trimmingCharacters(in: .whitespaces)
                        if !place.isEmpty, place != profile["city"]?.string {
                            edit("city", ["city": .string(place)], label: "Saving your home")
                        }
                    }
                Text("Places and plans start around here.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private func details(_ node: GraphNode) -> some View {
        let raw = node.raw
        HStack(alignment: .top, spacing: 10) {
            if node.image != nil {
                RemoteImage(url: node.image)
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(node.label).font(.system(size: 16, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                if let kind = Self.kindName(node) {
                    Text(kind).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            Button { selection = nil } label: { Image(systemName: "xmark") }
                .buttonStyle(.borderless)
                .help("Close")
        }
        switch node.style {
        case .you:
            if let summary = profile["summary"]?.string { Text(summary).font(.callout) }
            Text("Everything Slice picks for you starts from the loves around you.")
                .font(.callout).foregroundStyle(.secondary)
        case .love:
            if let line = Self.sourceLine(raw["source"]?.string, at: raw["at"]?.string) {
                Label(line, systemImage: "clock").font(.callout).foregroundStyle(.secondary)
            }
            if raw["steers"]?.bool == true {
                Label("Steers your picks", systemImage: "arrow.triangle.branch").font(.callout).foregroundStyle(Brand.orange)
            } else {
                Label("Not steering right now: only your 20 strongest loves do", systemImage: "pause.circle").font(.callout).foregroundStyle(.secondary)
            }
            if let detail = node.detail { Text(detail).font(.callout).fixedSize(horizontal: false, vertical: true) }
            threads(of: node)
            VStack(alignment: .leading, spacing: 6) {
                Button { ask("Why do I love \(node.label)?") } label: { Label("Why do I love this?", systemImage: "questionmark.bubble") }
                Button { edit("forget", ["id": .string(node.id)], label: "Removing \(node.label)") } label: {
                    Label("Remove from my taste", systemImage: "minus.circle")
                }
                Button { edit("dislike", ["items": [entity(node)]], label: "Saving") } label: {
                    Label("Not for me anymore", systemImage: "hand.thumbsdown")
                }
            }
            .buttonStyle(.link)
        case .tag:
            Text(node.detail ?? "").font(.callout).fixedSize(horizontal: false, vertical: true)
            Text("Qloo finds this in several of the things you love, so Slice leans on it when it picks for you.")
                .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Button { ask("Recommend me something \(node.label.lowercased()) I haven't seen or heard.") } label: {
                Label("Ask Slice for more like this", systemImage: "text.bubble")
            }
            .buttonStyle(.link)
        case .pick:
            if let because = raw["because"]?.array.compactMap(\.string), !because.isEmpty {
                Label("Because you love \(because.joined(separator: " and "))", systemImage: "arrow.triangle.branch")
                    .font(.callout).foregroundStyle(Brand.orange)
            }
            if let detail = node.detail { Text(detail).font(.callout).fixedSize(horizontal: false, vertical: true) }
            HStack {
                Button("Add to my taste") { edit("love", ["items": [entity(node)]], label: "Adding \(node.label)") }
                    .buttonStyle(.borderedProminent).tint(Brand.orange)
                Button("Not for me") { edit("dislike", ["items": [entity(node)]], label: "Saving") }
            }
        case .person:
            if let detail = node.detail { Text(detail.capitalizedFirst).font(.callout) }
            let theirs = layout.neighbours[node.id, default: []].compactMap(layout.node).filter { $0.style == .theirLove || $0.style == .love }
            if !theirs.isEmpty {
                Text("Loves").font(.subheadline.weight(.semibold))
                Text(theirs.map(\.label).joined(separator: ", ")).font(.callout)
            }
            let common = layout.neighbours[node.id, default: []].compactMap(layout.node).filter { $0.style == .tag }
            if !common.isEmpty {
                Text("What you share").font(.subheadline.weight(.semibold))
                Text(common.map(\.label).joined(separator: ", ")).font(.callout)
            }
            Button { edit("forget_person", ["name": .string(node.label)], label: "Forgetting \(node.label)") } label: {
                Label("Forget \(node.label)", systemImage: "person.crop.circle.badge.minus")
            }
            .buttonStyle(.link)
        case .theirLove:
            Text("One of \(raw["owner"]?.string ?? "their") loves.").font(.callout).foregroundStyle(.secondary)
            if let detail = node.detail { Text(detail).font(.callout).fixedSize(horizontal: false, vertical: true) }
            Button("I love it too") { edit("love", ["items": [entity(node)]], label: "Adding \(node.label)") }
        case .dislike:
            Text("Not for you: Slice won't pick it, and flags it on screen.").font(.callout).foregroundStyle(.secondary)
            Button("Take it back") { edit("undislike", ["id": raw["entity"] ?? .string(node.id)], label: "Saving") }
        case .hub, .fact:
            EmptyView()
        }
    }

    @ViewBuilder private func threads(of node: GraphNode) -> some View {
        let tags = layout.neighbours[node.id, default: []].compactMap(layout.node).filter { $0.style == .tag }
        if !tags.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Threads").font(.subheadline.weight(.semibold))
                FlowLayout(spacing: 5) {
                    ForEach(tags) { tag in
                        Button(tag.label) { selection = tag.id }
                            .buttonStyle(.plain)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Brand.sand.opacity(0.25)))
                    }
                }
            }
        }
    }

    // MARK: Adding

    private var addBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "plus.circle.fill").foregroundStyle(Brand.orange)
            TextField("Add something you love: a film, artist, book, place or brand", text: $query)
                .textFieldStyle(.roundedBorder)
                .onSubmit(search)
                .popover(isPresented: $showResults, arrowEdge: .top) { resultsList }
            Button("Search", action: search)
                .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty)
            Button("Add from Music", action: importMusic)
                .help("Your most played artists in the Music app")
        }
    }

    private var resultsList: some View {
        VStack(alignment: .leading, spacing: 8) {
            if results.isEmpty {
                Text("Qloo has nothing called that.").foregroundStyle(.secondary)
            }
            ForEach(Array(results.enumerated()), id: \.offset) { _, hit in
                HStack(spacing: 10) {
                    RemoteImage(url: hit["image"]?.string)
                        .frame(width: 36, height: 36)
                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(hit["name"]?.string ?? "").font(.body.weight(.medium))
                        Text([hit["kind"]?.string.map(Self.kindWord), hit["description"]?.string].compactMap { $0 }.joined(separator: ", "))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Button("Add") {
                        showResults = false
                        query = ""
                        let item: JSONValue = .object(["id": hit["id"] ?? .null, "name": hit["name"] ?? .null,
                                                       "kind": hit["kind"] ?? .null, "image": hit["image"] ?? .null])
                        edit("love", ["items": [item]], label: "Adding \(hit["name"]?.string ?? "it")")
                    }
                }
            }
        }
        .padding(12)
        .frame(width: 380)
    }

    private func search() {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        problem = nil
        Task {
            do {
                results = try await BrainHTTP.get("search", query: ["q": q])["results"]?.array ?? []
                showResults = true
            } catch {
                problem = "Can't reach the brain: \(error.localizedDescription)"
            }
        }
    }

    private func importMusic() {
        busy = "Reading your Music library"
        Task {
            let top = await MusicLibrary.topArtists()
            busy = nil
            guard let top else {
                problem = "Couldn't read Music. Is Slice allowed to control it (System Settings > Privacy > Automation)?"
                return
            }
            if top.isEmpty {
                problem = "Music has no play history to go on."
                return
            }
            edit("love", ["items": .array(top.map(JSONValue.string)), "source": "music"], label: "Adding your most played artists")
        }
    }

    private func tryPreset(_ preset: (name: String, city: String, loves: [String])) {
        busy = "Reading a \(preset.name) taste"
        problem = nil
        // People, notes and memory carry over; the loves and what they read as are replaced.
        var base = profile.object
        base["seeds"] = nil
        base["tags"] = nil
        Task {
            defer { busy = nil }
            do {
                let res = try await BrainHTTP.post("profile/build", body: [
                    "seeds": .array(preset.loves.map(JSONValue.string)), "city": .string(preset.city), "base": .object(base),
                ])
                if let built = res["profile"] { agent.setProfile(built) }
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    // MARK: Changes

    private func edit(_ op: String, _ fields: [String: JSONValue] = [:], label: String) {
        busy = label
        problem = nil
        Task {
            defer { busy = nil }
            do {
                let updated = try await TasteStore.edit(agent.profile, op: op, fields)
                selection = nil
                agent.setProfile(updated)
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    private func ask(_ text: String) {
        agent.send(text: text)
    }

    private func entity(_ node: GraphNode) -> JSONValue {
        .object(["id": node.raw["entity"] ?? .string(node.id), "name": .string(node.label),
                 "kind": node.kind.map(JSONValue.string) ?? .null, "image": node.image.map(JSONValue.string) ?? .null])
    }

    private func load(fresh: Bool) {
        let key = TasteStore.graphKey(agent.profile)
        if !fresh, key == graphKey { return }
        if layout.nodes.isEmpty, let saved = TasteStore.loadGraph() {
            apply(saved.graph, animate: false)
            if saved.key == key, !fresh {
                graphKey = key
                return
            }
        }
        if agent.profile["seeds"]?.array.isEmpty ?? true {
            layout.update(nodes: [GraphNode(id: "you", label: agent.profile["name"]?.string ?? "You", style: .you)], edges: [], animate: false)
            graphKey = key
            return
        }
        loading = true
        Task {
            defer { loading = false }
            do {
                let graph = try await BrainHTTP.post("profile/graph", body: ["profile": agent.profile, "fresh": .bool(fresh)])
                apply(graph, animate: true)
                TasteStore.saveGraph(graph, key: key)
                graphKey = key
            } catch {
                problem = "Can't reach the brain: \(error.localizedDescription)"
            }
        }
    }

    private func apply(_ graph: JSONValue, animate: Bool) {
        let (nodes, edges) = Self.parse(graph)
        layout.update(nodes: nodes, edges: edges, animate: animate && !rendering)
    }

    /// The brain's graph (graph.py) as canvas nodes and edges.
    static func parse(_ graph: JSONValue) -> ([GraphNode], [GraphEdge]) {
        let nodes = (graph["nodes"]?.array ?? []).compactMap { n -> GraphNode? in
            guard let id = n["id"]?.string, let label = n["label"]?.string else { return nil }
            let style = GraphNode.Style(rawValue: n["type"]?.string ?? "") ?? .tag
            let kind = n["kind"]?.string
            return GraphNode(id: id, label: label, style: style, kind: kind, image: n["image"]?.string,
                             weight: n["weight"]?.double ?? 1, detail: n["detail"]?.string,
                             group: style == .tag || style == .person ? nil : GraphPalette.group(kind), raw: n)
        }
        let edges = (graph["edges"]?.array ?? []).compactMap { e -> GraphEdge? in
            guard let a = e["a"]?.string, let b = e["b"]?.string else { return nil }
            return GraphEdge(a: a, b: b, style: e["type"]?.string ?? "")
        }
        return (nodes, edges)
    }

    // MARK: Words

    static func kindWord(_ kind: String) -> String {
        switch kind {
        case "tv_show": "TV show"
        case "movie": "Film"
        case "video_game": "Game"
        default: kind.replacingOccurrences(of: "_", with: " ").capitalizedFirst
        }
    }

    static func kindName(_ node: GraphNode) -> String? {
        switch node.style {
        case .you: "You"
        case .tag: "A thread in your taste"
        case .person: "Someone you plan for"
        case .pick: node.kind.map { "\(kindWord($0)), next for you" } ?? "Next for you"
        case .dislike: "Not for you"
        default: node.kind.map(kindWord)
        }
    }

    /// "From your first setup, 26 Oct" for a love.
    static func sourceLine(_ source: String?, at: String?) -> String? {
        let how: String? = switch source {
        case "onboarding": "From your first setup"
        case "settings": "Added in Settings"
        case "said": "You told Slice"
        case "liked": "You gave it a thumbs up"
        case "learned": "Learned from what you play and watch"
        case "screen": "Read from your screen"
        case "music": "From your Music library"
        default: nil
        }
        guard let how else { return nil }
        guard let at, let date = ISO8601DateFormatter().date(from: at) else { return how }
        return "\(how), \(date.formatted(.dateTime.day().month(.abbreviated)))"
    }

    /// Two very different tastes, so a demo can be re-run to show the answers come from Qloo.
    static let presets: [(name: String, city: String, loves: [String])] = [
        ("Indie, Brooklyn", "Williamsburg, Brooklyn", ["Mitski", "Frank Ocean", "Phoebe Bridgers", "Aftersun", "Lady Bird", "Past Lives"]),
        ("Country, Nashville", "East Nashville, Nashville", ["Morgan Wallen", "Luke Combs", "Yellowstone", "Top Gun: Maverick", "Patagonia", "Zach Bryan"]),
    ]
}

// MARK: Pieces

struct FilterChip: View {
    let title: String
    let color: Color
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 7, height: 7).opacity(on ? 1 : 0.35)
                Text(title)
            }
            .font(.callout.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Capsule().fill(on ? Color.primary.opacity(0.09) : .clear))
            .overlay(Capsule().strokeBorder(Color.primary.opacity(on ? 0.12 : 0.18), style: StrokeStyle(lineWidth: 1, dash: on ? [] : [3, 2])))
            .foregroundStyle(on ? Color.primary : Color.secondary)
        }
        .buttonStyle(.plain)
    }
}

struct InspectorLine: View {
    let symbol: String
    let color: Color
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: symbol).foregroundStyle(color).font(.caption).frame(width: 14)
            Text(text).font(.callout).fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct Stat: View {
    let number: Int
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(number)").font(.system(size: 20, weight: .bold))
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }
}

/// The user's most played artists in Music (AppleScript), for Settings and onboarding.
@MainActor
enum MusicLibrary {
    static func topArtists(_ count: Int = 8) async -> [String]? {
        let script = """
        tell application "Music"
            set out to ""
            repeat with t in (get every track of library playlist 1 whose played count > 2)
                set out to out & (artist of t) & linefeed
            end repeat
            return out
        end tell
        """
        guard let text = await OSAScript.run(script) else { return nil }
        var counts: [String: Int] = [:]
        for artist in text.components(separatedBy: "\n") where !artist.isEmpty { counts[artist, default: 0] += 1 }
        return counts.sorted { $0.value > $1.value }.prefix(count).map(\.key)
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}

/// Set while -renderSettings draws views to pictures: scroll views lay out flat, and the graph
/// settles at once instead of animating.
private struct RenderingKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var renderingForPreview: Bool {
        get { self[RenderingKey.self] }
        set { self[RenderingKey.self] = newValue }
    }
}
