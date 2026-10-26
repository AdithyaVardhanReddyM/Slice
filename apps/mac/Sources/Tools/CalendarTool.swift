import EventKit

/// The Mac's Calendar (every account added to it: iCloud, Google, Exchange).
@MainActor
enum CalendarTool {
    private static let store = EKEventStore()

    static func events(days: Int, search: String) async -> Result<JSONValue, LocalTools.Failure> {
        guard await access() else {
            return .failure(.init(message: "Slice isn't allowed to read Calendar. Allow it in Slice Settings > Integrations."))
        }
        let start = Calendar.current.startOfDay(for: Date())
        let end = Calendar.current.date(byAdding: .day, value: max(1, min(days, 60)) + 1, to: start) ?? start
        var events = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil))
        let term = search.trimmingCharacters(in: .whitespaces).lowercased()
        if !term.isEmpty {
            events = events.filter { event in
                [event.title, event.notes, event.location].compactMap { $0?.lowercased() }.contains { $0.contains(term) }
            }
        }
        let list: [JSONValue] = events.prefix(40).map { event in
            var item: [String: JSONValue] = [
                "title": .string(event.title ?? "Untitled"),
                "start": .string(LocalDate.string(event.startDate)),
                "end": .string(LocalDate.string(event.endDate)),
                "calendar": .string(event.calendar?.title ?? ""),
            ]
            if event.isAllDay { item["all_day"] = true }
            if let location = event.location, !location.isEmpty { item["location"] = .string(location) }
            if let attendees = event.attendees, !attendees.isEmpty {
                item["attendees"] = .array(attendees.compactMap { $0.name.map(JSONValue.string) })
            }
            return .object(item)
        }
        return .success(["events": .array(list), "from": .string(LocalDate.string(start)), "to": .string(LocalDate.string(end))])
    }

    static func add(_ args: JSONValue?) async -> Result<JSONValue, LocalTools.Failure> {
        guard await access() else {
            return .failure(.init(message: "Slice isn't allowed to use Calendar. Allow it in Slice Settings > Integrations."))
        }
        guard let start = LocalDate.parse(args?["start"]?.string), let end = LocalDate.parse(args?["end"]?.string) else {
            return .failure(.init(message: "start and end must be dates like 2026-10-23T20:00."))
        }
        let event = EKEvent(eventStore: store)
        event.title = args?["title"]?.string ?? "Event"
        event.startDate = start
        event.endDate = end
        event.location = args?["location"]?.string
        event.notes = args?["notes"]?.string
        event.calendar = store.defaultCalendarForNewEvents
        do {
            try store.save(event, span: .thisEvent)
            return .success(["added": true, "calendar": .string(event.calendar?.title ?? "")])
        } catch {
            return .failure(.init(message: "Calendar didn't save it: \(error.localizedDescription)"))
        }
    }

    static func access() async -> Bool {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess: return true
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                store.requestFullAccessToEvents { granted, _ in continuation.resume(returning: granted) }
            }
        default: return false
        }
    }
}

/// Local wall-clock dates, the way the worker writes them ("2026-10-23T20:00").
enum LocalDate {
    static func string(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "EEE yyyy-MM-dd'T'HH:mm"
        return f.string(from: date)
    }

    static func parse(_ text: String?) -> Date? {
        guard let text = text?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return nil }
        if let date = ISO8601DateFormatter().date(from: text) { return date }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        for format in ["yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-dd"] {
            f.dateFormat = format
            if let date = f.date(from: text) { return date }
        }
        return nil
    }
}
