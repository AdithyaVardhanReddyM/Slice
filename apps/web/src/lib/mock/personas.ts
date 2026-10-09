import type { Outcome, QlooEntityType, StoreKey } from "./types";

// Hand-written taste archetypes the mock conversations are generated from.
// Entity and tag names are our own seeds (see docs/demo-stores.md), not Qloo
// responses; IDs are derived locally.

export interface PersonaEntity {
  name: string;
  type: QlooEntityType;
  source: "questionnaire" | "chat";
}

export interface PersonaTag {
  name: string;
  weight: number;
  /** Indexes into `entities`. */
  from: number[];
}

export interface Scenario {
  intent: string;
  opener: string;
  reply: string;
  category: string[];
  room?: string;
  budget?: number;
  constraints: string[];
  picks: string[];
  /** Retrieved but not shown. */
  alsoRan: string[];
  followUp?: { ask: string; reply: string; picks: string[] };
  outcomes: Outcome[];
  /** For no_match scenarios: the unmet need. */
  gap?: string;
}

export interface Persona {
  id: string;
  label: string;
  store: StoreKey;
  entities: PersonaEntity[];
  tags: PersonaTag[];
  /** Style axis id → score, with the tag indexes that drove it. */
  styles: { style: string; score: number; from: number[] }[];
  palette: string[];
  materials: string[];
  answers: {
    domain: string;
    question: string;
    options: string[];
    choice: string;
    freeText?: string;
  }[];
  cities: [string, string][];
  scenarios: Scenario[];
}

export const personas: Persona[] = [
  {
    id: "quiet-naturalist",
    label: "Quiet naturalist",
    store: "marlow",
    entities: [
      { name: "Bon Iver", type: "artist", source: "questionnaire" },
      { name: "The Bridge", type: "tv_show", source: "questionnaire" },
      { name: "Norwegian Wood", type: "book", source: "questionnaire" },
      { name: "Kyoto", type: "place", source: "questionnaire" },
    ],
    tags: [
      { name: "minimalism", weight: 0.84, from: [1, 2, 3] },
      { name: "melancholic", weight: 0.77, from: [0, 1, 2] },
      { name: "nordic", weight: 0.72, from: [0, 1] },
      { name: "nature", weight: 0.69, from: [0, 3] },
      { name: "craftsmanship", weight: 0.61, from: [3] },
      { name: "contemplative", weight: 0.58, from: [0, 2] },
    ],
    styles: [
      { style: "japandi", score: 0.88, from: [0, 4, 5] },
      { style: "scandi-minimal", score: 0.81, from: [0, 2] },
      { style: "coastal", score: 0.34, from: [3] },
    ],
    palette: ["natural", "oak", "white", "charcoal", "clay", "black"],
    materials: ["oak", "linen", "paper", "stoneware", "cotton", "wool"],
    answers: [
      {
        domain: "Music",
        question: "Pick something you'd put on a slow Sunday morning",
        options: ["Bon Iver", "Fleet Foxes", "Sufjan Stevens", "The Shins"],
        choice: "Bon Iver",
      },
      {
        domain: "TV",
        question: "A show you'd happily rewatch",
        options: ["The Bridge", "Fleabag", "The Bear", "Succession"],
        choice: "The Bridge",
      },
      {
        domain: "Books",
        question: "A book that stayed with you",
        options: [
          "Norwegian Wood",
          "Normal People",
          "The Overstory",
          "Pachinko",
        ],
        choice: "Norwegian Wood",
      },
      {
        domain: "Travel",
        question: "A trip you'd take tomorrow",
        options: ["Kyoto", "Copenhagen", "Lisbon", "Oaxaca"],
        choice: "Kyoto",
      },
    ],
    cities: [
      ["Portland", "OR"],
      ["Seattle", "WA"],
      ["Minneapolis", "MN"],
    ],
    scenarios: [
      {
        intent: "Calmer bedroom, lighting",
        opener:
          "I'm trying to make my bedroom feel calmer. The overhead light is harsh, what would you put by the bed?",
        reply:
          "A soft, low light by the bed will do more than anything else. These three diffuse rather than spotlight, and they sit in the pale-wood, paper-and-linen world your picks point to.",
        category: ["Bedroom lighting", "Table lamps"],
        room: "bedroom",
        budget: 250,
        constraints: ["bedroom", "warm diffuse light", "≤ $250"],
        picks: ["mw-bed-17", "mw-lgt-15", "mw-bed-13"],
        alsoRan: ["mw-lgt-07", "mw-bed-19", "mw-lgt-09", "mw-dec-05"],
        followUp: {
          ask: "Love the paper lamp. What sheets would go with it?",
          reply:
            "Washed cotton in a muted clay or natural would keep it quiet. The Sato set is the closest match to the lamp's warmth.",
          picks: ["mw-bed-03", "mw-liv-34", "mw-liv-30"],
        },
        outcomes: ["purchased", "added_to_cart", "added_to_cart", "clicked"],
      },
      {
        intent: "Housewarming gift under $80",
        opener:
          "Need a housewarming gift for a friend, under $80. She's really into ceramics and slow living.",
        reply:
          "For someone into ceramics, a single good piece beats a set of small things. These are hand-finished and quiet enough to fit most homes.",
        category: ["Vases", "Candles & scent", "Utensils & boards"],
        budget: 80,
        constraints: ["gift", "≤ $80"],
        picks: ["mw-dec-09", "mw-kit-22", "mw-dec-01"],
        alsoRan: ["mw-dec-07", "mw-dec-05", "mw-kit-10", "mw-dec-11"],
        outcomes: ["added_to_cart", "clicked", "purchased"],
      },
      {
        intent: "Small living room shelving",
        opener:
          "Small apartment, living room is tight. I need somewhere to put books and plants that doesn't feel bulky.",
        reply:
          "In a tight room, open shelving that leans or floats keeps the floor visible. The Kiln ladder is the lightest-looking piece we make.",
        category: ["Shelving"],
        room: "living room",
        budget: 400,
        constraints: ["small apartment", "open storage", "≤ $400"],
        picks: ["mw-liv-20", "mw-liv-18", "mw-dec-15"],
        alsoRan: ["mw-liv-22", "mw-dec-13", "mw-dec-21"],
        outcomes: ["clicked", "browsing", "added_to_cart"],
      },
    ],
  },
  {
    id: "warm-retro",
    label: "Warm retro romantic",
    store: "marlow",
    entities: [
      { name: "Wes Anderson", type: "person", source: "chat" },
      { name: "Fleetwood Mac", type: "artist", source: "questionnaire" },
      { name: "Call Me by Your Name", type: "movie", source: "questionnaire" },
      { name: "Mexico City", type: "place", source: "questionnaire" },
    ],
    tags: [
      { name: "nostalgic", weight: 0.86, from: [0, 1, 2] },
      { name: "1970s", weight: 0.79, from: [1] },
      { name: "whimsical", weight: 0.73, from: [0] },
      { name: "warm color palette", weight: 0.7, from: [0, 2, 3] },
      { name: "mediterranean", weight: 0.62, from: [2] },
      { name: "symmetry", weight: 0.55, from: [0] },
    ],
    styles: [
      { style: "retro-70s", score: 0.86, from: [0, 1, 3] },
      { style: "maximalist-eclectic", score: 0.72, from: [2, 3] },
      { style: "mid-century", score: 0.57, from: [0, 5] },
    ],
    palette: ["burnt orange", "cream", "brass", "smoke", "amber", "walnut"],
    materials: ["brass", "smoked glass", "bouclé", "chrome", "walnut", "linen"],
    answers: [
      {
        domain: "Music",
        question: "Pick something you'd put on a slow Sunday morning",
        options: ["Fleetwood Mac", "Khruangbin", "Leon Bridges", "Big Thief"],
        choice: "Fleetwood Mac",
      },
      {
        domain: "Film",
        question: "A film you could watch on repeat",
        options: ["Call Me by Your Name", "Lady Bird", "Amélie", "Past Lives"],
        choice: "Call Me by Your Name",
      },
      {
        domain: "Travel",
        question: "A trip you'd take tomorrow",
        options: ["Mexico City", "Palm Springs", "Marrakech", "Copenhagen"],
        choice: "Mexico City",
        freeText: "or anywhere with good tiles honestly",
      },
    ],
    cities: [
      ["Austin", "TX"],
      ["Los Angeles", "CA"],
      ["Chicago", "IL"],
    ],
    scenarios: [
      {
        intent: "Reading corner floor lamp",
        opener:
          "I want my reading corner to feel like a Wes Anderson set. Warm, a bit 70s. Floor lamp ideas?",
        reply:
          "A warm, curved silhouette does most of the work there. All three throw amber-toned light and have the brass and smoke details that read as 70s without feeling like a costume.",
        category: ["Floor lamps", "Table lamps"],
        room: "living room",
        budget: 350,
        constraints: ["reading corner", "warm light", "≤ $350"],
        picks: ["mw-lgt-01", "mw-lgt-09", "mw-dec-25"],
        alsoRan: ["mw-lgt-05", "mw-lgt-03", "mw-dec-11"],
        followUp: {
          ask: "The arc lamp is perfect. Something to put my drink on next to the chair?",
          reply:
            "The Disco table has the same smoked glass and chrome as the Arlo's shade, so the corner reads as one idea.",
          picks: ["mw-liv-16", "mw-dec-11", "mw-liv-14"],
        },
        outcomes: ["purchased", "added_to_cart", "clicked"],
      },
      {
        intent: "Dinner party table",
        opener:
          "Hosting a dinner for 8 next weekend. I want the table to look fun, not matchy-matchy.",
        reply:
          "Mix one bold pattern with a warm solid and let the plates carry the color. These three work together without matching.",
        category: ["Table linens", "Tableware & ceramics", "Cookware"],
        room: "dining room",
        constraints: ["hosting", "serves 8"],
        picks: ["mw-kit-30", "mw-kit-12", "mw-kit-04"],
        alsoRan: ["mw-kit-14", "mw-kit-28", "mw-kit-26"],
        outcomes: ["added_to_cart", "clicked", "browsing"],
      },
    ],
  },
  {
    id: "after-dark-glam",
    label: "After-dark glam",
    store: "marlow",
    entities: [
      { name: "Beyoncé", type: "artist", source: "questionnaire" },
      { name: "Bridgerton", type: "tv_show", source: "questionnaire" },
      { name: "The Great Gatsby", type: "movie", source: "chat" },
    ],
    tags: [
      { name: "opulent", weight: 0.88, from: [1, 2] },
      { name: "glamorous", weight: 0.84, from: [0, 2] },
      { name: "romantic", weight: 0.71, from: [1] },
      { name: "jazz age", weight: 0.66, from: [2] },
      { name: "confident", weight: 0.6, from: [0] },
    ],
    styles: [
      { style: "art-deco-glam", score: 0.91, from: [0, 1, 3] },
      { style: "maximalist-eclectic", score: 0.6, from: [2, 4] },
    ],
    palette: ["emerald", "brass", "gold", "black", "sapphire", "noir"],
    materials: ["brass", "velvet", "marble", "glass", "copper"],
    answers: [
      {
        domain: "Music",
        question: "Pick something you'd put on getting ready to go out",
        options: ["Beyoncé", "SZA", "Dua Lipa", "Rosalía"],
        choice: "Beyoncé",
      },
      {
        domain: "TV",
        question: "A show you'd happily rewatch",
        options: ["Bridgerton", "Emily in Paris", "The Crown", "Insecure"],
        choice: "Bridgerton",
      },
    ],
    cities: [
      ["Atlanta", "GA"],
      ["New York", "NY"],
      ["Miami", "FL"],
    ],
    scenarios: [
      {
        intent: "Statement armchair",
        opener:
          "I want one statement chair for my living room. Think Gatsby, but I still want to actually sit in it.",
        reply:
          "Fluting and a jewel-toned velvet will give you the Gatsby note; all three are built for daily sitting, not just looking.",
        category: ["Sofas & armchairs"],
        room: "living room",
        budget: 900,
        constraints: ["statement piece", "comfortable", "≤ $900"],
        picks: ["mw-liv-08", "mw-lgt-05", "mw-liv-28"],
        alsoRan: ["mw-liv-04", "mw-liv-06", "mw-liv-22"],
        outcomes: ["purchased", "added_to_cart", "clicked"],
      },
      {
        intent: "Bar cart styling",
        opener:
          "Setting up a little bar corner for cocktails. What makes it look expensive?",
        reply:
          "Brass, smoke and one good scent. These three make a bar corner feel considered.",
        category: ["Glassware", "Candles & scent", "Coffee & tea"],
        constraints: ["hosting", "cocktails"],
        picks: ["mw-dec-03", "mw-kit-20", "mw-kit-32"],
        alsoRan: ["mw-kit-16", "mw-kit-14", "mw-lgt-13"],
        outcomes: ["added_to_cart", "clicked"],
      },
    ],
  },
  {
    id: "rustic-folk",
    label: "Folk & farmhouse",
    store: "marlow",
    entities: [
      { name: "Fleet Foxes", type: "artist", source: "questionnaire" },
      { name: "Gilmore Girls", type: "tv_show", source: "questionnaire" },
      { name: "Little Women", type: "movie", source: "questionnaire" },
    ],
    tags: [
      { name: "cozy", weight: 0.87, from: [1, 2] },
      { name: "pastoral", weight: 0.76, from: [0, 2] },
      { name: "small town", weight: 0.7, from: [1] },
      { name: "autumnal", weight: 0.64, from: [1, 2] },
      { name: "folk", weight: 0.62, from: [0] },
    ],
    styles: [
      { style: "cottage-rustic", score: 0.87, from: [0, 1, 2] },
      { style: "boho-global", score: 0.46, from: [4] },
      { style: "coastal", score: 0.28, from: [1] },
    ],
    palette: ["cream", "sage", "barn red", "oatmeal", "faded rose"],
    materials: ["stoneware", "wool", "cotton", "pine", "linen"],
    answers: [
      {
        domain: "Music",
        question: "Pick something you'd put on a slow Sunday morning",
        options: ["Fleet Foxes", "Bon Iver", "Joni Mitchell", "Mumford & Sons"],
        choice: "Fleet Foxes",
      },
      {
        domain: "TV",
        question: "A show you'd happily rewatch",
        options: [
          "Gilmore Girls",
          "Schitt's Creek",
          "Ted Lasso",
          "Anne with an E",
        ],
        choice: "Gilmore Girls",
      },
      {
        domain: "Film",
        question: "A film you could watch on repeat",
        options: ["Little Women", "Pride & Prejudice", "Amélie", "Paddington"],
        choice: "Little Women",
      },
    ],
    cities: [
      ["Burlington", "VT"],
      ["Asheville", "NC"],
      ["Madison", "WI"],
    ],
    scenarios: [
      {
        intent: "Cozy armchair + rug",
        opener:
          "We just moved into an old farmhouse. I want the front room to feel cozy for fall. Where do I start?",
        reply:
          "Start with one chair you'll actually sink into, then a rug to warm the floor. These are soft, patterned and made for old houses.",
        category: ["Sofas & armchairs", "Rugs", "Table lamps"],
        room: "living room",
        constraints: ["cozy", "fall"],
        picks: ["mw-liv-06", "mw-liv-26", "mw-lgt-07"],
        alsoRan: ["mw-liv-32", "mw-liv-30", "mw-liv-02"],
        outcomes: ["added_to_cart", "purchased", "clicked"],
      },
      {
        intent: "Outdoor rug",
        opener: "Do you have any outdoor rugs for a covered porch?",
        reply:
          "We don't make an outdoor rug yet, and I don't want to point you at an indoor wool rug that would mildew outside. For the porch, these are made for the weather.",
        category: ["Rugs", "Seating", "Lanterns"],
        room: "porch",
        constraints: ["outdoor", "weather resistant"],
        picks: ["mw-out-04", "mw-out-10", "mw-dec-13"],
        alsoRan: ["mw-liv-26", "mw-liv-24"],
        outcomes: ["no_match"],
        gap: "Outdoor rugs",
      },
    ],
  },
  {
    id: "line-cook",
    label: "Line-cook industrial",
    store: "marlow",
    entities: [
      { name: "The Bear", type: "tv_show", source: "questionnaire" },
      { name: "LCD Soundsystem", type: "artist", source: "questionnaire" },
      { name: "Anthony Bourdain", type: "person", source: "chat" },
    ],
    tags: [
      { name: "culinary", weight: 0.85, from: [0, 2] },
      { name: "urban", weight: 0.78, from: [0, 1] },
      { name: "gritty", weight: 0.69, from: [0, 2] },
      { name: "craft", weight: 0.63, from: [0] },
      { name: "loft", weight: 0.52, from: [1] },
    ],
    styles: [
      { style: "industrial", score: 0.84, from: [1, 2, 4] },
      { style: "japandi", score: 0.44, from: [3] },
      { style: "mid-century", score: 0.37, from: [1] },
    ],
    palette: ["matte black", "raw steel", "blued steel", "smoke grey"],
    materials: ["steel", "carbon steel", "reclaimed oak", "cast iron", "glass"],
    answers: [
      {
        domain: "TV",
        question: "A show you'd happily rewatch",
        options: ["The Bear", "Succession", "Severance", "Atlanta"],
        choice: "The Bear",
      },
      {
        domain: "Music",
        question: "Pick something for cooking on a Friday night",
        options: ["LCD Soundsystem", "Talking Heads", "Bon Iver", "Radiohead"],
        choice: "LCD Soundsystem",
      },
    ],
    cities: [
      ["Chicago", "IL"],
      ["Brooklyn", "NY"],
      ["Philadelphia", "PA"],
    ],
    scenarios: [
      {
        intent: "Serious home cook kit",
        opener:
          "I cook a lot and I'm sick of nonstick. What would a line cook actually use at home?",
        reply:
          "Carbon steel first: it takes a sear, lasts forever, and gets better with use. Then a kettle and a board that can take a beating.",
        category: ["Cookware", "Coffee & tea", "Utensils & boards"],
        room: "kitchen",
        constraints: ["durable", "no nonstick"],
        picks: ["mw-kit-02", "mw-kit-34", "mw-kit-22"],
        alsoRan: ["mw-kit-06", "mw-kit-04", "mw-kit-24"],
        outcomes: ["purchased", "added_to_cart"],
      },
      {
        intent: "Sleeper sofa",
        opener:
          "Do you have a sleeper sofa? Need somewhere for guests in my loft.",
        reply:
          "We don't make a sleeper yet. If the loft has the floor space, a deep sofa plus a good throw is what most people here end up doing. Here's what fits your space best.",
        category: ["Sofas & armchairs"],
        room: "living room",
        constraints: ["sleeper", "guests"],
        picks: ["mw-liv-02", "mw-liv-30", "mw-lgt-03"],
        alsoRan: ["mw-liv-04", "mw-liv-06"],
        outcomes: ["no_match"],
        gap: "Sleeper sofas",
      },
    ],
  },
  {
    id: "coastal-ease",
    label: "Coastal ease",
    store: "marlow",
    entities: [
      { name: "The White Lotus", type: "tv_show", source: "questionnaire" },
      { name: "Jack Johnson", type: "artist", source: "questionnaire" },
      { name: "Lisbon", type: "place", source: "questionnaire" },
    ],
    tags: [
      { name: "beach", weight: 0.83, from: [0, 1] },
      { name: "breezy", weight: 0.75, from: [1, 2] },
      { name: "sun-washed", weight: 0.68, from: [2] },
      { name: "relaxed", weight: 0.66, from: [1] },
    ],
    styles: [
      { style: "coastal", score: 0.86, from: [0, 1, 2] },
      { style: "boho-global", score: 0.51, from: [3] },
      { style: "scandi-minimal", score: 0.33, from: [1] },
    ],
    palette: ["white", "sea salt", "sand", "soft blue", "natural"],
    materials: ["linen", "jute", "rattan", "recycled glass", "rope"],
    answers: [
      {
        domain: "Music",
        question: "Pick something you'd put on a slow Sunday morning",
        options: [
          "Jack Johnson",
          "Khruangbin",
          "Norah Jones",
          "Vampire Weekend",
        ],
        choice: "Jack Johnson",
      },
      {
        domain: "TV",
        question: "A show you'd happily rewatch",
        options: [
          "The White Lotus",
          "Big Little Lies",
          "Normal People",
          "Ted Lasso",
        ],
        choice: "The White Lotus",
      },
      {
        domain: "Travel",
        question: "A trip you'd take tomorrow",
        options: ["Lisbon", "Tulum", "Big Sur", "Mykonos"],
        choice: "Lisbon",
      },
    ],
    cities: [
      ["San Diego", "CA"],
      ["Charleston", "SC"],
      ["Santa Cruz", "CA"],
    ],
    scenarios: [
      {
        intent: "Beachy bedroom refresh",
        opener:
          "Want my bedroom to feel like a beach house. Light, airy, not kitschy (no anchors please).",
        reply:
          "Washed linen and natural fibre will get you the beach house without a single anchor. These three are the core of it.",
        category: ["Bedding", "Pendants", "Baskets & storage"],
        room: "bedroom",
        constraints: ["airy", "no nautical motifs"],
        picks: ["mw-bed-01", "mw-lgt-11", "mw-dec-23"],
        alsoRan: ["mw-bed-03", "mw-dec-15", "mw-kit-26"],
        outcomes: ["added_to_cart", "clicked", "purchased", "abandoned"],
      },
    ],
  },

  // Fold
  {
    id: "night-street",
    label: "Night-shift streetwear",
    store: "fold",
    entities: [
      { name: "Kendrick Lamar", type: "artist", source: "questionnaire" },
      { name: "Euphoria", type: "tv_show", source: "questionnaire" },
      { name: "Seoul", type: "place", source: "questionnaire" },
    ],
    tags: [
      { name: "streetwear", weight: 0.88, from: [0, 2] },
      { name: "neon", weight: 0.72, from: [1] },
      { name: "y2k", weight: 0.7, from: [1, 2] },
      { name: "hip hop", weight: 0.68, from: [0] },
      { name: "bold", weight: 0.61, from: [1] },
    ],
    styles: [
      { style: "streetwear", score: 0.89, from: [0, 3] },
      { style: "y2k-retro", score: 0.74, from: [1, 2] },
      { style: "athletic", score: 0.42, from: [3] },
    ],
    palette: ["black", "silver", "metallic", "cloud white", "safety orange"],
    materials: ["nylon", "ripstop", "suede", "cotton fleece"],
    answers: [
      {
        domain: "Music",
        question: "What's on your headphones right now?",
        options: ["Kendrick Lamar", "Frank Ocean", "NewJeans", "Travis Scott"],
        choice: "Kendrick Lamar",
      },
      {
        domain: "TV",
        question: "A show you'd happily rewatch",
        options: ["Euphoria", "Atlanta", "Beef", "The Bear"],
        choice: "Euphoria",
      },
      {
        domain: "Travel",
        question: "A city whose street style you rate",
        options: ["Seoul", "Tokyo", "London", "Paris"],
        choice: "Seoul",
      },
    ],
    cities: [
      ["Los Angeles", "CA"],
      ["Brooklyn", "NY"],
      ["Houston", "TX"],
    ],
    scenarios: [
      {
        intent: "Going-out fit under $300",
        opener:
          "Need a fit for a show Saturday. Something that isn't just a hoodie. Under $300 total.",
        reply:
          "Cargo, a metallic bag and a shoe with some shine. These come from three different labels but read as one look.",
        category: ["Trousers", "Crossbody", "Sneakers"],
        budget: 300,
        constraints: ["night out", "≤ $300 total"],
        picks: ["fd-bot-11", "fd-bag-09", "fd-ftw-04"],
        alsoRan: ["fd-ftw-12", "fd-out-23", "fd-bot-07"],
        outcomes: ["purchased", "added_to_cart", "clicked"],
      },
    ],
  },
  {
    id: "trail-quiet",
    label: "Trailhead quiet",
    store: "fold",
    entities: [
      { name: "Bon Iver", type: "artist", source: "questionnaire" },
      { name: "The Bear", type: "tv_show", source: "questionnaire" },
      { name: "Patagonia (region)", type: "place", source: "questionnaire" },
    ],
    tags: [
      { name: "outdoors", weight: 0.86, from: [0, 2] },
      { name: "utilitarian", weight: 0.71, from: [1] },
      { name: "earthy", weight: 0.68, from: [0, 2] },
      { name: "workwear", weight: 0.6, from: [1] },
    ],
    styles: [
      { style: "gorpcore-outdoor", score: 0.87, from: [0, 2] },
      { style: "heritage-workwear", score: 0.71, from: [1, 3] },
      { style: "quiet-minimal", score: 0.39, from: [2] },
    ],
    palette: ["olive", "tobacco", "sage khaki", "black", "natural"],
    materials: ["waxed canvas", "fleece", "ripstop", "leather", "wool"],
    answers: [
      {
        domain: "Music",
        question: "What's on your headphones right now?",
        options: ["Bon Iver", "Fleet Foxes", "Big Thief", "Phoebe Bridgers"],
        choice: "Bon Iver",
      },
      {
        domain: "TV",
        question: "A show you'd happily rewatch",
        options: ["The Bear", "Severance", "Shōgun", "Fargo"],
        choice: "The Bear",
      },
    ],
    cities: [
      ["Denver", "CO"],
      ["Portland", "OR"],
      ["Salt Lake City", "UT"],
    ],
    scenarios: [
      {
        intent: "Fall layering for hikes",
        opener:
          "What should I layer for fall day hikes that also works for getting coffee after?",
        reply:
          "A fleece you can wear into town, a shell for the weather, and a boot that doesn't look like a hiking boot. Mixed across labels on purpose.",
        category: ["Shells & fleece", "Boots", "Backpacks"],
        constraints: ["fall", "hike-to-town"],
        picks: ["fd-out-19", "fd-ftw-16", "fd-bag-07"],
        alsoRan: ["fd-out-21", "fd-ftw-08", "fd-bag-05"],
        outcomes: ["added_to_cart", "purchased", "clicked"],
      },
    ],
  },
  {
    id: "quiet-minimal",
    label: "Gallery-quiet minimal",
    store: "fold",
    entities: [
      { name: "Past Lives", type: "movie", source: "questionnaire" },
      { name: "Phoebe Bridgers", type: "artist", source: "questionnaire" },
      { name: "Copenhagen", type: "place", source: "questionnaire" },
    ],
    tags: [
      { name: "understated", weight: 0.85, from: [0, 2] },
      { name: "introspective", weight: 0.74, from: [0, 1] },
      { name: "scandinavian", weight: 0.69, from: [2] },
      { name: "melancholic", weight: 0.62, from: [1] },
    ],
    styles: [
      { style: "quiet-minimal", score: 0.9, from: [0, 2] },
      { style: "romantic-boho", score: 0.38, from: [1] },
      { style: "preppy-ivy", score: 0.31, from: [2] },
    ],
    palette: ["optic white", "ecru", "charcoal", "camel", "light grey"],
    materials: ["cashmere", "poplin", "wool", "leather", "linen"],
    answers: [
      {
        domain: "Film",
        question: "A film you could watch on repeat",
        options: [
          "Past Lives",
          "Aftersun",
          "Lost in Translation",
          "Frances Ha",
        ],
        choice: "Past Lives",
      },
      {
        domain: "Music",
        question: "What's on your headphones right now?",
        options: ["Phoebe Bridgers", "Mitski", "Clairo", "boygenius"],
        choice: "Phoebe Bridgers",
      },
    ],
    cities: [
      ["San Francisco", "CA"],
      ["New York", "NY"],
      ["Boston", "MA"],
    ],
    scenarios: [
      {
        intent: "Capsule office pieces",
        opener:
          "Starting a new job in an office. I want a few pieces that look sharp but not try-hard.",
        reply:
          "An oversized white shirt, one great knit and a clean sneaker cover most weeks. These are the quietest versions we carry.",
        category: ["Shirts", "Knitwear", "Sneakers"],
        constraints: ["office", "capsule"],
        picks: ["fd-top-16", "fd-top-24", "fd-ftw-10"],
        alsoRan: ["fd-dre-04", "fd-out-15", "fd-bot-15"],
        outcomes: ["purchased", "added_to_cart", "browsing"],
      },
    ],
  },
];
