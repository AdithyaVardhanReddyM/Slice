import Foundation

/// A JSON frame from the brain (apps/agent/slice_mac/routes.py). Audio arrives as binary frames instead.
struct BrainEvent: Decodable, Sendable {
    enum Kind: String, Decodable, Sendable {
        case ready, transcript, activity, interrupted, error, task, profile, nudge
        case toolCall = "tool_call"
        case turnComplete = "turn_complete"
        case operatorStatus = "operator"
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
    // activity, operator: the task it belongs to
    let taskId: String?
    // operator
    let active: Bool?
    // task
    let task: TaskItem?
    // profile
    let profile: JSONValue?
    // nudge
    let nudge: Nudge?
    // ready, error
    let model: String?
    let message: String?

    enum CodingKeys: String, CodingKey {
        case type, role, text, partial, id, name, args, kind, label, detail, active, task, profile, nudge, model, message
        case taskId = "task_id"
    }
}

/// A background task, as the brain reports it (slice_mac/tasks.py `Task.snapshot`).
struct TaskItem: Decodable, Sendable, Identifiable, Equatable {
    struct Confirm: Decodable, Sendable, Equatable {
        let title: String
        let detail: String?
    }

    struct Card: Decodable, Sendable, Equatable, Identifiable {
        let title: String
        let subtitle: String?
        let image: String?
        let url: String?
        let reason: String?
        /// A one-word label over the picture ("Brand", "Vinyl", "Show").
        let tag: String?
        var id: String { title + (subtitle ?? "") }

        init(title: String, subtitle: String?, image: String?, url: String?, reason: String?, tag: String? = nil) {
            self.title = title
            self.subtitle = subtitle
            self.image = image
            self.url = url
            self.reason = reason
            self.tag = tag
        }
    }

    let id: String
    let title: String
    let status: String
    let steps: [String]
    let question: String?
    let confirm: Confirm?
    let say: String?
    let cards: [Card]
    /// Rich cards (a person, a day, a map, a note, gifts, why), newest last.
    var views: [TaskView] = []
    let error: String?

    enum CodingKeys: String, CodingKey {
        case id, title, status, steps, question, confirm, say, cards, views, error
    }

    init(id: String, title: String, status: String, steps: [String], question: String?, confirm: Confirm?,
         say: String?, cards: [Card], views: [TaskView] = [], error: String?) {
        self.id = id
        self.title = title
        self.status = status
        self.steps = steps
        self.question = question
        self.confirm = confirm
        self.say = say
        self.cards = cards
        self.views = views
        self.error = error
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        status = try c.decode(String.self, forKey: .status)
        steps = try c.decodeIfPresent([String].self, forKey: .steps) ?? []
        question = try c.decodeIfPresent(String.self, forKey: .question)
        confirm = try c.decodeIfPresent(Confirm.self, forKey: .confirm)
        say = try c.decodeIfPresent(String.self, forKey: .say)
        cards = (try? c.decodeIfPresent([Card].self, forKey: .cards)) ?? []
        // One view the app can't read shouldn't lose the task.
        views = (try? c.decodeIfPresent([Lossy<TaskView>].self, forKey: .views))?.compactMap(\.value) ?? []
        error = try c.decodeIfPresent(String.self, forKey: .error)
    }

    var isRunning: Bool { status == "running" }
    var needsYou: Bool { status == "needs_input" || status == "needs_confirmation" }
    var isOver: Bool { status == "done" || status == "failed" || status == "cancelled" }
}

/// Decodes to nil instead of failing the whole list.
struct Lossy<T: Decodable & Sendable>: Decodable, Sendable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

/// A rich card inside a task (slice_mac `show_view`): which fields are set depends on `type`.
struct TaskView: Decodable, Sendable, Equatable, Identifiable {
    struct Stop: Decodable, Sendable, Equatable, Identifiable {
        let time: String?
        let title: String
        let kind: String?
        let note: String?
        let address: String?
        let walkMin: Int?
        let lat: Double?
        let lon: Double?
        let image: String?
        let with: String?
        var id: String { (time ?? "") + title }

        enum CodingKeys: String, CodingKey {
            case time, title, kind, note, address, lat, lon, image, with
            case walkMin = "walk_min"
        }
    }

    struct Spot: Decodable, Sendable, Equatable, Identifiable {
        let name: String
        let lat: Double
        let lon: Double
        let weight: Double?
        var id: String { name }
    }

    struct Point: Decodable, Sendable, Equatable {
        let lat: Double
        let lon: Double
    }

    let type: String
    let key: String?
    let title: String?
    // person
    let name: String?
    let age: Int?
    let relation: String?
    let home: String?
    let needs: String?
    let stepFree: Bool?
    let birthday: String?
    let readsAs: [String]?
    let loves: [String]?
    // timeline
    let stops: [Stop]?
    // map
    let center: Point?
    let areas: [Spot]?
    // note, file
    let text: String?
    let detail: String?
    let path: String?
    // gifts
    let cards: [TaskItem.Card]?
    // why
    let why: Why?

    var id: String { type + (key ?? title ?? "") }

    enum CodingKeys: String, CodingKey {
        case type, key, title, name, age, relation, home, needs, birthday, loves, stops, center, areas, text, detail, path, cards
        case stepFree = "step_free"
        case readsAs = "reads_as"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decode(String.self, forKey: .type)
        key = try? c.decodeIfPresent(String.self, forKey: .key)
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        name = try? c.decodeIfPresent(String.self, forKey: .name)
        age = try? c.decodeIfPresent(Int.self, forKey: .age)
        relation = try? c.decodeIfPresent(String.self, forKey: .relation)
        home = try? c.decodeIfPresent(String.self, forKey: .home)
        needs = try? c.decodeIfPresent(String.self, forKey: .needs)
        stepFree = try? c.decodeIfPresent(Bool.self, forKey: .stepFree)
        birthday = try? c.decodeIfPresent(String.self, forKey: .birthday)
        readsAs = try? c.decodeIfPresent([String].self, forKey: .readsAs)
        loves = try? c.decodeIfPresent([String].self, forKey: .loves)
        stops = try? c.decodeIfPresent([Stop].self, forKey: .stops)
        center = try? c.decodeIfPresent(Point.self, forKey: .center)
        areas = try? c.decodeIfPresent([Spot].self, forKey: .areas)
        text = try? c.decodeIfPresent(String.self, forKey: .text)
        detail = try? c.decodeIfPresent(String.self, forKey: .detail)
        path = try? c.decodeIfPresent(String.self, forKey: .path)
        cards = try? c.decodeIfPresent([TaskItem.Card].self, forKey: .cards)
        // A "why" view carries the Why fields at its top level.
        why = type == "why" ? try? Why(from: decoder) : nil
    }
}

/// Why something fits a taste (slice_mac taste.explain), for the why card.
struct Why: Decodable, Sendable, Equatable {
    struct Thing: Decodable, Sendable, Equatable {
        let name: String
        let kind: String?
        let image: String?
        let description: String?
    }

    struct Shared: Decodable, Sendable, Equatable, Identifiable {
        let name: String
        let with: [String]
        var id: String { name }
    }

    struct Also: Decodable, Sendable, Equatable, Identifiable {
        let name: String
        let kind: String?
        let image: String?
        var id: String { name }
    }

    let thing: Thing
    let `for`: String?
    let match: Int?
    let line: String
    let because: [String]?
    let shared: [Shared]?
    let also: [Also]?
}

/// Something Slice brings up by itself (a "very you" moment, a birthday coming up), or a why
/// card the user asked for (`show`).
struct Nudge: Decodable, Sendable, Equatable, Identifiable {
    let id: String
    let kind: String
    let title: String
    let line: String
    /// Open the island with it now (asked for), rather than a pill under the notch.
    var show: Bool = false
    var why: Why?
    /// For a nudge with a button: what to ask Slice ("It's Maya's birthday…").
    var prompt: String?
    var action: String?

    enum CodingKeys: String, CodingKey { case id, kind, title, line, show, why, prompt, action }

    init(id: String, kind: String, title: String, line: String, show: Bool = false, why: Why? = nil,
         prompt: String? = nil, action: String? = nil) {
        self.id = id
        self.kind = kind
        self.title = title
        self.line = line
        self.show = show
        self.why = why
        self.prompt = prompt
        self.action = action
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        title = try c.decode(String.self, forKey: .title)
        line = try c.decode(String.self, forKey: .line)
        show = (try? c.decodeIfPresent(Bool.self, forKey: .show)) ?? false
        why = try? c.decodeIfPresent(Why.self, forKey: .why)
        prompt = try? c.decodeIfPresent(String.self, forKey: .prompt)
        action = try? c.decodeIfPresent(String.self, forKey: .action)
    }
}
