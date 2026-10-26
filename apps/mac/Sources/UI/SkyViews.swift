import AppKit
import SwiftUI

// The building blocks of Slice's look (Sky.swift has the colours): gradient skies, glossy
// icons on white tiles, pill buttons, chips, cards, page dots and key caps.

/// A soft mesh-gradient sky that drifts slowly. The bottom row is the card colour, so it melts
/// into whatever sits below it.
struct SkyMesh: View {
    var mood: SkyMood = .sky
    @Environment(\.colorScheme) private var scheme
    @Environment(\.renderingForPreview) private var rendering

    var body: some View {
        if rendering {
            mesh(at: 0)
        } else {
            TimelineView(.animation(minimumInterval: 1 / 30)) { context in
                mesh(at: context.date.timeIntervalSinceReferenceDate)
            }
        }
    }

    private func mesh(at t: Double) -> some View {
        let c = mood.colors(dark: scheme == .dark)
        let base = Sky.card
        func wobble(_ phase: Double, _ amount: Float = 0.07) -> Float { Float(sin(t * 0.35 + phase)) * amount }
        return MeshGradient(width: 3, height: 3, points: [
            [0, 0], [0.5 + wobble(0.3), 0], [1, 0],
            [0, 0.45 + wobble(1.2, 0.05)], [0.5 + wobble(2.1), 0.5 + wobble(0.7, 0.06)], [1, 0.42 + wobble(2.8, 0.05)],
            [0, 1], [0.5, 1], [1, 1],
        ], colors: [c[0], c[1], c[2], c[3], c[4], c[5], base, base, base])
    }
}

/// One of the glossy 3D icons (Assets > Glossy).
struct Glossy: View {
    let name: String
    var floating = false
    var phase: Double = 0
    @Environment(\.renderingForPreview) private var rendering

    init(_ name: String, floating: Bool = false, phase: Double = 0) {
        self.name = name
        self.floating = floating
        self.phase = phase
    }

    var body: some View {
        let image = Image("glossy-\(name)").resizable().interpolation(.high).scaledToFit()
        if floating, !rendering {
            TimelineView(.animation(minimumInterval: 1 / 30)) { context in
                image.offset(y: CGFloat(sin(context.date.timeIntervalSinceReferenceDate * 1.3 + phase)) * 5)
            }
        } else {
            image
        }
    }
}

/// A glossy icon on a white, softly shadowed tile (the app-icon look).
struct IconTile: View {
    let icon: String
    var size: CGFloat = 52
    var floating = false

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
            .fill(Sky.raised)
            .overlay(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous).strokeBorder(Sky.line, lineWidth: 0.5))
            .overlay(Glossy(icon, floating: floating).padding(size * 0.15))
            .frame(width: size, height: size)
            .shadow(color: Sky.shadow, radius: size * 0.16, y: size * 0.06)
    }
}

// MARK: Buttons

/// The main action: a dark pill (white in dark mode), with an arrow in a circle when it moves on.
struct PrimaryButton: ButtonStyle {
    var arrow = true
    var compact = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 10) {
            configuration.label
                .font(.system(size: compact ? 12.5 : 14, weight: .semibold))
            if arrow {
                Image(systemName: "arrow.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Sky.primary)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Sky.onPrimary))
            }
        }
        .foregroundStyle(Sky.onPrimary)
        .padding(.leading, compact ? 14 : 20)
        .padding(.trailing, arrow ? 7 : (compact ? 14 : 20))
        .frame(height: compact ? 30 : 38)
        .background(Capsule().fill(Sky.primary))
        .opacity(enabled ? (configuration.isPressed ? 0.82 : 1) : 0.35)
        .scaleEffect(configuration.isPressed ? 0.98 : 1)
        .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// A quiet pill (Back, Skip, secondary actions).
struct SecondaryButton: ButtonStyle {
    var symbol: String?
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            if let symbol { Image(systemName: symbol).font(.system(size: compact ? 11 : 12, weight: .semibold)) }
            configuration.label
        }
        .font(.system(size: compact ? 12.5 : 13.5, weight: .medium))
        .foregroundStyle(Sky.ink)
        .padding(.horizontal, compact ? 12 : 16)
        .frame(height: compact ? 30 : 38)
        .background(Capsule().fill(Sky.fill.opacity(configuration.isPressed ? 2 : 1)))
        .overlay(Capsule().strokeBorder(Sky.line, lineWidth: 0.5))
    }
}

/// A text action in the accent colour (inspector links, Undo).
struct InlineAction: ButtonStyle {
    var color: Color = Sky.accent
    var size: CGFloat = 13

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size, weight: .medium))
            .foregroundStyle(color)
            .opacity(configuration.isPressed ? 0.6 : 1)
            .contentShape(Rectangle())
    }
}

/// A selectable pill.
struct Chip: ButtonStyle {
    let on: Bool
    var symbol: String?

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            if let symbol { Image(systemName: symbol).font(.system(size: 11.5, weight: .semibold)) }
            configuration.label
        }
        .font(.system(size: 13, weight: on ? .semibold : .medium))
        .foregroundStyle(on ? Sky.accent : Sky.ink)
        .padding(.horizontal, 13)
        .frame(height: 32)
        .background(Capsule().fill(on ? Sky.accentSoft : Sky.card))
        .overlay(Capsule().strokeBorder(on ? Sky.accent.opacity(0.55) : Sky.line, lineWidth: on ? 1.2 : 1))
        .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

/// A round close button for frameless windows.
struct CloseButton: View {
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Sky.ink2)
                .frame(width: 30, height: 30)
                .background(Circle().fill(Sky.card.opacity(hovering ? 1 : 0.85)))
                .overlay(Circle().strokeBorder(Sky.line))
                .shadow(color: Sky.shadow, radius: 6, y: 2)
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

// MARK: Bits

/// Page dots; the current page is a short bar.
struct PageDots: View {
    let count: Int
    let index: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { i in
                Capsule()
                    .fill(i == index ? Sky.ink : Sky.ink3.opacity(0.45))
                    .frame(width: i == index ? 20 : 7, height: 7)
            }
        }
        .animation(.snappy, value: index)
    }
}

/// A small status pill: a coloured dot or symbol and a few words.
struct StatusPill: View {
    let text: String
    var color: Color = Sky.accent
    var symbol: String?
    var soft: Color?

    var body: some View {
        HStack(spacing: 6) {
            if let symbol {
                Image(systemName: symbol).font(.system(size: 11, weight: .bold))
            } else {
                Circle().fill(color).frame(width: 6, height: 6)
            }
            Text(text).font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .frame(height: 26)
        .background(Capsule().fill(soft ?? color.opacity(0.12)))
    }
}

/// A text field on a white card, with a leading symbol and an accent ring while typing.
struct SkyField: View {
    let placeholder: String
    @Binding var text: String
    var symbol: String?
    var large = false
    var secure = false
    var onSubmit: () -> Void = {}
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            if let symbol {
                Image(systemName: symbol).font(.system(size: large ? 15 : 13, weight: .medium)).foregroundStyle(Sky.ink3)
            }
            Group {
                if secure {
                    SecureField("", text: $text, prompt: Text(placeholder).foregroundStyle(Sky.ink3))
                } else {
                    TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(Sky.ink3))
                }
            }
            .textFieldStyle(.plain)
            .font(.system(size: large ? 16 : 14))
            .foregroundStyle(Sky.ink)
            .focused($focused)
            .onSubmit(onSubmit)
            if !text.isEmpty, !large {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Sky.ink3)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .frame(height: large ? 50 : 40)
        .background(RoundedRectangle(cornerRadius: large ? 16 : 13, style: .continuous).fill(Sky.card))
        .overlay(RoundedRectangle(cornerRadius: large ? 16 : 13, style: .continuous)
            .strokeBorder(focused ? Sky.accent.opacity(0.6) : Sky.line, lineWidth: focused ? 1.5 : 1))
        .shadow(color: Sky.shadow.opacity(0.6), radius: 8, y: 3)
        .animation(.easeOut(duration: 0.15), value: focused)
    }
}

extension View {
    /// A white card with a hairline and a soft blue shadow.
    func skyCard(radius: CGFloat = 20, shadow: Bool = true) -> some View {
        background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Sky.card))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Sky.line, lineWidth: 1))
            .shadow(color: shadow ? Sky.shadow : .clear, radius: 14, y: 5)
    }
}

/// A borderless window that still takes the keyboard (for text fields), drawn as a rounded
/// card with its own close button.
final class SkyWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    convenience init<Content: View>(size: CGSize, content: Content) {
        self.init(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless, .fullSizeContentView],
                  backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isMovableByWindowBackground = true
        isReleasedWhenClosed = false
        contentViewController = NSHostingController(rootView: content)
        setContentSize(size)
    }
}

/// A person's face: DiceBear's "Dylan" style (Natalia Spivak, CC BY 4.0), the same face every
/// time for the same name, on one of the app's soft pastels.
struct Avatar: View {
    let seed: String
    var size: CGFloat = 40
    var border: CGFloat = 2

    static func url(_ seed: String, pixels: Int = 160) -> String {
        let name = seed.trimmingCharacters(in: .whitespaces).isEmpty ? "Slice" : seed
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "Slice"
        return "https://api.dicebear.com/9.x/dylan/png?seed=\(encoded)&size=\(pixels)&backgroundColor=c9e6ff,d9d2ff,cdeee9,ffe0ec,fff1c9"
    }

    var body: some View {
        RemoteImage(url: Self.url(seed, pixels: Int(size * 2.5)))
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(Sky.card, lineWidth: border))
            .overlay(Circle().strokeBorder(Sky.line, lineWidth: 0.5).padding(-0.5))
    }
}
