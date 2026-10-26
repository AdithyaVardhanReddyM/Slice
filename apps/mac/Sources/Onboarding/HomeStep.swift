import MapKit
import SwiftUI

/// Where home is: the Mac's current location, or a neighbourhood or city, shown on a map with
/// how far a walk goes from there.
struct HomeStep: View {
    @Bindable var model: OnboardingModel

    static let suggestions = ["Williamsburg, Brooklyn", "West Village, New York", "Silver Lake, Los Angeles",
                              "Shoreditch, London", "Roma Norte, Mexico City", "Le Marais, Paris"]

    var body: some View {
        HStack(alignment: .top, spacing: 26) {
            VStack(alignment: .leading, spacing: 16) {
                IconTile(icon: "pin", size: 58, floating: true)
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.name.isEmpty ? "Where's home?" : "Where's home, \(model.name)?")
                        .font(.system(size: 26, weight: .bold))
                        .tracking(-0.5)
                    Text("Places and plans start from here. A neighbourhood works best.")
                        .font(.system(size: 14))
                        .foregroundStyle(Sky.ink2)
                }
                HomePickerPanel(picker: model.home)
            }
            .frame(width: 362)
            HomeCard(place: model.home.place, name: model.name) { model.home.choose(named: $0) }
        }
        .padding(.horizontal, 40)
        .padding(.top, 10)
    }
}

/// Current location, or search for a neighbourhood (with ready-made ones to tap).
struct HomePickerPanel: View {
    @Bindable var picker: HomePicker
    var suggestions = HomeStep.suggestions

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
                currentLocation(picker)
                HStack(spacing: 10) {
                    Rectangle().fill(Sky.line).frame(height: 1)
                    Text("or search").font(.system(size: 12, weight: .medium)).foregroundStyle(Sky.ink3).fixedSize()
                    Rectangle().fill(Sky.line).frame(height: 1)
                }
                SkyField(placeholder: "A neighbourhood or city", text: $picker.query, symbol: "magnifyingglass")
                if !picker.query.isEmpty, !picker.suggestions.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(picker.suggestions) { suggestion in
                            Button { picker.choose(suggestion) } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "mappin.circle.fill").font(.system(size: 17)).foregroundStyle(Sky.accent)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(suggestion.title).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(Sky.ink)
                                        Text(suggestion.subtitle).font(.system(size: 11.5)).foregroundStyle(Sky.ink2).lineLimit(1)
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                    .skyCard(radius: 14)
                } else {
                    FlowLayout(spacing: 7) {
                        ForEach(suggestions, id: \.self) { place in
                            Button(place) { picker.choose(named: place) }
                                .buttonStyle(Chip(on: picker.place?.name == place))
                        }
                    }
                }
        }
    }

    private func currentLocation(_ picker: HomePicker) -> some View {
        Button { picker.useCurrentLocation() } label: {
            HStack(spacing: 12) {
                Image(systemName: "location.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Sky.accent))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Use my current location").font(.system(size: 14, weight: .semibold)).foregroundStyle(Sky.ink)
                    Text(picker.locating ? "Finding where you are…" : "macOS asks you once")
                        .font(.system(size: 12)).foregroundStyle(Sky.ink2)
                }
                Spacer()
                if picker.locating {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Sky.ink3)
                }
            }
            .padding(12)
            .skyCard(radius: 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(picker.locating)
    }
}

/// Home on a dotted globe: the ready-made places pinned (tap one to pick it), and once home is
/// chosen the globe turns to it and its name sits underneath.
struct HomeCard: View {
    static let mapSize = CGSize(width: 492, height: 438)

    /// One pin per city (neighbourhoods of one city would sit on the same dot).
    static let places: [GlobePin] = [
        GlobePin(label: "Williamsburg, Brooklyn", lat: 40.7081, lon: -73.9571),
        GlobePin(label: "Silver Lake, Los Angeles", lat: 34.0869, lon: -118.2702, tagLeft: true),
        GlobePin(label: "Roma Norte, Mexico City", lat: 19.4194, lon: -99.1617, tagLeft: true, tagBelow: true),
        GlobePin(label: "Shoreditch, London", lat: 51.5246, lon: -0.0794, tagLeft: true),
        GlobePin(label: "Le Marais, Paris", lat: 48.8590, lon: 2.3620, tagBelow: true),
        GlobePin(label: "Shibuya, Tokyo", lat: 35.6620, lon: 139.7040),
    ]

    let place: HomePicker.Place?
    /// Whose home it is (kept for the label).
    let name: String
    var size: CGSize = HomeCard.mapSize
    var pick: (String) -> Void = { _ in }

    var body: some View {
        ZStack(alignment: .bottom) {
            Sky.card
            GlobeView(home: place.map { GlobePin(label: Self.short($0.name), lat: $0.lat, lon: $0.lon) },
                      pins: Self.places.map { GlobePin(label: Self.short($0.label), lat: $0.lat, lon: $0.lon, tagLeft: $0.tagLeft, tagBelow: $0.tagBelow) },
                      zoom: Self.zoom, drop: Self.drop, lift: lift, tagsAbove: place == nil ? 0.9 : (size.height - 104) / size.height) { pin in
                if let full = Self.places.first(where: { Self.short($0.label) == pin.label }) { pick(full.label) }
            }
            if let place {
                label(place)
            } else {
                Text("Drag to spin. Tap a city, or pick your own.")
                    .font(.system(size: 12))
                    .foregroundStyle(Sky.ink3)
                    .padding(.bottom, 16)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Sky.line))
        .shadow(color: Sky.shadow, radius: 14, y: 5)
        .animation(.easeInOut(duration: 0.3), value: place)
    }

    /// A close-up: the globe's cap fills the card, its edge arcing just under the top.
    static let zoom: CGFloat = 2.0
    static let drop: CGFloat = 0.51

    /// How far above the globe's facing point home sits so it lands about a third of the way down.
    private var lift: Double {
        let r = min(size.width, size.height) / 2 * 0.92 * Self.zoom
        let centreY = size.height / 2 + Self.drop * r
        let want = size.height * 0.36
        return asin(min(0.95, max(0, (centreY - want) / r))) * 180 / .pi
    }

    /// "Williamsburg, Brooklyn" → "Williamsburg" for a tag.
    static func short(_ name: String) -> String {
        name.split(separator: ",").first.map(String.init) ?? name
    }

    private func label(_ place: HomePicker.Place) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(place.name).font(.system(size: 15, weight: .bold)).lineLimit(1)
                Text(place.detail.isEmpty ? "Walks, dinners and days out start here" : place.detail)
                    .font(.system(size: 12)).foregroundStyle(Sky.ink2).lineLimit(1)
            }
            Spacer(minLength: 8)
            StatusPill(text: "Home", color: Sky.accent, symbol: "house.fill")
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Sky.canvas))
        .padding(12)
    }
}
