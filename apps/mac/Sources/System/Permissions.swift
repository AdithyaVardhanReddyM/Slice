import AppKit
import ApplicationServices
import AVFoundation
import Contacts
import EventKit

/// The macOS permissions the agent needs.
@MainActor
enum Permissions {
    enum Kind: CaseIterable, Identifiable {
        case microphone, accessibility, screenRecording, calendar, contacts

        var id: Self { self }

        var title: String {
            switch self {
            case .microphone: "Microphone"
            case .accessibility: "Accessibility"
            case .screenRecording: "Screen Recording"
            case .calendar: "Calendar"
            case .contacts: "Contacts"
            }
        }

        var reason: String {
            switch self {
            case .microphone: "To hear you while you hold fn and control."
            case .accessibility: "For the fn and control keys, and to read and use other apps."
            case .screenRecording: "To see your screen when you ask about it, and to work on it for you."
            case .calendar: "To plan around what's already on your calendar."
            case .contacts: "To find the people you mention."
            }
        }

        /// The System Settings > Privacy & Security pane for it.
        var settingsAnchor: String {
            switch self {
            case .microphone: "Privacy_Microphone"
            case .accessibility: "Privacy_Accessibility"
            case .screenRecording: "Privacy_ScreenCapture"
            case .calendar: "Privacy_Calendars"
            case .contacts: "Privacy_Contacts"
            }
        }
    }

    static func isGranted(_ kind: Kind) -> Bool {
        switch kind {
        case .microphone: AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        case .accessibility: AXIsProcessTrusted()
        case .screenRecording: CGPreflightScreenCaptureAccess()
        case .calendar: EKEventStore.authorizationStatus(for: .event) == .fullAccess
        case .contacts: CNContactStore.authorizationStatus(for: .contacts) == .authorized
        }
    }

    /// The two Slice can't work without. The rest are asked for in Settings, or when first needed.
    static var allGranted: Bool {
        isGranted(.microphone) && isGranted(.accessibility)
    }

    static func request(_ kind: Kind) {
        switch kind {
        case .microphone:
            if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
                AVCaptureDevice.requestAccess(for: .audio) { _ in }
            } else {
                openSettings(kind)
            }
        case .accessibility:
            let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
            if !AXIsProcessTrustedWithOptions(options) { openSettings(kind) }
        case .screenRecording:
            if !CGRequestScreenCaptureAccess() { openSettings(kind) }
        case .calendar:
            Task { if !(await CalendarTool.access()) { openSettings(kind) } }
        case .contacts:
            Task { if !(await ContactsTool.access()) { openSettings(kind) } }
        }
    }

    static func openSettings(_ kind: Kind) {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(kind.settingsAnchor)") {
            NSWorkspace.shared.open(url)
        }
    }
}
