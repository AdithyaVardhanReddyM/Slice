import AppKit
import Observation
import SwiftUI

/// The taste lens on screen: a badge over each thing Slice ranked (slice_mac/lens.py), the best
/// three outlined with why. Boxes arrive on a 0-1000 grid over the last screenshot's display
/// (ScreenTool.lastFrame). Click-through, left out of Slice's own screenshots, and gone as soon
/// as the page moves (a scroll, a click, a key), since the boxes no longer line up.
@MainActor
final class LensOverlay {
    static let shared = LensOverlay()

    struct Badge: Identifiable, Equatable {
        let id: Int
        let rect: CGRect
        let label: String
        let detail: String?
        let top: Bool
        let rank: Int
    }

    @Observable
    final class Model {
        var badges: [Badge] = []
        var shown = false
    }

    private let model = Model()
    private var panel: NSPanel?
    private var monitors: [Any] = []
    private var hideTask: Task<Void, Never>?
    private static let lifetime: Duration = .seconds(60)

    func show(_ items: [JSONValue]) -> Result<JSONValue, LocalTools.Failure> {
        let badges = Self.badges(items, frame: ScreenTool.lastFrame, origin: CGDisplayBounds(CGMainDisplayID()).origin)
        guard !badges.isEmpty else { return .failure(.init(message: "No badges to show.")) }
        ensurePanel()
        model.badges = badges
        withAnimation(.easeOut(duration: 0.3)) { model.shown = true }
        panel?.orderFrontRegardless()
        watchForChanges()
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: Self.lifetime)
            guard !Task.isCancelled else { return }
            self.clear()
        }
        return .success(["shown": .number(Double(badges.count))])
    }

    func clear() {
        hideTask?.cancel()
        monitors.forEach(NSEvent.removeMonitor)
        monitors = []
        withAnimation(.easeIn(duration: 0.2)) { model.shown = false }
        Task {
            try? await Task.sleep(for: .milliseconds(250))
            if !model.shown { model.badges = [] }
        }
    }

    /// Boxes ([ymin, xmin, ymax, xmax], 0-1000) to rects in the overlay's top-left coordinates.
    static func badges(_ items: [JSONValue], frame: CGRect, origin: CGPoint) -> [Badge] {
        items.enumerated().compactMap { index, item in
            let box = item["box"]?.array.compactMap { value -> Double? in if case .number(let n) = value { n } else { nil } } ?? []
            guard box.count == 4, let label = item["label"]?.string else { return nil }
            let rect = CGRect(
                x: frame.minX - origin.x + box[1] / 1000 * frame.width,
                y: frame.minY - origin.y + box[0] / 1000 * frame.height,
                width: (box[3] - box[1]) / 1000 * frame.width,
                height: (box[2] - box[0]) / 1000 * frame.height
            )
            return Badge(id: index, rect: rect, label: label, detail: item["detail"]?.string,
                         top: item["top"] == .bool(true), rank: index + 1)
        }
    }

    private func watchForChanges() {
        guard monitors.isEmpty else { return }
        let moved: NSEvent.EventTypeMask = [.scrollWheel, .leftMouseDown, .rightMouseDown, .keyDown]
        if let global = NSEvent.addGlobalMonitorForEvents(matching: moved, handler: { _ in
            MainActor.assumeIsolated { LensOverlay.shared.clear() }
        }) {
            monitors.append(global)
        }
    }

    private func ensurePanel() {
        guard panel == nil, let screen = NSScreen.screens.first else { return }
        let panel = NSPanel(contentRect: screen.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.mainMenuWindow)) + 1)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        panel.contentView = NSHostingView(rootView: LensLayer(model: model))
        panel.setFrame(screen.frame, display: true)
        self.panel = panel
    }
}

struct LensLayer: View {
    let model: LensOverlay.Model

    var body: some View {
        ZStack(alignment: .topLeading) {
            if model.shown {
                ForEach(model.badges) { badge in
                    LensBadge(badge: badge)
                        .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: .topLeading)))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}

private struct LensBadge: View {
    let badge: LensOverlay.Badge

    var body: some View {
        ZStack(alignment: .topLeading) {
            if badge.top {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(IslandStyle.accent, lineWidth: 2.5)
                    .frame(width: badge.rect.width, height: badge.rect.height)
            }
            pill
                .padding(8)
                .frame(maxWidth: max(badge.rect.width, 180), alignment: .topLeading)
        }
        .offset(x: badge.rect.minX, y: badge.rect.minY)
    }

    private var pill: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                if badge.top {
                    Text("\(badge.rank)")
                        .font(.system(size: 10, weight: .heavy))
                        .foregroundStyle(.black)
                        .frame(width: 16, height: 16)
                        .background(Circle().fill(.white))
                }
                Image(systemName: "heart.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(badge.top ? IslandStyle.accent : .white.opacity(0.7))
                Text(badge.label)
                    .font(.system(size: badge.top ? 13 : 11.5, weight: .bold))
                    .foregroundStyle(.white.opacity(badge.top ? 1 : 0.8))
                    .lineLimit(1)
            }
            if let detail = badge.detail {
                Text(detail)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.82))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(.black.opacity(badge.top ? 0.88 : 0.66)))
        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(.white.opacity(0.12), lineWidth: 0.5))
        .fixedSize(horizontal: badge.detail == nil, vertical: true)
        .frame(maxWidth: 230, alignment: .leading)
    }
}

#if DEBUG
extension LensOverlay {
    /// Draws badges over a screenshot to a PNG (`-renderLens <screenshot.jpg> <badges.json> <out.png>`).
    static func render(screenshot: URL, badgesJSON: URL, to out: URL) {
        guard let image = NSImage(contentsOf: screenshot), let data = try? Data(contentsOf: badgesJSON),
              let items = try? JSONDecoder().decode([JSONValue].self, from: data) else { return }
        let size = image.size
        let model = Model()
        model.badges = badges(items, frame: CGRect(origin: .zero, size: size), origin: .zero)
        model.shown = true
        let view = ZStack(alignment: .topLeading) {
            Image(nsImage: image).resizable().frame(width: size.width, height: size.height)
            LensLayer(model: model)
        }
        .frame(width: size.width, height: size.height)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        if let tiff = renderer.nsImage?.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
            try? png.write(to: out)
        }
    }
}
#endif
