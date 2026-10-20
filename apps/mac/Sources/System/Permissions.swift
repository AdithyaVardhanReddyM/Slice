import AppKit
import ApplicationServices
import AVFoundation

/// The three macOS permissions the agent needs.
@MainActor
enum Permissions {
    enum Kind: CaseIterable, Identifiable {
        case microphone, accessibility, screenRecording

        var id: Self { self }

        var title: String {
            switch self {
            case .microphone: "Microphone"
            case .accessibility: "Accessibility"
            case .screenRecording: "Screen Recording"
            }
        }

        var reason: String {
            switch self {
            case .microphone: "To hear you while you hold fn and control."
            case .accessibility: "For the fn and control keys, and to read and use other apps."
            case .screenRecording: "To see what's on your screen when you ask about it."
            }
        }

        /// The System Settings > Privacy & Security pane for it.
        var settingsAnchor: String {
            switch self {
            case .microphone: "Privacy_Microphone"
            case .accessibility: "Privacy_Accessibility"
            case .screenRecording: "Privacy_ScreenCapture"
            }
        }
    }

    static func isGranted(_ kind: Kind) -> Bool {
        switch kind {
        case .microphone: AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        case .accessibility: AXIsProcessTrusted()
        case .screenRecording: CGPreflightScreenCaptureAccess()
        }
    }

    /// Screen Recording isn't used yet, so it doesn't count here.
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
        }
    }

    static func openSettings(_ kind: Kind) {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(kind.settingsAnchor)") {
            NSWorkspace.shared.open(url)
        }
    }
}
