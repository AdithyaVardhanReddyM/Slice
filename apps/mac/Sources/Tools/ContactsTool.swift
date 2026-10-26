import Contacts

/// The Mac's Contacts.
@MainActor
enum ContactsTool {
    private static let store = CNContactStore()

    static func search(_ query: String) async -> Result<JSONValue, LocalTools.Failure> {
        guard await access() else {
            return .failure(.init(message: "Slice isn't allowed to read Contacts. Allow it in Slice Settings > Integrations."))
        }
        let keys: [CNKeyDescriptor] = [
            CNContactGivenNameKey, CNContactFamilyNameKey, CNContactOrganizationNameKey,
            CNContactPhoneNumbersKey, CNContactEmailAddressesKey, CNContactPostalAddressesKey, CNContactBirthdayKey,
        ] as [CNKeyDescriptor]
        do {
            let found = try store.unifiedContacts(matching: CNContact.predicateForContacts(matchingName: query), keysToFetch: keys)
            let list: [JSONValue] = found.prefix(8).map { contact in
                var item: [String: JSONValue] = [
                    "name": .string([contact.givenName, contact.familyName].filter { !$0.isEmpty }.joined(separator: " ")),
                    "phones": .array(contact.phoneNumbers.map { .string($0.value.stringValue) }),
                    "emails": .array(contact.emailAddresses.map { .string(String($0.value)) }),
                ]
                if !contact.organizationName.isEmpty { item["company"] = .string(contact.organizationName) }
                if let birthday = contact.birthday, let month = birthday.month, let day = birthday.day {
                    item["birthday"] = .string(String(format: "%02d-%02d", month, day))
                }
                if let address = contact.postalAddresses.first?.value {
                    item["address"] = .string(CNPostalAddressFormatter.string(from: address, style: .mailingAddress)
                        .replacingOccurrences(of: "\n", with: ", "))
                }
                return .object(item)
            }
            return .success(["contacts": .array(list)])
        } catch {
            return .failure(.init(message: "Contacts search failed: \(error.localizedDescription)"))
        }
    }

    /// A saved person's birthday from their contact card, when there's exactly one card by that name.
    /// Never asks for access (the watchers run in the background).
    static func birthday(of name: String) async -> (Int, Int)? {
        guard CNContactStore.authorizationStatus(for: .contacts) == .authorized else { return nil }
        let keys = [CNContactBirthdayKey, CNContactGivenNameKey] as [CNKeyDescriptor]
        guard let found = try? store.unifiedContacts(matching: CNContact.predicateForContacts(matchingName: name), keysToFetch: keys),
              found.count == 1, let birthday = found[0].birthday, let month = birthday.month, let day = birthday.day else { return nil }
        return (month, day)
    }

    static func access() async -> Bool {
        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .authorized: return true
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                store.requestAccess(for: .contacts) { granted, _ in continuation.resume(returning: granted) }
            }
        default: return false
        }
    }
}
