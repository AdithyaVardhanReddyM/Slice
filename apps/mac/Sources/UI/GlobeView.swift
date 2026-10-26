import AppKit
import SwiftUI

/// A dotted globe: land as a lattice of small dots (Assets > globe-dots, from Natural Earth via
/// world-atlas), places pinned with small tags. It turns slowly on its own, spins when dragged,
/// and turns to face a place when one is chosen.
struct GlobePin: Identifiable, Equatable {
    var id: String { label }
    let label: String
    let lat: Double
    let lon: Double
    /// Which side of the dot the tag sits on, so neighbours (London, Paris) don't collide.
    var tagLeft = false
    var tagBelow = false
}

struct GlobeView: View {
    /// The chosen place, if any: tagged dark, and the globe turns to face it.
    var home: GlobePin?
    /// Places to tap.
    var pins: [GlobePin] = []
    /// How big the globe is against its frame: 1 fits it whole; more shows a close-up cap of it.
    var zoom: CGFloat = 1
    /// How far below the frame's middle the globe's centre sits, as a share of its radius (0 centred).
    var drop: CGFloat = 0
    /// How far above the view's middle a chosen place sits, in degrees of arc.
    var lift: Double = 14
    /// Tags lower than this (a share of the height) are hidden: something covers the bottom.
    var tagsAbove: CGFloat = 1
    var onPick: (GlobePin) -> Void = { _ in }

    @State private var motion = GlobeMotion()
    @Environment(\.renderingForPreview) private var rendering

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let radius = side / 2 * 0.92 * zoom
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2 + drop * radius)
            let bounds = CGRect(origin: .zero, size: geo.size)
            Group {
                if rendering {
                    // ImageRenderer never calls onAppear: face home before drawing.
                    let _ = home.map { motion.focus(lat: $0.lat, lon: $0.lon, lift: lift, animated: false) }
                    frame(center: center, radius: radius, bounds: bounds)
                } else {
                    TimelineView(.animation(minimumInterval: 1 / 40)) { context in
                        let _ = motion.tick(context.date)
                        frame(center: center, radius: radius, bounds: bounds)
                    }
                }
            }
            .contentShape(Circle().path(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
                .intersection(Rectangle().path(in: bounds)))
            .gesture(DragGesture(minimumDistance: 2)
                .onChanged { value in motion.drag(by: value.translation, radius: radius) }
                .onEnded { _ in motion.endDrag(resume: home == nil) })
        }
        .onAppear { if let home { motion.focus(lat: home.lat, lon: home.lon, lift: lift, animated: false) } }
        .onChange(of: home) {
            if let home { motion.focus(lat: home.lat, lon: home.lon, lift: lift, animated: !rendering) } else { motion.spin() }
        }
    }

    private func frame(center: CGPoint, radius: CGFloat, bounds: CGRect) -> some View {
        let view = GlobeProjection(lat: motion.lat, lon: motion.lon)
        return ZStack {
            Canvas { ctx, _ in
                let box = CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
                ctx.fill(Path(ellipseIn: box), with: .radialGradient(
                    Gradient(colors: [GlobeColors.light, GlobeColors.edge]),
                    center: CGPoint(x: center.x - radius * 0.3, y: center.y - radius * 0.35), startRadius: 0, endRadius: radius * 1.35))
                ctx.stroke(Path(ellipseIn: box), with: .color(Sky.line), lineWidth: 1)
                // Three depths, so dots fade and shrink towards the edge like a sphere.
                var paths = [Path(), Path(), Path()]
                let dot = max(1.0, radius * 0.0052)
                let visible = bounds.insetBy(dx: -4, dy: -4)
                for p in GlobeDots.points {
                    let s = view.project(p)
                    guard s.z > 0.02 else { continue }
                    let size = dot * (0.5 + 0.5 * s.z)
                    let x = center.x + s.x * radius, y = center.y - s.y * radius
                    guard visible.contains(CGPoint(x: x, y: y)) else { continue }
                    paths[s.z < 0.35 ? 0 : (s.z < 0.7 ? 1 : 2)].addEllipse(in: CGRect(x: x - size / 2, y: y - size / 2, width: size, height: size))
                }
                for (i, opacity) in [0.28, 0.5, 0.78].enumerated() {
                    ctx.fill(paths[i], with: .color(GlobeColors.dot.opacity(opacity)))
                }
            }
            ForEach(pins.filter { pin in home.map { abs($0.lat - pin.lat) + abs($0.lon - pin.lon) > 1.5 } ?? true }) { pin in
                tagged(pin, view: view, center: center, radius: radius, bounds: bounds, home: false)
            }
            if let home {
                tagged(home, view: view, center: center, radius: radius, bounds: bounds, home: true)
            }
        }
    }

    @ViewBuilder
    private func tagged(_ pin: GlobePin, view: GlobeProjection, center: CGPoint, radius: CGFloat, bounds: CGRect, home: Bool) -> some View {
        let s = view.project(GlobeDots.vector(lat: pin.lat, lon: pin.lon))
        let at = CGPoint(x: center.x + s.x * radius, y: center.y - s.y * radius)
        // Only where the whole tag fits: not cut by the frame's sides or hidden under what covers the bottom.
        if s.z > 0.12, at.y < bounds.height * tagsAbove, at.y > 28, at.x > 70, at.x < bounds.width - 70 {
            PinTag(pin: pin, home: home) { if !home { onPick(pin) } }
                .opacity(min(1, (s.z - 0.12) * 4))
                .position(at)
        }
    }
}

/// A dot on the globe with its tag: dark for home, white for places to tap.
private struct PinTag: View {
    let pin: GlobePin
    let home: Bool
    let tap: () -> Void
    @State private var hovering = false

    var body: some View {
        ZStack {
            Circle()
                .fill(home ? Sky.accent : Sky.primary)
                .frame(width: home ? 9 : 6, height: home ? 9 : 6)
                .overlay(Circle().strokeBorder(Sky.card, lineWidth: home ? 2 : 1.5))
            tag
                .offset(x: pin.tagLeft ? -tagShift : tagShift, y: pin.tagBelow ? 12 : -12)
        }
        .frame(width: 10, height: 10)
    }

    private var tagShift: CGFloat { 4 }

    private var tag: some View {
        Button(action: tap) {
            HStack(spacing: 5) {
                if home { Image(systemName: "house.fill").font(.system(size: 8.5, weight: .bold)) }
                Text(pin.label.uppercased())
                    .font(.system(size: 9.5, weight: .semibold))
                    .tracking(0.5)
            }
            .foregroundStyle(home ? Sky.onPrimary : Sky.ink)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(home ? Sky.primary : Sky.card))
            .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(home ? .clear : (hovering ? Sky.ink.opacity(0.5) : Sky.line)))
        }
        .buttonStyle(.plain)
        .onHover { hovering = home ? false : $0 }
        // Anchor the tag's near corner on the dot.
        .fixedSize()
        .frame(width: 0, height: 0, alignment: pin.tagLeft ? .trailing : .leading)
    }
}

private enum GlobeColors {
    static let light = Sky.dynamic(0xFFFFFF, 0x1E2433)
    static let edge = Sky.dynamic(0xE7EBF2, 0x0C0F16)
    static let dot = Sky.dynamic(0x1B2333, 0xDCE3F0)
}

/// Where the globe faces: a turn about the poles to the centre longitude, then a tilt to the
/// centre latitude, so (lat, lon) lands in the middle facing out.
struct GlobeProjection {
    let cosLat: Double, sinLat: Double, cosLon: Double, sinLon: Double

    init(lat: Double, lon: Double) {
        cosLat = cos(lat); sinLat = sin(lat); cosLon = cos(lon); sinLon = sin(lon)
    }

    /// x right, y up, z towards the viewer (front half is z > 0).
    func project(_ p: SIMD3<Double>) -> SIMD3<Double> {
        let x1 = p.x * cosLon - p.z * sinLon
        let z1 = p.x * sinLon + p.z * cosLon
        let y2 = p.y * cosLat - z1 * sinLat
        let z2 = p.y * sinLat + z1 * cosLat
        return SIMD3(x1, y2, z2)
    }
}

/// The globe's turning: a slow spin on its own, following a drag, or easing round to a place.
@MainActor
final class GlobeMotion {
    private(set) var lat: Double = 0.38
    private(set) var lon: Double = -1.2
    private var spinning = true
    private var last: Date?
    private var dragFrom: (lat: Double, lon: Double)?
    private var easing: (from: (Double, Double), to: (Double, Double), start: Date)?

    func tick(_ now: Date) {
        defer { last = now }
        if let e = easing {
            let t = min(1, now.timeIntervalSince(e.start) / 1.4)
            let k = t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
            lat = e.from.0 + (e.to.0 - e.from.0) * k
            lon = e.from.1 + (e.to.1 - e.from.1) * k
            if t >= 1 { easing = nil }
        } else if spinning, dragFrom == nil, let last {
            // West to east, like the Earth: the land drifts right.
            lon -= min(now.timeIntervalSince(last), 0.1) * 0.16
        }
    }

    /// Turn so the place sits `lift` degrees above the middle (the name card covers the bottom).
    func focus(lat: Double, lon: Double, lift: Double, animated: Bool) {
        spinning = false
        let toLat = (lat - lift) * .pi / 180
        var toLon = lon * .pi / 180
        // The short way round.
        while toLon - self.lon > .pi { toLon -= 2 * .pi }
        while toLon - self.lon < -.pi { toLon += 2 * .pi }
        if animated {
            easing = ((self.lat, self.lon), (toLat, toLon), Date())
        } else {
            self.lat = toLat
            self.lon = toLon
        }
    }

    func spin() { spinning = true }

    func drag(by t: CGSize, radius: CGFloat) {
        easing = nil
        if dragFrom == nil { dragFrom = (lat, lon) }
        guard let from = dragFrom else { return }
        lon = from.lon - Double(t.width / radius)
        lat = min(1.1, max(-1.1, from.lat + Double(t.height / radius)))
    }

    func endDrag(resume: Bool) {
        dragFrom = nil
        if resume { spinning = true }
    }
}

/// The land dots as unit vectors, read once.
@MainActor
enum GlobeDots {
    static let points: [SIMD3<Double>] = {
        guard let data = NSDataAsset(name: "globe-dots")?.data else { return [] }
        return data.withUnsafeBytes { raw in
            let floats = raw.bindMemory(to: Float32.self)
            return stride(from: 0, to: floats.count - 1, by: 2).map { vector(lat: Double(floats[$0]), lon: Double(floats[$0 + 1])) }
        }
    }()

    nonisolated static func vector(lat: Double, lon: Double) -> SIMD3<Double> {
        let φ = lat * .pi / 180, λ = lon * .pi / 180
        return SIMD3(cos(φ) * sin(λ), sin(φ), cos(φ) * cos(λ))
    }
}
