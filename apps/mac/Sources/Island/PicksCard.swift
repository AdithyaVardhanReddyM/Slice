import AppKit
import SwiftUI

/// The talker's quick picks (a film, a song, a book, a place) as a card under its answer: white
/// on the black island, like a widget. The first pick is large, with its picture, why it fits and
/// the one thing to do with it (play, trailer, directions); the other two sit below, and clicking
/// one brings it up top.
struct PicksCard: View {
    let picks: Picks
    let agent: AgentSession
    @State private var chosen = 0

    var body: some View {
        let items = picks.items
        let top = min(chosen, max(items.count - 1, 0))
        VStack(alignment: .leading, spacing: 14) {
            header
            if items.indices.contains(top) {
                HeroPick(item: items[top], kind: picks.kind, genre: picks.genre, popular: picks.taste == "popular", agent: agent)
                    .id(items[top].id)
                    .transition(.opacity)
            }
            if items.count > 1 {
                Rectangle().fill(Paper.line).frame(height: 1)
                HStack(spacing: 8) {
                    ForEach(Array(items.enumerated()).filter { $0.offset != top }, id: \.element.id) { index, item in
                        MiniPick(item: item, kind: picks.kind) {
                            withAnimation(.snappy(duration: 0.22)) { chosen = index }
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Paper.card))
        // Its own height, however tall the conversation around it is.
        .fixedSize(horizontal: false, vertical: true)
        .environment(\.colorScheme, .light)
        .animation(.easeOut(duration: 0.25), value: picks)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: PickLook.symbol(picks.kind, genre: picks.genre))
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 20, height: 20)
                .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Paper.accent))
            Text(picks.title.uppercased())
                .font(.system(size: 11.5, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(Paper.ink2)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(picks.taste == "popular" ? "Popular" : "Your taste")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Paper.ink2)
                .padding(.horizontal, 9)
                .frame(height: 22)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Paper.fill))
        }
    }
}

/// The card's own colours: it's always white, whatever the island or the app's theme.
enum Paper {
    static let card = Color.white
    static let ink = Color(hex: 0x0D1220)
    static let ink2 = Color(hex: 0x5D6679)
    static let ink3 = Color(hex: 0x98A1B3)
    static let line = Color(hex: 0x0D1220, alpha: 0.08)
    static let fill = Color(hex: 0x0D1220, alpha: 0.05)
    static let accent = Color(hex: 0x2E7BFF)
    static let accentSoft = Color(hex: 0x2E7BFF, alpha: 0.1)
    static let good = Color(hex: 0x14A363)
}

/// The first pick: the picture, the name, what it is, why it fits, a line about it, and what to do.
private struct HeroPick: View {
    let item: Picks.Item
    let kind: String
    let genre: String?
    let popular: Bool
    let agent: AgentSession

    var body: some View {
        let (title, subtitle) = PickLook.split(item.name, kind: item.kind ?? kind)
        HStack(alignment: .top, spacing: 14) {
            PickArtwork(item: item, kind: item.kind ?? kind, size: 116)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: 21, weight: .bold))
                    .tracking(-0.4)
                    .foregroundStyle(Paper.ink)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle ?? PickLook.meta(item, kind: item.kind ?? kind))
                    .font(.system(size: 12.5))
                    .foregroundStyle(Paper.ink2)
                    .lineLimit(1)
                    .padding(.top, 3)
                if let because = item.because, !because.isEmpty {
                    Label("Because you love \(PickLook.list(because))", systemImage: "heart.fill")
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(Paper.accent)
                        .lineLimit(1)
                        .padding(.horizontal, 9)
                        .frame(height: 24)
                        .background(Capsule().fill(Paper.accentSoft))
                        .padding(.top, 9)
                        .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .leading)))
                } else if popular {
                    Text("Popular right now")
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(Paper.ink2)
                        .padding(.horizontal, 9)
                        .frame(height: 24)
                        .background(Capsule().fill(Paper.fill))
                        .padding(.top, 9)
                }
                if let about = PickLook.about(item) {
                    Text(about)
                        .font(.system(size: 12))
                        .foregroundStyle(Paper.ink2)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 9)
                }
                Spacer(minLength: 12)
                HStack(spacing: 6) {
                    ForEach(PickLook.actions(item, kind: item.kind ?? kind, genre: genre), id: \.title) { action in
                        Button { run(action) } label: {
                            Label(action.title, systemImage: action.symbol)
                        }
                        .buttonStyle(PaperButton(primary: action.primary))
                    }
                    Spacer(minLength: 4)
                    if !popular { PaperThumbs(item: item, kind: item.kind ?? kind, agent: agent) }
                }
            }
            .frame(maxWidth: .infinity, minHeight: PickArtwork.height(item.kind ?? kind, size: 116), alignment: .topLeading)
        }
    }

    private func run(_ action: PickLook.Action) {
        switch action.does {
        case .open(let link):
            if let url = URL(string: link) { NSWorkspace.shared.open(url) }
        case .play(let query):
            agent.runTool("music_open", args: ["query": .string(query)])
        case .ask(let words):
            agent.send(text: words)
        }
    }
}

/// One of the other picks: small picture, name, and why (or what it is). Click to bring it up top.
private struct MiniPick: View {
    let item: Picks.Item
    let kind: String
    let choose: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: choose) {
            HStack(spacing: 9) {
                PickArtwork(item: item, kind: item.kind ?? kind, size: 40)
                VStack(alignment: .leading, spacing: 1) {
                    Text(PickLook.split(item.name, kind: item.kind ?? kind).title)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(Paper.ink)
                        .lineLimit(1)
                    Text(item.because.flatMap { $0.isEmpty ? nil : "Like \(PickLook.list($0))" } ?? PickLook.meta(item, kind: item.kind ?? kind))
                        .font(.system(size: 11))
                        .foregroundStyle(Paper.ink2)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(hovering ? Paper.fill : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help("Show \(item.name)")
    }
}

/// A pick's picture in the shape of what it is: a poster, a book cover, a round face for an
/// artist, a square for an album, a podcast or a place.
private struct PickArtwork: View {
    let item: Picks.Item
    let kind: String
    let size: CGFloat

    static func height(_ kind: String, size: CGFloat) -> CGFloat {
        switch kind {
        case "movie", "tv_show": size * 1.25
        case "book": size * 1.3
        default: size
        }
    }

    var body: some View {
        let tall = ["movie", "tv_show", "book"].contains(kind)
        let width = tall ? Self.height(kind, size: size) * (kind == "book" ? 0.66 : 2.0 / 3.0) : size
        let corner: CGFloat = kind == "book" ? size * 0.05 : size * 0.12
        ZStack {
            Paper.fill
            if item.image != nil {
                RemoteImage(url: item.image, fit: kind == "brand")
            } else {
                Image(systemName: PickLook.symbol(kind, genre: nil))
                    .font(.system(size: size * 0.28, weight: .medium))
                    .foregroundStyle(Paper.ink3)
            }
        }
        .frame(width: width, height: Self.height(kind, size: size))
        .clipShape(kind == "artist" ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: corner, style: .continuous)))
    }
}

/// Thumbs on the top pick: up adds it to the user's taste, down means not for them.
private struct PaperThumbs: View {
    let item: Picks.Item
    let kind: String
    let agent: AgentSession

    var body: some View {
        if let given = agent.feedback[item.name] {
            let up = given.hasPrefix("up")
            Label(given.hasSuffix("saved") ? (up ? "In your taste" : "Not for you") : "Saving",
                  systemImage: up ? "hand.thumbsup.fill" : "hand.thumbsdown.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(up ? Paper.good : Paper.ink2)
        } else {
            HStack(spacing: 4) {
                thumb("hand.thumbsup", "up", help: "I love this: add it to my taste")
                thumb("hand.thumbsdown", "down", help: "Not for me")
            }
        }
    }

    private func thumb(_ symbol: String, _ verdict: String, help: String) -> some View {
        Button {
            agent.give(verdict, to: TaskItem.Card(title: item.name, subtitle: nil, image: item.image, url: item.url, reason: nil,
                                                  tag: PickLook.tag(kind)))
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundStyle(Paper.ink2)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Paper.fill))
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

private struct PaperButton: ButtonStyle {
    let primary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .labelStyle(Tight())
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(primary ? Color.white : Paper.ink)
            .padding(.horizontal, 12)
            .frame(height: 28)
            .background(Capsule().fill(primary ? Paper.ink : Paper.fill))
            .opacity(configuration.isPressed ? 0.75 : 1)
            .contentShape(Capsule())
    }

    private struct Tight: LabelStyle {
        func makeBody(configuration: Configuration) -> some View {
            HStack(spacing: 5) {
                configuration.icon.font(.system(size: 10, weight: .bold))
                configuration.title
            }
        }
    }
}

/// How each kind of pick reads: its symbol, its one-line "what it is", and what to do with it.
enum PickLook {
    struct Action {
        enum Does { case open(String), play(String), ask(String) }
        let title: String
        let symbol: String
        let primary: Bool
        let does: Does
    }

    static func symbol(_ kind: String, genre: String?) -> String {
        switch kind {
        case "movie": "film"
        case "tv_show": "tv"
        case "artist", "album": "music.note"
        case "book": "book.closed"
        case "podcast": "headphones"
        case "video_game": "gamecontroller"
        case "brand": "bag"
        case "place":
            switch genre ?? "" {
            case "bar", "cocktail_bar", "wine_bar": "wineglass"
            case "cafe", "coffee": "cup.and.saucer"
            case "music_venue": "music.mic"
            case "museum": "building.columns"
            case "bookstore": "book"
            case "record_store": "opticaldisc"
            case "hotel": "bed.double"
            case "park": "leaf"
            default: "fork.knife"
            }
        default: "heart"
        }
    }

    /// A book's long title splits at its colon: the title, then the rest as its subtitle.
    static func split(_ name: String, kind: String) -> (title: String, subtitle: String?) {
        guard kind == "book", let colon = name.firstIndex(of: ":") else { return (name, nil) }
        let rest = name[name.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        return (String(name[..<colon]), rest.isEmpty ? nil : rest)
    }

    static func meta(_ item: Picks.Item, kind: String) -> String {
        let year = item.year.map { ", \($0)" } ?? ""
        switch kind {
        case "movie": return "Film" + year
        case "tv_show": return "Series" + year
        case "artist": return "Artist"
        case "album": return "Album" + year
        case "book": return "Book" + year
        case "podcast": return "Podcast"
        case "video_game": return "Game" + year
        case "brand": return "Brand"
        case "place":
            let price = item.priceLevel.map { String(repeating: "$", count: max(1, min($0, 4))) }
            let bits = [item.neighborhood ?? item.address, price].compactMap { $0 }
            return bits.isEmpty ? "Place" : bits.joined(separator: ", ")
        default: return kind.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    /// Qloo's description, without the "(2012)" after the name that the line above already says,
    /// and cut at a full stop when Qloo cut it mid-word.
    static func about(_ item: Picks.Item) -> String? {
        guard var text = item.description?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        if let year = item.year, text.hasPrefix(item.name + " (\(year))") {
            text = item.name + text.dropFirst(item.name.count + " (\(year))".count)
        }
        if text.count >= 230, let stop = text.range(of: ". ", options: .backwards) { text = String(text[..<stop.lowerBound]) + "." }
        return text
    }

    static func list(_ names: [String]) -> String {
        names.count > 1 ? "\(names[0]) and \(names[1])" : (names.first ?? "")
    }

    /// The word the brain's learning reads a card's kind from (learning._TAG_KINDS).
    static func tag(_ kind: String) -> String? {
        switch kind {
        case "movie": "film"
        case "tv_show": "show"
        case "artist", "album", "podcast", "book", "brand", "place": kind
        default: nil
        }
    }

    static func actions(_ item: Picks.Item, kind: String, genre: String?) -> [Action] {
        let name = item.name
        func search(_ base: String, _ q: String) -> String {
            base + (q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)
        }
        switch kind {
        case "movie", "tv_show":
            let q = [name, item.year.map(String.init), "trailer"].compactMap { $0 }.joined(separator: " ")
            return [Action(title: "Trailer", symbol: "play.fill", primary: true, does: .open(search("https://www.youtube.com/results?search_query=", q))),
                    Action(title: "Where to watch", symbol: "tv", primary: false, does: .open(search("https://www.justwatch.com/us/search?q=", name)))]
        case "artist", "album":
            return [Action(title: "Play", symbol: "play.fill", primary: true, does: .play(name)),
                    Action(title: "More like this", symbol: "plus", primary: false, does: .ask("More like \(name)"))]
        case "podcast":
            return [Action(title: "Listen", symbol: "play.fill", primary: true, does: .open(search("https://podcasts.apple.com/us/search?term=", name))),
                    Action(title: "More like this", symbol: "plus", primary: false, does: .ask("More podcasts like \(name)"))]
        case "book":
            return [Action(title: "Read more", symbol: "book", primary: true, does: .open(search("https://www.goodreads.com/search?q=", name))),
                    Action(title: "More like this", symbol: "plus", primary: false, does: .ask("More books like \(split(name, kind: kind).title)"))]
        case "place":
            var where_ = search("https://maps.apple.com/?q=", name)
            if let lat = item.lat, let lon = item.lon { where_ += "&ll=\(lat),\(lon)" }
            let booking = ["restaurant", "bar", "cocktail_bar", "wine_bar", ""].contains(genre ?? "")
            return [Action(title: "Directions", symbol: "location.fill", primary: true, does: .open(where_)),
                    booking ? Action(title: "Book a table", symbol: "calendar", primary: false, does: .ask("Book a table at \(name)"))
                        : Action(title: "Plan a visit", symbol: "calendar", primary: false, does: .ask("Plan a visit to \(name)"))]
        case "brand":
            return [Action(title: "Visit", symbol: "arrow.up.right", primary: true, does: .open(item.url ?? search("https://duckduckgo.com/?q=", name)))]
        default:
            return [Action(title: "Look it up", symbol: "arrow.up.right", primary: true, does: .open(search("https://duckduckgo.com/?q=", name)))]
        }
    }
}
