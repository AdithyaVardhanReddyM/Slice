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

/// The Slice logogram. On the Mac it's the puffy glass version of slice_logo.svg's two slabs
/// (Assets > Glossy > glossy-mark), to match the glossy icons; `height` is the slabs' height.
struct SliceMark: View {
    var height: CGFloat = 14

    var body: some View {
        Image("glossy-mark")
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: height * 1.32, height: height * 1.1)
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
        let points: [CGPoint] = switch part {
        case .top: [p(15.4992, 0), p(36.5808, 0), p(21.0816, 22.9729), p(0, 22.9729)]
        case .bottom: [p(16.4224, 25.102), p(10.4192, 34), p(32.5008, 34), p(48, 11.0271), p(31.7024, 11.0271), p(22.2064, 25.102)]
        }
        // Every corner rounded, so the glyph is as soft as the glossy mark.
        let radius = 2.4 * min(sx, sy)
        var path = Path()
        let start = CGPoint(x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2)
        path.move(to: start)
        for i in 1...points.count {
            path.addArc(tangent1End: points[i % points.count], tangent2End: points[(i + 1) % points.count], radius: radius)
        }
        path.addLine(to: start)
        path.closeSubpath()
        return path
    }
}
