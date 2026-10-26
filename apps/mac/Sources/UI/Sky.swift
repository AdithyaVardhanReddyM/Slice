import AppKit
import SwiftUI

/// Slice's look: light and airy by default (soft sky gradients, white cards, glossy 3D icons,
/// black pill buttons), with a dark version the user can pick in Settings > General.
/// Every colour here has a light and a dark value and follows the window it's drawn in.
/// The island keeps its own black (it has to match the notch).
enum Appearance: String, CaseIterable, Identifiable {
    case light, dark
    var id: Self { self }
    var title: String { self == .light ? "Light" : "Dark" }
}

@MainActor
enum Theme {
    static let key = "appearance"

    static var current: Appearance {
        Appearance(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .light
    }

    /// Light unless the user picked dark; every window but the island follows it.
    static func apply(_ appearance: Appearance? = nil) {
        if let appearance { UserDefaults.standard.set(appearance.rawValue, forKey: key) }
        NSApp.appearance = NSAppearance(named: current == .dark ? .darkAqua : .aqua)
    }
}

enum Sky {
    // Surfaces
    static let canvas = dynamic(0xF3F6FB, 0x0A0D14)
    static let card = dynamic(0xFFFFFF, 0x131823)
    static let raised = dynamic(0xFFFFFF, 0x1B2131)

    // Text
    static let ink = dynamic(0x0D1220, 0xF1F4FA)
    static let ink2 = dynamic(0x5D6679, 0xA3ACBE)
    static let ink3 = dynamic(0x98A1B3, 0x6A7388)

    // Lines and quiet fills
    static let line = dynamic(0x0D1220, 0xFFFFFF, alpha: 0.08, darkAlpha: 0.09)
    static let fill = dynamic(0x0D1220, 0xFFFFFF, alpha: 0.045, darkAlpha: 0.07)

    // Colour
    static let accent = dynamic(0x2E7BFF, 0x5C9DFF)
    static let accentSoft = dynamic(0x2E7BFF, 0x5C9DFF, alpha: 0.11, darkAlpha: 0.2)
    static let lilac = dynamic(0x8A7BFF, 0xA797FF)
    static let good = dynamic(0x14A363, 0x3DD598)
    static let goodSoft = dynamic(0x14A363, 0x3DD598, alpha: 0.12, darkAlpha: 0.16)
    static let warn = dynamic(0xD98200, 0xFBBF24)
    static let warnSoft = dynamic(0xF5A300, 0xFBBF24, alpha: 0.14, darkAlpha: 0.16)
    static let bad = dynamic(0xE5484D, 0xF87171)

    /// Primary buttons: ink on light, white on dark.
    static let primary = dynamic(0x0D1220, 0xF4F6FB)
    static let onPrimary = dynamic(0xFFFFFF, 0x0D1220)

    static let shadow = dynamic(0x101828, 0x000000, alpha: 0.07, darkAlpha: 0.45)

    /// A colour with a light and a dark value, resolved against whatever is drawing it.
    static func dynamic(_ light: UInt32, _ dark: UInt32, alpha: CGFloat = 1, darkAlpha: CGFloat? = nil) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            return NSColor(hex: isDark ? dark : light, alpha: isDark ? (darkAlpha ?? alpha) : alpha)
        })
    }
}

extension NSColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }
}

/// The soft gradient skies behind a hero. Each step of a flow gets its own, like the cards in a deck.
enum SkyMood: CaseIterable {
    case sky, mint, blush, lilac

    /// Two rows of a 3 × 3 mesh (the third row is the card, so the sky melts into it).
    func colors(dark: Bool) -> [Color] {
        let rows: [UInt32] = switch (self, dark) {
        case (.sky, false): [0xA6D9FF, 0x9DB9FF, 0xC2AEFF, 0xD3EDFF, 0xDCE3FF, 0xEBDDFF]
        case (.mint, false): [0xA6EEE5, 0xB5EFD2, 0xCFF2B9, 0xD9F7F4, 0xE3F8EC, 0xF0FAE2]
        case (.blush, false): [0xFFC8E2, 0xE4C3FF, 0xBFCBFF, 0xFFE4F1, 0xF0E3FF, 0xE1E8FF]
        case (.lilac, false): [0xC6B6FF, 0xA9C1FF, 0xF1C8FF, 0xE6DEFF, 0xDCE7FF, 0xF7E4FF]
        case (.sky, true): [0x10306E, 0x1C2C80, 0x3A2A86, 0x0E1A38, 0x121C42, 0x1C1840]
        case (.mint, true): [0x0B4A4A, 0x0F4A3A, 0x23461E, 0x0C2226, 0x0E2420, 0x16231A]
        case (.blush, true): [0x5A1E4A, 0x3E2370, 0x1E2C72, 0x2A1430, 0x22183E, 0x14193A]
        case (.lilac, true): [0x33227A, 0x1E3478, 0x55206E, 0x1A1640, 0x121C40, 0x26163A]
        }
        return rows.map { Color(hex: $0) }
    }
}
