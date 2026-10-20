import AppKit
import Contacts

/// What Slice keeps an eye on by itself, lightly (a look every 20 seconds):
/// - what's playing and the film, show, book or music page in front: sent as `noticed`, so the
///   brain can say "very you" now and then (at most once an hour; slice_mac/lens.py),
/// - birthdays of the people the user saved, up to ten days out: a pill with "Sort it",
/// - weekly jobs the user asked for (slice_mac/plans.py repeat_weekly): `run_routine` when due.
@MainActor
final class Watchers {
    /// Pages worth a look: their titles name a film, show, book or artist (lens.thing_from_page).
    static let mediaHosts = ["netflix.com", "letterboxd.com", "imdb.com", "goodreads.com", "open.spotify.com",
                             "music.apple.com", "youtube.com", "wikipedia.org"]
    static let suggestKey = "suggestVeryYou"
    private static let every: Duration = .seconds(20)
    private static let weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

    private weak var agent: AgentSession?
    private var loop: Task<Void, Never>?
    private var lastNoticed = ""

    init(agent: AgentSession) {
        self.agent = agent
    }

    static var suggestVeryYou: Bool {
        UserDefaults.standard.object(forKey: suggestKey) as? Bool ?? true
    }

    func start() {
        loop = Task { [weak self] in
            var tick = 0
            while !Task.isCancelled {
                await self?.look(tick: tick)
                tick += 1
                try? await Task.sleep(for: Self.every)
            }
        }
    }

    private func look(tick: Int) async {
        guard let agent, agent.connection == .online else { return }
        if Self.suggestVeryYou { await noticeMedia(agent) }
        if tick % 3 == 0 { runDueRoutines(agent) }
        if tick % 90 == 0 { await birthdays(agent) }
    }

    // MARK: What's playing or open

    private func noticeMedia(_ agent: AgentSession) async {
        if case .success(let playing) = await AppTools.nowPlaying(), let artist = playing["artist"]?.string, !artist.isEmpty {
            let key = "track:\(artist):\(playing["track"]?.string ?? "")"
            if key != lastNoticed {
                lastNoticed = key
                agent.sendFrame(["type": "noticed", "artist": .string(artist), "track": playing["track"] ?? .null])
            }
            return
        }
        guard let app = NSWorkspace.shared.frontmostApplication, let id = app.bundleIdentifier,
              let link = await BrowserTab.currentURL(bundleId: id), let host = URL(string: link)?.host?.lowercased(),
              Self.mediaHosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }),
              let title = LocalTools.focusedWindowTitle(pid: app.processIdentifier) else { return }
        let key = "page:\(link)"
        guard key != lastNoticed else { return }
        lastNoticed = key
        agent.sendFrame(["type": "noticed", "title": .string(title), "url": .string(link)])
    }

    // MARK: Birthdays

    private func birthdays(_ agent: AgentSession) async {
        let info = agent.profile["people_info"]?.object ?? [:]
        let people = Set((agent.profile["people"]?.object ?? [:]).keys).union(info.keys)
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        for name in people.sorted() {
            var birthday = info[name]?["birthday"]?.string.flatMap(Self.monthDay)
            if birthday == nil { birthday = await ContactsTool.birthday(of: name) }
            guard let (month, day) = birthday,
                  let next = calendar.nextDate(after: today.addingTimeInterval(-1), matching: DateComponents(month: month, day: day), matchingPolicy: .nextTime)
            else { continue }
            let days = calendar.dateComponents([.day], from: today, to: next).day ?? 99
            let key = "birthdayNudge.\(name).\(calendar.component(.year, from: next))"
            guard (1...10).contains(days), !UserDefaults.standard.bool(forKey: key) else { continue }
            UserDefaults.standard.set(true, forKey: key)
            let date = next.formatted(.dateTime.month(.wide).day())
            agent.show(Nudge(
                id: key, kind: "birthday", title: "\(name)'s birthday is in \(days) day\(days == 1 ? "" : "s")",
                line: "Want me to sort it? Gift ideas for \(name)'s taste, and dinner if you like.",
                prompt: "It's \(name)'s birthday on \(date). Help me sort it: gift ideas for \(name)'s taste.", action: "Sort it"
            ))
            return
        }
    }

    /// "10-29", "--10-29" or "1990-10-29" to (month, day).
    static func monthDay(_ text: String) -> (Int, Int)? {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count >= 2 else { return nil }
        let (month, day) = (parts[parts.count - 2], parts[parts.count - 1])
        return (1...12).contains(month) && (1...31).contains(day) ? (month, day) : nil
    }

    // MARK: Weekly jobs

    private func runDueRoutines(_ agent: AgentSession) {
        let now = Date()
        let calendar = Calendar.current
        let weekday = Self.weekdays[calendar.component(.weekday, from: now) - 1]
        let today = now.formatted(.iso8601.year().month().day())
        for routine in agent.profile["routines"]?.array ?? [] {
            guard let id = routine["id"]?.string, routine["weekday"]?.string == weekday,
                  let goal = routine["goal"]?.string, let time = routine["time"]?.string else { continue }
            let hm = time.split(separator: ":").compactMap { Int($0) }
            guard hm.count == 2, let due = calendar.date(bySettingHour: hm[0], minute: hm[1], second: 0, of: now),
                  now >= due, now.timeIntervalSince(due) < 6 * 3600 else { continue }
            let key = "routineRan.\(id)"
            guard UserDefaults.standard.string(forKey: key) != today else { continue }
            UserDefaults.standard.set(today, forKey: key)
            agent.sendFrame(["type": "run_routine", "title": routine["title"] ?? "Weekly", "goal": .string(goal)])
        }
    }
}
