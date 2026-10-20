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

    /// A file (a large-print plan) by iMessage. The brain asks the user first.
    static func sendFile(to: String, path: String, text: String) async -> Result<JSONValue, LocalTools.Failure> {
        guard FileManager.default.fileExists(atPath: path) else { return .failure(.init(message: "There's no file at \(path).")) }
        let message = text.isEmpty ? "" : "send \"\(OSAScript.escape(text))\" to theBuddy\n"
        let script = """
        tell application "Messages"
            set theService to 1st account whose service type = iMessage
            set theBuddy to participant "\(OSAScript.escape(to))" of theService
            \(message)send (POSIX file "\(OSAScript.escape(path))") to theBuddy
        end tell
        return "sent"
        """
        guard await OSAScript.run(script) == "sent" else {
            return .failure(.init(message: "Messages didn't send it. Is Slice allowed to control Messages (System Settings > Privacy > Automation)?"))
        }
        return .success(["sent": true])
    }

    /// A Mail compose window with a file attached; the user presses Send.
    static func mailDraft(to: String, subject: String, body: String, attachment: String) async -> Result<JSONValue, LocalTools.Failure> {
        guard FileManager.default.fileExists(atPath: attachment) else { return .failure(.init(message: "There's no file at \(attachment).")) }
        let script = """
        tell application "Mail"
            set theMessage to make new outgoing message with properties {subject:"\(OSAScript.escape(subject))", content:"\(OSAScript.escape(body))" & return & return, visible:true}
            tell theMessage
                make new to recipient at end of to recipients with properties {address:"\(OSAScript.escape(to))"}
                make new attachment with properties {file name:(POSIX file "\(OSAScript.escape(attachment))")} at after the last paragraph
            end tell
            activate
        end tell
        return "ok"
        """
        guard await OSAScript.run(script) == "ok" else {
            return .failure(.init(message: "Mail didn't open the draft. Is Mail set up, and is Slice allowed to control it?"))
        }
        return .success(["opened": true])
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

/// Files the brain makes for the user (a large-print plan), kept in Documents/Slice.
@MainActor
enum FileTool {
    static func save(name: String, base64: String, open: Bool) -> Result<JSONValue, LocalTools.Failure> {
        guard let data = Data(base64Encoded: base64) else { return .failure(.init(message: "The file didn't arrive whole.")) }
        let safe = name.replacingOccurrences(of: "/", with: "-").trimmingCharacters(in: .whitespaces)
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Slice", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(safe.isEmpty ? "Slice file" : safe)
            try data.write(to: url, options: .atomic)
            if open { NSWorkspace.shared.open(url) }
            return .success(["path": .string(url.path)])
        } catch {
            return .failure(.init(message: "Couldn't save \(safe): \(error.localizedDescription)"))
        }
    }
}
