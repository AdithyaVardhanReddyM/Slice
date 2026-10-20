import AppKit
import ScreenCaptureKit

/// Screenshots for the brain (look_at_screen, the operator), through ScreenCaptureKit.
/// Slice's own windows (the island, the agent cursor) are left out of the picture.
@MainActor
enum ScreenTool {
    /// The display the last screenshot showed, in global points with a top-left origin
    /// (the space CGEvent uses). ComputerTool maps the operator's 0-999 grid onto it.
    private(set) static var lastFrame = CGDisplayBounds(CGMainDisplayID())

    /// Wide enough for the model to read text, small enough to send every step.
    private static let maxWidth: CGFloat = 1440

    static func screenshot() async -> Result<JSONValue, LocalTools.Failure> {
        guard CGPreflightScreenCaptureAccess() else {
            CGRequestScreenCaptureAccess()
            return .failure(.init(message: "Slice needs Screen Recording to see the screen. Allow it in System Settings > Privacy & Security."))
        }
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            let mainID = CGMainDisplayID()
            guard let display = content.displays.first(where: { $0.displayID == mainID }) ?? content.displays.first else {
                return .failure(.init(message: "No display to capture."))
            }
            let me = ProcessInfo.processInfo.processIdentifier
            let filter = SCContentFilter(display: display, excludingApplications: content.applications.filter { $0.processID == me }, exceptingWindows: [])
            let config = SCStreamConfiguration()
            let scale = min(1, maxWidth / CGFloat(display.width))
            config.width = Int(CGFloat(display.width) * scale)
            config.height = Int(CGFloat(display.height) * scale)
            config.showsCursor = true
            let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
            lastFrame = display.frame
            guard let jpeg = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: 0.72]) else {
                return .failure(.init(message: "Couldn't encode the screenshot."))
            }
            var out: [String: JSONValue] = [
                "image": .string(jpeg.base64EncodedString()),
                "mime": "image/jpeg",
                "width": .number(Double(config.width)),
                "height": .number(Double(config.height)),
            ]
            if let id = NSWorkspace.shared.frontmostApplication?.bundleIdentifier, let url = await BrowserTab.currentURL(bundleId: id) {
                out["url"] = .string(url)
            }
            return .success(.object(out))
        } catch {
            return .failure(.init(message: "Screen capture failed: \(error.localizedDescription)"))
        }
    }
}
