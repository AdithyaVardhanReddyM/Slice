import AppKit
import CoreLocation
import MapKit

/// Where home is: the Mac's current location (named with Apple Maps), or a neighbourhood or
/// city the user searches for. The point goes into the profile as `home`, so the brain plans
/// around the real place instead of guessing from a name ("Tokyo" once landed in the ocean).
@MainActor
@Observable
final class HomePicker: NSObject {
    struct Place: Equatable, Codable {
        var name: String
        var detail: String
        var lat: Double
        var lon: Double

        var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
    }

    var place: Place?
    var query = "" {
        didSet { query.isEmpty ? (suggestions = []) : (completer.queryFragment = query) }
    }
    private(set) var suggestions: [Suggestion] = []
    private(set) var locating = false
    private(set) var problem: String?

    struct Suggestion: Identifiable {
        let id = UUID()
        let title: String
        let subtitle: String
        fileprivate let completion: MKLocalSearchCompletion
    }

    @ObservationIgnored private let completer = MKLocalSearchCompleter()
    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private var wantsLocation = false

    init(place: Place? = nil) {
        self.place = place
        super.init()
        completer.resultTypes = .address
        completer.delegate = self
        manager.delegate = self
    }

    /// A saved home (profile["home"]), if there is one.
    static func saved(_ profile: JSONValue) -> Place? {
        guard let home = profile["home"], let lat = home["lat"]?.double, let lon = home["lon"]?.double else { return nil }
        return Place(name: home["name"]?.string ?? profile["city"]?.string ?? "Home", detail: home["detail"]?.string ?? "",
                     lat: lat, lon: lon)
    }

    var json: JSONValue? {
        guard let place else { return nil }
        return ["name": .string(place.name), "detail": .string(place.detail), "lat": .number(place.lat), "lon": .number(place.lon)]
    }

    // MARK: Current location

    func useCurrentLocation() {
        problem = nil
        wantsLocation = true
        switch manager.authorizationStatus {
        case .notDetermined:
            locating = true
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            wantsLocation = false
            problem = "Location is off for Slice. Turn it on in System Settings, or search instead."
            Permissions.openSettings(.location)
        default:
            locating = true
            manager.requestLocation()
        }
    }

    private func name(_ location: CLLocation) async {
        let placemark = try? await CLGeocoder().reverseGeocodeLocation(location).first
        locating = false
        let area = placemark?.subLocality ?? placemark?.locality ?? "Your area"
        let wider = [placemark?.locality, placemark?.administrativeArea, placemark?.country]
            .compactMap { $0 }.filter { $0 != area }
        place = Place(name: [area, wider.first].compactMap { $0 }.joined(separator: ", "),
                      detail: wider.dropFirst().joined(separator: ", "),
                      lat: location.coordinate.latitude, lon: location.coordinate.longitude)
    }

    // MARK: Search

    func choose(_ suggestion: Suggestion) {
        Task { await resolve(MKLocalSearch.Request(completion: suggestion.completion), title: suggestion.title, subtitle: suggestion.subtitle) }
    }

    /// A ready-made place ("Williamsburg, Brooklyn").
    func choose(named text: String) {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = text
        request.resultTypes = .address
        let parts = text.split(separator: ",", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
        Task { await resolve(request, title: parts.first ?? text, subtitle: parts.count > 1 ? parts[1] : "", exact: text) }
    }

    private func resolve(_ request: MKLocalSearch.Request, title: String, subtitle: String, exact: String? = nil) async {
        problem = nil
        guard let item = try? await MKLocalSearch(request: request).start().mapItems.first else {
            problem = "Apple Maps couldn't find that. Try a neighbourhood and its city."
            return
        }
        // "Williamsburg" + "Brooklyn, NY, United States" → "Williamsburg, Brooklyn".
        let rest = subtitle.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let name = exact ?? ([title] + rest.prefix(1)).joined(separator: ", ")
        place = Place(name: name, detail: rest.dropFirst().joined(separator: ", "),
                      lat: item.placemark.coordinate.latitude, lon: item.placemark.coordinate.longitude)
        query = ""
    }
}

extension HomePicker: MKLocalSearchCompleterDelegate {
    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        MainActor.assumeIsolated {
            suggestions = self.completer.results.prefix(5).map {
                Suggestion(title: $0.title, subtitle: $0.subtitle, completion: $0)
            }
        }
    }

    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {}
}

extension HomePicker: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated {
            guard wantsLocation else { return }
            switch self.manager.authorizationStatus {
            case .notDetermined: break
            case .denied, .restricted:
                wantsLocation = false
                locating = false
                problem = "Location is off for Slice. Search for your neighbourhood instead."
            default:
                self.manager.requestLocation()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        MainActor.assumeIsolated {
            guard wantsLocation else { return }
            wantsLocation = false
            Task { await name(location) }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        MainActor.assumeIsolated {
            wantsLocation = false
            locating = false
            problem = "Couldn't find where you are. Search for your neighbourhood instead."
        }
    }
}
