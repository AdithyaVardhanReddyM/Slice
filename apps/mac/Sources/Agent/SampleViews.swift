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

    /// Quick picks cards (`-sampleViews picks|picks-music|picks-book|picks-place`): real Qloo picks and reasons
    /// (recommend + explainability standouts) for Past Lives, Aftersun, Frank Ocean, Mitski and Bon Iver, 2026-10-26.
    static let picks: [String: (ask: String, say: String, card: String)] = [
        "picks": ("What should I watch tonight?", "Try Frances Ha. It has the same tender, restless heart as your Bon Iver and Mitski records.", #"""
        {"id": "s-film", "kind": "movie", "genre": null, "title": "Films for you", "taste": "yours", "items": [{"name": "Frances Ha", "image": "https://images.qloo.com/i/EFD8B201-CC97-462C-AFE2-5CC6352239E6-420x-auto.jpg", "year": 2012, "description": "Frances Ha (2012), directed by Noah Baumbach and starring Greta Gerwig, Mickey Sumner, and Adam Driver, is a black-and-white comedy-drama with romantic elements. It follows a young New York dance apprentice who pursues an increasingly elusi", "kind": "movie", "because": ["Bon Iver", "Mitski"]}, {"name": "The Worst Person in the World", "image": "https://images.qloo.com/i/13593D69-566D-4E74-880C-BB7A1C1511E1-420x-auto.jpg", "year": 2021, "description": "The Worst Person in the World (2021), directed by Joachim Trier and co-written with Eskil Vogt, stars Renate Reinsve, Anders Danielsen Lie, and Herbert Nordrum in a comedy-drama-romance about a young woman's four-year search for identity. T", "kind": "movie", "because": ["Aftersun", "Past Lives"]}, {"name": "Cha Cha Real Smooth", "image": "https://images.qloo.com/i/387F917E-1972-4503-A107-68FB723A4F72-420x-auto.jpg", "year": 2022, "description": "Cha Cha Real Smooth (2022), written and directed by Cooper Raiff, stars Cooper Raiff alongside Dakota Johnson, Vanessa Burghardt, Evan Assante, Leslie Mann, and Brad Garrett. The film is a comedy-drama coming-of-age story about a young man ", "kind": "movie", "because": ["Past Lives", "Aftersun"]}]}
        """#),
        "picks-music": ("Who should I listen to next?", "Phoebe Bridgers. She sits right between Aftersun's ache and Frank Ocean's quiet.", #"""
        {"id": "s-music", "kind": "artist", "genre": null, "title": "Artists for you", "taste": "yours", "items": [{"name": "Phoebe Bridgers", "image": "https://images.qloo.com/i/AFBC71A7-9439-4AB0-AB68-D14B11AAF836-420x-auto.jpg", "description": "Phoebe Bridgers is an American singer-songwriter celebrated for intimate, literate songs that blend indie rock and folk. She first gained attention with early EPs and her 2017 debut album 'Stranger in the Alps', established herself as a dis", "kind": "artist", "because": ["Aftersun", "Frank Ocean"]}, {"name": "Perfume Genius", "image": "https://images.qloo.com/i/2500BC06-F6E9-4AD6-8B6C-9B5DC8BAD3E6-420x-auto.jpg", "description": "Perfume Genius is the musical project of Mike Hadreas, an American singer-songwriter and musician. Known for his deeply personal and emotionally charged lyrics, Hadreas blends elements of indie pop, art pop, and experimental music to create", "kind": "artist", "because": ["Past Lives", "Bon Iver"]}, {"name": "Lucy Dacus", "image": "https://images.qloo.com/i/99FBEE0C-2A8A-4EE2-9B20-8CEBD854CD46-420x-auto.jpg", "description": "Lucy Dacus is an American singer-songwriter from Richmond, Virginia, celebrated for literate, deeply personal songwriting, a warm alto voice, and arrangements that build from sparse intimacy to cathartic crescendos. She released her debut a", "kind": "artist", "because": ["Mitski", "Aftersun"]}]}
        """#),
        "picks-book": ("Give me a book for the weekend", "A Little Devil in America, by Hanif Abdurraqib. It reads like the liner notes to everything you love.", #"""
        {"id": "s-book", "kind": "book", "genre": null, "title": "Books for you", "taste": "yours", "items": [{"name": "A Little Devil in America: Notes in Praise of Black Performance", "image": "https://images.qloo.com/i/CEA70E01-7BF7-4BBE-9FE9-C7DBBCDC8D3D-420x-auto.jpg", "description": "A reflection on Black performance in America, inspired by Josephine Baker's words, exploring its cultural significance.", "kind": "book", "because": ["Mitski", "Frank Ocean"]}, {"name": "The Pink Line: Journeys Across the World's Queer Frontiers", "image": "https://images.qloo.com/i/7AD25D7E-2DD7-4E44-B184-60F961DA4968-420x-auto.jpg", "description": "A global exploration of the divide and unity brought by sexuality and gender identity issues.", "kind": "book", "because": ["Mitski", "Aftersun"]}, {"name": "Consumed: On Colonialism, Climate Change, Consumerism, and the Need for Collective Change", "image": "https://images.qloo.com/i/B7C312E1-1FC2-4403-BCA2-CD2A0717AAA6-420x-auto.jpg", "description": "Aja Barber's 'Consumed' explores the injustices in consumer industries and challenges readers to rethink their consumption habits.", "kind": "book", "because": ["Aftersun", "Frank Ocean"]}]}
        """#),
        "picks-place": ("Find dinner near me", "Land to Sea on Graham Avenue. It's cosy and cheap, with red bean buns and wine, and it fits your Frank Ocean side.", #"""
        {"id": "s-place", "kind": "place", "genre": "restaurant", "title": "Dinner near Williamsburg", "taste": "yours", "items": [{"name": "Land to Sea", "image": "https://images.qloo.com/i/BCCE6C5A-0D22-4653-8C13-FC6E8D5E5947-420x-auto.jpg", "description": "Brooklyn cafe and creative space serving coffee, wine, Asian-inspired comfort food and signature red bean buns in a cozy wine-bar setting.", "neighborhood": "Williamsburg", "address": "402 Graham Ave Brooklyn, NY 11211", "price_level": 1, "kind": "place", "lat": 40.716837999999996, "lon": -73.9445622, "because": ["Frank Ocean", "Mitski"]}, {"name": "Puerh Brooklyn teashop", "image": "https://images.qloo.com/i/7D74B102-A9A0-49E6-9F2B-4653B7531747-420x-auto.jpg", "description": "Williamsburg teashop and gallery specializing in Puerh tea, hands-on tea ceremonies, workshops, and curated artist-made teaware.", "neighborhood": "Williamsburg", "address": "174 Grand St Brooklyn, NY 11211", "kind": "place", "lat": 40.7143355, "lon": -73.9611974, "because": ["Aftersun", "Past Lives"]}, {"name": "Baby's All Right", "image": "https://images.qloo.com/i/CF8503DF-2014-42D7-9437-0082A70CC58E-420x-auto.jpg", "description": "Brooklyn spot with nightly live music, creative cocktails, and gourmet bar fare, plus weekend brunch.", "neighborhood": "Williamsburg", "address": "146 Broadway Brooklyn, NY 11211", "kind": "place", "lat": 40.710127799999995, "lon": -73.9634861, "because": ["Mitski", "Aftersun"]}]}
        """#),
    ]
}
#endif
