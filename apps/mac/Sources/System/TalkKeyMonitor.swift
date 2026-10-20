import AppKit

/// Hold fn and control (nothing else) to talk. Another key pressed while they're held
/// means it was a shortcut, so the talk is cancelled.
///
/// Watching keys in other apps needs Accessibility. Until it's granted the global
/// monitor gets nothing, so this checks again every two seconds and reinstalls itself.
@MainActor
final class TalkKeyMonitor {
    var onPress: (() -> Void)?
    var onRelease: (() -> Void)?
    var onCancel: (() -> Void)?

    private var monitors: [Any] = []
    private var held = false
    private var trustWatch: Timer?
    private var installedTrusted = false

    func start() {
        install()
        trustWatch = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, AXIsProcessTrusted() != self.installedTrusted else { return }
                self.install()
            }
        }
    }

    func stop() {
        trustWatch?.invalidate()
        trustWatch = nil
        monitors.forEach(NSEvent.removeMonitor)
        monitors = []
    }

    private func install() {
        monitors.forEach(NSEvent.removeMonitor)
        monitors = []
        installedTrusted = AXIsProcessTrusted()
        let mask: NSEvent.EventTypeMask = [.flagsChanged, .keyDown]
        if let global = NSEvent.addGlobalMonitorForEvents(matching: mask, handler: { event in
            MainActor.assumeIsolated { self.handle(event) }
        }) {
            monitors.append(global)
        }
        if let local = NSEvent.addLocalMonitorForEvents(matching: mask, handler: { event in
            MainActor.assumeIsolated { self.handle(event) }
            return event
        }) {
            monitors.append(local)
        }
    }

    private func handle(_ event: NSEvent) {
        switch event.type {
        case .flagsChanged:
            let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            let combo = flags.contains(.function) && flags.contains(.control)
                && flags.isDisjoint(with: [.command, .option, .shift])
            if combo, !held {
                held = true
                onPress?()
            } else if !combo, held {
                held = false
                onRelease?()
            }
        case .keyDown:
            if held {
                held = false
                onCancel?()
            }
        default:
            break
        }
    }
}
