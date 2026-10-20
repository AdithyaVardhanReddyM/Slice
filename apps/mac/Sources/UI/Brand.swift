import AppKit
import SwiftUI

/// The "Freshly squeezed" palette. On the black island these work as text and fills.
enum Brand {
    static let yellow = Color(red: 1, green: 0.902, blue: 0.259)   // #FFE642
    static let orange = Color(red: 1, green: 0.475, blue: 0)       // #FF7900
    static let amber = Color(red: 1, green: 0.749, blue: 0)        // #FFBF00
    static let sand = Color(red: 0.949, green: 0.812, blue: 0.494) // #F2CF7E

    static let squeeze = LinearGradient(colors: [yellow, orange], startPoint: .leading, endPoint: .trailing)
}

/// The Slice logogram (slice_logo.svg): a yellow slab over an orange one, on a 49 × 34 grid.
struct SliceMark: View {
    var height: CGFloat = 14

    var body: some View {
        ZStack {
            SliceMarkShape(part: .top).fill(Brand.yellow)
            SliceMarkShape(part: .bottom).fill(Brand.orange)
        }
        .frame(width: height * 49 / 34, height: height)
    }

    /// A template image for the menu bar.
    @MainActor static let menuBarImage: NSImage = {
        let size = NSSize(width: 20, height: 14)
        let image = NSImage(size: size, flipped: true) { rect in
            NSColor.black.setFill()
            for part in [SliceMarkShape.Part.top, .bottom] {
                let path = SliceMarkShape(part: part).path(in: rect)
                NSBezierPath(cgPath: path.cgPath).fill()
            }
            return true
        }
        image.isTemplate = true
        return image
    }()
}

struct SliceMarkShape: Shape {
    enum Part { case top, bottom }
    let part: Part

    func path(in rect: CGRect) -> Path {
        let sx = rect.width / 49, sy = rect.height / 34
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * sx, y: rect.minY + y * sy) }
        var path = Path()
        switch part {
        case .top:
            path.addLines([p(15.4992, 0), p(36.5808, 0), p(21.0816, 22.9729), p(0, 22.9729)])
        case .bottom:
            path.addLines([p(16.4224, 25.102), p(10.4192, 34), p(32.5008, 34), p(48, 11.0271),
                           p(31.7024, 11.0271), p(22.2064, 25.102)])
        }
        path.closeSubpath()
        return path
    }
}
