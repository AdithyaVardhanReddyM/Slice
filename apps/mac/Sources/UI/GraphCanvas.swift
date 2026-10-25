import AppKit
import SwiftUI

/// One thing on a graph canvas: the taste graph (Settings > Taste) or the memory graph
/// (Settings > Memory).
struct GraphNode: Identifiable, Equatable {
    enum Style: String {
        case you, love, tag, person, pick, dislike, hub, fact
        case theirLove = "their_love"
    }

    let id: String
    var label: String
    var style: Style
    /// artist, movie, …; a tag's family; a person's relation; a hub's SF Symbol.
    var kind: String?
    var image: String?
    var weight: Double = 1
    var detail: String?
    /// The filter chip it belongs to: music, screen, books, brands, places.
    var group: String?
    /// The node as the brain (or the profile) gave it, for the inspector.
    var raw: JSONValue = .null

    var isCapsule: Bool { style == .tag || style == .fact }

    /// Half the node's size, for spacing and hit areas.
    var radius: CGFloat {
        switch style {
        case .you: 34
        case .love: 20 + 8 * CGFloat(min(max(weight - 1, -0.5), 0.5))
        case .person: 22
        case .pick: 19
        case .theirLove: 15
        case .dislike: 14
        case .hub: 25
        case .tag, .fact: min(CGFloat(label.count) * 3.3 + 12, 92)
        }
    }

    /// How far its label reaches below a round node.
    var labelDrop: CGFloat { isCapsule ? 0 : 20 }
}

struct GraphEdge: Hashable {
    let a: String
    let b: String
    let style: String
}

/// A force-directed layout on rings: the user's own node holds the middle, each kind of node is
/// drawn to its own ring (loves inside, the threads between them around those, next picks and
/// people outside; hubs and their leaves for memory), nodes push apart and edges pull their
/// ends round to the same side. It animates for a couple of seconds after a change, and
/// settles at once for rendering (`settle`).
@MainActor
@Observable
final class GraphLayout {
    private(set) var nodes: [GraphNode] = []
    private(set) var edges: [GraphEdge] = []
    private(set) var positions: [String: CGPoint] = [:]
    /// Each node's neighbours, for lighting up what's tied to the one under the pointer.
    private(set) var neighbours: [String: Set<String>] = [:]

    @ObservationIgnored private var velocity: [String: CGVector] = [:]
    /// How far from the middle each node belongs (from the plan); a pull keeps it there.
    @ObservationIgnored private var targets: [String: CGFloat] = [:]
    @ObservationIgnored private var heat: CGFloat = 1
    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private var dragging: String?

    func node(_ id: String) -> GraphNode? { nodes.first { $0.id == id } }

    func update(nodes: [GraphNode], edges: [GraphEdge], animate: Bool = true) {
        let ids = Set(nodes.map(\.id))
        let edges = edges.filter { ids.contains($0.a) && ids.contains($0.b) && $0.a != $0.b }
        var around: [String: Set<String>] = [:]
        for e in edges {
            around[e.a, default: []].insert(e.b)
            around[e.b, default: []].insert(e.a)
        }
        var placed = positions.filter { ids.contains($0.key) }
        if nodes.contains(where: { placed[$0.id] == nil }) {
            // New nodes start where the radial plan puts them; ones already shown stay put.
            let plan = nodes.contains { $0.style == .hub } ? Self.memoryPlan(nodes, around: around)
                : Self.plan(nodes, around: around, rings: Self.rings(for: nodes))
            for (id, point) in plan where placed[id] == nil {
                placed[id] = point
                targets[id] = sqrt(point.x * point.x + point.y * point.y)
            }
        }
        self.nodes = nodes
        self.edges = edges
        neighbours = around
        positions = placed
        velocity = velocity.filter { ids.contains($0.key) }
        targets = targets.filter { ids.contains($0.key) }
        heat = 1
        if animate { start() } else { settle() }
    }

    /// Run the layout to rest without animating (for -renderSettings and first draws).
    func settle(steps: Int = 420) {
        loop?.cancel()
        heat = 1
        for _ in 0..<steps where heat > 0.01 { step() }
    }

    func drag(_ id: String, to point: CGPoint) {
        guard node(id)?.style != .you else { return }
        dragging = id
        positions[id] = point
        velocity[id] = .zero
        heat = max(heat, 0.35)
        if loop == nil { start() }
    }

    func endDrag() {
        dragging = nil
    }

    /// The box the nodes sit in, for fitting the view.
    var bounds: CGRect {
        let points = nodes.compactMap { n in positions[n.id].map { (n, $0) } }
        guard let first = points.first else { return .zero }
        var box = CGRect(origin: first.1, size: .zero)
        for (n, p) in points {
            box = box.union(CGRect(x: p.x - n.radius, y: p.y - n.radius, width: n.radius * 2, height: n.radius * 2 + n.labelDrop))
        }
        return box
    }

    private func start() {
        loop?.cancel()
        loop = Task { [weak self] in
            for _ in 0..<360 {
                guard let self, !Task.isCancelled else { return }
                self.step()
                if self.heat < 0.015, self.dragging == nil { break }
                try? await Task.sleep(for: .milliseconds(16))
            }
            self?.loop = nil
        }
    }

    // MARK: Forces

    /// How much room a node takes along its ring: its circle or capsule, or its label if wider.
    private static func span(_ n: GraphNode) -> CGFloat {
        n.isCapsule ? n.radius * 2 + 14 : max(n.radius * 2, 84) + 8
    }

    /// How far from the middle each kind sits: far enough out that everything on a ring fits
    /// side by side, and each ring clear of the one inside it.
    private static func rings(for nodes: [GraphNode]) -> [GraphNode.Style: CGFloat] {
        func fit(_ styles: Set<GraphNode.Style>, atLeast: CGFloat) -> CGFloat {
            let around = nodes.filter { styles.contains($0.style) }.reduce(0) { $0 + span($1) }
            return max(atLeast, around / (2 * .pi) * 1.08)
        }
        let love = fit([.love], atLeast: 120)
        let tag = fit([.tag], atLeast: love + 105)
        let pick = fit([.pick, .dislike], atLeast: tag + 70)
        let person = fit([.person], atLeast: pick + 62)
        return [.love: love, .tag: tag, .pick: pick, .dislike: pick, .person: person, .theirLove: person + 80, .hub: love, .fact: tag]
    }

    /// Memory: hubs (and people, who are hubs of what's known about them) evenly round the middle,
    /// each fanning its leaves out across its own slice, staggered so wide labels clear each other.
    private static func memoryPlan(_ nodes: [GraphNode], around: [String: Set<String>]) -> [String: CGPoint] {
        let hubs = nodes.filter { $0.style == .hub || $0.style == .person }
        let inner = max(150, hubs.reduce(0) { $0 + span($1) } / (2 * .pi) * 1.1)
        var out: [String: CGPoint] = ["you": .zero]
        let slice = 2 * .pi / CGFloat(max(hubs.count, 1))
        var taken = Set(hubs.map(\.id))
        for (i, hub) in hubs.enumerated() {
            let a = CGFloat(i) * slice - .pi / 2
            out[hub.id] = CGPoint(x: cos(a) * inner, y: sin(a) * inner)
            let leaves = nodes.filter { around[hub.id, default: []].contains($0.id) && !taken.contains($0.id) && $0.style != .you }
            taken.formUnion(leaves.map(\.id))
            let fan = slice * 0.86
            for (j, leaf) in leaves.enumerated() {
                let t = leaves.count == 1 ? 0.5 : CGFloat(j) / CGFloat(leaves.count - 1)
                let la = a - fan / 2 + fan * t
                let r = inner + 120 + (j % 2 == 0 ? 0 : 58) + (leaves.count > 5 && j % 4 >= 2 ? 30 : 0)
                out[leaf.id] = CGPoint(x: cos(la) * r, y: sin(la) * r)
            }
        }
        for (i, n) in nodes.enumerated() where out[n.id] == nil {
            let a = Self.angle(n.id, i)
            out[n.id] = CGPoint(x: cos(a) * (inner + 140), y: sin(a) * (inner + 140))
        }
        return out
    }

    /// Where everything starts: the inner ring (loves, or memory's hubs) evenly round the middle,
    /// grouped by kind; everything else at the average angle of what it's tied to on the inside;
    /// then each ring spread so nothing on it overlaps.
    private static func plan(_ nodes: [GraphNode], around: [String: Set<String>], rings: [GraphNode.Style: CGFloat]) -> [String: CGPoint] {
        let memory = nodes.contains { $0.style == .hub }
        var angle: [String: CGFloat] = [:]
        let inner = nodes.filter { memory ? ($0.style == .hub || $0.style == .person) : $0.style == .love }
            .sorted { ($0.group ?? "~", $0.label) < ($1.group ?? "~", $1.label) }
        for (i, n) in inner.enumerated() {
            angle[n.id] = CGFloat(i) / CGFloat(max(inner.count, 1)) * 2 * .pi - .pi / 2
        }
        let rest = nodes.filter { $0.style != .you && angle[$0.id] == nil }
        for _ in 0..<3 {
            for n in rest where angle[n.id] == nil {
                let tied = around[n.id, default: []].compactMap { angle[$0] }
                if !tied.isEmpty {
                    let x = tied.reduce(0) { $0 + cos($1) }, y = tied.reduce(0) { $0 + sin($1) }
                    angle[n.id] = abs(x) + abs(y) < 0.001 ? tied[0] : atan2(y, x)
                }
            }
        }
        let loose = rest.filter { angle[$0.id] == nil }
        for (i, n) in loose.enumerated() {
            angle[n.id] = (CGFloat(i) + 0.5) / CGFloat(loose.count) * 2 * .pi - .pi / 2
        }
        // Spread each ring: neighbours at least their half-widths apart, scaled down if the ring is full.
        let byRing = Dictionary(grouping: nodes.filter { $0.style != .you }) { rings[$0.style] ?? 200 }
        var out: [String: CGPoint] = ["you": .zero]
        for (radius, members) in byRing {
            var ordered = members.sorted { (angle[$0.id] ?? 0) < (angle[$1.id] ?? 0) }.map { ($0, angle[$0.id] ?? 0) }
            let count = ordered.count
            if count > 1 {
                var gaps = (0..<count).map { i in (span(ordered[i].0) + span(ordered[(i + 1) % count].0)) / 2 / radius }
                let total = gaps.reduce(0, +)
                if total > 2 * .pi { gaps = gaps.map { $0 * 2 * .pi / total } }
                for _ in 0..<80 {
                    var moved = false
                    for i in 0..<count {
                        let j = (i + 1) % count
                        var diff = ordered[j].1 - ordered[i].1
                        if j == 0 { diff += 2 * .pi }
                        if diff < gaps[i] - 0.001 {
                            let push = (gaps[i] - diff) / 2
                            ordered[i].1 -= push
                            ordered[j].1 += push
                            moved = true
                        }
                    }
                    if !moved { break }
                }
            }
            for (n, a) in ordered { out[n.id] = CGPoint(x: cos(a) * radius, y: sin(a) * radius) }
        }
        return out
    }

    /// A stable angle per node, so the same graph lays out the same way each time.
    private static func angle(_ id: String, _ index: Int) -> CGFloat {
        let hash = id.unicodeScalars.reduce(UInt32(5381)) { ($0 &* 33) &+ $1.value }
        return CGFloat(index) * 2.39996 + CGFloat(hash % 628) / 100
    }

    /// How far a node reaches towards a neighbour in direction (dx, dy): half its width side to
    /// side, half its height (with the label under a round node) above and below.
    private static func reach(_ n: GraphNode, _ dx: CGFloat, _ dy: CGFloat, _ d: CGFloat) -> CGFloat {
        let (w, h): (CGFloat, CGFloat) = n.isCapsule ? (n.radius, 13) : (max(n.radius, 42), n.radius + n.labelDrop / 2 + 4)
        return abs(dx) / d * w + abs(dy) / d * h
    }

    private static func push(_ style: GraphNode.Style) -> CGFloat {
        switch style {
        case .you: 92
        case .love, .person, .hub: 62
        case .pick: 54
        case .tag, .fact: 50
        case .theirLove, .dislike: 40
        }
    }

    private static func spring(_ style: String) -> (rest: CGFloat, k: CGFloat) {
        switch style {
        case "loves": (150, 0.02)
        case "carries": (110, 0.012)
        case "knows": (250, 0.008)
        case "their": (80, 0.03)
        case "shares": (150, 0.006)
        case "common": (160, 0.005)
        case "because": (100, 0.02)
        case "not": (150, 0.01)
        case "hub": (150, 0.02)
        case "leaf": (135, 0.03)
        default: (120, 0.02)
        }
    }

    private func step() {
        var force: [String: CGVector] = [:]
        var pos = positions
        let list = nodes.filter { pos[$0.id] != nil }
        for i in 0..<list.count {
            for j in (i + 1)..<list.count {
                let a = list[i], b = list[j]
                let pa = pos[a.id]!, pb = pos[b.id]!
                var dx = pb.x - pa.x, dy = pb.y - pa.y
                if abs(dx) + abs(dy) < 0.5 { dx = 0.7; dy = 0.4 }
                let d2 = max(dx * dx + dy * dy, 1)
                let d = sqrt(d2)
                var f = Self.push(a.style) * Self.push(b.style) / d2 * (dragging == nil ? 0.15 : 0.5)
                // Keep clear of each other's whole shape: a round node with its label is wide, a
                // capsule wide and short.
                let gap = Self.reach(a, dx, dy, d) + Self.reach(b, dx, dy, d) + 10
                if d < gap { f += (gap - d) * 0.4 }
                let v = CGVector(dx: dx / d * f, dy: dy / d * f)
                force[a.id, default: .zero].dx -= v.dx
                force[a.id, default: .zero].dy -= v.dy
                force[b.id, default: .zero].dx += v.dx
                force[b.id, default: .zero].dy += v.dy
            }
        }
        // Edges pull only while something is dragged, so the rest follow it; otherwise the plan holds.
        for e in edges where dragging != nil {
            guard let pa = pos[e.a], let pb = pos[e.b] else { continue }
            let (rest, k) = Self.spring(e.style)
            let dx = pb.x - pa.x, dy = pb.y - pa.y
            let d = max(sqrt(dx * dx + dy * dy), 0.01)
            let f = (d - rest) * k
            let v = CGVector(dx: dx / d * f, dy: dy / d * f)
            force[e.a, default: .zero].dx += v.dx
            force[e.a, default: .zero].dy += v.dy
            force[e.b, default: .zero].dx -= v.dx
            force[e.b, default: .zero].dy -= v.dy
        }
        for n in list where n.style != .you && n.id != dragging {
            let p = pos[n.id]!
            var f = force[n.id] ?? .zero
            // Each kind keeps to its ring, so the picture reads from the middle out.
            let r = max(sqrt(p.x * p.x + p.y * p.y), 0.01)
            let pull = ((targets[n.id] ?? r) - r) * 0.08
            f.dx += p.x / r * pull
            f.dy += p.y / r * pull
            var v = velocity[n.id] ?? .zero
            v.dx = (v.dx + f.dx) * 0.78
            v.dy = (v.dy + f.dy) * 0.78
            let speed = sqrt(v.dx * v.dx + v.dy * v.dy)
            let limit = 24 * heat + 0.5
            if speed > limit {
                v.dx *= limit / speed
                v.dy *= limit / speed
            }
            velocity[n.id] = v
            pos[n.id] = CGPoint(x: p.x + v.dx, y: p.y + v.dy)
        }
        if let you = list.first(where: { $0.style == .you }) { pos[you.id] = .zero }
        positions = pos
        heat *= 0.986
    }
}

// MARK: The canvas

/// Draws a GraphLayout on a dark field (the island's black, so loves and tags glow): drag a
/// node to move it, drag the field to pan, pinch or use the buttons to zoom, hover to light up
/// what a node is tied to, click to select it.
struct GraphCanvas: View {
    let layout: GraphLayout
    @Binding var selection: String?
    var hidden: Set<String> = []
    var interactive = true
    var showLegend = true
    /// Fixed zoom (rendering, onboarding); nil fits the graph to the view.
    var fixedScale: CGFloat?

    @State private var pan: CGSize = .zero
    @State private var panStart: CGSize?
    @State private var zoom: CGFloat = 1
    @State private var zoomStart: CGFloat?
    @State private var hover: String?

    var body: some View {
        GeometryReader { geo in
            let scale = fixedScale ?? fitScale(geo.size) * zoom
            let mid = fitCenter()
            let origin = CGPoint(x: geo.size.width / 2 + pan.width - mid.x * scale, y: geo.size.height / 2 + pan.height - mid.y * scale)
            let focus = hover ?? selection
            let lit: Set<String>? = focus.map { layout.neighbours[$0, default: []].union([$0]) }
            let nodeScale = min(1.1, max(0.72, scale))
            ZStack {
                GraphField()
                    .contentShape(Rectangle())
                    .gesture(panGesture, including: interactive ? .all : .none)
                    .onTapGesture { if interactive { selection = nil } }
                Canvas { ctx, _ in
                    for e in layout.edges where !hidden.contains(e.a) && !hidden.contains(e.b) {
                        guard let pa = layout.positions[e.a], let pb = layout.positions[e.b] else { continue }
                        var path = Path()
                        path.move(to: CGPoint(x: origin.x + pa.x * scale, y: origin.y + pa.y * scale))
                        path.addLine(to: CGPoint(x: origin.x + pb.x * scale, y: origin.y + pb.y * scale))
                        let look = EdgeLook(e.style)
                        let on = focus != nil && (e.a == focus || e.b == focus)
                        let color = on ? Brand.yellow.opacity(0.85) : look.color.opacity(lit == nil ? look.opacity : look.opacity * 0.3)
                        ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: on ? 1.6 : look.width, lineCap: .round, dash: look.dash))
                    }
                }
                .allowsHitTesting(false)
                ForEach(layout.nodes.filter { !hidden.contains($0.id) }) { node in
                    if let p = layout.positions[node.id] {
                        GraphNodeView(node: node, selected: selection == node.id, dimmed: lit.map { !$0.contains(node.id) } ?? false)
                            .scaleEffect(nodeScale)
                            .position(x: origin.x + p.x * scale, y: origin.y + p.y * scale)
                            .onTapGesture { if interactive { selection = node.id } }
                            .onHover { inside in
                                if inside { hover = node.id } else if hover == node.id { hover = nil }
                            }
                            .gesture(nodeDrag(node, origin: origin, scale: scale), including: interactive ? .all : .none)
                            .help(node.detail ?? node.label)
                    }
                }
            }
            .coordinateSpace(name: "graph")
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .simultaneousGesture(MagnifyGesture()
                .onChanged { value in
                    guard interactive else { return }
                    zoomStart = zoomStart ?? zoom
                    zoom = min(3, max(0.4, (zoomStart ?? 1) * value.magnification))
                }
                .onEnded { _ in zoomStart = nil })
            .overlay(alignment: .bottomTrailing) {
                if interactive {
                    HStack(spacing: 2) {
                        CanvasButton(symbol: "minus", help: "Zoom out") { withAnimation(.snappy) { zoom = max(0.4, zoom / 1.25) } }
                        CanvasButton(symbol: "plus", help: "Zoom in") { withAnimation(.snappy) { zoom = min(3, zoom * 1.25) } }
                        CanvasButton(symbol: "arrow.up.left.and.down.right.and.arrow.up.right.and.down.left", help: "Fit") {
                            withAnimation(.snappy) { zoom = 1; pan = .zero }
                        }
                    }
                    .padding(10)
                }
            }
            .overlay(alignment: .bottomLeading) {
                if showLegend { GraphLegend(nodes: layout.nodes).padding(12) }
            }
        }
    }

    private func fitCenter() -> CGPoint {
        let box = layout.bounds
        return box == .zero ? .zero : CGPoint(x: box.midX, y: box.midY)
    }

    private func fitScale(_ size: CGSize) -> CGFloat {
        let box = layout.bounds
        guard box.width > 1, box.height > 1 else { return 1 }
        return min(1.2, max(0.45, min((size.width - 80) / (box.width + 60), (size.height - 70) / (box.height + 60))))
    }

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                panStart = panStart ?? pan
                pan = CGSize(width: (panStart?.width ?? 0) + value.translation.width, height: (panStart?.height ?? 0) + value.translation.height)
            }
            .onEnded { _ in panStart = nil }
    }

    private func nodeDrag(_ node: GraphNode, origin: CGPoint, scale: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 3, coordinateSpace: .named("graph"))
            .onChanged { value in
                layout.drag(node.id, to: CGPoint(x: (value.location.x - origin.x) / scale, y: (value.location.y - origin.y) / scale))
            }
            .onEnded { _ in layout.endDrag() }
    }
}

private struct EdgeLook {
    let color: Color
    let opacity: Double
    let width: CGFloat
    let dash: [CGFloat]

    init(_ style: String) {
        switch style {
        case "loves": (color, opacity, width, dash) = (.white, 0.22, 1.2, [])
        case "carries": (color, opacity, width, dash) = (Brand.sand, 0.28, 1, [])
        case "knows": (color, opacity, width, dash) = (.white, 0.2, 1, [4, 4])
        case "their": (color, opacity, width, dash) = (.white, 0.16, 1, [])
        case "shares": (color, opacity, width, dash) = (Brand.orange, 0.5, 1.3, [])
        case "common": (color, opacity, width, dash) = (Brand.orange, 0.3, 1, [2, 4])
        case "because": (color, opacity, width, dash) = (Brand.yellow, 0.4, 1, [3, 4])
        case "not": (color, opacity, width, dash) = (GraphPalette.no, 0.35, 1, [2, 3])
        case "hub": (color, opacity, width, dash) = (.white, 0.24, 1.2, [])
        case "leaf": (color, opacity, width, dash) = (Brand.sand, 0.26, 1, [])
        default: (color, opacity, width, dash) = (.white, 0.18, 1, [])
        }
    }
}

enum GraphPalette {
    static let field = Color(red: 0.055, green: 0.055, blue: 0.06)
    static let no = Color(red: 1, green: 0.42, blue: 0.36)
    static let places = Color(red: 0.62, green: 0.86, blue: 0.78)

    /// The filter group of a Qloo kind.
    static func group(_ kind: String?) -> String? {
        switch kind {
        case "artist", "album", "podcast": "music"
        case "movie", "tv_show": "screen"
        case "book", "author": "books"
        case "brand": "brands"
        case "place", "destination": "places"
        default: nil
        }
    }

    static func color(group: String?) -> Color {
        switch group {
        case "music": Brand.yellow
        case "screen": Brand.orange
        case "books": Brand.sand
        case "brands": Brand.amber
        case "places": places
        default: .white.opacity(0.7)
        }
    }

    static let groups: [(id: String, name: String)] = [
        ("music", "Music"), ("screen", "Film & TV"), ("books", "Books"), ("brands", "Brands"), ("places", "Places"),
    ]
}

/// The dark field with a faint dot grid.
private struct GraphField: View {
    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(GraphPalette.field))
            let step: CGFloat = 22
            var dots = Path()
            var y: CGFloat = step / 2
            while y < size.height {
                var x: CGFloat = step / 2
                while x < size.width {
                    dots.addEllipse(in: CGRect(x: x - 0.7, y: y - 0.7, width: 1.4, height: 1.4))
                    x += step
                }
                y += step
            }
            ctx.fill(dots, with: .color(.white.opacity(0.07)))
        }
    }
}

struct GraphNodeView: View {
    let node: GraphNode
    var selected = false
    var dimmed = false

    var body: some View {
        Group {
            if node.isCapsule {
                capsule
            } else {
                round
                    .overlay(alignment: .top) {
                        Text(node.label)
                            .font(.system(size: node.style == .you ? 12.5 : 10.5, weight: node.style == .you || node.style == .person ? .semibold : .medium))
                            .foregroundStyle(.white.opacity(node.style == .theirLove || node.style == .dislike ? 0.6 : 0.92))
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .frame(width: 88)
                            .shadow(color: .black, radius: 3)
                            .offset(y: node.radius * 2 + 4)
                            .allowsHitTesting(false)
                    }
            }
        }
        .opacity(dimmed ? 0.28 : 1)
        .animation(.easeOut(duration: 0.15), value: dimmed)
    }

    private var ring: Color {
        switch node.style {
        case .you: Brand.yellow
        case .dislike: GraphPalette.no
        case .person: .white.opacity(0.7)
        case .hub: Brand.sand
        default: GraphPalette.color(group: node.group)
        }
    }

    @ViewBuilder private var round: some View {
        let size = node.radius * 2
        ZStack {
            switch node.style {
            case .you:
                Circle().fill(Brand.squeeze)
                if let initial = node.label.first, node.label != "You" {
                    Text(String(initial)).font(.system(size: 26, weight: .bold)).foregroundStyle(.black.opacity(0.8))
                } else {
                    SliceMark(height: 20).colorMultiply(.black)
                }
            case .person:
                Circle().fill(.white.opacity(0.12))
                Text(Self.initials(node.label)).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
            case .hub:
                Circle().fill(.white.opacity(0.1))
                Image(systemName: node.kind ?? "circle").font(.system(size: 17, weight: .semibold)).foregroundStyle(Brand.sand)
            default:
                if node.image != nil {
                    RemoteImage(url: node.image)
                        .saturation(node.style == .dislike ? 0 : 1)
                } else {
                    Circle().fill(.white.opacity(0.1))
                    Text(Self.initials(node.label)).font(.system(size: size * 0.32, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            if node.style == .pick {
                Circle().strokeBorder(Brand.yellow, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
            } else if node.style != .you {
                Circle().strokeBorder(ring.opacity(node.style == .theirLove ? 0.5 : 0.95), lineWidth: node.style == .love ? 2 : 1.5)
            }
        }
        .overlay {
            if selected {
                Circle().strokeBorder(.white, lineWidth: 2).padding(-4)
            }
        }
        .opacity(node.style == .pick ? 0.92 : (node.style == .dislike ? 0.7 : 1))
        .shadow(color: node.style == .you ? Brand.orange.opacity(0.55) : .clear, radius: 18)
    }

    private var capsule: some View {
        let isTag = node.style == .tag
        return Text(node.label)
            .font(.system(size: isTag ? 11 : 11.5, weight: .medium))
            .foregroundStyle(isTag ? Brand.sand : .white.opacity(0.9))
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .frame(maxWidth: 190)
            .background(Capsule().fill(isTag ? Brand.sand.opacity(0.1) : .white.opacity(0.08)))
            .overlay(Capsule().strokeBorder(selected ? .white : (isTag ? Brand.sand.opacity(0.35) : .white.opacity(0.18)), lineWidth: selected ? 1.5 : 1))
            .fixedSize()
    }

    static func initials(_ name: String) -> String {
        let words = name.split(separator: " ").prefix(2)
        return words.compactMap(\.first).map(String.init).joined().uppercased()
    }
}

private struct GraphLegend: View {
    let nodes: [GraphNode]

    var body: some View {
        let present = Set(nodes.compactMap(\.group))
        let hasPicks = nodes.contains { $0.style == .pick }
        HStack(spacing: 10) {
            ForEach(GraphPalette.groups.filter { present.contains($0.id) }, id: \.id) { g in
                HStack(spacing: 4) {
                    Circle().fill(GraphPalette.color(group: g.id)).frame(width: 7, height: 7)
                    Text(g.name)
                }
            }
            if hasPicks {
                HStack(spacing: 4) {
                    Circle().strokeBorder(Brand.yellow, style: StrokeStyle(lineWidth: 1.2, dash: [2, 2])).frame(width: 8, height: 8)
                    Text("Next for you")
                }
            }
        }
        .font(.system(size: 10.5, weight: .medium))
        .foregroundStyle(.white.opacity(0.6))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(.black.opacity(0.55)))
    }
}

private struct CanvasButton: View {
    let symbol: String
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.8))
                .frame(width: 26, height: 24)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(.white.opacity(0.1)))
        }
        .buttonStyle(.plain)
        .help(help)
    }
}
