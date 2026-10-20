import AppKit
import ApplicationServices

/// Tools the brain runs on this Mac (`tool_call` frames). Names match
/// apps/agent/slice_mac/tools.py.
@MainActor
struct LocalTools {
    struct Failure: Error { let message: String }

    func run(_ name: String, args: JSONValue?) async -> Result<JSONValue, Failure> {
        switch name {
        case "frontmost_app":
            return .success(await frontmostApp())
        case "open_url":
            return openURL(args?["url"]?.string)
        default:
            return .failure(Failure(message: "This Mac doesn't know the tool \(name)."))
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
    private static func focusedWindowTitle(pid: pid_t) -> String? {
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

/// The address of the front browser tab, through AppleScript. Run by osascript in a child
/// process so the first-time Automation prompt never blocks the app.
enum BrowserTab {
    private static let scripts: [String: String] = [
        "com.apple.Safari": #"tell application "Safari" to return URL of front document"#,
        "com.google.Chrome": #"tell application id "com.google.Chrome" to return URL of active tab of front window"#,
        "com.brave.Browser": #"tell application id "com.brave.Browser" to return URL of active tab of front window"#,
        "com.microsoft.edgemac": #"tell application id "com.microsoft.edgemac" to return URL of active tab of front window"#,
        "company.thebrowser.Browser": #"tell application id "company.thebrowser.Browser" to return URL of active tab of front window"#,
    ]

    static func currentURL(bundleId: String) async -> String? {
        guard let script = scripts[bundleId] else { return nil }
        return await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", script]
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = Pipe()
            process.terminationHandler = { finished in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
                continuation.resume(returning: finished.terminationStatus == 0 && text?.isEmpty == false ? text : nil)
            }
            do { try process.run() } catch { continuation.resume(returning: nil) }
        }
    }
}
