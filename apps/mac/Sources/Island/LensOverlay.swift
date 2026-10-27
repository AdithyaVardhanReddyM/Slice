import AppKit
import Observation
import SwiftUI

/// The taste lens on screen (slice_mac/lens.py). While the brain reads the screen a light sweeps
/// down it (`lens_scan`); then (`lens_show`) everything dims a little except the best three, which
/// stay lit with a footer that says the rank, the match, why, and two words Qloo uses for them.
/// Everything else gets a small ring chip with its match at the tile's top right, the user's own
/// loves a heart, and a bar at the foot of the screen says what was ranked and what to say next.
/// Boxes arrive on a 0-1000 grid over the last screenshot's display (ScreenTool.lastFrame).
/// Click-through, left out of Slice's own screenshots, and gone as soon as the page moves (a
/// scroll, a click, a key), since the boxes no longer line up.
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
        let match: Int?
        let tags: [String]
        let own: Bool
        let disliked: Bool
    }

    struct Summary: Equatable {
        let count: Int
        let what: String       // "titles", "listings", "favourites"
        let whose: String      // "your", "Maya's"
        let top: Int
        let hint: String?      // "Say “play the first one”"
        let line: String?      // a whole line instead, e.g. "12 of Maya's favourites read off this page and saved."
    }

    @Observable
    final class Model {
        var badges: [Badge] = []
        var summary: Summary?
        var shown = false
        var scanning = false
        var menuBar: CGFloat = 0
        var screen = CGSize.zero
    }

    private let model = Model()
    private var panel: NSPanel?
    private var monitors: [Any] = []
    private var hideTask: Task<Void, Never>?
    private static let lifetime: Duration = .seconds(60)
    private static let scanLifetime: Duration = .seconds(20)

    /// The brain is reading the screen: sweep a light down it until the badges come (or 20 s).
    func scan() -> Result<JSONValue, LocalTools.Failure> {
        ensurePanel()
        model.badges = []
        model.summary = nil
        model.shown = false
        withAnimation(.easeOut(duration: 0.25)) { model.scanning = true }
        panel?.orderFrontRegardless()
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: Self.scanLifetime)
            guard !Task.isCancelled else { return }
            self.clear()
        }
        return .success(["ok": true])
    }

    func show(_ items: [JSONValue], summary: JSONValue?) -> Result<JSONValue, LocalTools.Failure> {
        let badges = Self.badges(items, frame: ScreenTool.lastFrame, origin: CGDisplayBounds(CGMainDisplayID()).origin)
        guard !badges.isEmpty else {
            clear()
            return .failure(.init(message: "No badges to show."))
        }
        ensurePanel()
        model.badges = badges
        model.summary = Self.summary(summary, badges: badges)
        withAnimation(.easeOut(duration: 0.25)) { model.scanning = false }
        withAnimation(.easeOut(duration: 0.35)) { model.shown = true }
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
        withAnimation(.easeIn(duration: 0.2)) {
            model.shown = false
            model.scanning = false
        }
        Task {
            try? await Task.sleep(for: .milliseconds(250))
            if !model.shown, !model.scanning {
                model.badges = []
                model.summary = nil
            }
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
            var match: Int?
            if case .number(let n) = item["match"] ?? .null { match = Int(n) }
            let tags = item["tags"]?.array.compactMap(\.string) ?? []
            return Badge(id: index, rect: rect, label: label, detail: item["detail"]?.string,
                         top: item["top"] == .bool(true), rank: index + 1, match: match, tags: Array(tags.prefix(2)),
                         own: item["own"] == .bool(true), disliked: item["disliked"] == .bool(true))
        }
    }

    static func summary(_ value: JSONValue?, badges: [Badge]) -> Summary? {
        guard let value else { return nil }
        var count = badges.count
        if case .number(let n) = value["count"] ?? .null { count = Int(n) }
        return Summary(count: count, what: value["what"]?.string ?? "things", whose: value["whose"]?.string ?? "your",
                       top: badges.filter(\.top).count, hint: value["hint"]?.string, line: value["line"]?.string)
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
        model.menuBar = screen.frame.maxY - screen.visibleFrame.maxY
        model.screen = screen.frame.size
        panel.contentView = NSHostingView(rootView: LensLayer(model: model))
        panel.setFrame(screen.frame, display: true)
        self.panel = panel
    }
}

struct LensLayer: View {
    let model: LensOverlay.Model
    var animateScan = true

    var body: some View {
        ZStack(alignment: .topLeading) {
            if model.scanning {
                LensSweep(height: model.screen.height, animate: animateScan)
                    .transition(.opacity)
            }
            LensVeil(cutouts: model.badges.filter(\.top).map(\.rect), menuBar: model.menuBar)
                .opacity(model.shown ? 1 : 0)
                .animation(.easeOut(duration: 0.35), value: model.shown)
            ForEach(model.badges) { badge in
                LensBadge(badge: badge)
                    .opacity(model.shown ? 1 : 0)
                    .scaleEffect(model.shown ? 1 : 0.94, anchor: .top)
                    .animation(.spring(duration: 0.4, bounce: 0.15).delay(model.shown ? Self.delay(for: badge) : 0), value: model.shown)
            }
            if let summary = model.summary {
                LensBar(summary: summary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .padding(.bottom, 44)
                    .opacity(model.shown ? 1 : 0)
                    .offset(y: model.shown ? 0 : 10)
                    .animation(.easeOut(duration: 0.4).delay(model.shown ? 0.25 : 0), value: model.shown)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .allowsHitTesting(false)
    }

    /// The best come first, the rest ripple in after them.
    private static func delay(for badge: LensOverlay.Badge) -> Double {
        badge.top ? Double(badge.rank - 1) * 0.08 : 0.2 + Double(badge.rank) * 0.025
    }
}

/// A soft band of light passing down the screen while the brain reads it.
private struct LensSweep: View {
    let height: CGFloat
    let animate: Bool
    @State private var phase: CGFloat = 0
    private let band: CGFloat = 220

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.opacity(0.12)
            VStack(spacing: 0) {
                LinearGradient(colors: [.white.opacity(0), .white.opacity(0.16)], startPoint: .top, endPoint: .bottom)
                    .frame(height: band)
                Rectangle().fill(IslandStyle.accent.opacity(0.75)).frame(height: 1.5)
            }
            .offset(y: -band + (animate ? phase : 0.42) * (height + band))
        }
        .onAppear {
            guard animate else { return }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: false)) { phase = 1 }
        }
    }
}

/// Dims the screen below the menu bar, except the tiles cut out of it.
private struct LensVeil: View {
    let cutouts: [CGRect]
    let menuBar: CGFloat

    var body: some View {
        Color.black.opacity(0.38)
            .padding(.top, menuBar)
            .mask {
                ZStack(alignment: .topLeading) {
                    Rectangle().fill(.white)
                    ForEach(Array(cutouts.enumerated()), id: \.offset) { _, rect in
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(.black)
                            .frame(width: rect.width, height: rect.height)
                            .offset(x: rect.minX, y: rect.minY)
                            .blendMode(.destinationOut)
                    }
                }
                .compositingGroup()
            }
    }
}

private struct LensBadge: View {
    let badge: LensOverlay.Badge

    var body: some View {
        Group {
            if badge.top {
                topTile
            } else {
                chip
                    .padding(7)
                    .frame(width: badge.rect.width, height: badge.rect.height, alignment: .topTrailing)
            }
        }
        .offset(x: badge.rect.minX, y: badge.rect.minY)
    }

    // The best three: lit, outlined, and a footer with the rank, the match, why and two taste words.
    private var topTile: some View {
        let compact = badge.rect.height < 110
        return ZStack(alignment: .bottomLeading) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 7) {
                    Text("\(badge.rank)")
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(width: 19, height: 19)
                        .background(Circle().fill(IslandStyle.accent))
                    Text(badge.label)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                    if badge.rect.width >= 210, !badge.tags.isEmpty {
                        Spacer(minLength: 4)
                        HStack(spacing: 4) {
                            ForEach(badge.tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.9))
                                    .lineLimit(1)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2.5)
                                    .background(Capsule().fill(.white.opacity(0.16)))
                            }
                        }
                        .layoutPriority(-1)
                    }
                }
                if let detail = badge.detail, !compact {
                    Text(detail)
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(.white.opacity(0.86))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 8)
            .padding(.bottom, 9)
            .frame(width: badge.rect.width, alignment: .leading)
            .background(
                LinearGradient(stops: [.init(color: .black.opacity(0), location: 0),
                                       .init(color: .black.opacity(0.82), location: 0.45),
                                       .init(color: .black.opacity(0.9), location: 1)],
                               startPoint: .top, endPoint: .bottom)
                    .padding(.top, -34)
            )
        }
        .frame(width: badge.rect.width, height: badge.rect.height, alignment: .bottomLeading)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(IslandStyle.accent, lineWidth: 2.5))
    }

    // Everyone else: a ring with the match, a heart for a love, a muted mark for "not for you".
    private var chip: some View {
        HStack(spacing: 5) {
            if badge.own {
                Image(systemName: "heart.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(IslandStyle.accent)
            } else if badge.disliked {
                Image(systemName: "minus.circle")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
            } else if let match = badge.match {
                LensRing(match: match)
            }
            Text(badge.label)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(tier >= 2 ? 1 : 0.85))
                .lineLimit(1)
        }
        .padding(.leading, badge.match != nil && !badge.own && !badge.disliked ? 5 : 7)
        .padding(.trailing, 8)
        .padding(.vertical, 4.5)
        .background(Capsule().fill(.black.opacity(0.66)))
        .overlay(Capsule().strokeBorder(.white.opacity(0.14), lineWidth: 0.5))
        .opacity(tier == 0 ? 0.62 : 1)
    }

    /// 2: a strong fit, 1: a fair one, 0: a weak one (drawn quieter).
    private var tier: Int {
        guard let match = badge.match else { return 1 }
        return match >= 85 ? 2 : match >= 70 ? 1 : 0
    }
}

private struct LensRing: View {
    let match: Int

    var body: some View {
        ZStack {
            Circle().stroke(.white.opacity(0.22), lineWidth: 2)
            Circle()
                .trim(from: 0, to: CGFloat(max(0, min(100, match))) / 100)
                .stroke(match >= 85 ? IslandStyle.accent : .white.opacity(0.85), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 13, height: 13)
    }
}

/// The bar at the foot of the screen: what was ranked, and what to say next.
private struct LensBar: View {
    let summary: LensOverlay.Summary

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "viewfinder")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(IslandStyle.accent)
            Text("Taste lens")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
            Text(line)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.78))
            if let hint = summary.hint {
                Rectangle().fill(.white.opacity(0.16)).frame(width: 1, height: 14)
                Text(hint)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.78))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(Capsule().fill(.black.opacity(0.8)))
        .overlay(Capsule().strokeBorder(.white.opacity(0.12), lineWidth: 0.5))
    }

    private var line: String {
        if let line = summary.line { return line }
        let ranked = "\(summary.count) \(summary.what) ranked for \(summary.whose) taste."
        switch summary.top {
        case 0: return ranked
        case 1: return ranked + " The best one is lit."
        default: return ranked + " The best \(Self.words[summary.top] ?? "\(summary.top)") are lit."
        }
    }

    private static let words = [2: "two", 3: "three", 4: "four", 5: "five"]
}

#if DEBUG
extension LensOverlay {
    /// Draws the lens over a screenshot to a PNG (`-renderLens <screenshot.png> <badges.json> <out.png>`).
    /// The JSON is `{"badges": [...], "summary": {...}}` as the brain sends it, or a bare list; with
    /// `"scanning": true` it draws the sweep instead.
    static func render(screenshot: URL, badgesJSON: URL, to out: URL) {
        guard let image = NSImage(contentsOf: screenshot), let data = try? Data(contentsOf: badgesJSON),
              let value = try? JSONDecoder().decode(JSONValue.self, from: data) else { return }
        let size = image.size
        let model = Model()
        model.screen = size
        model.menuBar = 0
        if case .number(let n) = value["menuBar"] ?? .null { model.menuBar = n }
        var items: [JSONValue] = []
        if case .array(let list) = value { items = list } else { items = value["badges"]?.array ?? [] }
        model.badges = badges(items, frame: CGRect(origin: .zero, size: size), origin: .zero)
        model.summary = summary(value["summary"], badges: model.badges)
        if value["scanning"] == .bool(true) {
            model.scanning = true
        } else {
            model.shown = true
        }
        let view = ZStack(alignment: .topLeading) {
            Image(nsImage: image).resizable().frame(width: size.width, height: size.height)
            LensLayer(model: model, animateScan: false)
        }
        .frame(width: size.width, height: size.height)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        if let tiff = renderer.nsImage?.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
            try? png.write(to: out)
        }
    }
}
#endif
