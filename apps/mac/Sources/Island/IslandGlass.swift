import AppKit
import SwiftUI

/// The island's look: black where it meets the notch, dark frosted glass below (the desktop
/// behind it shows through, blurred), neutral grey cards with a lighter header strip, and a
/// blue pill for the main action. It never follows the light theme: it has to match the notch.
enum IslandStyle {
    static let card = Color(hex: 0x1E1F24)
    static let header = Color(hex: 0x2A2B31)
    static let waiting = Color(hex: 0x24304A)
    static let raised = Color(hex: 0x2A2B31)
    static let line = Color.white.opacity(0.08)
    static let accent = Color(hex: 0x5A8CF0)
    static let text = Color.white.opacity(0.94)
    static let text2 = Color.white.opacity(0.62)
    static let text3 = Color.white.opacity(0.42)
    static let good = Color(hex: 0x3DD598)
    static let bad = Color(hex: 0xF87171)
}

/// The island's shell: the notch shape in black glass. `solidTop` points stay pure black so the
/// shell melts into the notch; below, the blurred desktop shows faintly through.
struct IslandShell: View {
    let shape: NotchShape
    let height: CGFloat
    let solidTop: CGFloat
    let glass: Bool
    var rendering = false

    var body: some View {
        ZStack {
            if glass, !rendering {
                BehindWindowBlur().clipShape(shape)
            }
            shape.fill(LinearGradient(stops: [
                .init(color: .black, location: 0),
                .init(color: .black, location: min(0.98, solidTop / max(height, 1))),
                .init(color: .black.opacity(glass ? 0.88 : 1), location: min(1, (solidTop + 40) / max(height, 1))),
                .init(color: .black.opacity(glass ? 0.8 : 1), location: 1),
            ], startPoint: .top, endPoint: .bottom))
        }
    }
}

/// What's behind the window, blurred (NSVisualEffectView): the glass in the island's shell.
private struct BehindWindowBlur: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .hudWindow
        view.blendingMode = .behindWindow
        view.state = .active
        view.appearance = NSAppearance(named: .darkAqua)
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

/// A card inside the island: a lighter header strip over a grey body.
struct IslandCard<Header: View, Content: View>: View {
    var highlighted = false
    @ViewBuilder var header: Header
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, 12)
                .frame(height: 36)
                .frame(maxWidth: .infinity, alignment: .leading)
                // No borders in the island: the one waiting for you gets a blue-tinted strip instead.
                .background(highlighted ? IslandStyle.waiting : IslandStyle.header)
            VStack(alignment: .leading, spacing: 9) { content }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(IslandStyle.card)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// A small white tag with dark capitals on a dark surface ("BRAND", "VINYL").
struct IslandTag: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 8.5, weight: .bold).italic())
            .tracking(0.4)
            .foregroundStyle(Color(hex: 0x111216))
            .padding(.horizontal, 5)
            .padding(.vertical, 2.5)
            .background(RoundedRectangle(cornerRadius: 3, style: .continuous).fill(.white))
            .fixedSize()
    }
}
