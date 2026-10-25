import SwiftUI

/// Settings > Memory: what Slice knows about the user and the people they plan for, what it is
/// learning from what they play and watch (slice_mac/memory.py), and a timeline of every change
/// with an undo. All of it is drawn from the local profile; changes go through the brain.
struct MemorySpace: View {
    let agent: AgentSession

    @State private var layout: GraphLayout
    @State private var selection: String?
    @State private var newFact = ""
    @State private var factAbout = "me"
    @State private var busy: String?
    @State private var problem: String?
    @Environment(\.renderingForPreview) private var rendering

    private var profile: JSONValue { agent.profile }

    init(agent: AgentSession, layout: GraphLayout = GraphLayout(), selection: String? = nil) {
        self.agent = agent
        _layout = State(initialValue: layout)
        _selection = State(initialValue: selection)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 12) {
                header
                GraphCanvas(layout: layout, selection: $selection, interactive: !rendering, showLegend: false)
                    .frame(minWidth: 380, maxHeight: .infinity)
                addFact
            }
            side
                .frame(width: 320)
                .frame(maxHeight: .infinity, alignment: .top)
        }
        .padding(18)
        .onAppear { if !rendering { rebuild() } }
        .onChange(of: profile) { rebuild() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Memory").font(.system(size: 22, weight: .bold))
                Spacer()
                if let busy {
                    ProgressView().controlSize(.small)
                    Text(busy).font(.callout).foregroundStyle(.secondary)
                }
                if let problem { Text(problem).font(.callout).foregroundStyle(.red).lineLimit(1) }
            }
            Text(Self.weekLine(profile))
                .foregroundStyle(.secondary)
        }
    }

    private var addFact: some View {
        HStack(spacing: 8) {
            Image(systemName: "text.quote").foregroundStyle(Brand.orange)
            TextField("Something Slice should remember, like \"I don't eat meat\" or \"Sam doesn't drink\"", text: $newFact)
                .textFieldStyle(.roundedBorder)
                .onSubmit(saveFact)
            Picker("About", selection: $factAbout) {
                Text("Me").tag("me")
                ForEach(Self.people(profile), id: \.self) { Text($0).tag($0) }
            }
            .labelsHidden()
            .fixedSize()
            Button("Remember", action: saveFact)
                .disabled(newFact.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    @ViewBuilder private var side: some View {
        let content = VStack(alignment: .leading, spacing: 14) {
            if let node = selection.flatMap(layout.node) {
                inspector(node)
                Divider()
            }
            waiting
            timeline
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        Group {
            if rendering { content } else { ScrollView { content } }
        }
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.primary.opacity(0.04)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.primary.opacity(0.08)))
    }

    // MARK: Suggestions waiting for a yes

    @ViewBuilder private var waiting: some View {
        let suggested = profile["suggested"]?.array ?? []
        if !suggested.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Add to your taste?").font(.headline)
                ForEach(Array(suggested.enumerated()), id: \.offset) { _, s in
                    HStack(alignment: .top, spacing: 10) {
                        RemoteImage(url: s["image"]?.string)
                            .frame(width: 38, height: 38)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s["name"]?.string ?? "").font(.body.weight(.semibold))
                            Text((s["why"]?.string ?? "") + ".").font(.caption).foregroundStyle(.secondary)
                            HStack {
                                Button("Add") { edit("accept", ["id": s["id"] ?? .null], label: "Adding") }
                                    .buttonStyle(.borderedProminent).tint(Brand.orange).controlSize(.small)
                                Button("Not now") { edit("decline", ["id": s["id"] ?? .null], label: "Saving") }
                                    .controlSize(.small)
                            }
                        }
                    }
                }
            }
            Divider()
        }
    }

    // MARK: The timeline

    private var timeline: some View {
        let entries = Array((profile["journal"]?.array ?? []).reversed())
        let days = Dictionary(grouping: entries.indices) { Self.dayLabel(entries[$0]["at"]?.string) }
        let order = entries.map { Self.dayLabel($0["at"]?.string) }.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        return VStack(alignment: .leading, spacing: 10) {
            Text("What changed").font(.headline)
            if entries.isEmpty {
                Text("As you tell Slice what you love, give a thumbs up, or play and watch things, what it learns shows up here.")
                    .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(order.prefix(12), id: \.self) { day in
                VStack(alignment: .leading, spacing: 8) {
                    Text(day).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(days[day] ?? [], id: \.self) { i in
                        JournalRow(entry: entries[i]) { edit("undo", ["id": entries[i]["id"] ?? .null], label: "Taking it back") }
                    }
                }
            }
        }
    }

    // MARK: Inspector

    @ViewBuilder private func inspector(_ node: GraphNode) -> some View {
        let raw = node.raw
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(node.label).font(.system(size: 15, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                if let detail = node.detail {
                    Text(detail).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer()
            Button { selection = nil } label: { Image(systemName: "xmark") }.buttonStyle(.borderless)
        }
        switch raw["memory"]?.string {
        case "fact":
            Button { edit("forget_fact", ["id": raw["id"] ?? .null], label: "Forgetting") } label: { Label("Forget this", systemImage: "eraser") }
                .buttonStyle(.link)
        case "person":
            Button { edit("forget_person", ["name": .string(node.label)], label: "Forgetting \(node.label)") } label: {
                Label("Forget \(node.label)", systemImage: "person.crop.circle.badge.minus")
            }
            .buttonStyle(.link)
        case "evidence":
            Text("Slice asks to add it once it's sure. You can add it now.").font(.callout).foregroundStyle(.secondary)
            Button("Add to my taste now") { edit("love", ["items": .array([Self.entity(raw)]), "source": .string("learned")], label: "Adding") }
                .buttonStyle(.borderedProminent).tint(Brand.orange)
        case "suggested":
            HStack {
                Button("Add to my taste") { edit("accept", ["id": raw["id"] ?? .null], label: "Adding") }
                    .buttonStyle(.borderedProminent).tint(Brand.orange)
                Button("Not now") { edit("decline", ["id": raw["id"] ?? .null], label: "Saving") }
            }
        case "dislike":
            Button("Take it back") { edit("undislike", ["id": raw["id"] ?? .null], label: "Saving") }
        case "routine":
            Button { edit("forget_routine", ["id": raw["id"] ?? .null], label: "Stopping") } label: { Label("Stop this weekly job", systemImage: "calendar.badge.minus") }
                .buttonStyle(.link)
        default:
            EmptyView()
        }
    }

    // MARK: Changes

    private func saveFact() {
        let text = newFact.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        newFact = ""
        edit("fact", ["text": .string(text), "about": .string(factAbout)], label: "Remembering")
    }

    private func edit(_ op: String, _ fields: [String: JSONValue], label: String) {
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

    private func rebuild() {
        let (nodes, edges) = Self.graph(profile)
        layout.update(nodes: nodes, edges: edges, animate: !rendering && !layout.nodes.isEmpty)
    }

    // MARK: The memory graph, from the profile

    static func people(_ profile: JSONValue) -> [String] {
        Set((profile["people"]?.object ?? [:]).keys).union((profile["people_info"]?.object ?? [:]).keys).sorted()
    }

    static func entity(_ raw: JSONValue) -> JSONValue {
        .object(["id": raw["id"] ?? .null, "name": raw["name"] ?? .null, "kind": raw["kind"] ?? .null, "image": raw["image"] ?? .null])
    }

    static func graph(_ profile: JSONValue) -> ([GraphNode], [GraphEdge]) {
        var nodes = [GraphNode(id: "you", label: profile["name"]?.string ?? "You", style: .you)]
        var edges: [GraphEdge] = []
        func hub(_ id: String, _ label: String, symbol: String, leaves: [GraphNode]) {
            guard !leaves.isEmpty else { return }
            nodes.append(GraphNode(id: id, label: label, style: .hub, kind: symbol))
            edges.append(GraphEdge(a: "you", b: id, style: "hub"))
            for leaf in leaves {
                nodes.append(leaf)
                edges.append(GraphEdge(a: id, b: leaf.id, style: "leaf"))
            }
        }
        let facts = profile["facts"]?.array ?? []

        // About you
        var about: [GraphNode] = []
        if let city = profile["city"]?.string, !city.isEmpty {
            about.append(GraphNode(id: "city", label: "Lives in \(city)", style: .fact, detail: "Places and plans start around here."))
        }
        for f in facts where (f["about"]?.string ?? "me") == "me" {
            guard let id = f["id"]?.string, let text = f["text"]?.string else { continue }
            var raw = f.object
            raw["memory"] = "fact"
            about.append(GraphNode(id: "fact:\(id)", label: text, style: .fact,
                                   detail: TasteSpace.sourceLine(Self.factSource(f["source"]?.string), at: f["at"]?.string), raw: .object(raw)))
        }
        hub("hub:about", "About you", symbol: "person.text.rectangle", leaves: about)

        // The people they plan for, each a hub of what's known about them.
        let info = profile["people_info"]?.object ?? [:]
        let loves = profile["people"]?.object ?? [:]
        for name in people(profile).prefix(6) {
            let pid = "person:\(name)"
            let i = info[name] ?? .null
            var leaves: [GraphNode] = []
            let who = [i["relation"]?.string?.capitalizedFirst, i["age"]?.double.map { "\(Int($0))" }].compactMap { $0 }.joined(separator: ", ")
            if !who.isEmpty { leaves.append(GraphNode(id: "\(pid):who", label: who, style: .fact)) }
            if let home = i["home"]?.string { leaves.append(GraphNode(id: "\(pid):home", label: home, style: .fact)) }
            if let needs = i["needs"]?.string {
                leaves.append(GraphNode(id: "\(pid):needs", label: needs.capitalizedFirst + (i["step_free"]?.bool == true ? ", step-free" : ""), style: .fact))
            }
            if let birthday = i["birthday"]?.string, let (m, d) = Watchers.monthDay(birthday),
               let date = Calendar.current.date(from: DateComponents(year: 2000, month: m, day: d)) {
                leaves.append(GraphNode(id: "\(pid):birthday", label: "Birthday \(date.formatted(.dateTime.day().month(.abbreviated)))", style: .fact))
            }
            let theirs = (loves[name]?.array ?? []).compactMap { $0["name"]?.string }
            if !theirs.isEmpty {
                let shown = theirs.prefix(3).joined(separator: ", ") + (theirs.count > 3 ? " and \(theirs.count - 3) more" : "")
                leaves.append(GraphNode(id: "\(pid):loves", label: "Loves \(shown)", style: .fact))
            }
            for f in facts where f["about"]?.string == name {
                guard let id = f["id"]?.string, let text = f["text"]?.string else { continue }
                var raw = f.object
                raw["memory"] = "fact"
                leaves.append(GraphNode(id: "fact:\(id)", label: text, style: .fact, raw: .object(raw)))
            }
            let reads = (i["reads_as"]?.array ?? []).compactMap(\.string)
            nodes.append(GraphNode(id: pid, label: name, style: .person, kind: i["relation"]?.string,
                                   detail: reads.isEmpty ? nil : "Reads as \(reads.joined(separator: ", ").lowercased())",
                                   raw: ["memory": "person"]))
            edges.append(GraphEdge(a: "you", b: pid, style: "hub"))
            for leaf in leaves {
                nodes.append(leaf)
                edges.append(GraphEdge(a: pid, b: leaf.id, style: "leaf"))
            }
        }

        // What Slice is learning: suggestions waiting, and quieter signals adding up.
        var learning: [GraphNode] = []
        for s in profile["suggested"]?.array ?? [] {
            guard let id = s["id"]?.string, let name = s["name"]?.string else { continue }
            var raw = s.object
            raw["memory"] = "suggested"
            learning.append(GraphNode(id: "sug:\(id)", label: name, style: .pick, kind: s["kind"]?.string, image: s["image"]?.string,
                                      detail: (s["why"]?.string).map { "\($0). Waiting for your yes." }, group: GraphPalette.group(s["kind"]?.string),
                                      raw: .object(raw)))
        }
        let asked = Set((profile["suggested"]?.array ?? []).compactMap { $0["id"]?.string })
        let evidence = (profile["evidence"]?.object ?? [:]).filter { !asked.contains($0.key) }
            .sorted { ($0.value["score"]?.double ?? 0) > ($1.value["score"]?.double ?? 0) }
        for (id, ev) in evidence.prefix(6) {
            guard let name = ev["name"]?.string else { continue }
            var raw = ev.object
            raw["memory"] = "evidence"
            raw["id"] = .string(id)
            learning.append(GraphNode(id: "ev:\(id)", label: "\(name), \(Self.evidenceCount(ev))", style: .theirLove, kind: ev["kind"]?.string,
                                      image: ev["image"]?.string, detail: Self.evidenceDetail(ev), group: GraphPalette.group(ev["kind"]?.string),
                                      raw: .object(raw)))
        }
        hub("hub:learning", "Learning", symbol: "waveform.path.ecg", leaves: learning)

        var not: [GraphNode] = []
        for d in profile["dislikes"]?.array ?? [] {
            guard let id = d["id"]?.string, let name = d["name"]?.string else { continue }
            var raw = d.object
            raw["memory"] = "dislike"
            not.append(GraphNode(id: "no:\(id)", label: name, style: .dislike, kind: d["kind"]?.string, image: d["image"]?.string,
                                 detail: "Not for you: never picked again.", raw: .object(raw)))
        }
        hub("hub:not", "Not for you", symbol: "hand.thumbsdown", leaves: not)

        var weekly: [GraphNode] = []
        for r in profile["routines"]?.array ?? [] {
            guard let id = r["id"]?.string, let title = r["title"]?.string else { continue }
            var raw = r.object
            raw["memory"] = "routine"
            let when = [r["weekday"]?.string?.capitalizedFirst, r["time"]?.string].compactMap { $0 }.joined(separator: " at ")
            weekly.append(GraphNode(id: "routine:\(id)", label: title, style: .fact, detail: when.isEmpty ? nil : "Every \(when)", raw: .object(raw)))
        }
        hub("hub:weekly", "Every week", symbol: "calendar", leaves: weekly)
        return (nodes, edges)
    }

    private static func factSource(_ source: String?) -> String? {
        switch source {
        case "onboarding": "onboarding"
        case "settings": "settings"
        default: "said"
        }
    }

    private static func evidenceCount(_ ev: JSONValue) -> String {
        let events = ev["events"]?.object ?? [:]
        if let played = events["played"]?.double { return "\(Int(played)) play\(played == 1 ? "" : "s")" }
        if let opened = events["opened"]?.double { return "looked up \(Int(opened))×" }
        return "came up"
    }

    private static func evidenceDetail(_ ev: JSONValue) -> String {
        let days = ev["days"]?.array.count ?? 1
        return "Noticed on \(days) day\(days == 1 ? "" : "s"). It isn't in your taste yet."
    }

    // MARK: Words

    static func weekLine(_ profile: JSONValue) -> String {
        let weekAgo = Date().addingTimeInterval(-7 * 86400)
        let parser = ISO8601DateFormatter()
        let learned = (profile["journal"]?.array ?? []).filter { entry in
            guard let at = entry["at"]?.string.flatMap(parser.date(from:)), at > weekAgo else { return false }
            return ["added", "learned", "liked", "disliked", "fact", "started"].contains(entry["kind"]?.string ?? "")
        }.count
        let base = "What Slice knows about you and the people you plan for, kept on this Mac."
        return learned == 0 ? base : "\(base) It learned \(learned) thing\(learned == 1 ? "" : "s") this week."
    }

    static func dayLabel(_ at: String?) -> String {
        guard let at, let date = ISO8601DateFormatter().date(from: at) else { return "Earlier" }
        if Calendar.current.isDateInToday(date) { return "Today" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }
}

/// One change in the timeline, with an undo while it can still be taken back.
private struct JournalRow: View {
    let entry: JSONValue
    let undo: () -> Void

    var body: some View {
        let kind = entry["kind"]?.string ?? ""
        let undone = entry["undone"]?.bool == true
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: Self.symbol(kind))
                .font(.caption.weight(.semibold))
                .foregroundStyle(Self.color(kind))
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry["text"]?.string ?? "")
                    .font(.callout)
                    .strikethrough(undone)
                    .foregroundStyle(undone ? .secondary : .primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let at = entry["at"]?.string.flatMap(ISO8601DateFormatter().date(from:)) {
                    Text(at.formatted(.dateTime.hour().minute())).font(.caption2).foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 4)
            if !undone, ["added", "learned", "liked", "removed", "disliked", "fact", "started"].contains(kind) {
                Button("Undo", action: undo)
                    .buttonStyle(.link)
                    .font(.caption)
            }
        }
    }

    static func symbol(_ kind: String) -> String {
        switch kind {
        case "started": "flag.fill"
        case "added": "heart.fill"
        case "learned": "waveform.path.ecg"
        case "liked": "hand.thumbsup.fill"
        case "removed": "heart.slash"
        case "disliked": "hand.thumbsdown.fill"
        case "fact": "text.quote"
        case "forgot": "eraser"
        case "reread": "arrow.triangle.2.circlepath"
        default: "circle.fill"
        }
    }

    static func color(_ kind: String) -> Color {
        switch kind {
        case "added", "liked", "started": Brand.orange
        case "learned", "reread": Brand.amber
        case "disliked", "removed": GraphPalette.no
        default: .secondary
        }
    }
}
