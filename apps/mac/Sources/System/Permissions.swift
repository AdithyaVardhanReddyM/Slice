import AppKit
import ApplicationServices
import AVFoundation
import Contacts
import CoreLocation
import CoreServices
import EventKit

/// The macOS permissions the agent uses: two it can't work without, the rest for what they unlock.
@MainActor
enum Permissions {
    enum Kind: CaseIterable, Identifiable {
        case microphone, accessibility, screenRecording, location, calendar, contacts, automation, fullDiskAccess

        var id: Self { self }

        var title: String {
            switch self {
            case .microphone: "Microphone"
            case .accessibility: "Accessibility"
            case .screenRecording: "Screen Recording"
            case .location: "Location"
            case .calendar: "Calendar"
            case .contacts: "Contacts"
            case .automation: "Your apps"
            case .fullDiskAccess: "Full Disk Access"
            }
        }

        var reason: String {
            switch self {
            case .microphone: "To hear you while you hold fn and control."
            case .accessibility: "For the talk keys, and to click and type in other apps for you."
            case .screenRecording: "To see what's on screen when you ask about it, and to work on it."
            case .location: "So places and plans start from where you are."
            case .calendar: "To plan around what's already on your calendar."
            case .contacts: "To find the people you mention, and their birthdays."
            case .automation: "To play music, send the messages you approve and read the page you're on."
            case .fullDiskAccess: "To read your Podcasts library, so the shows you follow count."
            }
        }

        /// Its glossy icon (Assets > Glossy).
        var icon: String {
            switch self {
            case .microphone: "mic"
            case .accessibility: "cursor"
            case .screenRecording: "screen"
            case .location: "pin"
            case .calendar: "calendar"
            case .contacts: "contacts"
            case .automation: "apps"
            case .fullDiskAccess: "folder"
            }
        }

        enum Need { case needed, recommended, optional }

        var need: Need {
            switch self {
            case .microphone, .accessibility: .needed
            case .fullDiskAccess: .optional
            default: .recommended
            }
        }

        /// The System Settings > Privacy & Security pane for it.
        var settingsAnchor: String {
            switch self {
            case .microphone: "Privacy_Microphone"
            case .accessibility: "Privacy_Accessibility"
            case .screenRecording: "Privacy_ScreenCapture"
            case .location: "Privacy_LocationServices"
            case .calendar: "Privacy_Calendars"
            case .contacts: "Privacy_Contacts"
            case .automation: "Privacy_Automation"
            case .fullDiskAccess: "Privacy_AllFiles"
            }
        }

        /// Turned on in System Settings by hand, not with a prompt.
        var isSwitchInSettings: Bool { self == .fullDiskAccess }
    }

    enum Status: Equatable {
        case granted, notYet, denied
        /// macOS asks the first time it's needed (the apps Slice controls).
        case onFirstUse
    }

    static func status(_ kind: Kind) -> Status {
        switch kind {
        case .microphone:
            switch AVCaptureDevice.authorizationStatus(for: .audio) {
            case .authorized: return .granted
            case .notDetermined: return .notYet
            default: return .denied
            }
        case .accessibility:
            return AXIsProcessTrusted() ? .granted : .notYet
        case .screenRecording:
            return CGPreflightScreenCaptureAccess() ? .granted : .notYet
        case .location:
            switch locationManager.authorizationStatus {
            case .notDetermined: return .notYet
            case .denied, .restricted: return .denied
            default: return .granted
            }
        case .calendar:
            switch EKEventStore.authorizationStatus(for: .event) {
            case .fullAccess: return .granted
            case .notDetermined: return .notYet
            default: return .denied
            }
        case .contacts:
            switch CNContactStore.authorizationStatus(for: .contacts) {
            case .authorized: return .granted
            case .notDetermined: return .notYet
            default: return .denied
            }
        case .automation:
            return automationStatus
        case .fullDiskAccess:
            return hasFullDiskAccess ? .granted : .notYet
        }
    }

    static func isGranted(_ kind: Kind) -> Bool { status(kind) == .granted }

    /// The two Slice can't work without. The rest are asked for in onboarding, Settings, or when first needed.
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
        case .location:
            if locationManager.authorizationStatus == .notDetermined {
                locationManager.requestWhenInUseAuthorization()
            } else {
                openSettings(kind)
            }
        case .calendar:
            Task { if !(await CalendarTool.access()) { openSettings(kind) } }
        case .contacts:
            Task { if !(await ContactsTool.access()) { openSettings(kind) } }
        case .automation:
            askToAutomate()
        case .fullDiskAccess:
            openSettings(kind)
        }
    }

    static func openSettings(_ kind: Kind) {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(kind.settingsAnchor)") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: Location

    /// Kept alive so the prompt (and the status) belong to this app.
    static let locationManager = CLLocationManager()

    // MARK: Your apps (Apple Events)

    /// The apps Slice drives with AppleScript (AppTools, BrowserTab, NotesTool).
    nonisolated static let automatedApps = ["com.apple.Music", "com.apple.MobileSMS", "com.apple.mail", "com.apple.Notes", "com.apple.Safari",
                                "com.google.Chrome", "com.brave.Browser", "com.microsoft.edgemac", "company.thebrowser.Browser"]

    /// Answered from the last check (checking means asking each running app, which can block).
    private static var automationCache: Status = .onFirstUse
    private static var automationChecked = Date.distantPast

    private static var automationStatus: Status {
        if Date().timeIntervalSince(automationChecked) > 4 {
            automationChecked = Date()
            Task.detached(priority: .utility) {
                let answers = automatedRunning().map { automationPermission($0, ask: false) }
                let status: Status = answers.contains(-1743) ? .denied
                    : (!answers.isEmpty && answers.allSatisfy { $0 == noErr } ? .granted : .onFirstUse)
                await MainActor.run { automationCache = status }
            }
        }
        return automationCache
    }

    /// Ask every running app Slice drives now, instead of the first time it's used. Apps that
    /// aren't open ask when Slice first needs them.
    private static func askToAutomate() {
        if automationCache == .denied {
            openSettings(.automation)
            return
        }
        Task.detached(priority: .userInitiated) {
            for id in automatedRunning() { _ = automationPermission(id, ask: true) }
            await MainActor.run { automationChecked = .distantPast }
        }
    }

    nonisolated private static func automatedRunning() -> [String] {
        let running = Set(NSWorkspace.shared.runningApplications.compactMap(\.bundleIdentifier))
        return automatedApps.filter(running.contains)
    }

    /// noErr when allowed, -1743 when the user said no, -1744 when it would ask, -600 when the app isn't running.
    nonisolated private static func automationPermission(_ bundleID: String, ask: Bool) -> OSStatus {
        var target = AEAddressDesc()
        let made = bundleID.withCString { AECreateDesc(DescType(typeApplicationBundleID), $0, strlen($0), &target) }
        guard made == noErr else { return OSStatus(made) }
        defer { AEDisposeDesc(&target) }
        return AEDeterminePermissionToAutomateTarget(&target, AEEventClass(typeWildCard), AEEventID(typeWildCard), ask)
    }

    // MARK: Full Disk Access

    /// There's no API for it: try to open a file only Full Disk Access can read.
    private static var hasFullDiskAccess: Bool {
        let path = NSHomeDirectory() + "/Library/Application Support/com.apple.TCC/TCC.db"
        let fd = open(path, O_RDONLY)
        guard fd >= 0 else { return false }
        close(fd)
        return true
    }
}
