import SwiftUI

/// The bottom-left corner of a Mac keyboard, zoomed in on fn and control (the keys to hold to
/// talk): those two lit up and sinking while held, the rest fading away (no blur). The keys
/// are drawn after Aceternity UI's keyboard (ui.aceternity.com/components/keyboard): 24 pt keys,
/// 3.5 pt corners, a hairline and an inset highlight, on a neutral case.
struct TalkKeys: View {
    /// Follows the real keys when set; nil presses and lets go on its own, slowly.
    var pressed: Bool?
    /// How big a key is drawn (Aceternity's are 24).
    var keySize: CGFloat = 44
    @Environment(\.renderingForPreview) private var rendering

    /// Where fn and control meet, in key units, and where that lands in the frame.
    private static let focus = CGPoint(x: 29.5, y: 97)
    private static let anchor = UnitPoint(x: 0.3, y: 0.62)

    var body: some View {
        if let pressed {
            scene(pressed)
        } else if rendering {
            scene(true)
        } else {
            TimelineView(.periodic(from: .now, by: 0.2)) { context in
                // Down for 1.6 s, up for 1.6 s.
                scene(context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3.2) < 1.6)
            }
        }
    }

    private func scene(_ down: Bool) -> some View {
        let u = keySize / 24
        return GeometryReader { geo in
            let board = KeyboardCorner(u: u, down: down)
                .offset(x: geo.size.width * Self.anchor.x - Self.focus.x * u,
                        y: geo.size.height * Self.anchor.y - Self.focus.y * u)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
            board
            // Fades out before every edge of the frame (the top is anchor.y away, the closest).
            .mask(EllipticalGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.4),
                                             .init(color: .clear, location: 1)], center: Self.anchor, endRadiusFraction: Self.anchor.y))
        }
        .animation(.spring(response: 0.22, dampingFraction: 0.7), value: down)
        .accessibilityElement()
        .accessibilityLabel(down ? "fn and control, held" : "Hold fn and control")
    }
}

/// Four rows of the keyboard's left end, laid out like Aceternity's keypad (all sizes in key units).
private struct KeyboardCorner: View {
    let u: CGFloat
    let down: Bool

    private static let pitch: CGFloat = 27

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 12 * u, style: .continuous)
                .fill(KeyLook.caseColor)
                .overlay(RoundedRectangle(cornerRadius: 12 * u, style: .continuous).strokeBorder(KeyLook.caseLine, lineWidth: max(0.5, u * 0.5)))
                .frame(width: 280 * u, height: 113 * u)
            row(0, wide: ("tab", 40), letters: ["Q", "W", "E", "R", "T", "Y"])
            row(1, wide: ("caps lock", 44.8), letters: ["A", "S", "D", "F", "G", "H"])
            row(2, wide: ("shift", 58.4), letters: ["Z", "X", "C", "V", "B", "N"])
            key(at: 4, row: 3, width: 24, lit: true, bottomLeft: 8) { Modifier(top: Text("fn"), bottom: mark("globe"), u: u) }
            key(at: 31, row: 3, width: 24, lit: true) { Modifier(top: mark("chevron.up"), bottom: Text("control"), u: u) }
            key(at: 58, row: 3, width: 24) { Modifier(top: mark("option"), bottom: Text("option"), u: u) }
            key(at: 85, row: 3, width: 32) { Modifier(top: mark("command"), bottom: Text("command"), u: u) }
            key(at: 120, row: 3, width: 131) { Color.clear }
        }
        .frame(width: 280 * u, height: 113 * u, alignment: .topLeading)
    }

    /// Aceternity's icons are a touch bigger than its 5 pt labels.
    private func mark(_ symbol: String) -> some View {
        Image(systemName: symbol).font(.system(size: 6 * u, weight: .medium))
    }

    private func row(_ index: Int, wide: (String, CGFloat), letters: [String]) -> some View {
        ZStack(alignment: .topLeading) {
            key(at: 4, row: index, width: wide.1) {
                Text(wide.0)
                    .fixedSize()
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .padding(.leading, 4 * u)
                    .padding(.bottom, 2 * u)
            }
            ForEach(Array(letters.enumerated()), id: \.offset) { i, letter in
                key(at: 4 + wide.1 + 3 + CGFloat(i) * Self.pitch, row: index, width: 24) { Text(letter) }
            }
        }
    }

    private func key<Label: View>(at x: CGFloat, row: Int, width: CGFloat, lit: Bool = false, bottomLeft: CGFloat = 3.5,
                                  @ViewBuilder label: () -> Label) -> some View {
        Keycap(u: u, width: width, lit: lit, down: lit && down, bottomLeft: bottomLeft, label: label())
            .offset(x: x * u, y: (4 + CGFloat(row) * Self.pitch) * u)
    }
}

/// Aceternity's greys, with a dark version for Slice's dark look.
private enum KeyLook {
    static let caseColor = Sky.dynamic(0xE5E5E5, 0x191C24)
    static let caseLine = Sky.dynamic(0x000000, 0xFFFFFF, alpha: 0.05, darkAlpha: 0.06)
    static let face = Sky.dynamic(0xF3F4F6, 0x2A2F3A)
    static let ink = Sky.dynamic(0x404040, 0xC8CDD6)
    static let highlight = Sky.dynamic(0xFFFFFF, 0xFFFFFF, alpha: 1, darkAlpha: 0.08)
}

/// One key. A lit key carries the accent; a held one sinks (no glow).
private struct Keycap<Label: View>: View {
    let u: CGFloat
    let width: CGFloat
    let lit: Bool
    let down: Bool
    let bottomLeft: CGFloat
    let label: Label

    var body: some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: 3.5 * u, bottomLeadingRadius: bottomLeft * u,
                                           bottomTrailingRadius: 3.5 * u, topTrailingRadius: 3.5 * u, style: .continuous)
        shape
            .fill(KeyLook.face.opacity(down ? 0.85 : 1))
            .overlay(shape.fill(Sky.accent.opacity(lit ? (down ? 0.2 : 0.1) : 0)))
            // The inset white line along the top edge.
            .overlay(shape.strokeBorder(LinearGradient(colors: [KeyLook.highlight.opacity(down ? 0.5 : 1), .clear],
                                                       startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.18)),
                                        lineWidth: u))
            .overlay(shape.strokeBorder(Sky.accent.opacity(lit ? (down ? 0.95 : 0.7) : 0), lineWidth: max(1, 0.7 * u)))
            .overlay(label.font(.system(size: 5 * u)).foregroundStyle(lit ? Sky.accent : KeyLook.ink))
            .frame(width: width * u, height: 24 * u)
            .shadow(color: .black.opacity(0.4), radius: 0.5 * u)
            .shadow(color: .black.opacity(down ? 0.04 : 0.1), radius: 0.5 * u, y: (down ? 0.3 : 1) * u)
            .scaleEffect(down ? 0.96 : 1)
            .offset(y: down ? 0.6 * u : 0)
    }
}

/// A modifier's two marks, top-left and bottom-left (fn over the globe, ⌃ over control).
private struct Modifier<Top: View, Bottom: View>: View {
    let top: Top
    let bottom: Bottom
    let u: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            top.fixedSize()
            Spacer(minLength: 0)
            bottom.fixedSize()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.horizontal, 3 * u)
        .padding(.vertical, 3.5 * u)
    }
}
