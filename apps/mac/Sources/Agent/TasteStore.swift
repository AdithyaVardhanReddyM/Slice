import Foundation

/// Who this Mac's user is to the brain, and their taste profile.
///
/// The profile is local-first: it lives in Application Support/Slice/taste.json,
/// goes to the brain in `hello`, and comes back from the brain (`profile` frames)
/// when the agent learns something. Its shape is documented in slice_mac/taste.py
/// and slice_mac/memory.py (what Slice remembers and learns).
@MainActor
enum TasteStore {
    /// A random id per Mac, also the user's Composio identity (`mac-user:<id>`).
    static var userID: String {
        if let id = UserDefaults.standard.string(forKey: "userID") { return id }
        let id = UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: "userID")
        return id
    }

    private static var dir: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Slice", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static var fileURL: URL { dir.appendingPathComponent("taste.json") }
    private static var graphURL: URL { dir.appendingPathComponent("graph.json") }

    static func load() -> JSONValue {
        guard let data = try? Data(contentsOf: fileURL),
              let profile = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [:] }
        return profile
    }

    static func save(_ profile: JSONValue) {
        guard let data = try? JSONEncoder().encode(profile) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    /// Onboarding is done, or the user already had a taste before it existed.
    static func isOnboarded(_ profile: JSONValue) -> Bool {
        profile["onboarding"]?["done"]?.bool == true || !(profile["seeds"]?.array.isEmpty ?? true)
    }

    // MARK: The taste graph (slice_mac/graph.py), kept so Settings opens on it at once

    /// What the graph depends on: the loves, the people's loves and the dislikes.
    static func graphKey(_ profile: JSONValue) -> String {
        let seeds = (profile["seeds"]?.array ?? []).compactMap { $0["id"]?.string }.sorted()
        let people = (profile["people"]?.object ?? [:]).sorted { $0.key < $1.key }
            .map { "\($0.key):" + $0.value.array.compactMap { $0["id"]?.string }.sorted().joined(separator: ",") }
        let dislikes = (profile["dislikes"]?.array ?? []).compactMap { $0["id"]?.string }.sorted()
        return (seeds + ["|"] + people + ["|"] + dislikes).joined(separator: ";")
    }

    static func loadGraph() -> (key: String, graph: JSONValue)? {
        guard let data = try? Data(contentsOf: graphURL),
              let saved = try? JSONDecoder().decode(JSONValue.self, from: data),
              let key = saved["key"]?.string, let graph = saved["graph"] else { return nil }
        return (key, graph)
    }

    static func saveGraph(_ graph: JSONValue, key: String) {
        guard let data = try? JSONEncoder().encode(JSONValue.object(["key": .string(key), "graph": graph])) else { return }
        try? data.write(to: graphURL, options: .atomic)
    }

    // MARK: Changes from the Settings window (POST /mac/profile/edit)

    /// One change to the profile, done by the brain so it lands in the journal (and the taste is
    /// re-read when the loves changed). Returns the new profile.
    static func edit(_ profile: JSONValue, op: String, _ fields: [String: JSONValue] = [:]) async throws -> JSONValue {
        var body = fields
        body["profile"] = profile
        body["op"] = .string(op)
        let res = try await BrainHTTP.post("profile/edit", body: .object(body))
        guard let updated = res["profile"] else { throw BrainHTTP.Failure(message: "The brain didn't send the profile back.") }
        return updated
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
