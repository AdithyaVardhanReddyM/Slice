import AppKit
import MapKit
import SwiftUI

/// The rich cards a task can carry (slice_mac `show_view`), and the why card.
struct TaskViewCard: View {
    let view: TaskView
    let agent: AgentSession
    /// The task's own title, so a card with the same one doesn't say it twice.
    var taskTitle: String?

    var body: some View {
        switch view.type {
        case "person": PersonCard(view: view)
        case "gifts": GiftsCard(view: view, showTitle: view.title != taskTitle)
        case "timeline": TimelineCard(view: view, showTitle: view.title != taskTitle)
        case "map": TasteMapCard(view: view)
        case "note": NoteCard(view: view)
        case "file": FileCard(view: view)
        case "why": if let why = view.why { WhyCard(why: why, agent: agent) }
        default: EmptyView()
        }
    }
}

// MARK: Person

/// Someone the user saved: who they are, what they love, how Qloo reads their taste.
private struct PersonCard: View {
    let view: TaskView

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(String((view.name ?? "?").prefix(1)))
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(.black)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Brand.squeeze))
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text(view.name ?? "")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                    if let about = about {
                        Text(about)
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.55))
                    }
                }
                if let home = view.home {
                    Label(home, systemImage: "house")
                        .font(.system(size: 11.5))
                        .foregroundStyle(.white.opacity(0.7))
                }
                if view.stepFree == true {
                    Label("Step-free places only", systemImage: "figure.roll")
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(Brand.yellow)
                }
                if let reads = view.readsAs, !reads.isEmpty {
                    Text("Reads as \(reads.prefix(3).map { $0.lowercased() }.joined(separator: ", "))")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.85))
                }
                if let loves = view.loves, !loves.isEmpty {
                    Chips(words: Array(loves.prefix(6)))
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var about: String? {
        let bits = [view.relation?.capitalized, view.age.map { "\($0)" }, view.birthday.map { "birthday \($0)" }].compactMap { $0 }
        return bits.isEmpty ? nil : bits.joined(separator: ", ")
    }
}

/// Small rounded labels that wrap onto new lines.
struct Chips: View {
    let words: [String]

    var body: some View {
        FlowLayout(spacing: 5) {
            ForEach(words, id: \.self) { word in
                Text(word)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(.white.opacity(0.1)))
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal.width ?? .infinity, subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (index, point) in arrange(bounds.width, subviews).points.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    private func arrange(_ width: CGFloat, _ subviews: Subviews) -> (points: [CGPoint], size: CGSize) {
        var points: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += row + spacing
                row = 0
            }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            row = max(row, size.height)
            widest = max(widest, x - spacing)
        }
        return (points, CGSize(width: widest, height: y + row))
    }
}

// MARK: Gifts

/// A gift shortlist: two columns, each idea with its picture, kind, price and why.
private struct GiftsCard: View {
    let view: TaskView
    var showTitle = true

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if showTitle, let title = view.title {
                CardHeading(symbol: "gift", text: title)
            }
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                let cards = view.cards ?? []
                ForEach(Array(stride(from: 0, to: cards.count, by: 2)), id: \.self) { i in
                    GridRow(alignment: .top) {
                        GiftTile(card: cards[i])
                        if i + 1 < cards.count { GiftTile(card: cards[i + 1]) } else { Color.clear.gridCellUnsizedAxes([.horizontal, .vertical]) }
                    }
                }
            }
        }
    }
}

private struct GiftTile: View {
    let card: TaskItem.Card

    var body: some View {
        Button {
            if let link = card.url, let url = URL(string: link) { NSWorkspace.shared.open(url) }
        } label: {
            HStack(alignment: .top, spacing: 9) {
                RemoteImage(url: card.image)
                    .frame(width: 52, height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 5) {
                        Text(card.title)
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        if let tag = card.tag {
                            Text(tag)
                                .font(.system(size: 9.5, weight: .bold))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1.5)
                                .background(Capsule().fill(Brand.yellow))
                        }
                    }
                    if let subtitle = card.subtitle {
                        Text(subtitle)
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.5))
                            .lineLimit(1)
                    }
                    if let reason = card.reason {
                        Text(reason)
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.75))
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(card.url.map { "Open \($0)" } ?? card.title)
    }
}

/// A row of picks: plain when they fit, scrolling when there are more.
struct PicksRow: View {
    let cards: [TaskItem.Card]

    var body: some View {
        let row = HStack(alignment: .top, spacing: 8) {
            ForEach(cards) { CardTile(card: $0) }
        }
        ViewThatFits(in: .horizontal) {
            row
            ScrollView(.horizontal) { row }.scrollIndicators(.never)
        }
    }
}

struct CardHeading: View {
    let symbol: String
    let text: String

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white.opacity(0.75))
            .lineLimit(1)
    }
}

// MARK: Timeline

private struct TimelineCard: View {
    let view: TaskView
    var showTitle = true

    private var stops: [TaskView.Stop] { view.stops ?? [] }

    private var pins: [MapPin] {
        stops.enumerated().compactMap { index, stop in
            guard let lat = stop.lat, let lon = stop.lon else { return nil }
            return MapPin(label: "\(index + 1)", name: nil, at: CLLocationCoordinate2D(latitude: lat, longitude: lon), weight: nil)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if showTitle, let title = view.title {
                CardHeading(symbol: "calendar", text: title)
            }
            if pins.count >= 2 {
                MapSnapshot(pins: pins, height: 96)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(stops.enumerated()), id: \.element.id) { index, stop in
                    StopRow(index: index, stop: stop, last: index == stops.count - 1)
                }
            }
        }
    }
}

private struct StopRow: View {
    let index: Int
    let stop: TaskView.Stop
    let last: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(stop.time ?? "")
                .font(.system(size: 12, weight: .semibold).monospacedDigit())
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 40, alignment: .leading)
            VStack(spacing: 0) {
                Text("\(index + 1)")
                    .font(.system(size: 9.5, weight: .heavy))
                    .foregroundStyle(.black)
                    .frame(width: 17, height: 17)
                    .background(Circle().fill(Brand.yellow))
                if !last {
                    Rectangle().fill(.white.opacity(0.18)).frame(width: 1.5).frame(maxHeight: .infinity)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: Self.symbol(stop.kind))
                        .font(.system(size: 10.5))
                        .foregroundStyle(.white.opacity(0.55))
                    Text(stop.title)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                if let line = subline {
                    Text(line)
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                }
            }
            .padding(.bottom, last ? 0 : 9)
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var subline: String? {
        var bits: [String] = []
        if let walk = stop.walkMin, walk > 0 { bits.append("\(walk) min walk") }
        if let with = stop.with { bits.append("with \(with)") }
        if let note = stop.note, !note.isEmpty { bits.append(note) }
        return bits.isEmpty ? nil : bits.joined(separator: ", ")
    }

    static func symbol(_ kind: String?) -> String {
        switch kind ?? "" {
        case "coffee", "cafe": "cup.and.saucer"
        case "bakery": "birthday.cake"
        case "record_store": "opticaldisc"
        case "bookstore": "book"
        case "museum": "building.columns"
        case "park": "leaf"
        case "restaurant", "dinner", "lunch": "fork.knife"
        case "bar", "cocktail_bar", "wine_bar": "wineglass"
        case "music_venue", "show", "concert": "music.mic"
        case "flight": "airplane"
        case "hotel": "bed.double"
        case "calendar", "meeting": "calendar"
        default: "mappin"
        }
    }
}

// MARK: Map

private struct TasteMapCard: View {
    let view: TaskView

    private var pins: [MapPin] {
        (view.areas ?? []).map { MapPin(label: nil, name: $0.name, at: CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon), weight: $0.weight) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CardHeading(symbol: "map", text: view.title ?? "Where your taste lives")
            if !pins.isEmpty {
                MapSnapshot(pins: pins, height: 150)
                Text("Your taste is strongest in " + Self.list(pins.prefix(3).compactMap(\.name)) + ".")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
    }

    static func list(_ names: [String]) -> String {
        switch names.count {
        case 0: ""
        case 1: names[0]
        default: names.dropLast().joined(separator: ", ") + " and " + names[names.count - 1]
        }
    }
}

struct MapPin: Equatable {
    /// A number for a stop, or nil for a taste area (drawn as a glow with its name).
    let label: String?
    let name: String?
    let at: CLLocationCoordinate2D
    let weight: Double?

    static func == (a: MapPin, b: MapPin) -> Bool {
        a.label == b.label && a.name == b.name && a.at.latitude == b.at.latitude && a.at.longitude == b.at.longitude
    }
}

/// A dark Apple Maps picture with pins drawn over it. Snapshots are cached, so a card that
/// redraws doesn't fetch the map again (and -renderIsland can prepare them first).
struct MapSnapshot: View {
    let pins: [MapPin]
    let height: CGFloat
    static let width: CGFloat = 436

    @State private var shot: MapShots.Shot?

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 10, style: .continuous).fill(.white.opacity(0.06))
            if let shot = shot ?? MapShots.cached(pins, size: size) {
                Image(nsImage: shot.image).resizable()
                ForEach(Array(pins.enumerated()), id: \.offset) { index, pin in
                    marker(pin).position(shot.points[index])
                }
            }
        }
        .frame(width: Self.width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .task(id: pins.map(\.at.latitude)) { shot = await MapShots.shot(pins, size: size) }
    }

    private var size: CGSize { CGSize(width: Self.width, height: height) }

    @ViewBuilder
    private func marker(_ pin: MapPin) -> some View {
        if let label = pin.label {
            Text(label)
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(.black)
                .frame(width: 18, height: 18)
                .background(Circle().fill(Brand.yellow))
                .overlay(Circle().strokeBorder(.black.opacity(0.6), lineWidth: 1))
        } else {
            ZStack {
                Circle()
                    .fill(RadialGradient(colors: [Brand.orange.opacity(0.75), Brand.orange.opacity(0)], center: .center, startRadius: 2, endRadius: 30))
                    .frame(width: 60 * (0.6 + 0.4 * (pin.weight ?? 1)), height: 60 * (0.6 + 0.4 * (pin.weight ?? 1)))
                Text(pin.name ?? "")
                    .font(.system(size: 10.5, weight: .bold))
                    .foregroundStyle(.white)
                    .shadow(color: .black, radius: 2)
                    .fixedSize()
            }
        }
    }
}

@MainActor
enum MapShots {
    struct Shot {
        let image: NSImage
        let points: [CGPoint]
    }

    private static var cache: [String: Shot] = [:]

    private static func key(_ pins: [MapPin], _ size: CGSize) -> String {
        pins.map { "\($0.at.latitude),\($0.at.longitude)" }.joined(separator: ";") + "@\(Int(size.width))x\(Int(size.height))"
    }

    static func cached(_ pins: [MapPin], size: CGSize) -> Shot? {
        cache[key(pins, size)]
    }

    static func shot(_ pins: [MapPin], size: CGSize) async -> Shot? {
        if let hit = cached(pins, size: size) { return hit }
        guard !pins.isEmpty else { return nil }
        let lats = pins.map(\.at.latitude), lons = pins.map(\.at.longitude)
        let span = MKCoordinateSpan(latitudeDelta: max(0.008, (lats.max()! - lats.min()!) * 1.6),
                                    longitudeDelta: max(0.012, (lons.max()! - lons.min()!) * 1.4))
        let options = MKMapSnapshotter.Options()
        options.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: (lats.max()! + lats.min()!) / 2,
                                                                           longitude: (lons.max()! + lons.min()!) / 2), span: span)
        options.size = size
        options.appearance = NSAppearance(named: .darkAqua)
        options.pointOfInterestFilter = .excludingAll
        guard let snapshot = try? await MKMapSnapshotter(options: options).start() else { return nil }
        // AppKit snapshots count y up from the bottom; SwiftUI counts down from the top.
        let shot = Shot(image: snapshot.image, points: pins.map {
            let p = snapshot.point(for: $0.at)
            return CGPoint(x: p.x, y: size.height - p.y)
        })
        cache[key(pins, size)] = shot
        return shot
    }

    #if DEBUG
    /// -renderIsland: fetch every map a set of views will draw, before ImageRenderer runs.
    static func prepare(_ views: [TaskView]) async {
        for view in views {
            if let stops = view.stops {
                let pins = stops.enumerated().compactMap { i, s in
                    s.lat.flatMap { lat in s.lon.map { MapPin(label: "\(i + 1)", name: nil, at: CLLocationCoordinate2D(latitude: lat, longitude: $0), weight: nil) } }
                }
                if pins.count >= 2 { _ = await shot(pins, size: CGSize(width: MapSnapshot.width, height: 96)) }
            }
            if let areas = view.areas {
                let pins = areas.map { MapPin(label: nil, name: $0.name, at: CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon), weight: $0.weight) }
                _ = await shot(pins, size: CGSize(width: MapSnapshot.width, height: 150))
            }
        }
    }
    #endif
}

// MARK: Note and file

private struct NoteCard: View {
    let view: TaskView
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                CardHeading(symbol: "text.quote", text: view.title ?? "Note")
                Spacer()
                Button(copied ? "Copied" : "Copy") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(view.text ?? "", forType: .string)
                    copied = true
                }
                .buttonStyle(IslandButtonStyle(primary: false))
            }
            Text(view.text ?? "")
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.92))
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            if let detail = view.detail {
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
    }
}

private struct FileCard: View {
    let view: TaskView

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "doc.richtext")
                .font(.system(size: 22))
                .foregroundStyle(Brand.yellow)
            VStack(alignment: .leading, spacing: 2) {
                Text(view.title ?? "File")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                if let detail = view.detail {
                    Text(detail)
                        .font(.system(size: 11.5))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
            Spacer()
            if let path = view.path {
                Button("Show") { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)]) }
                    .buttonStyle(IslandButtonStyle(primary: false))
                Button("Open") { NSWorkspace.shared.open(URL(fileURLWithPath: path)) }
                    .buttonStyle(IslandButtonStyle(primary: true))
            }
        }
    }
}

// MARK: Why

/// Why something fits a taste: the match, the loved things it shares words with, and what its
/// fans also love (with a play button for artists).
struct WhyCard: View {
    let why: Why
    let agent: AgentSession

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 10) {
                RemoteImage(url: why.thing.image)
                    .frame(width: 42, height: 42)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(why.thing.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if let match = why.match {
                        Label("\(match)% match for \(who)", systemImage: "touchid")
                            .font(.system(size: 11.5, weight: .semibold))
                            .foregroundStyle(Brand.yellow)
                    }
                }
                Spacer(minLength: 0)
                if why.thing.kind == "artist" {
                    PlayButton(name: why.thing.name, agent: agent)
                }
            }
            Text(why.line)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)
            if let shared = why.shared, !shared.isEmpty {
                Chips(words: shared.prefix(4).map { tag in
                    tag.with.first.map { "\(tag.name), like \($0)" } ?? tag.name
                })
            }
            if let also = why.also, !also.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Fans of it also love")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.5))
                    HStack(spacing: 8) {
                        ForEach(also.prefix(3)) { item in
                            HStack(spacing: 6) {
                                Text(item.name)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.9))
                                    .lineLimit(1)
                                if item.kind == "artist" {
                                    PlayButton(name: item.name, agent: agent, small: true)
                                }
                            }
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(Capsule().fill(.white.opacity(0.08)))
                        }
                    }
                }
            }
        }
    }

    private var who: String {
        guard let person = why.for, person != "you" else { return "you" }
        return person
    }
}

private struct PlayButton: View {
    let name: String
    let agent: AgentSession
    var small = false

    var body: some View {
        Button {
            agent.runTool("music_open", args: ["query": .string(name)])
        } label: {
            Image(systemName: "play.fill")
                .font(.system(size: small ? 8 : 11, weight: .bold))
                .foregroundStyle(.black)
                .frame(width: small ? 16 : 26, height: small ? 16 : 26)
                .background(Circle().fill(Brand.yellow))
        }
        .buttonStyle(.plain)
        .help("Play \(name)")
    }
}

/// A nudge in the open island: a why card, or a birthday with "Sort it".
struct NudgeCard: View {
    let nudge: Nudge
    let agent: AgentSession

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: nudge.kind == "birthday" ? "gift.fill" : "touchid")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Brand.yellow)
                Text(nudge.kind == "why" ? (nudge.show ? "Why it fits" : "Very you") : nudge.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer()
                IconButton(symbol: "xmark", help: "Dismiss") { agent.dismissNudge() }
            }
            if let why = nudge.why {
                WhyCard(why: why, agent: agent)
            } else {
                Text(nudge.line)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
                if let action = nudge.action, nudge.prompt != nil {
                    HStack {
                        Spacer()
                        Button("Not now") { agent.dismissNudge() }
                            .buttonStyle(IslandButtonStyle(primary: false))
                        Button(action) { agent.act(on: nudge) }
                            .buttonStyle(IslandButtonStyle(primary: true))
                    }
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.08)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Brand.yellow.opacity(0.35), lineWidth: 1))
    }
}

// MARK: Images

/// A remote picture with an in-memory cache (AsyncImage refetches whenever the island redraws,
/// and draws nothing in ImageRenderer; -renderIsland prefetches these instead).
struct RemoteImage: View {
    let url: String?
    @State private var image: NSImage?

    var body: some View {
        ZStack {
            Rectangle().fill(.white.opacity(0.08))
            if let image = image ?? url.flatMap(ImageCache.cached) {
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                SliceMark(height: 12).opacity(0.5)
            }
        }
        .task(id: url) {
            if let url { image = await ImageCache.load(url) }
        }
    }
}

@MainActor
enum ImageCache {
    private static var images: [String: NSImage] = [:]

    static func cached(_ url: String) -> NSImage? { images[url] }

    static func load(_ link: String) async -> NSImage? {
        if let hit = images[link] { return hit }
        guard let url = URL(string: link), let (data, _) = try? await URLSession.shared.data(from: url),
              let image = NSImage(data: data) else { return nil }
        images[link] = image
        return image
    }
}
