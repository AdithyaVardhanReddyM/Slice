import AppKit
import Observation
import SwiftUI

/// What the user sees while Slice works on their Mac, built on Cortana's actor layer
/// (~/Desktop/cortana, app/src/renderer/overlay.js): light flowing round the edge of the screen,
/// Slice's own cursor gliding to each target before the real click lands (so every action is
/// telegraphed, never sprung), a ripple where it lands, and a pill saying what it's doing and how
/// to stop it (esc). Click-through, and left out of the operator's screenshots (ScreenTool
/// excludes Slice's windows).
@MainActor
final class AgentCursor {
    static let shared = AgentCursor()

    struct Ripple: Identifiable, Equatable {
        let id = UUID()
        let point: CGPoint
        let right: Bool
    }

    @Observable
    final class Model {
        var operating = false
        /// Where Slice's cursor is, in the overlay's own top-left coordinates.
        var cursor: CGPoint?
        var label = ""
        var pressed = false
        var ripples: [Ripple] = []
        var stopping = false
        /// How far the bottom pill sits above the screen's bottom edge (clear of the Dock).
        var bottomInset: CGFloat = 24
    }

    /// The glide before each real input: long enough to follow, short enough not to drag.
    static let glide: Duration = .milliseconds(300)
    /// Marks Slice's own synthetic events, so esc pressed by the operator doesn't stop it.
    static let eventMark: Int64 = 0x5_11CE

    private let model = Model()
    private var panel: NSPanel?
    private var glow: EdgeGlowView?
    private var hideTask: Task<Void, Never>?
    private var stop: (() -> Void)?
    private var monitors: [Any] = []

    /// The operator started or stopped (`operator` frames). `stop` cancels its task (esc).
    func setOperating(_ on: Bool, stop: (() -> Void)? = nil) {
        guard on != model.operating else { return }
        if on { ensurePanel() }
        model.operating = on
        model.stopping = false
        glow?.set(on: on)
        if on {
            self.stop = stop
            watchEsc()
            hideTask?.cancel()
            panel?.orderFrontRegardless()
        } else {
            self.stop = nil
            unwatchEsc()
            model.label = ""
            hideSoon(after: .milliseconds(500))
        }
    }

    /// Bring Slice's cursor to `point` (global CGEvent coordinates, top-left origin) and wait
    /// until it's there, so the real input follows it.
    func glide(to point: CGPoint, label: String) async {
        ensurePanel()
        panel?.orderFrontRegardless()
        let local = Self.local(point)
        if !label.isEmpty { model.label = label }
        hideTask?.cancel()
        if model.cursor == nil {
            // It arrives from just up and to the left, the way a hand brings a pointer in.
            model.cursor = CGPoint(x: local.x - 44, y: local.y - 34)
        }
        withAnimation(.timingCurve(0.22, 0.9, 0.3, 1, duration: 0.3)) { model.cursor = local }
        try? await Task.sleep(for: Self.glide)
        if !model.operating { hideSoon(after: .seconds(2.5)) }
    }

    /// Put the cursor somewhere at once (a drag in progress).
    func move(to point: CGPoint) {
        model.cursor = Self.local(point)
    }

    /// The moment of contact: the cursor squeezes and a ring spreads from the spot.
    func press(at point: CGPoint, right: Bool = false) {
        let ripple = Ripple(point: Self.local(point), right: right)
        model.ripples.append(ripple)
        withAnimation(.easeOut(duration: 0.1)) { model.pressed = true }
        Task {
            try? await Task.sleep(for: .milliseconds(200))
            withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) { model.pressed = false }
            try? await Task.sleep(for: .milliseconds(600))
            model.ripples.removeAll { $0.id == ripple.id }
        }
    }

    /// What the pill says while there's nothing to point at (typing, a shortcut).
    func say(_ label: String) {
        guard !label.isEmpty else { return }
        model.label = label
    }

    private func hideSoon(after delay: Duration) {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, !model.operating else { return }
            withAnimation(.easeOut(duration: 0.3)) { model.cursor = nil }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled, !model.operating else { return }
            panel?.orderOut(nil)
        }
    }

    // MARK: esc to stop

    private func watchEsc() {
        guard monitors.isEmpty else { return }
        let handle: (NSEvent) -> Bool = { [weak self] event in
            guard event.keyCode == 53, event.cgEvent?.getIntegerValueField(.eventSourceUserData) != Self.eventMark else { return false }
            Task { @MainActor in self?.stopNow() }
            return true
        }
        if let global = NSEvent.addGlobalMonitorForEvents(matching: .keyDown, handler: { _ = handle($0) }) { monitors.append(global) }
        if let local = NSEvent.addLocalMonitorForEvents(matching: .keyDown, handler: { handle($0) ? nil : $0 }) { monitors.append(local) }
    }

    private func unwatchEsc() {
        monitors.forEach(NSEvent.removeMonitor)
        monitors = []
    }

    private func stopNow() {
        guard model.operating, !model.stopping else { return }
        model.stopping = true
        model.label = "Stopping"
        stop?()
    }

    // MARK: The panel

    /// Global CGEvent coordinates to the overlay's top-left coordinates on the main display.
    private static func local(_ point: CGPoint) -> CGPoint {
        let frame = CGDisplayBounds(CGMainDisplayID())
        return CGPoint(x: point.x - frame.minX, y: point.y - frame.minY)
    }

    private func ensurePanel() {
        guard panel == nil, let screen = NSScreen.screens.first else { return }
        let panel = NSPanel(contentRect: screen.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.mainMenuWindow)) + 2)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        let root = NSView(frame: CGRect(origin: .zero, size: screen.frame.size))
        let glow = EdgeGlowView(frame: root.bounds)
        glow.autoresizingMask = [.width, .height]
        let marks = NSHostingView(rootView: OperatorOverlay(model: model))
        marks.frame = root.bounds
        marks.autoresizingMask = [.width, .height]
        root.addSubview(glow)
        root.addSubview(marks)
        panel.contentView = root
        panel.setFrame(screen.frame, display: true)
        model.bottomInset = max(screen.visibleFrame.minY - screen.frame.minY, 0) + 22
        self.panel = panel
        self.glow = glow
    }

    #if DEBUG
    /// -previewOperator <dir>: the overlay mid-task (glow, cursor, a ripple, the pill), captured
    /// from Slice's own windows over a plain light and a plain dark backdrop, then quit.
    func preview(to dir: URL) async {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let frame = CGDisplayBounds(CGMainDisplayID())
        setOperating(true)
        await glide(to: CGPoint(x: frame.midX - 180, y: frame.midY - 60), label: "Opening the date picker")
        try? await Task.sleep(for: .milliseconds(500))
        await glide(to: CGPoint(x: frame.midX + 140, y: frame.midY + 40), label: "Choosing Friday at 8 PM")
        press(at: CGPoint(x: frame.midX + 140, y: frame.midY + 40))
        try? await Task.sleep(for: .milliseconds(260))
        for (name, backdrop) in [("light", CGColor(gray: 0.96, alpha: 1)), ("dark", CGColor(gray: 0.09, alpha: 1))] {
            if let png = await ScreenTool.ownWindows(backdrop: backdrop) {
                try? png.write(to: dir.appendingPathComponent("operator-\(name).png"))
            }
        }
        setOperating(false)
    }
    #endif
}

// MARK: The glow

/// Light flowing round the edge of the screen: a conic gradient (blue, lilac, orchid, sky) that
/// turns slowly, seen through a mask that is brightest at the very edge and falls off the way
/// light does, (1 - t)^2.4, so no seam shows where it ends (Cortana's curve). A crisp rim sits
/// flush to the edge and the corners get a little extra, so they read as anchored rather than as
/// the dim seam between two edges. All Core Animation: nothing runs on the main thread while it
/// glows, however long the task.
final class EdgeGlowView: NSView {
    private static let palette: [NSColor] = [0x4C8DFF, 0x8A7BFF, 0xD07BFF, 0x5CC8FF, 0x4C8DFF].map { NSColor(hex: $0) }
    /// Seconds for the colours to go once round the screen.
    private static let turn: CFTimeInterval = 9

    private let root = CALayer()
    private let colors = CAGradientLayer()
    private let edges = CALayer()
    private var maskSize: CGSize = .zero

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        colors.type = .conic
        colors.colors = Self.palette.map(\.cgColor)
        colors.startPoint = CGPoint(x: 0.5, y: 0.5)
        colors.endPoint = CGPoint(x: 0.5, y: 0)
        root.addSublayer(colors)
        root.mask = edges
        root.opacity = 0
        layer?.addSublayer(root)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        root.frame = bounds
        edges.frame = bounds
        // Big enough to cover the screen at every angle as it turns round the middle.
        let side = hypot(bounds.width, bounds.height)
        colors.bounds = CGRect(x: 0, y: 0, width: side, height: side)
        colors.position = CGPoint(x: bounds.midX, y: bounds.midY)
        if maskSize != bounds.size, bounds.width > 0 {
            maskSize = bounds.size
            edges.contents = Self.edgeMask(bounds.size, scale: min(window?.backingScaleFactor ?? 2, 2))
        }
        CATransaction.commit()
    }

    func set(on: Bool) {
        let from = root.presentation()?.opacity ?? root.opacity
        root.opacity = on ? 1 : 0
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = from
        fade.toValue = root.opacity
        fade.duration = on ? 0.45 : 0.5
        fade.timingFunction = CAMediaTimingFunction(name: .easeOut)
        root.add(fade, forKey: "fade")
        if on {
            let spin = CABasicAnimation(keyPath: "transform.rotation.z")
            spin.fromValue = 0
            spin.toValue = -2 * Double.pi
            spin.duration = Self.turn
            spin.repeatCount = .infinity
            colors.add(spin, forKey: "spin")
            let breathe = CABasicAnimation(keyPath: "opacity")
            breathe.fromValue = 0.7
            breathe.toValue = 1
            breathe.duration = 1.6
            breathe.autoreverses = true
            breathe.repeatCount = .infinity
            breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            colors.add(breathe, forKey: "breathe")
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) { [weak self] in
                guard let self, self.root.opacity == 0 else { return }
                self.colors.removeAllAnimations()
            }
        }
    }

    /// The mask, drawn once per screen size: a bright band at each edge falling off like light, a
    /// wider faint halo behind it, extra light from each corner, and the rim.
    private static func edgeMask(_ size: CGSize, scale: CGFloat) -> CGImage? {
        let w = Int(size.width * scale), h = Int(size.height * scale)
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 2,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        ctx.scaleBy(x: scale, y: scale)
        let W = size.width, H = size.height
        let depth = max(22, min(min(W, H) * 0.045, 48))

        func falloff(_ peak: CGFloat) -> CGGradient? {
            let stops = 10
            var components: [CGFloat] = []
            var locations: [CGFloat] = []
            for i in 0..<stops {
                let t = CGFloat(i) / CGFloat(stops - 1)
                components += [1, peak * pow(1 - t, 2.4)]
                locations.append(t)
            }
            return CGGradient(colorSpace: CGColorSpaceCreateDeviceGray(), colorComponents: components, locations: locations, count: stops)
        }

        func band(_ d: CGFloat, _ peak: CGFloat) {
            guard let g = falloff(peak) else { return }
            let sides: [(CGRect, CGPoint, CGPoint)] = [
                (CGRect(x: 0, y: 0, width: W, height: d), CGPoint(x: 0, y: 0), CGPoint(x: 0, y: d)),
                (CGRect(x: 0, y: H - d, width: W, height: d), CGPoint(x: 0, y: H), CGPoint(x: 0, y: H - d)),
                (CGRect(x: 0, y: 0, width: d, height: H), CGPoint(x: 0, y: 0), CGPoint(x: d, y: 0)),
                (CGRect(x: W - d, y: 0, width: d, height: H), CGPoint(x: W, y: 0), CGPoint(x: W - d, y: 0)),
            ]
            for (rect, start, end) in sides {
                ctx.saveGState()
                ctx.clip(to: rect)
                ctx.drawLinearGradient(g, start: start, end: end, options: [])
                ctx.restoreGState()
            }
        }

        band(depth * 2.6, 0.16)
        band(depth, 0.6)
        if let corner = falloff(0.16) {
            for c in [CGPoint(x: 0, y: 0), CGPoint(x: W, y: 0), CGPoint(x: 0, y: H), CGPoint(x: W, y: H)] {
                ctx.drawRadialGradient(corner, startCenter: c, startRadius: 0, endCenter: c, endRadius: depth * 1.8, options: [])
            }
        }
        // Centred on the edge, so half is off the screen and a clean line of light hugs it.
        ctx.setStrokeColor(gray: 1, alpha: 0.9)
        ctx.setLineWidth(3)
        ctx.stroke(CGRect(x: 0, y: 0, width: W, height: H))
        return ctx.makeImage()
    }
}

// MARK: The cursor, the ripples and the pill

private struct OperatorOverlay: View {
    let model: AgentCursor.Model

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(model.ripples) { ripple in
                RippleRing(right: ripple.right)
                    .position(ripple.point)
            }
            if let point = model.cursor {
                SliceCursor(pressed: model.pressed)
                    // The arrow's tip is the top-left of its frame: put the tip on the point.
                    .position(x: point.x + SliceCursor.size.width / 2, y: point.y + SliceCursor.size.height / 2)
                    .transition(.opacity)
            }
            if model.operating {
                OperatorPill(label: model.label, stopping: model.stopping)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .padding(.bottom, model.bottomInset)
                    .transition(.opacity.combined(with: .offset(y: 10)))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .animation(.easeOut(duration: 0.3), value: model.operating)
        .animation(.easeOut(duration: 0.2), value: model.label)
        .allowsHitTesting(false)
        .environment(\.colorScheme, .dark)
    }
}

/// Slice's own pointer: an arrow in Slice's blue to lilac with a white edge, and a small tag with
/// the mark, so it's never mistaken for the user's own.
private struct SliceCursor: View {
    static let size = CGSize(width: 110, height: 52)
    let pressed: Bool

    var body: some View {
        ZStack(alignment: .topLeading) {
            ArrowShape()
                .fill(LinearGradient(colors: [Color(hex: 0x4C8DFF), Color(hex: 0x8A7BFF)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(ArrowShape().stroke(.white, style: StrokeStyle(lineWidth: 1.6, lineJoin: .round)))
                .frame(width: 17, height: 24)
                .shadow(color: .black.opacity(0.45), radius: 5, y: 2)
                .scaleEffect(pressed ? 0.84 : 1, anchor: .topLeading)
            HStack(spacing: 5) {
                SliceMark(height: 9)
                Text("Slice").font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(.white)
            .padding(.leading, 6)
            .padding(.trailing, 9)
            .frame(height: 20)
            .background(Capsule().fill(LinearGradient(colors: [Color(hex: 0x3D7BFF), Color(hex: 0x7D6BFF)], startPoint: .leading, endPoint: .trailing)))
            .overlay(Capsule().strokeBorder(.white.opacity(0.35), lineWidth: 0.5))
            .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
            .offset(x: 16, y: 24)
        }
        .frame(width: Self.size.width, height: Self.size.height, alignment: .topLeading)
    }
}

/// A pointer arrow with its tip at the top-left corner (Cortana's outline, in a 14 by 21 box).
private struct ArrowShape: Shape {
    func path(in rect: CGRect) -> Path {
        let sx = rect.width / 13.8, sy = rect.height / 21
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * sx, y: rect.minY + y * sy) }
        var path = Path()
        path.move(to: p(0, 0))
        path.addLine(to: p(0, 19))
        path.addLine(to: p(4.8, 14.3))
        path.addLine(to: p(8, 21))
        path.addLine(to: p(10.7, 19.8))
        path.addLine(to: p(7.5, 13.2))
        path.addLine(to: p(13.8, 13.2))
        path.closeSubpath()
        return path
    }
}

/// Where a click lands: a ring that spreads and fades (amber for a right click).
private struct RippleRing: View {
    let right: Bool
    @State private var spread = false

    var body: some View {
        Circle()
            .stroke(right ? Color(hex: 0xFFBE5C) : Color(hex: 0x6E9BFF), lineWidth: spread ? 1 : 2.5)
            .frame(width: 80, height: 80)
            .scaleEffect(spread ? 1 : 0.15)
            .opacity(spread ? 0 : 0.95)
            .onAppear { withAnimation(.easeOut(duration: 0.64)) { spread = true } }
    }
}

/// The bottom pill: what Slice is doing, and how to take the Mac back.
private struct OperatorPill: View {
    let label: String
    let stopping: Bool

    var body: some View {
        HStack(spacing: 10) {
            SliceMark(height: 12)
            Text(label.isEmpty ? "Slice is using your Mac" : label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
                .lineLimit(1)
                .contentTransition(.opacity)
            if !stopping {
                Rectangle().fill(.white.opacity(0.15)).frame(width: 1, height: 16)
                HStack(spacing: 5) {
                    Text("esc")
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.horizontal, 6)
                        .frame(height: 18)
                        .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(.white.opacity(0.14)))
                    Text("to stop").font(.system(size: 12)).foregroundStyle(.white.opacity(0.55))
                }
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 40)
        .background(Capsule().fill(Color(hex: 0x0E0F13).opacity(0.86)))
        .overlay(Capsule().strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
        .shadow(color: .black.opacity(0.3), radius: 14, y: 6)
        .frame(maxWidth: 560)
    }
}
