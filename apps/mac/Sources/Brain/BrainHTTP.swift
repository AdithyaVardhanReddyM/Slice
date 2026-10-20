import Foundation

/// The brain's HTTP routes beside the WebSocket (Taste and Accounts settings).
/// The base comes from the WebSocket address: ws://host:8000/mac/live → http://host:8000/mac.
enum BrainHTTP {
    struct Failure: Error, LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private static var base: URL {
        var parts = URLComponents(url: BrainSettings.url, resolvingAgainstBaseURL: false) ?? URLComponents()
        parts.scheme = parts.scheme == "wss" ? "https" : "http"
        parts.path = "/mac"
        return parts.url ?? URL(string: "http://127.0.0.1:8000/mac")!
    }

    static func get(_ path: String, query: [String: String] = [:]) async throws -> JSONValue {
        var parts = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        parts.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        return try await send(URLRequest(url: parts.url!))
    }

    static func post(_ path: String, body: JSONValue) async throws -> JSONValue {
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = 120
        return try await send(request)
    }

    private static func send(_ request: URLRequest) async throws -> JSONValue {
        var request = request
        if let token = BrainSettings.token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let json = (try? JSONDecoder().decode(JSONValue.self, from: data)) ?? .null
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw Failure(message: json["detail"]?.string ?? "The brain answered \(http.statusCode).")
        }
        return json
    }
}
