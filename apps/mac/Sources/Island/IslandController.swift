import AppKit
import SwiftUI

/// Owns the island's panel: pins it over the notch, opens it while the pointer is over
/// the notch, and lets clicks through everywhere the island isn't drawn.
@MainActor
final class IslandController {
    let model: IslandModel
    private let panel: IslandPanel
    private var screen: NSScreen
    private var monitors: [Any] = []
    private var openTask: Task<Void, Never>?
    private var closeTask: Task<Void, Never>?
    private var lingerTask: Task<Void, Never>?
    private var lastPhase: AgentSession.Phase = .idle

    /// The panel is fixed and larger than the island; the island draws at its top centre.
    private static let panelSize = CGSize(width: 680, height: 460)
    /// Hover this long before the island opens, so sweeping past it does nothing.
    private static let openDelay: Duration = .milliseconds(90)
    private static let closeDelay: Duration = .milliseconds(350)
    private static let lingerFor: Duration = .seconds(4)

    init(agent: AgentSession) {
        model = IslandModel(agent: agent)
        screen = Self.notchScreen()
        panel = IslandPanel(
            contentRect: NSRect(origin: .zero, size: Self.panelSize),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.contentView = NSHostingView(rootView: IslandView(model: model))
        layout()
        panel.orderFrontRegardless()

        installMonitors()
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.screen = Self.notchScreen()
                self.layout()
            }
        }
        watchAgent()
    }

    // MARK: Placement

    private static func notchScreen() -> NSScreen {
        NSScreen.screens.first { $0.safeAreaInsets.top > 0 } ?? NSScreen.main ?? NSScreen.screens[0]
    }

    private func layout() {
        if screen.safeAreaInsets.top > 0, let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea {
            model.notch = CGSize(width: screen.frame.width - left.width - right.width, height: screen.safeAreaInsets.top)
            model.hasNotch = true
        } else {
            let menuBar = screen.frame.maxY - screen.visibleFrame.maxY
            model.notch = CGSize(width: 200, height: menuBar > 0 ? menuBar : 24)
            model.hasNotch = false
        }
        let f = screen.frame
        panel.setFrame(
            NSRect(x: f.midX - Self.panelSize.width / 2, y: f.maxY - Self.panelSize.height,
                   width: Self.panelSize.width, height: Self.panelSize.height),
            display: true
        )
    }

    /// Where the island is drawn for a mode, in screen coordinates.
    private func islandRect(_ mode: IslandModel.Mode) -> CGRect {
        let size = model.size(mode)
        let width = size.width + 2 * IslandModel.shoulder
        let f = screen.frame
        return CGRect(x: f.midX - width / 2, y: f.maxY - size.height, width: width, height: size.height)
    }

    /// The area that opens the island: the notch (a little wider), or the island while open.
    private func hotRect() -> CGRect {
        if model.mode == .open {
            return islandRect(.open).insetBy(dx: -6, dy: -6)
        }
        let f = screen.frame
        let height = max(model.notch.height, 6)
        return CGRect(x: f.midX - model.notch.width / 2 - 10, y: f.maxY - height,
                      width: model.notch.width + 20, height: height)
    }

    // MARK: Pointer and keys

    private func installMonitors() {
        let moves: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDragged, .rightMouseDragged]
        if let global = NSEvent.addGlobalMonitorForEvents(matching: moves, handler: { _ in
            MainActor.assumeIsolated { self.pointerMoved() }
        }) {
            monitors.append(global)
        }
        if let local = NSEvent.addLocalMonitorForEvents(matching: moves, handler: { event in
            MainActor.assumeIsolated { self.pointerMoved() }
            return event
        }) {
            monitors.append(local)
        }
        // Escape closes the open island.
        if let keys = NSEvent.addLocalMonitorForEvents(matching: .keyDown, handler: { event in
            guard event.keyCode == 53 else { return event }
            MainActor.assumeIsolated { self.close() }
            return nil
        }) {
            monitors.append(keys)
        }
    }

    private func pointerMoved() {
        let point = NSEvent.mouseLocation
        if hotRect().contains(point) {
            closeTask?.cancel()
            closeTask = nil
            if !model.hovering, openTask == nil {
                openTask = Task {
                    try? await Task.sleep(for: Self.openDelay)
                    openTask = nil
                    guard !Task.isCancelled, hotRect().contains(NSEvent.mouseLocation) else { return }
                    model.hovering = true
                    updateClickThrough()
                }
            }
        } else {
            openTask?.cancel()
            openTask = nil
            if model.hovering, closeTask == nil {
                closeTask = Task {
                    try? await Task.sleep(for: Self.closeDelay)
                    closeTask = nil
                    guard !Task.isCancelled else { return }
                    model.hovering = false
                    giveBackKeyFocus()
                    updateClickThrough()
                }
            }
        }
        updateClickThrough()
    }

    /// Clicks reach the island only while it's open and the pointer is on it.
    private func updateClickThrough() {
        let onIsland = model.mode == .open && islandRect(.open).contains(NSEvent.mouseLocation)
        if panel.ignoresMouseEvents == onIsland { panel.ignoresMouseEvents = !onIsland }
    }

    private func close() {
        model.draft = ""
        model.hovering = false
        giveBackKeyFocus()
        updateClickThrough()
    }

    /// Typing made the panel key; hand the keyboard back to the app underneath.
    private func giveBackKeyFocus() {
        guard panel.isKeyWindow, model.draft.isEmpty else { return }
        panel.orderOut(nil)
        panel.orderFrontRegardless()
    }

    // MARK: Agent

    /// After a reply (or an error) the caption stays up for a few seconds.
    private func watchAgent() {
        withObservationTracking {
            _ = model.agent.phase
            _ = model.agent.lastError
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.agentChanged()
                self?.watchAgent()
            }
        }
    }

    private func agentChanged() {
        let phase = model.agent.phase
        defer { lastPhase = phase }
        let finished = phase == .idle && lastPhase != .idle && lastPhase != .listening
        guard finished || model.agent.lastError != nil else { return }
        model.lingering = true
        lingerTask?.cancel()
        lingerTask = Task {
            try? await Task.sleep(for: Self.lingerFor)
            guard !Task.isCancelled else { return }
            model.lingering = false
            model.agent.clearError()
        }
    }
}

final class IslandPanel: NSPanel {
    override init(contentRect: NSRect, styleMask style: NSWindow.StyleMask, backing: NSWindow.BackingStoreType, defer flag: Bool) {
        super.init(contentRect: contentRect, styleMask: style, backing: backing, defer: flag)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.mainMenuWindow)) + 3)
        collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        ignoresMouseEvents = true
        becomesKeyOnlyIfNeeded = true
        hidesOnDeactivate = false
        isMovable = false
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    /// Sit in the menu bar over the notch; don't let AppKit push the panel below it.
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}
