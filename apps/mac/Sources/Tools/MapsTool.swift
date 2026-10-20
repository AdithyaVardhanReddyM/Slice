import CoreLocation
import MapKit

/// Apple Maps: search, travel times and naming map points. No key, and no location
/// permission: places are found around an address or area the brain names.
@MainActor
enum MapsTool {
    static func search(query: String, near: String) async -> Result<JSONValue, LocalTools.Failure> {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        if !near.isEmpty, let center = await geocode(near) {
            request.region = MKCoordinateRegion(center: center, latitudinalMeters: 6000, longitudinalMeters: 6000)
        }
        do {
            let response = try await MKLocalSearch(request: request).start()
            let list: [JSONValue] = response.mapItems.prefix(6).map { item in
                var out: [String: JSONValue] = [
                    "name": .string(item.name ?? ""),
                    "address": .string(item.placemark.title ?? ""),
                    "lat": .number(item.placemark.coordinate.latitude),
                    "lon": .number(item.placemark.coordinate.longitude),
                ]
                if let phone = item.phoneNumber { out["phone"] = .string(phone) }
                if let url = item.url { out["url"] = .string(url.absoluteString) }
                return .object(out)
            }
            return .success(["results": .array(list)])
        } catch {
            return .failure(.init(message: "Maps found nothing for \(query)."))
        }
    }

    static func eta(from: String, to: String, mode: String) async -> Result<JSONValue, LocalTools.Failure> {
        guard let destination = await geocode(to) else { return .failure(.init(message: "Couldn't find \(to) on the map.")) }
        guard !from.isEmpty, let origin = await geocode(from) else { return .failure(.init(message: "Where from? Give an address.")) }
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination))
        request.transportType = switch mode {
        case "walking": .walking
        case "transit": .transit
        default: .automobile
        }
        do {
            let eta = try await MKDirections(request: request).calculateETA()
            return .success(["minutes": .number((eta.expectedTravelTime / 60).rounded()), "mode": .string(mode),
                             "km": .number((eta.distance / 100).rounded() / 10)])
        } catch {
            return .failure(.init(message: "Maps couldn't work out a \(mode) route."))
        }
    }

    /// Neighbourhood names for map points (Qloo heatmap cells).
    static func reverse(_ points: [JSONValue]) async -> Result<JSONValue, LocalTools.Failure> {
        var names: [JSONValue] = []
        for point in points.prefix(16) {
            guard case .number(let lat)? = point["lat"], case .number(let lon)? = point["lon"] else {
                names.append(.null)
                continue
            }
            let placemark = try? await CLGeocoder().reverseGeocodeLocation(CLLocation(latitude: lat, longitude: lon)).first
            let name = [placemark?.subLocality, placemark?.locality].compactMap { $0 }.joined(separator: ", ")
            names.append(name.isEmpty ? .null : .string(name))
        }
        return .success(["places": .array(names)])
    }

    /// Addresses or neighbourhoods to points, in order (null for a miss), for scoring listings.
    static func geocode(_ places: [String]) async -> Result<JSONValue, LocalTools.Failure> {
        var points: [JSONValue] = []
        for place in places.prefix(30) {
            var at = await geocode(place)
            if at == nil { at = await firstResult(place) }
            if let at {
                points.append(["lat": .number(at.latitude), "lon": .number(at.longitude)])
            } else {
                points.append(.null)
            }
        }
        return .success(["points": .array(points)])
    }

    /// Venues ("Brooklyn Steel") that the address geocoder doesn't know.
    private static func firstResult(_ query: String) async -> CLLocationCoordinate2D? {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        return try? await MKLocalSearch(request: request).start().mapItems.first?.placemark.coordinate
    }

    private static func geocode(_ place: String) async -> CLLocationCoordinate2D? {
        try? await CLGeocoder().geocodeAddressString(place).first?.location?.coordinate
    }
}
