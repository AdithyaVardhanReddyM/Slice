import AppKit

/// Music, Messages and Mail, through AppleScript and URLs. The first use of each
/// AppleScript target shows macOS's Automation prompt.
@MainActor
enum AppTools {
    static func nowPlaying() async -> Result<JSONValue, LocalTools.Failure> {
        let players = [("com.spotify.client", "Spotify"), ("com.apple.Music", "Music")]
        for (bundle, name) in players where NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first != nil {
            let script = """
            tell application "\(name)"
                if player state is playing then return (name of current track) & "\\n" & (artist of current track) & "\\n" & (album of current track)
            end tell
            return ""
            """
            if let text = await OSAScript.run(script), !text.isEmpty {
                let parts = text.components(separatedBy: "\n")
                return .success(["app": .string(name), "track": .string(parts[0]),
                                 "artist": .string(parts.count > 1 ? parts[1] : ""), "album": .string(parts.count > 2 ? parts[2] : "")])
            }
        }
        return .success(["playing": false])
    }

    /// Opens a search in Spotify when it's installed, Apple Music otherwise.
    static func openInMusic(_ query: String) -> Result<JSONValue, LocalTools.Failure> {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let hasSpotify = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.spotify.client") != nil
        let link = hasSpotify ? "spotify:search:\(encoded)" : "music://music.apple.com/search?term=\(encoded)"
        guard let url = URL(string: link) else { return .failure(.init(message: "Couldn't make a music link.")) }
        NSWorkspace.shared.open(url)
        return .success(["opened": .string(hasSpotify ? "Spotify" : "Music")])
    }

    /// The brain asks the user before calling this (slice_mac/mac_tools.py send_imessage).
    static func sendMessage(to: String, text: String) async -> Result<JSONValue, LocalTools.Failure> {
        let script = """
        tell application "Messages"
            set theService to 1st account whose service type = iMessage
            send "\(OSAScript.escape(text))" to participant "\(OSAScript.escape(to))" of theService
        end tell
        return "sent"
        """
        guard await OSAScript.run(script) == "sent" else {
            return .failure(.init(message: "Messages didn't send it. Is Slice allowed to control Messages (System Settings > Privacy > Automation)?"))
        }
        return .success(["sent": true])
    }

    /// A compose window in the default mail app; the user presses Send.
    static func mailDraft(to: String, subject: String, body: String) -> Result<JSONValue, LocalTools.Failure> {
        var parts = URLComponents()
        parts.scheme = "mailto"
        parts.path = to
        parts.queryItems = [URLQueryItem(name: "subject", value: subject), URLQueryItem(name: "body", value: body)]
        guard let url = parts.url else { return .failure(.init(message: "Couldn't make the draft.")) }
        NSWorkspace.shared.open(url)
        return .success(["opened": true])
    }
}

/// Runs AppleScript through osascript in a child process, so a first-time Automation
/// prompt never blocks the app.
enum OSAScript {
    static func run(_ script: String) async -> String? {
        await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", script]
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = Pipe()
            process.terminationHandler = { finished in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
                continuation.resume(returning: finished.terminationStatus == 0 ? text : nil)
            }
            do { try process.run() } catch { continuation.resume(returning: nil) }
        }
    }

    static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    }
}
