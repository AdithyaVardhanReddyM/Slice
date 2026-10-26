import AppKit
import ApplicationServices

/// Tools the brain runs on this Mac (`tool_call` frames). Names match the bridge
/// calls in apps/agent/slice_mac (tools.py, mac_tools.py, taste.py, computer.py).
@MainActor
struct LocalTools {
    struct Failure: Error {
        let message: String
    }

    func run(_ name: String, args: JSONValue?) async -> Result<JSONValue, Failure> {
        let text = { (key: String) in args?[key]?.string ?? "" }
        switch name {
        case "frontmost_app": return .success(await frontmostApp())
        case "open_url": return openURL(args?["url"]?.string)
        case "open_app": return AppTools.openApp(text("name"))
        case "calendar_events":
            let days: Int = if case .number(let n)? = args?["days"] { Int(n) } else { 7 }
            return await CalendarTool.events(days: days, search: text("search"))
        case "calendar_add": return await CalendarTool.add(args)
        case "reminders_list": return await RemindersTool.list(args)
        case "reminders_add": return await RemindersTool.add(args)
        case "reminders_complete": return await RemindersTool.complete(text("title"))
        case "notes_search": return await NotesTool.search(text("query"))
        case "notes_read": return await NotesTool.read(text("note"))
        case "notes_add": return await NotesTool.add(title: text("title"), body: text("body"))
        case "contacts_search": return await ContactsTool.search(text("query"))
        case "maps_search": return await MapsTool.search(query: text("query"), near: text("near"))
        case "maps_eta": return await MapsTool.eta(from: text("from"), to: text("to"), mode: text("mode"))
        case "maps_reverse_geocode": return await MapsTool.reverse(args?["points"]?.array ?? [])
        case "maps_geocode": return await MapsTool.geocode(args?["places"]?.array.compactMap(\.string) ?? [])
        case "music_now_playing": return await AppTools.nowPlaying()
        case "music_open": return AppTools.openInMusic(text("query"))
        case "messages_send": return await AppTools.sendMessage(to: text("to"), text: text("text"))
        case "messages_send_file": return await AppTools.sendFile(to: text("to"), path: text("path"), text: text("text"))
        case "mail_draft":
            if !text("attachment").isEmpty {
                return await AppTools.mailDraft(to: text("to"), subject: text("subject"), body: text("body"), attachment: text("attachment"))
            }
            return AppTools.mailDraft(to: text("to"), subject: text("subject"), body: text("body"))
        case "save_file": return FileTool.save(name: text("name"), base64: text("data"), open: args?["open"] == .bool(true))
        case "screenshot": return await ScreenTool.screenshot()
        case "computer": return await ComputerTool.run(args)
        case "lens_show": return LensOverlay.shared.show(args?["badges"]?.array ?? [])
        case "lens_clear":
            LensOverlay.shared.clear()
            return .success(["ok": true])
        default: return .failure(Failure(message: "This Mac doesn't know the tool \(name)."))
        }
    }

    private func frontmostApp() async -> JSONValue {
        guard let app = NSWorkspace.shared.frontmostApplication else { return ["app": .null] }
        var out: [String: JSONValue] = [
            "app": .string(app.localizedName ?? "Unknown"),
            "bundleId": .string(app.bundleIdentifier ?? ""),
        ]
        if let title = Self.focusedWindowTitle(pid: app.processIdentifier) {
            out["windowTitle"] = .string(title)
        }
        if let id = app.bundleIdentifier, let url = await BrowserTab.currentURL(bundleId: id) {
            out["url"] = .string(url)
        }
        return .object(out)
    }

    private func openURL(_ string: String?) -> Result<JSONValue, Failure> {
        guard let string, let url = URL(string: string),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
            return .failure(Failure(message: "Only http and https links can be opened."))
        }
        NSWorkspace.shared.open(url)
        return .success(["ok": true])
    }

    /// Needs Accessibility; without it the title is left out.
    static func focusedWindowTitle(pid: pid_t) -> String? {
        guard AXIsProcessTrusted() else { return nil }
        let app = AXUIElementCreateApplication(pid)
        var window: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &window) == .success,
              let window, CFGetTypeID(window) == AXUIElementGetTypeID() else { return nil }
        var title: CFTypeRef?
        guard AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &title) == .success else {
            return nil
        }
        return (title as? String).flatMap { $0.isEmpty ? nil : $0 }
    }
}

/// The address of the front browser tab, through AppleScript.
enum BrowserTab {
    private static let scripts: [String: String] = [
        "com.apple.Safari": #"tell application "Safari" to return URL of front document"#,
        "com.google.Chrome": #"tell application id "com.google.Chrome" to return URL of active tab of front window"#,
        "com.brave.Browser": #"tell application id "com.brave.Browser" to return URL of active tab of front window"#,
        "com.microsoft.edgemac": #"tell application id "com.microsoft.edgemac" to return URL of active tab of front window"#,
        "company.thebrowser.Browser": #"tell application id "company.thebrowser.Browser" to return URL of active tab of front window"#,
    ]

    static func currentURL(bundleId: String) async -> String? {
        guard let script = scripts[bundleId], let url = await OSAScript.run(script), !url.isEmpty else { return nil }
        return url
    }
}
