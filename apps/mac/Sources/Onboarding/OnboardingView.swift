import AppKit
import SwiftUI

/// The onboarding window's card: a soft sky at the top that changes with each step, the step
/// itself, then Back, the page dots and the main action.
struct OnboardingView: View {
    static let size = CGSize(width: 960, height: 660)

    @Bindable var model: OnboardingModel
    let close: () -> Void
    @Environment(\.renderingForPreview) private var rendering

    var body: some View {
        ZStack(alignment: .top) {
            Sky.card
            SkyMesh(mood: mood)
                .frame(height: heroHeight)
                .frame(maxWidth: .infinity)
                .animation(.easeInOut(duration: 0.5), value: model.step)
            if !rendering {
                WindowDragArea().frame(height: 64)
            }
            VStack(spacing: 0) {
                topBar
                Group {
                    switch model.step {
                    case .welcome: welcome
                    case .home: HomeStep(model: model)
                    case .music: picking(icon: "music", title: "Pick a few artists you love",
                                         subtitle: "Three or more is a good start. Slice finds what ties them together.")
                    case .screen: picking(icon: "film", title: "Films and shows you love",
                                          subtitle: "The ones you'd watch again, or tell a friend about.")
                    case .everyday: picking(icon: "bag", title: "Brands and books you like",
                                            subtitle: "What you'd buy, wear or read. Slice uses these for gifts and shopping.")
                    case .questions: questions
                    case .access: AccessStep()
                    case .talk: TalkStep(agent: model.agent)
                    case .reveal: reveal
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .transition(.opacity.combined(with: .offset(y: 8)))
                .id(model.step)
                footer
            }
        }
        .frame(width: Self.size.width, height: Self.size.height)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(Sky.line, lineWidth: 1))
        .foregroundStyle(Sky.ink)
        .onAppear { model.prefetch() }
    }

    private var mood: SkyMood {
        switch model.step {
        case .welcome, .access: .sky
        case .home, .talk, .questions: .mint
        case .music, .reveal: .blush
        case .screen, .everyday: .lilac
        }
    }

    private var heroHeight: CGFloat {
        switch model.step {
        case .welcome: 360
        case .talk: 330
        case .reveal: 260
        default: 210
        }
    }

    // MARK: Chrome

    private var topBar: some View {
        HStack(spacing: 8) {
            SliceMark(height: 13)
            Text("Slice").font(.system(size: 13.5, weight: .semibold))
            Spacer()
            if model.building, model.step != .reveal {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.mini)
                    Text("Reading your taste").font(.system(size: 12, weight: .medium)).foregroundStyle(Sky.ink2)
                }
                .padding(.horizontal, 10)
                .frame(height: 26)
                .background(Capsule().fill(Sky.card.opacity(0.75)))
            }
            CloseButton(action: close)
        }
        .padding(.horizontal, 22)
        .padding(.top, 16)
        .frame(height: 58)
    }

    private var footer: some View {
        ZStack {
            PageDots(count: OnboardingModel.Step.allCases.count, index: model.step.rawValue)
            HStack(spacing: 10) {
                if model.step != .welcome, model.step != .reveal {
                    Button("Back") { model.step == .questions ? model.previousQuestion() : model.back() }
                        .buttonStyle(SecondaryButton(symbol: "arrow.left"))
                }
                Spacer()
                primary
            }
        }
        .overlay(alignment: .top) {
            if let problem = model.problem ?? model.home.problem {
                Label(problem, systemImage: "exclamationmark.circle.fill")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Sky.bad)
                    .padding(.horizontal, 12)
                    .frame(height: 30)
                    .background(Capsule().fill(Sky.card))
                    .overlay(Capsule().strokeBorder(Sky.bad.opacity(0.25)))
                    .shadow(color: Sky.shadow, radius: 8, y: 3)
                    .offset(y: -40)
                    .transition(.opacity)
            }
        }
        .padding(.horizontal, 28)
        .padding(.top, 10)
        .padding(.bottom, 22)
    }

    @ViewBuilder
    private var primary: some View {
        switch model.step {
        case .welcome:
            Button("Let's start") { model.next() }.buttonStyle(PrimaryButton())
        case .home:
            Button(model.home.place == nil ? "Skip for now" : "Continue") { model.next() }
                .buttonStyle(PrimaryButton())
        case .questions:
            let answered = !(model.answers[model.question.id] ?? []).isEmpty
            let last = model.questionIndex == Question.all.count - 1
            Button(answered ? (last ? "Continue" : "Next") : "Skip") { model.nextQuestion() }
                .buttonStyle(PrimaryButton())
        case .talk:
            Button("See my taste") { model.next() }.buttonStyle(PrimaryButton())
        case .reveal:
            Button("Start using Slice") {
                model.finish()
                close()
            }
            .buttonStyle(PrimaryButton())
            .disabled(model.building)
        default:
            let skipping = model.isPicking && model.picks(on: model.step).isEmpty
            Button(skipping ? "Skip" : "Continue") { model.next() }.buttonStyle(PrimaryButton())
        }
    }

    // MARK: Welcome

    private var welcome: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            ZStack {
                floating("music", size: 70, x: -215, y: -18, phase: 0.4)
                floating("film", size: 62, x: 210, y: -40, phase: 1.6)
                floating("bag", size: 54, x: -150, y: 76, phase: 2.5)
                floating("heart", size: 48, x: 168, y: 70, phase: 3.3)
                floating("pin", size: 40, x: -300, y: 64, phase: 4.1).opacity(0.85)
                floating("chat", size: 38, x: 300, y: 30, phase: 5.0).opacity(0.85)
                appTile
                StatusPill(text: "Very you", color: Sky.accent, symbol: "heart.fill", soft: Sky.card)
                    .shadow(color: Sky.shadow, radius: 10, y: 4)
                    .offset(x: -118, y: -66)
            }
            .frame(height: 240)
            Text(model.name.isEmpty ? "Hi, I'm Slice." : "Hi \(model.name), I'm Slice.")
                .font(.system(size: 36, weight: .bold))
                .tracking(-0.8)
                .contentTransition(.opacity)
            Text("I live in your notch and pick things the way a friend with great taste would: what to watch, where to eat, what to give. First, a little about you.")
                .font(.system(size: 15))
                .foregroundStyle(Sky.ink2)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .frame(width: 540)
                .padding(.top, 10)
            SkyField(placeholder: "What should I call you?", text: $model.name, symbol: "person", large: true) { model.next() }
                .frame(width: 340)
                .padding(.top, 26)
            Label("About two minutes. Everything stays on this Mac.", systemImage: "lock.fill")
                .font(.system(size: 12.5))
                .foregroundStyle(Sky.ink3)
                .padding(.top, 14)
            Spacer(minLength: 0)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }

    private var appTile: some View {
        RoundedRectangle(cornerRadius: 36, style: .continuous)
            .fill(Sky.raised)
            .overlay(RoundedRectangle(cornerRadius: 36, style: .continuous).strokeBorder(Sky.line, lineWidth: 0.5))
            .overlay(Glossy("mark").padding(24))
            .overlay(alignment: .top) {
                // A soft shine across the top, like a glass app icon.
                RoundedRectangle(cornerRadius: 36, style: .continuous)
                    .fill(LinearGradient(colors: [.white.opacity(0.55), .white.opacity(0)], startPoint: .top, endPoint: .center))
                    .blendMode(.plusLighter)
                    .opacity(0.5)
            }
            .frame(width: 128, height: 128)
            .shadow(color: Sky.shadow, radius: 20, y: 10)
    }

    private func floating(_ icon: String, size: CGFloat, x: CGFloat, y: CGFloat, phase: Double) -> some View {
        Glossy(icon, floating: true, phase: phase)
            .frame(width: size, height: size)
            .offset(x: x, y: y)
    }

    // MARK: Picking

    private func picking(icon: String, title: String, subtitle: String) -> some View {
        let step = model.step
        let grid = VStack(alignment: .leading, spacing: 18) {
            if !model.results.isEmpty {
                section("Results", tiles: model.results)
            }
            if let more = model.more[step], !more.isEmpty {
                section(step == .music ? "More like your picks" : "Because of your picks", tiles: more, highlight: true)
            }
            if let starters = model.starters[step] {
                if starters.isEmpty {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Finding a few to start with").foregroundStyle(Sky.ink2)
                    }
                } else {
                    section("Popular to start with", tiles: starters.filter { s in !(model.more[step] ?? []).contains { $0.id == s.id } })
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 4)
        return VStack(alignment: .leading, spacing: 16) {
            StepHeader(icon: icon, title: title, subtitle: subtitle) {
                PickedStack(tiles: model.picks(on: step))
            }
            HStack(spacing: 10) {
                SkyField(placeholder: step == .music ? "Search any artist or podcast" : (step == .screen ? "Search any film or show" : "Search any brand or book"),
                         text: $model.query, symbol: "magnifyingglass") { model.search() }
                    .frame(maxWidth: 360)
                if step == .music {
                    source("From my Music", symbol: "music.note", busy: model.importing == "music") { model.addFromMusic() }
                    source("From my Podcasts", symbol: "headphones", busy: model.importing == "podcasts") { model.addFromPodcasts() }
                }
                if step == .everyday {
                    source("From my Books", symbol: "book", busy: model.importing == "books") { model.addFromBooks() }
                }
                Spacer()
            }
            if rendering {
                grid.frame(maxHeight: .infinity, alignment: .top).clipped()
            } else {
                ScrollView { grid.padding(.bottom, 12) }
                    .scrollIndicators(.never)
                    .mask(LinearGradient(stops: [.init(color: .black, location: 0.9), .init(color: .clear, location: 1)],
                                         startPoint: .top, endPoint: .bottom))
            }
        }
        .padding(.horizontal, 40)
        .padding(.top, 6)
    }

    private func source(_ title: String, symbol: String, busy: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if busy { ProgressView().controlSize(.mini) }
                Text(title)
            }
        }
        .buttonStyle(SecondaryButton(symbol: busy ? nil : symbol))
        .disabled(busy)
    }

    private func section(_ title: String, tiles: [Tile], highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                if highlight { Image(systemName: "arrow.triangle.branch").foregroundStyle(Sky.accent) }
                Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(highlight ? Sky.ink : Sky.ink2)
            }
            // One grid per shape, so posters, covers, faces and logos each line up with their own kind.
            ForEach(TileShape.groups(tiles), id: \.shape) { group in
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16, alignment: .top), count: group.shape.columns),
                          alignment: .leading, spacing: 18) {
                    ForEach(rendering ? Array(group.tiles.prefix(group.shape.columns)) : group.tiles) { tile in
                        TileView(tile: tile, shape: group.shape, picked: model.isPicked(tile)) { model.toggle(tile) }
                    }
                }
            }
        }
    }

    // MARK: Questions

    private var questions: some View {
        let q = model.question
        let columns = q.options.count <= 4 ? q.options.count : 3
        return VStack(spacing: 0) {
            StepHeader(icon: "chat", title: "A few quick ones", subtitle: "So plans fit how you live. Skip any you like.") {
                EmptyView()
            }
            .padding(.horizontal, 40)
            Spacer(minLength: 10)
            VStack(spacing: 22) {
                VStack(spacing: 6) {
                    Text(q.title).font(.system(size: 25, weight: .bold)).tracking(-0.5)
                    Text(q.multi ? "Pick any that apply." : "Pick one.").font(.system(size: 13.5)).foregroundStyle(Sky.ink2)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(172), spacing: 14), count: columns), spacing: 14) {
                    ForEach(q.options) { option in
                        OptionCard(option: option, on: model.answers[q.id]?.contains(option.label) == true) {
                            model.choose(option, in: q)
                        }
                    }
                }
            }
            .id(model.questionIndex)
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                    removal: .move(edge: .leading).combined(with: .opacity)))
            Spacer(minLength: 10)
            HStack(spacing: 5) {
                ForEach(Question.all.indices, id: \.self) { i in
                    Capsule()
                        .fill(i < model.questionIndex ? Sky.accent : (i == model.questionIndex ? Sky.ink : Sky.fill))
                        .frame(width: 30, height: 4)
                }
            }
            .padding(.bottom, 4)
        }
        .padding(.top, 6)
        .clipped()
    }

    // MARK: Reveal

    private var reveal: some View {
        let profile = model.agent.profile
        let words = (profile["tags"]?.array ?? []).compactMap { $0["name"]?.string }.prefix(7)
        return VStack(spacing: 14) {
            VStack(spacing: 8) {
                Text(model.name.isEmpty ? "Here's your taste" : "Here's your taste, \(model.name)")
                    .font(.system(size: 30, weight: .bold))
                    .tracking(-0.6)
                Text(model.building ? "Reading what ties your picks together…" : (profile["summary"]?.string ?? ""))
                    .font(.system(size: 14.5))
                    .foregroundStyle(Sky.ink2)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(width: 660)
            }
            if !words.isEmpty, !model.building {
                HStack(spacing: 6) {
                    ForEach(Array(words), id: \.self) { word in
                        Text(word)
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(Sky.accent)
                            .padding(.horizontal, 11)
                            .frame(height: 26)
                            .background(Capsule().fill(Sky.accentSoft))
                    }
                }
            }
            HStack(alignment: .top, spacing: 16) {
                ZStack {
                    GraphCanvas(layout: model.graph, selection: .constant(nil), interactive: !rendering, showLegend: false)
                    if model.building {
                        VStack(spacing: 10) {
                            ProgressView()
                            Text("Finding the threads").font(.callout).foregroundStyle(Sky.ink2)
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .skyCard(radius: 22)
                if !model.nextUp.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Next for you").font(.system(size: 13, weight: .semibold)).foregroundStyle(Sky.ink2)
                        ForEach(model.nextUp.prefix(3)) { pick in
                            HStack(spacing: 11) {
                                RemoteImage(url: pick.image)
                                    .frame(width: 46, height: 46)
                                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(pick.label).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                                    let because = pick.raw["because"]?.array.compactMap(\.string) ?? []
                                    Text(because.isEmpty ? (pick.kind.map(TasteSpace.kindWord) ?? "") : "Because of \(because.joined(separator: " and "))")
                                        .font(.system(size: 11.5)).foregroundStyle(Sky.ink2).lineLimit(2)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(9)
                            .skyCard(radius: 15, shadow: false)
                        }
                        Spacer(minLength: 0)
                        Text("Slice keeps learning from what you play, watch and say. See it all in Settings > You.")
                            .font(.system(size: 11.5)).foregroundStyle(Sky.ink3).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(width: 250)
                }
            }
            .padding(.horizontal, 40)
        }
        .padding(.top, 8)
        .padding(.bottom, 4)
    }
}

// MARK: Pieces

/// A working step's heading: a glossy tile, the title and a line under it, and anything on the right.
struct StepHeader<Trailing: View>: View {
    let icon: String
    let title: String
    let subtitle: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            IconTile(icon: icon, size: 58, floating: true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 26, weight: .bold)).tracking(-0.5)
                Text(subtitle).font(.system(size: 14)).foregroundStyle(Sky.ink2).lineLimit(2)
            }
            Spacer(minLength: 12)
            trailing
        }
    }
}

/// What's been picked on this step: their faces, overlapping, and how many.
private struct PickedStack: View {
    let tiles: [Tile]

    var body: some View {
        if !tiles.isEmpty {
            HStack(spacing: 8) {
                HStack(spacing: -10) {
                    ForEach(tiles.suffix(4)) { tile in
                        RemoteImage(url: tile.image)
                            .frame(width: 30, height: 30)
                            .clipShape(Circle())
                            .overlay(Circle().strokeBorder(Sky.card, lineWidth: 2))
                    }
                }
                Text("\(tiles.count) picked").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Sky.accent)
            }
            .padding(.leading, 5)
            .padding(.trailing, 12)
            .frame(height: 40)
            .background(Capsule().fill(Sky.card))
            .overlay(Capsule().strokeBorder(Sky.line))
            .shadow(color: Sky.shadow, radius: 10, y: 4)
            .transition(.scale.combined(with: .opacity))
        }
    }
}

/// The shape a pick is drawn in, from what it is: a face for an artist, a poster for a film or
/// show, a cover for a book, a square for an album or podcast, the whole logo for a brand, a wide
/// photo for a place. (Qloo's pictures: posters about 0.68 wide to 1 tall, artist photos 0.92,
/// brand logos square.)
enum TileShape: Int, Hashable {
    case round, poster, book, square, logo, wide

    init(kind: String?) {
        switch kind {
        case "artist", "author", "person": self = .round
        case "movie", "tv_show": self = .poster
        case "book": self = .book
        case "brand": self = .logo
        case "place", "destination": self = .wide
        default: self = .square
        }
    }

    /// Width over height.
    var aspect: CGFloat {
        switch self {
        case .poster: 2.0 / 3.0
        case .book: 0.66
        case .wide: 4.0 / 3.0
        default: 1
        }
    }

    var columns: Int { self == .wide ? 4 : 6 }

    var corner: CGFloat {
        switch self {
        case .book: 5
        case .poster: 10
        default: 16
        }
    }

    /// Tiles grouped by shape, in the order each shape first appears.
    static func groups(_ tiles: [Tile]) -> [(shape: TileShape, tiles: [Tile])] {
        var order: [TileShape] = []
        var by: [TileShape: [Tile]] = [:]
        for tile in tiles {
            let shape = TileShape(kind: tile.kind)
            if by[shape] == nil { order.append(shape) }
            by[shape, default: []].append(tile)
        }
        return order.map { ($0, by[$0] ?? []) }
    }
}

private struct TileView: View {
    let tile: Tile
    let shape: TileShape
    let picked: Bool
    let toggle: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: toggle) {
            VStack(alignment: shape == .round ? .center : .leading, spacing: 7) {
                picture
                    .overlay(alignment: shape == .round ? .bottomTrailing : .topTrailing) {
                        if picked {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10.5, weight: .heavy))
                                .foregroundStyle(.white)
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(Sky.accent))
                                .overlay(Circle().strokeBorder(.white, lineWidth: 2))
                                .padding(shape == .round ? 2 : 7)
                                .transition(.scale.combined(with: .opacity))
                        }
                    }
                    .shadow(color: Sky.shadow.opacity(hovering ? 1.3 : 0.75), radius: hovering ? 12 : 6, y: hovering ? 6 : 3)
                    .scaleEffect(hovering && !picked ? 1.03 : 1)
                Text(tile.name)
                    .font(.system(size: 12.5, weight: picked ? .semibold : .medium))
                    .foregroundStyle(picked ? Sky.accent : Sky.ink)
                    .multilineTextAlignment(shape == .round ? .center : .leading)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: shape == .round ? .center : .leading)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.14), value: hovering)
        .animation(.snappy(duration: 0.2), value: picked)
        .help(tile.description ?? tile.name)
    }

    @ViewBuilder
    private var picture: some View {
        switch shape {
        case .round:
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay { RemoteImage(url: tile.image) }
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(picked ? Sky.accent : Sky.line, lineWidth: picked ? 3 : 0.5))
        case .logo:
            // Qloo's brand pictures are square, so the logo fills the tile edge to edge; one that
            // isn't square still shows whole, on white, rather than being cropped.
            RoundedRectangle(cornerRadius: shape.corner, style: .continuous)
                .fill(Color.white)
                .aspectRatio(1, contentMode: .fit)
                .overlay { RemoteImage(url: tile.image, fit: true) }
                .clipShape(RoundedRectangle(cornerRadius: shape.corner, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: shape.corner, style: .continuous)
                    .strokeBorder(picked ? Sky.accent : Sky.line, lineWidth: picked ? 3 : 1))
        default:
            Color.clear
                .aspectRatio(shape.aspect, contentMode: .fit)
                .overlay { RemoteImage(url: tile.image) }
                .clipShape(RoundedRectangle(cornerRadius: shape.corner, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: shape.corner, style: .continuous)
                    .strokeBorder(picked ? Sky.accent : Sky.line, lineWidth: picked ? 3 : 0.5))
        }
    }
}

/// One answer to a question: a big card with an outline icon, blue when chosen.
private struct OptionCard: View {
    let option: Question.Option
    let on: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                Image(systemName: option.symbol)
                    .font(.system(size: 27, weight: .regular))
                    .foregroundStyle(on ? Sky.accent : Sky.ink2)
                    .frame(height: 32)
                Text(option.label)
                    .font(.system(size: 13.5, weight: on ? .semibold : .medium))
                    .foregroundStyle(on ? Sky.accent : Sky.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .padding(.horizontal, 10)
            .frame(width: 172, height: 124)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(on ? Sky.accentSoft : Sky.card))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(on ? Sky.accent : (hovering ? Sky.accent.opacity(0.35) : Sky.line), lineWidth: on ? 2 : 1))
            .shadow(color: Sky.shadow.opacity(on ? 0.3 : 0.7), radius: 12, y: 6)
            .scaleEffect(hovering && !on ? 1.02 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.14), value: hovering)
        .animation(.snappy(duration: 0.2), value: on)
    }
}

/// Lets the window be dragged by its empty top strip (it has no title bar).
struct WindowDragArea: NSViewRepresentable {
    final class DragView: NSView {
        override var mouseDownCanMoveWindow: Bool { true }
        override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
    }

    func makeNSView(context: Context) -> NSView { DragView() }
    func updateNSView(_ nsView: NSView, context: Context) {}
}
