import Foundation
import Security

/// Where the brain is. The address lives in UserDefaults; the token (only a hosted brain
/// asks for one, MAC_CLIENT_TOKEN) lives in the Keychain.
enum BrainSettings {
    static let defaultURL = "ws://127.0.0.1:8000/mac/live"
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

    static var token: String? {
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
