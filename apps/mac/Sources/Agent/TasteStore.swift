import Foundation

/// Who this Mac's user is to the brain, and their taste profile.
///
/// The profile is local-first: it lives in Application Support/Slice/taste.json,
/// goes to the brain in `hello`, and comes back from the brain (`profile` frames)
/// when the agent learns something. Its shape is documented in slice_mac/taste.py.
@MainActor
enum TasteStore {
    /// A random id per Mac, also the user's Composio identity (`mac-user:<id>`).
    static var userID: String {
        if let id = UserDefaults.standard.string(forKey: "userID") { return id }
        let id = UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: "userID")
        return id
    }

    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Slice", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("taste.json")
    }

    static func load() -> JSONValue {
        guard let data = try? Data(contentsOf: fileURL),
              let profile = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [:] }
        return profile
    }

    static func save(_ profile: JSONValue) {
        guard let data = try? JSONEncoder().encode(profile) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}

extension JSONValue {
    var array: [JSONValue] {
        if case .array(let a) = self { return a }
        return []
    }

    var object: [String: JSONValue] {
        if case .object(let o) = self { return o }
        return [:]
    }
}
