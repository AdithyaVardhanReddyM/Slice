import Foundation
import Security

/// Where the brain is. The address lives in UserDefaults; the token (only a hosted brain
/// asks for one, MAC_CLIENT_TOKEN) lives in the Keychain.
///
/// A release build (apps/mac/scripts/release.sh) can carry the hosted brain's address and
/// token in its Info.plist (SliceBrainURL, SliceBrainToken), so a fresh install connects
/// without any setup. Debug builds leave both empty and use the dev server on this Mac.
enum BrainSettings {
    /// The dev server on this Mac (pnpm --filter @slice/agent dev).
    static let localURL = "ws://127.0.0.1:8000/mac/live"
    /// What a fresh install connects to: the address baked into the build, else the dev server.
    static let defaultURL = bundled("SliceBrainURL") ?? localURL
    private static let urlKey = "brainURL"
    private static let service = "ai.slice.mac"
    private static let account = "brainToken"

    static var urlString: String {
        get { UserDefaults.standard.string(forKey: urlKey) ?? defaultURL }
        set { UserDefaults.standard.set(newValue, forKey: urlKey) }
    }

    static var url: URL {
        URL(string: urlString) ?? URL(string: defaultURL)!
    }

    /// The token from Settings, else the one baked into the build. The baked-in token is only
    /// offered to the address that came with it, never to an address someone typed in.
    static var token: String? {
        get {
            if let saved = keychainToken, !saved.isEmpty { return saved }
            guard urlString == defaultURL else { return nil }
            return bundled("SliceBrainToken")
        }
        set { keychainToken = newValue }
    }

    private static func bundled(_ key: String) -> String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // An unset build setting is "" (or the literal "$(...)" if the plist was never processed).
        return value.isEmpty || value.hasPrefix("$(") ? nil : value
    }

    private static var keychainToken: String? {
        get {
            var item: CFTypeRef?
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecReturnData as String: true,
            ]
            guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            SecItemDelete(query as CFDictionary)
            guard let newValue, !newValue.isEmpty else { return }
            var add = query
            add[kSecValueData as String] = Data(newValue.utf8)
            SecItemAdd(add as CFDictionary, nil)
        }
    }
}
