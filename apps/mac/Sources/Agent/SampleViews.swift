#if DEBUG
/// Rich task cards as the brain sends them (real Qloo answers from 2026-10-21), for
/// `-sampleViews <type>` and `-renderIsland`, so each card can be looked at without a brain.
enum SampleViews {
    static let titles = [
        "person": "Dad's week", "gifts": "Maya's birthday", "timeline": "Thursday in Lisbon", "map": "Your Lisbon",
        "note": "Card for Maya", "file": "Dad's week", "why": "Why Big Thief",
    ]

    private static let why = #"""
    {"type": "why", "thing": {"name": "Big Thief", "kind": "artist", "image": "https://images.qloo.com/i/AD420A3F-5F09-4C1C-BB1E-A3DEB937F184-420x-auto.jpg"},
     "for": "you", "match": 96, "because": ["Phoebe Bridgers", "Mitski"],
     "shared": [{"name": "Emotive", "with": ["Frank Ocean", "Phoebe Bridgers"]}, {"name": "Raw", "with": ["Mitski", "Phoebe Bridgers"]},
                {"name": "Poetic", "with": ["Phoebe Bridgers"]}, {"name": "Melancholic", "with": ["Phoebe Bridgers"]}],
     "also": [{"name": "Adrianne Lenker", "kind": "artist"}, {"name": "Julia Jacklin", "kind": "artist"}, {"name": "Lucy Dacus", "kind": "artist"}],
     "line": "Same emotive, raw streak as Phoebe Bridgers and Mitski. Fans of it also love Adrianne Lenker."}
    """#

    static let json: [String: String] = [
        "person": #"""
        {"type": "person", "key": "Ray", "name": "Ray", "age": 74, "relation": "dad", "home": "Lincoln Park, Chicago",
         "needs": "uses a walker", "step_free": true, "reads_as": ["Loyal", "Nostalgic", "Polished", "Reflective"],
         "loves": ["Frank Sinatra", "Casablanca", "Downton Abbey"]}
        """#,
        "gifts": #"""
        {"type": "gifts", "key": "Maya", "title": "Gifts for Maya, birthday on the 29th", "cards": [
          {"title": "Polaroid", "tag": "Brand", "subtitle": "$50 to $250", "image": "https://images.qloo.com/i/62926E8D-2D7E-4428-819E-BF2477D3233F-420x-auto.jpg", "reason": "Suits Maya's love of Before Sunrise"},
          {"title": "Dr. Martens", "tag": "Brand", "subtitle": "$90 to $250", "image": "https://images.qloo.com/i/F59D6DB5-5A85-48C6-A2EC-CAAE334D4348-420x-auto.jpg", "reason": "Grunge, alternative, which suits Maya's love of In the Mood for Love"},
          {"title": "Nick Drake", "tag": "Vinyl", "subtitle": "An artist to discover", "image": "https://images.qloo.com/i/9FDC44C4-D40D-484C-AAAC-88E1C2B13998-420x-auto.jpg", "reason": "Suits Maya's love of Before Sunrise"},
          {"title": "The Bell Jar", "tag": "Book", "image": "https://images.qloo.com/i/61BF2BD8-CD90-418D-B155-0971B00C6702-420x-auto.jpg", "reason": "Suits Maya's love of Frances Ha"}]}
        """#,
        "timeline": #"""
        {"type": "timeline", "key": "day", "title": "Thursday in Lisbon", "stops": [
          {"time": "10:13", "kind": "coffee", "title": "Palacio Belmonte Cafe & Bar", "walk_min": 13, "lat": 38.7123, "lon": -9.1318},
          {"time": "10:59", "kind": "museum", "title": "Museu de Lisboa, Casa dos Bicos", "walk_min": 6, "lat": 38.7087, "lon": -9.1331},
          {"time": "12:36", "kind": "restaurant", "title": "Bar Terraço de Santa Luzia", "walk_min": 7, "lat": 38.7118, "lon": -9.1301},
          {"time": "14:00", "kind": "record_store", "title": "doVigário PubandRecords", "walk_min": 4, "lat": 38.7140, "lon": -9.1287},
          {"time": "20:30", "kind": "music_venue", "title": "Big Thief at Coliseu dos Recreios", "note": "96% match, because you love Phoebe Bridgers", "walk_min": 18, "lat": 38.7157, "lon": -9.1412}]}
        """#,
        "map": #"""
        {"type": "map", "key": "taste", "title": "Your Lisbon", "center": {"lat": 38.7127, "lon": -9.1450},
         "areas": [{"name": "Príncipe Real", "lat": 38.7167, "lon": -9.1490, "weight": 0.95}, {"name": "Chiado", "lat": 38.7106, "lon": -9.1420, "weight": 0.93},
                   {"name": "Cais do Sodré", "lat": 38.7061, "lon": -9.1450, "weight": 0.9}, {"name": "Santos", "lat": 38.7069, "lon": -9.1561, "weight": 0.86}]}
        """#,
        "note": #"""
        {"type": "note", "key": "Card for Maya", "title": "Card for Maya",
         "text": "Maya, happy birthday. May this year be all In the Mood for Love: slow, golden and a little bit mysterious. Shoot it all on the Polaroid. Love, Alex"}
        """#,
        "file": #"""
        {"type": "file", "key": "printout", "title": "Ray's week", "path": "/tmp/Ray's week.pdf", "detail": "Large print, ready to send"}
        """#,
        "why": why,
        "pill": why,
    ]
}
#endif
