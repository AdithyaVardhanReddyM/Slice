import AppKit
import ApplicationServices
import Carbon.HIToolbox

/// The operator's hands: Gemini computer-use actions (desktop environment) as real
/// mouse and keyboard events. Coordinates arrive on a 0-999 grid over the last
/// screenshot's display (ScreenTool.lastFrame). Needs Accessibility.
@MainActor
enum ComputerTool {
    static func run(_ args: JSONValue?) async -> Result<JSONValue, LocalTools.Failure> {
        guard AXIsProcessTrusted() else {
            return .failure(.init(message: "Slice needs Accessibility to use the mouse and keyboard."))
        }
        let action = args?["action"]?.string ?? ""
        let intent = args?["intent"]?.string ?? ""
        let at = point(args, "x", "y")

        switch action {
        case "click", "double_click", "triple_click", "right_click", "middle_click":
            let count = action == "double_click" ? 2 : action == "triple_click" ? 3 : 1
            let button: CGMouseButton = action == "right_click" ? .right : action == "middle_click" ? .center : .left
            AgentCursor.shared.show(at: at, label: intent)
            click(at, button: button, count: count)
        case "move":
            AgentCursor.shared.show(at: at, label: intent)
            mouse(.mouseMoved, at)
        case "mouse_down":
            mouse(.leftMouseDown, at)
        case "mouse_up":
            mouse(.leftMouseUp, at)
        case "drag_and_drop":
            drag(from: point(args, "start_x", "start_y"), to: point(args, "end_x", "end_y"))
        case "type":
            type(args?["text"]?.string ?? "")
            if args?["press_enter"] == .bool(true) { press(UInt16(kVK_Return)) }
        case "press_key", "key_down", "key_up":
            guard let name = args?["key"]?.string, let code = keyCode(name) else {
                return .failure(.init(message: "Unknown key \(args?["key"]?.string ?? "")."))
            }
            switch action {
            case "key_down": key(code, down: true)
            case "key_up": key(code, down: false)
            default: press(code)
            }
        case "hotkey":
            let keys = (args?["keys"]?.array ?? []).compactMap(\.string)
            guard !hotkey(keys) else { break }
            return .failure(.init(message: "Couldn't press \(keys.joined(separator: "+"))."))
        case "scroll":
            AgentCursor.shared.show(at: at, label: intent)
            let amount: Double = if case .number(let n)? = args?["magnitude_in_pixels"] { n } else { 300 }
            scroll(at, direction: args?["direction"]?.string ?? "down", pixels: Int32(amount))
        default:
            return .failure(.init(message: "This Mac can't do \(action) yet."))
        }
        return .success(["ok": true])
    }

    private static func point(_ args: JSONValue?, _ xKey: String, _ yKey: String) -> CGPoint {
        let frame = ScreenTool.lastFrame
        func value(_ key: String) -> Double {
            if case .number(let n)? = args?[key] { return min(999, max(0, n)) }
            return 500
        }
        return CGPoint(x: frame.minX + value(xKey) / 1000 * frame.width, y: frame.minY + value(yKey) / 1000 * frame.height)
    }

    // MARK: Mouse

    private static let source = CGEventSource(stateID: .hidSystemState)

    private static func mouse(_ type: CGEventType, _ at: CGPoint, button: CGMouseButton = .left, clickState: Int64 = 1) {
        let event = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: at, mouseButton: button)
        event?.setIntegerValueField(.mouseEventClickState, value: clickState)
        event?.post(tap: .cghidEventTap)
    }

    private static func click(_ at: CGPoint, button: CGMouseButton, count: Int) {
        mouse(.mouseMoved, at)
        let (down, up): (CGEventType, CGEventType) = switch button {
        case .right: (.rightMouseDown, .rightMouseUp)
        case .center: (.otherMouseDown, .otherMouseUp)
        default: (.leftMouseDown, .leftMouseUp)
        }
        for n in 1...count {
            mouse(down, at, button: button, clickState: Int64(n))
            mouse(up, at, button: button, clickState: Int64(n))
        }
    }

    private static func drag(from: CGPoint, to: CGPoint) {
        AgentCursor.shared.show(at: from, label: "")
        mouse(.mouseMoved, from)
        mouse(.leftMouseDown, from)
        for step in 1...12 {
            let t = CGFloat(step) / 12
            mouse(.leftMouseDragged, CGPoint(x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t))
        }
        mouse(.leftMouseUp, to)
        AgentCursor.shared.show(at: to, label: "")
    }

    private static func scroll(_ at: CGPoint, direction: String, pixels: Int32) {
        mouse(.mouseMoved, at)
        let (dy, dx): (Int32, Int32) = switch direction {
        case "up": (pixels, 0)
        case "left": (0, pixels)
        case "right": (0, -pixels)
        default: (-pixels, 0)
        }
        CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0)?
            .post(tap: .cghidEventTap)
    }

    // MARK: Keyboard

    private static func key(_ code: UInt16, down: Bool, flags: CGEventFlags = []) {
        let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down)
        event?.flags = flags
        event?.post(tap: .cghidEventTap)
    }

    private static func press(_ code: UInt16, flags: CGEventFlags = []) {
        key(code, down: true, flags: flags)
        key(code, down: false, flags: flags)
    }

    /// Text goes in as Unicode, a few characters per event, so any layout and any character works.
    private static func type(_ text: String) {
        for line in text.components(separatedBy: "\n").enumerated() {
            if line.offset > 0 { press(UInt16(kVK_Return)) }
            var chars = Array(line.element.utf16)[...]
            while !chars.isEmpty {
                let chunk = Array(chars.prefix(16))
                chars = chars.dropFirst(16)
                for down in [true, false] {
                    let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down)
                    event?.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
                    event?.post(tap: .cghidEventTap)
                }
            }
        }
    }

    private static func hotkey(_ keys: [String]) -> Bool {
        var flags: CGEventFlags = []
        var main: UInt16?
        for name in keys.map({ $0.lowercased() }) {
            switch name {
            case "cmd", "command", "meta", "super": flags.insert(.maskCommand)
            case "ctrl", "control": flags.insert(.maskControl)
            case "alt", "option": flags.insert(.maskAlternate)
            case "shift": flags.insert(.maskShift)
            case "fn": flags.insert(.maskSecondaryFn)
            default: main = keyCode(name)
            }
        }
        guard let main else { return false }
        press(main, flags: flags)
        return true
    }

    private static func keyCode(_ name: String) -> UInt16? {
        let named: [String: Int] = [
            "enter": kVK_Return, "return": kVK_Return, "tab": kVK_Tab, "space": kVK_Space, " ": kVK_Space,
            "backspace": kVK_Delete, "delete": kVK_Delete, "forwarddelete": kVK_ForwardDelete, "escape": kVK_Escape, "esc": kVK_Escape,
            "up": kVK_UpArrow, "arrowup": kVK_UpArrow, "down": kVK_DownArrow, "arrowdown": kVK_DownArrow,
            "left": kVK_LeftArrow, "arrowleft": kVK_LeftArrow, "right": kVK_RightArrow, "arrowright": kVK_RightArrow,
            "home": kVK_Home, "end": kVK_End, "pageup": kVK_PageUp, "pagedown": kVK_PageDown,
            "f1": kVK_F1, "f2": kVK_F2, "f3": kVK_F3, "f4": kVK_F4, "f5": kVK_F5, "f6": kVK_F6,
            "f7": kVK_F7, "f8": kVK_F8, "f9": kVK_F9, "f10": kVK_F10, "f11": kVK_F11, "f12": kVK_F12,
            "a": kVK_ANSI_A, "b": kVK_ANSI_B, "c": kVK_ANSI_C, "d": kVK_ANSI_D, "e": kVK_ANSI_E, "f": kVK_ANSI_F,
            "g": kVK_ANSI_G, "h": kVK_ANSI_H, "i": kVK_ANSI_I, "j": kVK_ANSI_J, "k": kVK_ANSI_K, "l": kVK_ANSI_L,
            "m": kVK_ANSI_M, "n": kVK_ANSI_N, "o": kVK_ANSI_O, "p": kVK_ANSI_P, "q": kVK_ANSI_Q, "r": kVK_ANSI_R,
            "s": kVK_ANSI_S, "t": kVK_ANSI_T, "u": kVK_ANSI_U, "v": kVK_ANSI_V, "w": kVK_ANSI_W, "x": kVK_ANSI_X,
            "y": kVK_ANSI_Y, "z": kVK_ANSI_Z, "0": kVK_ANSI_0, "1": kVK_ANSI_1, "2": kVK_ANSI_2, "3": kVK_ANSI_3,
            "4": kVK_ANSI_4, "5": kVK_ANSI_5, "6": kVK_ANSI_6, "7": kVK_ANSI_7, "8": kVK_ANSI_8, "9": kVK_ANSI_9,
            "-": kVK_ANSI_Minus, "=": kVK_ANSI_Equal, "[": kVK_ANSI_LeftBracket, "]": kVK_ANSI_RightBracket,
            ";": kVK_ANSI_Semicolon, "'": kVK_ANSI_Quote, ",": kVK_ANSI_Comma, ".": kVK_ANSI_Period, "/": kVK_ANSI_Slash,
            "\\": kVK_ANSI_Backslash, "`": kVK_ANSI_Grave,
        ]
        return named[name.lowercased()].map { UInt16($0) }
    }
}
