import AppKit
import CoreServices

/// The Mac's Notes app, through AppleScript (Notes has no other API). The first use shows
/// macOS's Automation prompt for Notes.
@MainActor
enum NotesTool {
    nonisolated static let bundleID = "com.apple.Notes"

    /// Fields and records in AppleScript's answers (unit and record separators never appear in notes).
    private static let field = "\u{1F}", record = "\u{1E}"
    private static let separators = """
    set FS to (character id 31)
    set RS to (character id 30)
    """

    /// Notes whose title, then whose text, contains the words; newest first, at most 12.
    static func search(_ query: String) async -> Result<JSONValue, LocalTools.Failure> {
        let q = OSAScript.escape(query.trimmingCharacters(in: .whitespaces))
        guard !q.isEmpty else { return .failure(.init(message: "Say what to look for.")) }
        let script = """
        \(separators)
        set out to ""
        tell application "Notes"
            set hits to (notes whose name contains "\(q)")
            if (count of hits) < 12 then
                try
                    set hits to hits & (notes whose plaintext contains "\(q)")
                end try
            end if
            set n to 0
            repeat with x in hits
                set n to n + 1
                if n > 24 then exit repeat
                set t to plaintext of x
                if (length of t) > 240 then set t to text 1 thru 240 of t
                set folderName to ""
                try
                    set folderName to name of container of x
                end try
                set out to out & (id of x) & FS & (name of x) & FS & folderName & FS & t & FS & ((modification date of x) as «class isot» as string) & RS
            end repeat
        end tell
        return out
        """
        guard let text = await OSAScript.run(script) else { return .failure(notAllowed) }
        var seen = Set<String>()
        let notes: [JSONValue] = text.components(separatedBy: record).compactMap { row in
            let parts = row.components(separatedBy: field)
            guard parts.count >= 5, seen.insert(parts[0]).inserted else { return nil }
            return ["id": .string(parts[0]), "title": .string(parts[1]), "folder": .string(parts[2]),
                    "snippet": .string(parts[3].replacingOccurrences(of: "\n", with: " ")), "edited": .string(String(parts[4].prefix(16)))]
        }
        return .success(["notes": .array(Array(notes.prefix(12)))])
    }

    /// One note's full text, by its id or its exact title.
    static func read(_ note: String) async -> Result<JSONValue, LocalTools.Failure> {
        let key = OSAScript.escape(note.trimmingCharacters(in: .whitespaces))
        let pick = key.hasPrefix("x-coredata:") ? "note id \"\(key)\"" : "first note whose name is \"\(key)\""
        let script = """
        \(separators)
        tell application "Notes"
            try
                set x to \(pick)
            on error
                return "missing"
            end try
            return (name of x) & FS & (plaintext of x)
        end tell
        """
        guard let text = await OSAScript.run(script) else { return .failure(notAllowed) }
        let parts = text.components(separatedBy: field)
        guard text != "missing", parts.count >= 2 else { return .failure(.init(message: "There's no note called \(note).")) }
        return .success(["title": .string(parts[0]), "text": .string(String(parts[1...].joined(separator: field).prefix(12_000)))])
    }

    /// A new note in the default folder: the title as its heading, then one line per paragraph.
    static func add(title: String, body: String) async -> Result<JSONValue, LocalTools.Failure> {
        let lines = body.components(separatedBy: .newlines).map { $0.isEmpty ? "<div><br></div>" : "<div>\(html($0))</div>" }
        let markup = OSAScript.escape("<div><h1>\(html(title))</h1></div>" + lines.joined())
        let script = """
        tell application "Notes"
            try
                set x to make new note with properties {body:"\(markup)"}
            on error
                set x to make new note at folder 1 of default account with properties {body:"\(markup)"}
            end try
            return id of x
        end tell
        """
        guard let id = await OSAScript.run(script), !id.isEmpty else { return .failure(notAllowed) }
        return .success(["added": true, "id": .string(id)])
    }

    private static func html(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
    }

    private static let notAllowed = LocalTools.Failure(
        message: "Notes didn't answer. Is Slice allowed to control Notes (System Settings > Privacy & Security > Automation)?")

    // MARK: Permission

    enum Access { case allowed, denied, notAsked }

    /// Without asking: allowed, denied, or not asked yet (also when Notes isn't open, since macOS
    /// can only answer for a running app; then it asks on first use).
    nonisolated static func access() -> Access {
        switch permission(ask: false) {
        case noErr: .allowed
        case -1743: .denied
        default: .notAsked
        }
    }

    /// Shows macOS's prompt: opens Notes in the background if it isn't running, then asks it something harmless.
    static func requestAccess() async -> Access {
        if access() == .denied { return .denied }
        _ = await OSAScript.run(#"tell application "Notes" to count notes"#)
        return access()
    }

    nonisolated private static func permission(ask: Bool) -> OSStatus {
        var target = AEAddressDesc()
        let made = bundleID.withCString { AECreateDesc(DescType(typeApplicationBundleID), $0, strlen($0), &target) }
        guard made == noErr else { return OSStatus(made) }
        defer { AEDisposeDesc(&target) }
        return AEDeterminePermissionToAutomateTarget(&target, AEEventClass(typeWildCard), AEEventID(typeWildCard), ask)
    }
}
