import AppKit
import Observation
import SwiftUI

/// What the user sees while the operator works: a soft brand glow around the screen,
/// and a ring where each click lands with the step's intent beside it. Click-through,
/// and left out of the operator's own screenshots (ScreenTool excludes Slice's windows).
@MainActor
final class AgentCursor {
    static let shared = AgentCursor()

    @Observable
    final class Model {
        var operating = false
        var point: CGPoint?
        var label = ""
        var pulse = 0
    }

    private let model = Model()
    private var panel: NSPanel?
    private var hideTask: Task<Void, Never>?

    /// The operator started or stopped (`operator` frames).
    func setOperating(_ on: Bool) {
        model.operating = on
        if on { ensurePanel() } else { model.point = nil }
        panel?.orderFrontRegardless()
    }

    /// `point` is in global CGEvent coordinates (top-left origin).
    func show(at point: CGPoint, label: String) {
        ensurePanel()
        let frame = CGDisplayBounds(CGMainDisplayID())
        model.point = CGPoint(x: point.x - frame.minX, y: point.y - frame.minY)
        model.label = label
        model.pulse += 1
        panel?.orderFrontRegardless()
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(2.5))
            guard !Task.isCancelled else { return }
            self.model.point = nil
        }
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
        panel.contentView = NSHostingView(rootView: CursorOverlay(model: model))
        panel.setFrame(screen.frame, display: true)
        self.panel = panel
    }
}

private struct CursorOverlay: View {
    let model: AgentCursor.Model

    var body: some View {
        ZStack(alignment: .topLeading) {
            if model.operating {
                // A crisp edge round the screen while Slice works on it (no glow).
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(IslandStyle.accent, lineWidth: 3)
                    .opacity(0.9)
                    .transition(.opacity)
            }
            if let point = model.point {
                ClickMark(label: model.label, pulse: model.pulse)
                    .position(x: point.x, y: point.y)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeOut(duration: 0.25), value: model.operating)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: model.point)
        .allowsHitTesting(false)
    }
}

private struct ClickMark: View {
    let label: String
    let pulse: Int
    @State private var ripple = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(IslandStyle.accent, lineWidth: 2)
                .frame(width: 44, height: 44)
                .scaleEffect(ripple ? 1.6 : 0.6)
                .opacity(ripple ? 0 : 1)
            Circle()
                .fill(IslandStyle.accent)
                .frame(width: 12, height: 12)
                .overlay(Circle().strokeBorder(.white, lineWidth: 2))
            if !label.isEmpty {
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(.black.opacity(0.82)))
                    .fixedSize()
                    .offset(x: 18, y: 26)
                    .frame(width: 0, height: 0, alignment: .topLeading)
            }
        }
        .onChange(of: pulse, initial: true) {
            ripple = false
            withAnimation(.easeOut(duration: 0.7)) { ripple = true }
        }
    }
}
