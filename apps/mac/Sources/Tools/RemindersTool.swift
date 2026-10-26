import EventKit

/// The Mac's Reminders (every list in it, iCloud included), through EventKit.
@MainActor
enum RemindersTool {
    private static let store = EKEventStore()

    static func list(_ args: JSONValue?) async -> Result<JSONValue, LocalTools.Failure> {
        guard await access() else { return .failure(denied) }
        let lists = calendars(named: args?["list"]?.string ?? "")
        if lists?.isEmpty == true {
            return .failure(.init(message: "There's no Reminders list called \(args?["list"]?.string ?? ""). Lists: \(listNames)."))
        }
        var predicates = [store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: lists)]
        if args?["done"] == .bool(true) {
            let since = Calendar.current.date(byAdding: .day, value: -14, to: Date())
            predicates.append(store.predicateForCompletedReminders(withCompletionDateStarting: since, ending: Date(), calendars: lists))
        }
        var items: [JSONValue] = []
        for predicate in predicates { items += await fetch(predicate) }
        return .success(["reminders": .array(Array(items.prefix(60))), "lists": .string(listNames)])
    }

    static func add(_ args: JSONValue?) async -> Result<JSONValue, LocalTools.Failure> {
        guard await access() else { return .failure(denied) }
        let reminder = EKReminder(eventStore: store)
        reminder.title = args?["title"]?.string ?? "Reminder"
        if let notes = args?["notes"]?.string, !notes.isEmpty { reminder.notes = notes }
        let name = args?["list"]?.string ?? ""
        reminder.calendar = calendars(named: name)?.first ?? store.defaultCalendarForNewReminders()
        if let due = args?["due"]?.string, !due.isEmpty {
            guard let date = LocalDate.parse(due) else {
                return .failure(.init(message: "due must be a time like 2026-10-29T17:00 or a date like 2026-10-29."))
            }
            let timed = due.contains(":")
            reminder.dueDateComponents = Calendar.current.dateComponents(timed ? [.year, .month, .day, .hour, .minute] : [.year, .month, .day], from: date)
            if timed { reminder.addAlarm(EKAlarm(absoluteDate: date)) }
        }
        do {
            try store.save(reminder, commit: true)
            return .success(["added": true, "list": .string(reminder.calendar?.title ?? "")])
        } catch {
            return .failure(.init(message: "Reminders didn't save it: \(error.localizedDescription)"))
        }
    }

    /// Ticks off the first open reminder whose title contains `title`.
    static func complete(_ title: String) async -> Result<JSONValue, LocalTools.Failure> {
        guard await access() else { return .failure(denied) }
        let term = title.trimmingCharacters(in: .whitespaces).lowercased()
        let open = await fetch(store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil))
        let match = open.first { $0["title"]?.string?.lowercased() == term }
            ?? open.first { $0["title"]?.string?.lowercased().contains(term) == true }
        guard let id = match?["id"]?.string, let reminder = store.calendarItem(withIdentifier: id) as? EKReminder else {
            return .failure(.init(message: "No open reminder matches \(title)."))
        }
        reminder.isCompleted = true
        do {
            try store.save(reminder, commit: true)
            return .success(["completed": .string(reminder.title ?? title)])
        } catch {
            return .failure(.init(message: "Reminders didn't save it: \(error.localizedDescription)"))
        }
    }

    static var status: EKAuthorizationStatus { EKEventStore.authorizationStatus(for: .reminder) }

    static func access() async -> Bool {
        switch status {
        case .fullAccess: return true
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                store.requestFullAccessToReminders { granted, _ in continuation.resume(returning: granted) }
            }
        default: return false
        }
    }

    private static let denied = LocalTools.Failure(message: "Slice isn't allowed to use Reminders. Allow it in Slice Settings > Integrations.")

    private static var listNames: String {
        store.calendars(for: .reminder).map(\.title).joined(separator: ", ")
    }

    /// nil means every list; an empty array means no list has that name.
    private static func calendars(named name: String) -> [EKCalendar]? {
        let name = name.trimmingCharacters(in: .whitespaces).lowercased()
        guard !name.isEmpty else { return nil }
        return store.calendars(for: .reminder).filter { $0.title.lowercased() == name }
    }

    /// The reminders as JSON, made inside EventKit's callback (EKReminder can't leave its queue).
    private static func fetch(_ predicate: NSPredicate) async -> [JSONValue] {
        await withCheckedContinuation { continuation in
            store.fetchReminders(matching: predicate) { found in
                let items: [JSONValue] = (found ?? []).map { reminder in
                    var item: [String: JSONValue] = [
                        "id": .string(reminder.calendarItemIdentifier),
                        "title": .string(reminder.title ?? ""),
                        "list": .string(reminder.calendar?.title ?? ""),
                    ]
                    if reminder.isCompleted { item["done"] = true }
                    if let due = reminder.dueDateComponents, let date = Calendar.current.date(from: due) {
                        item["due"] = .string(due.hour == nil ? String(LocalDate.string(date).prefix(14)) : LocalDate.string(date))
                    }
                    if let notes = reminder.notes, !notes.isEmpty { item["notes"] = .string(String(notes.prefix(300))) }
                    if reminder.priority > 0 { item["priority"] = .string(reminder.priority <= 4 ? "high" : (reminder.priority == 5 ? "medium" : "low")) }
                    return .object(item)
                }
                continuation.resume(returning: items)
            }
        }
    }
}
