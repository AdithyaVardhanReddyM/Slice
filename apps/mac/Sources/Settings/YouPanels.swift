import SwiftUI

/// The side panel of Settings > You, beside the taste graph: what the graph means and what Slice
/// is learning (Taste), the plain facts and the people it plans for (Facts and people), and every
/// change with an undo (Changes). It's all read from the local profile (slice_mac/memory.py);
/// changes go through the brain with `edit`.
enum YouPanel: String, CaseIterable, Identifiable {
    case taste, facts, changes
    var id: Self { self }

    var title: String {
        switch self {
        case .taste: "Taste"
        case .facts: "Facts and people"
        case .changes: "Changes"
        }
    }
}

typealias ProfileEdit = (_ op: String, _ fields: [String: JSONValue], _ label: String) -> Void

/// Three pills, one per tab.
struct PanelPicker: View {
    @Binding var panel: YouPanel

    var body: some View {
        HStack(spacing: 2) {
            ForEach(YouPanel.allCases) { tab in
                Button { withAnimation(.snappy(duration: 0.2)) { panel = tab } } label: {
                    Text(tab.title)
                        .font(.system(size: 12, weight: panel == tab ? .semibold : .medium))
                        .foregroundStyle(panel == tab ? Sky.ink : Sky.ink2)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                        .frame(height: 28)
                        .background(Capsule().fill(panel == tab ? Sky.card : .clear))
                        .overlay(Capsule().strokeBorder(panel == tab ? Sky.line : .clear))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Capsule().fill(Sky.fill))
    }
}

// MARK: Taste: what's waiting, what's adding up, what's not for you

struct LearningNotes: View {
    let profile: JSONValue
    let edit: ProfileEdit

    var body: some View {
        let suggested = profile["suggested"]?.array ?? []
        let asked = Set(suggested.compactMap { $0["id"]?.string })
        let evidence = (profile["evidence"]?.object ?? [:]).filter { !asked.contains($0.key) }
            .sorted { ($0.value["score"]?.double ?? 0) > ($1.value["score"]?.double ?? 0) }
        let dislikes = profile["dislikes"]?.array ?? []
        VStack(alignment: .leading, spacing: 18) {
            if !suggested.isEmpty {
                PanelSection(title: "Waiting for your yes") {
                    ForEach(Array(suggested.enumerated()), id: \.offset) { _, s in
                        VStack(alignment: .leading, spacing: 8) {
                            ThingRow(image: s["image"]?.string, name: s["name"]?.string ?? "", line: (s["why"]?.string).map { $0 + "." }) { EmptyView() }
                            HStack(spacing: 6) {
                                Button("Add to my taste") { edit("accept", ["id": s["id"] ?? .null], "Adding") }
                                    .buttonStyle(PrimaryButton(arrow: false, compact: true))
                                Button("Not now") { edit("decline", ["id": s["id"] ?? .null], "Saving") }
                                    .buttonStyle(SecondaryButton(compact: true))
                            }
                            .padding(.leading, 48)
                        }
                    }
                }
            }
            if !evidence.isEmpty {
                PanelSection(title: "Adding up", note: "From what you play and watch. Slice asks once it's sure.") {
                    ForEach(Array(evidence.prefix(4)), id: \.key) { id, ev in
                        ThingRow(image: ev["image"]?.string, name: ev["name"]?.string ?? "", line: Memory.evidenceLine(ev)) {
                            Button("Add now") {
                                var raw = ev.object
                                raw["id"] = .string(id)
                                edit("love", ["items": .array([Memory.entity(.object(raw))]), "source": .string("learned")], "Adding")
                            }
                            .buttonStyle(InlineAction(size: 12))
                        }
                    }
                }
            }
            if !dislikes.isEmpty {
                PanelSection(title: "Not for you", note: "Never picked again, and flagged on screen.") {
                    ForEach(Array(dislikes.enumerated()), id: \.offset) { _, d in
                        ThingRow(image: d["image"]?.string, name: d["name"]?.string ?? "", line: nil, grey: true) {
                            Button("Take back") { edit("undislike", ["id": d["id"] ?? .null], "Saving") }
                                .buttonStyle(InlineAction(size: 12))
                        }
                    }
                }
            }
        }
    }
}

// MARK: Facts and people

struct FactsAndPeople: View {
    let profile: JSONValue
    let edit: ProfileEdit
    @State private var newFact = ""
    @State private var about = "me"

    var body: some View {
        let facts = profile["facts"]?.array ?? []
        let mine = facts.filter { ($0["about"]?.string ?? "me") == "me" }
        let routines = profile["routines"]?.array ?? []
        VStack(alignment: .leading, spacing: 18) {
            PanelSection(title: "About you") {
                if mine.isEmpty {
                    Text("Nothing yet. Tell Slice anything it should keep in mind.")
                        .font(.system(size: 12.5)).foregroundStyle(Sky.ink2)
                }
                ForEach(Array(mine.enumerated()), id: \.offset) { _, f in
                    FactRow(text: f["text"]?.string ?? "",
                            source: TasteSpace.sourceLine(Memory.factSource(f["source"]?.string), at: f["at"]?.string)) {
                        edit("forget_fact", ["id": f["id"] ?? .null], "Forgetting")
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    SkyField(placeholder: "Something to remember, like \u{201C}I don't eat meat\u{201D}", text: $newFact, onSubmit: save)
                    HStack(spacing: 8) {
                        Picker("About", selection: $about) {
                            Text("About me").tag("me")
                            ForEach(Memory.people(profile), id: \.self) { Text("About \($0)").tag($0) }
                        }
                        .labelsHidden()
                        .fixedSize()
                        Spacer()
                        Button("Remember", action: save)
                            .buttonStyle(PrimaryButton(arrow: false, compact: true))
                            .disabled(newFact.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                .padding(.top, 4)
            }
            let people = Memory.people(profile)
            PanelSection(title: "People you plan for", note: people.isEmpty ? "Tell Slice about someone (\u{201C}my dad Ray is 74 and loves Sinatra\u{201D}) and they show up here." : nil) {
                ForEach(people, id: \.self) { name in
                    PersonCard(name: name, profile: profile, facts: facts.filter { $0["about"]?.string == name }, edit: edit)
                }
            }
            if !routines.isEmpty {
                PanelSection(title: "Every week") {
                    ForEach(Array(routines.enumerated()), id: \.offset) { _, r in
                        let when = [r["weekday"]?.string?.capitalizedFirst, r["time"]?.string].compactMap { $0 }.joined(separator: " at ")
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "calendar").font(.system(size: 13)).foregroundStyle(Sky.ink2).frame(width: 18)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r["title"]?.string ?? "").font(.system(size: 13, weight: .semibold))
                                if !when.isEmpty { Text("Every \(when)").font(.system(size: 11.5)).foregroundStyle(Sky.ink2) }
                            }
                            Spacer(minLength: 4)
                            Button("Stop") { edit("forget_routine", ["id": r["id"] ?? .null], "Stopping") }
                                .buttonStyle(InlineAction(color: Sky.bad, size: 12))
                        }
                    }
                }
            }
        }
    }

    private func save() {
        let text = newFact.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        newFact = ""
        edit("fact", ["text": .string(text), "about": .string(about)], "Remembering")
    }
}

/// Someone the user plans for: their face, who they are, and what Slice knows about them.
private struct PersonCard: View {
    let name: String
    let profile: JSONValue
    let facts: [JSONValue]
    let edit: ProfileEdit

    var body: some View {
        let info = profile["people_info"]?[name] ?? .null
        let loves = (profile["people"]?[name]?.array ?? []).compactMap { $0["name"]?.string }
        let who = [info["relation"]?.string?.capitalizedFirst, info["age"]?.double.map { "\(Int($0))" }].compactMap { $0 }.joined(separator: ", ")
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 10) {
                Avatar(seed: name, size: 36, border: 0)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(.system(size: 14, weight: .bold))
                    if !who.isEmpty { Text(who).font(.system(size: 11.5)).foregroundStyle(Sky.ink2) }
                }
                Spacer()
                Button("Forget") { edit("forget_person", ["name": .string(name)], "Forgetting \(name)") }
                    .buttonStyle(InlineAction(color: Sky.bad, size: 12))
            }
            VStack(alignment: .leading, spacing: 5) {
                if let home = info["home"]?.string { line("house", home) }
                if let needs = info["needs"]?.string { line("figure.roll", needs.capitalizedFirst + (info["step_free"]?.bool == true ? ", step-free places only" : "")) }
                if let birthday = info["birthday"]?.string, let (m, d) = Watchers.monthDay(birthday),
                   let date = Calendar.current.date(from: DateComponents(year: 2000, month: m, day: d)) {
                    line("gift", "Birthday \(date.formatted(.dateTime.day().month(.wide)))")
                }
                if !loves.isEmpty {
                    line("heart", "Loves " + loves.prefix(4).joined(separator: ", ") + (loves.count > 4 ? " and \(loves.count - 4) more" : ""))
                }
                ForEach(Array(facts.enumerated()), id: \.offset) { _, f in
                    line("text.quote", f["text"]?.string ?? "")
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Sky.canvas))
    }

    private func line(_ symbol: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: symbol).font(.system(size: 11)).foregroundStyle(Sky.ink3).frame(width: 14)
            Text(text).font(.system(size: 12.5)).foregroundStyle(Sky.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct FactRow: View {
    let text: String
    let source: String?
    let forget: () -> Void
    @State private var hovering = false

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle().fill(Sky.ink).frame(width: 5, height: 5).padding(.top, 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                if let source { Text(source).font(.system(size: 11)).foregroundStyle(Sky.ink3) }
            }
            Spacer(minLength: 4)
            Button(action: forget) {
                Image(systemName: "xmark").font(.system(size: 9.5, weight: .bold)).foregroundStyle(Sky.ink3)
                    .frame(width: 20, height: 20)
                    .background(Circle().fill(hovering ? Sky.fill : .clear))
            }
            .buttonStyle(.plain)
            .help("Forget this")
            .onHover { hovering = $0 }
        }
    }
}

// MARK: Changes

struct ChangesList: View {
    let profile: JSONValue
    let edit: ProfileEdit

    var body: some View {
        let entries = Array((profile["journal"]?.array ?? []).reversed())
        let days = Dictionary(grouping: entries.indices) { Memory.dayLabel(entries[$0]["at"]?.string) }
        let order = entries.map { Memory.dayLabel($0["at"]?.string) }.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        VStack(alignment: .leading, spacing: 16) {
            Text(Memory.weekLine(profile)).font(.system(size: 12.5)).foregroundStyle(Sky.ink2).fixedSize(horizontal: false, vertical: true)
            if entries.isEmpty {
                Text("As you tell Slice what you love, give a thumbs up, or play and watch things, what it learns shows up here.")
                    .font(.system(size: 12.5)).foregroundStyle(Sky.ink2).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(order.prefix(14), id: \.self) { day in
                PanelSection(title: day) {
                    ForEach(days[day] ?? [], id: \.self) { i in
                        JournalRow(entry: entries[i]) { edit("undo", ["id": entries[i]["id"] ?? .null], "Taking it back") }
                    }
                }
            }
        }
    }
}

/// One change, with an undo while it can still be taken back.
private struct JournalRow: View {
    let entry: JSONValue
    let undo: () -> Void

    var body: some View {
        let kind = entry["kind"]?.string ?? ""
        let undone = entry["undone"]?.bool == true
        HStack(alignment: .firstTextBaseline, spacing: 9) {
            Image(systemName: Self.symbol(kind))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(kind == "disliked" || kind == "removed" ? Sky.bad : Sky.ink2)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry["text"]?.string ?? "")
                    .font(.system(size: 13))
                    .strikethrough(undone)
                    .foregroundStyle(undone ? Sky.ink3 : Sky.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let at = entry["at"]?.string.flatMap(ISO8601DateFormatter().date(from:)) {
                    Text(at.formatted(.dateTime.hour().minute())).font(.system(size: 11)).foregroundStyle(Sky.ink3)
                }
            }
            Spacer(minLength: 4)
            if !undone, ["added", "learned", "liked", "removed", "disliked", "fact", "started"].contains(kind) {
                Button("Undo", action: undo).buttonStyle(InlineAction(size: 12))
            }
        }
    }

    static func symbol(_ kind: String) -> String {
        switch kind {
        case "started": "flag"
        case "added": "heart"
        case "learned": "waveform.path"
        case "liked": "hand.thumbsup"
        case "removed": "heart.slash"
        case "disliked": "hand.thumbsdown"
        case "fact": "text.quote"
        case "forgot": "eraser"
        case "reread": "arrow.triangle.2.circlepath"
        default: "circle"
        }
    }
}

// MARK: Pieces

struct PanelSection<Content: View>: View {
    let title: String
    var note: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title.uppercased()).font(.system(size: 10.5, weight: .bold)).tracking(0.6).foregroundStyle(Sky.ink3)
                if let note { Text(note).font(.system(size: 11.5)).foregroundStyle(Sky.ink2).fixedSize(horizontal: false, vertical: true) }
            }
            content
        }
    }
}

/// A thing with its picture, a line under its name, and an action on the right.
private struct ThingRow<Action: View>: View {
    let image: String?
    let name: String
    let line: String?
    var grey = false
    @ViewBuilder var action: Action

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            RemoteImage(url: image)
                .saturation(grey ? 0 : 1)
                .frame(width: 38, height: 38)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                if let line { Text(line).font(.system(size: 11.5)).foregroundStyle(Sky.ink2).lineLimit(2) }
            }
            Spacer(minLength: 4)
            action.fixedSize()
        }
    }
}

/// Reading the memory parts of the profile.
enum Memory {
    static func people(_ profile: JSONValue) -> [String] {
        Set((profile["people"]?.object ?? [:]).keys).union((profile["people_info"]?.object ?? [:]).keys).sorted()
    }

    static func entity(_ raw: JSONValue) -> JSONValue {
        .object(["id": raw["id"] ?? .null, "name": raw["name"] ?? .null, "kind": raw["kind"] ?? .null, "image": raw["image"] ?? .null])
    }

    static func factSource(_ source: String?) -> String? {
        switch source {
        case "onboarding": "onboarding"
        case "settings": "settings"
        default: "said"
        }
    }

    static func evidenceLine(_ ev: JSONValue) -> String {
        let events = ev["events"]?.object ?? [:]
        let days = ev["days"]?.array.count ?? 1
        let how = if let played = events["played"]?.double { "Played \(Int(played)) time\(played == 1 ? "" : "s")" }
            else if let opened = events["opened"]?.double { "Looked up \(Int(opened)) time\(opened == 1 ? "" : "s")" }
            else { "Came up" }
        return "\(how), on \(days) day\(days == 1 ? "" : "s")"
    }

    static func weekLine(_ profile: JSONValue) -> String {
        let weekAgo = Date().addingTimeInterval(-7 * 86400)
        let parser = ISO8601DateFormatter()
        let learned = (profile["journal"]?.array ?? []).filter { entry in
            guard let at = entry["at"]?.string.flatMap(parser.date(from:)), at > weekAgo else { return false }
            return ["added", "learned", "liked", "disliked", "fact", "started"].contains(entry["kind"]?.string ?? "")
        }.count
        let base = "Every change to what Slice knows, kept on this Mac."
        return learned == 0 ? base : "\(base) It learned \(learned) thing\(learned == 1 ? "" : "s") this week."
    }

    static func dayLabel(_ at: String?) -> String {
        guard let at, let date = ISO8601DateFormatter().date(from: at) else { return "Earlier" }
        if Calendar.current.isDateInToday(date) { return "Today" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }
}
