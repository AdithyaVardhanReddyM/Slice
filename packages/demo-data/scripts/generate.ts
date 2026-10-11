// Generates the two demo customer datasets. Deterministic: the same seed
// gives the same rows. Taste columns only use well-known real names so Qloo's
// /search resolves them; each dataset has latent groups baked in so the CSV
// clustering has something true to find.
//
//   pnpm --filter @slice/demo-data generate

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = path.resolve(import.meta.dirname, "..", "data");
mkdirSync(out, { recursive: true });

/* Deterministic RNG ------------------------------------------------------- */

function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    some: <T>(xs: readonly T[], n: number) => {
      const pool = [...xs];
      const res: T[] = [];
      while (res.length < n && pool.length) res.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      return res;
    },
    weighted: <T>(xs: readonly [T, number][]) => {
      const total = xs.reduce((a, [, w]) => a + w, 0);
      let r = next() * total;
      for (const [x, w] of xs) {
        r -= w;
        if (r <= 0) return x;
      }
      return xs[xs.length - 1][0];
    },
    chance: (p: number) => next() < p,
  };
}

const FIRST = [
  "Ava", "Noah", "Maya", "Liam", "Priya", "Ethan", "Sofia", "Jonas", "Amara", "Theo", "Nora", "Mateo", "Hannah", "Omar",
  "Elena", "Lucas", "Leah", "Felix", "Isla", "Arjun", "Clara", "Daniel", "Zoe", "Marcus", "Lena", "Kai", "Ruth", "Hugo",
  "Alice", "Samuel", "Ines", "Tobias", "Grace", "Ravi", "Mila", "Owen", "Freya", "Diego", "Anna", "Elliot", "Rosa",
  "Nathan", "Imogen", "Caleb", "Yara", "Oscar", "June", "Patrick", "Margot", "Ben",
];
const LAST = [
  "Carter", "Nguyen", "Okafor", "Lindqvist", "Moreno", "Patel", "Brennan", "Schulz", "Rossi", "Kim", "Haddad", "Novak",
  "Doyle", "Fischer", "Alves", "Sato", "Walsh", "Dubois", "Mendes", "Larsen", "Hughes", "Costa", "Weber", "Byrne",
];

const email = (first: string, last: string, i: number) =>
  `${first.toLowerCase()}.${last.toLowerCase()}${i % 7 === 0 ? i : ""}@example.com`;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.UTC(2026, 9, 11) - n * 86_400_000);

const csv = (rows: Record<string, string | number>[]) => {
  const cols = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c] ?? "")).join(","))].join("\n") + "\n";
};

/* Ridgeline Coffee Roasters -------------------------------------------------- */

type Group = {
  key: string;
  weight: number;
  artists: string[];
  brands: string[];
  interests: string[];
  cities: [string, string, number][]; // city, state, weight
  ages: [number, number];
  roasts: string[];
  brew: string[];
  flavour: string[];
  plan: [string, number][];
};

const RIDGELINE_GROUPS: Group[] = [
  {
    key: "third-wave",
    weight: 30,
    artists: ["Bon Iver", "Fleet Foxes", "Khruangbin", "Sufjan Stevens", "Big Thief", "Radiohead", "Phoebe Bridgers", "Nils Frahm", "Kamasi Washington", "Alabama Shakes"],
    brands: ["Aesop", "Patagonia", "Monocle", "Allbirds", "Le Labo", "Snow Peak", "Arc'teryx", "Kinfolk"],
    interests: ["pour-over", "ceramics", "hiking", "vinyl records", "farmers market", "natural wine", "film photography"],
    cities: [["Portland", "OR", 40], ["Seattle", "WA", 30], ["San Francisco", "CA", 15], ["Oakland", "CA", 8], ["Denver", "CO", 7]],
    ages: [26, 42],
    roasts: ["RC-ETH-01", "RC-COL-02", "RC-KEN-03", "RC-GUA-04", "RC-RWA-05", "RC-HND-06"],
    brew: ["pour-over", "AeroPress", "Chemex", "French press"],
    flavour: ["bright and fruity", "floral", "tea-like", "juicy acidity"],
    plan: [["Single origin rotation", 55], ["none", 30], ["Roaster's choice", 15]],
  },
  {
    key: "home-espresso",
    weight: 28,
    artists: ["Taylor Swift", "Dua Lipa", "The Weeknd", "Harry Styles", "Drake", "Olivia Rodrigo", "Billie Eilish", "Coldplay", "Ed Sheeran", "SZA"],
    brands: ["Apple", "Lululemon", "Nike", "Peloton", "Dyson", "Nespresso", "Stanley", "Away"],
    interests: ["podcasts", "running", "home office", "meal prep", "Peloton", "reality TV", "travel hacks"],
    cities: [["Seattle", "WA", 30], ["Portland", "OR", 25], ["San Francisco", "CA", 15], ["Denver", "CO", 10], ["Los Angeles", "CA", 12], ["Phoenix", "AZ", 8]],
    ages: [27, 48],
    roasts: ["RC-BLD-07", "RC-BLD-08", "RC-ESP-09", "RC-DEC-10", "RC-INS-11"],
    brew: ["espresso machine", "Moka pot", "Nespresso-compatible", "drip machine"],
    flavour: ["chocolate", "caramel", "smooth", "low acidity", "nutty"],
    plan: [["House espresso", 50], ["none", 35], ["Roaster's choice", 15]],
  },
  {
    key: "gift-buyers",
    weight: 22,
    artists: ["Fleetwood Mac", "Norah Jones", "Bruce Springsteen", "Adele", "Diana Krall", "James Taylor", "Paul Simon", "The Beatles", "Sade", "Van Morrison"],
    brands: ["Williams Sonoma", "Le Creuset", "L.L.Bean", "Crate & Barrel", "Nordstrom", "Pendleton", "Sur La Table", "Barnes & Noble"],
    interests: ["cooking", "gardening", "book club", "travel", "grandchildren", "wine tasting", "jazz"],
    cities: [["Portland", "OR", 20], ["Seattle", "WA", 15], ["Chicago", "IL", 12], ["Boston", "MA", 10], ["Minneapolis", "MN", 10], ["Sacramento", "CA", 8], ["Austin", "TX", 5], ["Nashville", "TN", 8], ["Philadelphia", "PA", 12]],
    ages: [45, 68],
    roasts: ["RC-GFT-12", "RC-GFT-13", "RC-GFT-14", "RC-BLD-07", "RC-DEC-10"],
    brew: ["drip machine", "French press", "pour-over"],
    flavour: ["classic", "chocolate", "balanced", "smooth"],
    plan: [["none", 70], ["Roaster's choice", 20], ["House espresso", 10]],
  },
  {
    key: "austin",
    weight: 20,
    artists: ["Spoon", "Gary Clark Jr.", "Khruangbin", "Black Pumas", "Leon Bridges", "Willie Nelson", "Shakey Graves", "Explosions in the Sky", "Tame Impala", "Kacey Musgraves"],
    brands: ["Yeti", "Howler Brothers", "Tecovas", "Allbirds", "Whole Foods Market", "Alamo Drafthouse", "Topo Chico", "Patagonia"],
    interests: ["live music", "breakfast tacos", "Barton Springs", "Austin City Limits", "swimming", "trail running", "food trucks"],
    cities: [["Austin", "TX", 85], ["Round Rock", "TX", 8], ["San Marcos", "TX", 7]],
    ages: [23, 40],
    roasts: ["RC-COL-02", "RC-BLD-08", "RC-ETH-01", "RC-INS-11", "RC-ESP-09"],
    brew: ["cold brew", "pour-over", "espresso machine", "AeroPress"],
    flavour: ["bright and fruity", "chocolate", "cold brew friendly", "juicy acidity"],
    plan: [["none", 60], ["Single origin rotation", 25], ["House espresso", 15]],
  },
];

function ridgeline(n: number) {
  const r = rng(20261011);
  const rows: Record<string, string | number>[] = [];
  for (let i = 0; i < n; i++) {
    const g = r.weighted(RIDGELINE_GROUPS.map((x) => [x, x.weight] as [Group, number]));
    const first = r.pick(FIRST);
    const last = r.pick(LAST);
    const [city, state] = r.weighted(g.cities.map(([c, s, w]) => [[c, s] as [string, string], w] as [[string, string], number]));
    const age = r.int(g.ages[0], g.ages[1]);
    const joinedDays = g.key === "austin" ? r.int(5, 120) : r.int(30, 900);
    const orders = g.key === "gift-buyers" ? r.int(1, 5) : Math.max(1, Math.round(joinedDays / r.int(25, 60)));
    const plan = r.weighted(g.plan);
    const ltv = Math.round(orders * (plan === "none" ? r.int(18, 42) : r.int(24, 38)) + (g.key === "gift-buyers" ? r.int(30, 90) : 0));
    const lastOrder = g.key === "gift-buyers" ? (r.chance(0.6) ? r.int(290, 330) : r.int(5, 120)) : r.int(1, Math.min(joinedDays, 90));
    rows.push({
      id: `RC-${String(10001 + i)}`,
      email: email(first, last, i),
      first_name: first,
      city,
      state,
      country: "US",
      age,
      gender: r.weighted([["female", 52], ["male", 44], ["non-binary", 4]]),
      joined_at: iso(daysAgo(joinedDays)),
      plan,
      orders,
      ltv,
      last_order_at: iso(daysAgo(lastOrder)),
      roasts_bought: r.some(g.roasts, r.int(1, 3)).join("; "),
      brew_method: r.pick(g.brew),
      flavour_prefs: r.some(g.flavour, r.int(1, 2)).join("; "),
      favourite_artists: r.some(g.artists, r.int(2, 3)).join("; "),
      favourite_brands: r.some(g.brands, r.int(1, 3)).join("; "),
      interests: r.some(g.interests, r.int(1, 3)).join("; "),
      source: g.key === "austin" ? "austin-waitlist" : r.weighted([["web", 60], ["cafe", 25], ["instagram", 15]]),
    });
  }
  return rows;
}

/* Saltline Hotels -------------------------------------------------------------- */

type GuestGroup = {
  key: string;
  weight: number;
  artists: string[];
  films: string[];
  places: string[];
  interests: string[];
  homes: [string, string, number][];
  ages: [number, number];
  party: [string, number][];
  tiers: [string, number][];
  experiences: string[];
  dining: string[];
};

const SALTLINE_GROUPS: GuestGroup[] = [
  {
    key: "design-culture",
    weight: 38,
    artists: ["Radiohead", "Björk", "Nils Frahm", "Caribou", "Jamie xx", "Four Tet", "Portishead", "Christine and the Queens", "Rosalía", "Arca"],
    films: ["Call Me by Your Name", "The Grand Budapest Hotel", "Portrait of a Lady on Fire", "Lost in Translation", "Parasite", "Past Lives", "Columbus", "Drive My Car"],
    places: ["Tate Modern", "Louisiana Museum of Modern Art", "MoMA", "Fondation Louis Vuitton", "Serpentine Galleries", "Barbican Centre", "Berghain", "Design Museum"],
    interests: ["architecture", "galleries", "design shops", "ceramics", "photography", "mid-century furniture", "independent cinema"],
    homes: [["London", "GB", 32], ["Berlin", "DE", 24], ["New York", "US", 16], ["Paris", "FR", 12], ["Stockholm", "SE", 8], ["Amsterdam", "NL", 5], ["Milan", "IT", 3]],
    ages: [28, 46],
    party: [["couple", 55], ["solo", 30], ["friends", 15]],
    tiers: [["Studio", 25], ["Corner room", 40], ["Terrace suite", 30], ["Loft", 5]],
    experiences: ["Gallery walk with a curator", "Architecture by bike", "Ceramics morning", "Tile workshop", "Vinyl listening session"],
    dining: ["small plates", "natural wine", "omakase", "vegetarian"],
  },
  {
    key: "food-wine",
    weight: 34,
    artists: ["Khruangbin", "Anderson .Paak", "Erykah Badu", "Fela Kuti", "Buena Vista Social Club", "Amy Winehouse", "Nina Simone", "Arctic Monkeys", "Fontaines D.C.", "Jorja Smith"],
    films: ["The Bear", "Chef's Table", "Ratatouille", "Julie & Julia", "Big Night", "Jiro Dreams of Sushi", "Somm", "The Menu", "Boiling Point"],
    places: ["Noma", "Septime", "St. John", "Barrafina", "Borough Market", "Le Chateaubriand", "Lyle's", "Eleven Madison Park", "Mercado de la Boqueria"],
    interests: ["natural wine", "chef's table", "food markets", "cooking classes", "cocktail bars", "cheese", "seafood"],
    homes: [["London", "GB", 30], ["Paris", "FR", 22], ["New York", "US", 24], ["Berlin", "DE", 8], ["Dublin", "IE", 6], ["Amsterdam", "NL", 5], ["Milan", "IT", 5]],
    ages: [30, 55],
    party: [["couple", 60], ["friends", 25], ["solo", 15]],
    tiers: [["Corner room", 40], ["Terrace suite", 35], ["Studio", 15], ["Loft", 10]],
    experiences: ["Natural wine dinner", "Market breakfast with the chef", "Fishermen's morning", "Vermouth hour", "Bakery crawl"],
    dining: ["chef's table", "natural wine", "seafood", "tasting menu", "late dinners"],
  },
  {
    key: "slow-travel",
    weight: 28,
    artists: ["Bon Iver", "Ólafur Arnalds", "Norah Jones", "Jack Johnson", "Fleet Foxes", "Sigur Rós", "Angus & Julia Stone", "Ben Howard", "First Aid Kit", "José González"],
    films: ["The Secret Life of Walter Mitty", "Nomadland", "Wild", "Chef", "Little Miss Sunshine", "Paddington 2", "The Darjeeling Limited", "Before Sunrise"],
    places: ["Hyde Park", "Central Park", "Tiergarten", "Jardin du Luxembourg", "Kew Gardens", "Brooklyn Botanic Garden", "Vondelpark", "Phoenix Park"],
    interests: ["surfing", "hiking", "yoga", "slow mornings", "beaches", "family time", "sailing", "reading"],
    homes: [["London", "GB", 28], ["New York", "US", 20], ["Amsterdam", "NL", 14], ["Dublin", "IE", 12], ["Paris", "FR", 10], ["Stockholm", "SE", 10], ["Berlin", "DE", 6]],
    ages: [32, 62],
    party: [["family", 45], ["couple", 45], ["solo", 10]],
    tiers: [["Terrace suite", 40], ["Loft", 25], ["Corner room", 30], ["Studio", 5]],
    experiences: ["Surf morning", "Coastal hike and picnic", "Sunrise yoga on the roof", "Sailing afternoon", "Kids' pastry class"],
    dining: ["long breakfasts", "family tables", "grilled fish", "vegetarian", "early dinners"],
  },
];

const PROPERTIES: [string, number][] = [["Saltline Lisbon", 45], ["Saltline Copenhagen", 30], ["Saltline Barcelona", 25]];

function saltline(n: number) {
  const r = rng(20261012);
  const rows: Record<string, string | number>[] = [];
  for (let i = 0; i < n; i++) {
    const g = r.weighted(SALTLINE_GROUPS.map((x) => [x, x.weight] as [GuestGroup, number]));
    const first = r.pick(FIRST);
    const last = r.pick(LAST);
    const [home, country] = r.weighted(g.homes.map(([c, k, w]) => [[c, k] as [string, string], w] as [[string, string], number]));
    const party = r.weighted(g.party);
    const nights = g.key === "slow-travel" ? r.int(4, 9) : r.int(2, 5);
    const tier = r.weighted(g.tiers);
    const rate = { Studio: 190, "Corner room": 260, "Terrace suite": 390, Loft: 520 }[tier] ?? 260;
    const stays = r.weighted([[1, 55], [2, 30], [3, 15]]);
    rows.push({
      id: `SL-${String(50001 + i)}`,
      email: email(first, last, i),
      first_name: first,
      home_city: home,
      home_country: country,
      age: r.int(g.ages[0], g.ages[1]),
      gender: r.weighted([["female", 50], ["male", 46], ["non-binary", 4]]),
      party_type: party,
      property: r.weighted(PROPERTIES),
      stays,
      nights,
      room_tier: tier,
      spend: Math.round(nights * rate * (0.9 + r.next() * 0.4) * stays),
      experiences_booked: r.some(g.experiences, r.int(0, 2)).join("; "),
      dining_prefs: r.some(g.dining, r.int(1, 2)).join("; "),
      favourite_artists: r.some(g.artists, r.int(2, 3)).join("; "),
      favourite_films: r.some(g.films, r.int(1, 2)).join("; "),
      favourite_places: r.some(g.places, r.int(1, 2)).join("; "),
      interests: r.some(g.interests, r.int(1, 3)).join("; "),
      last_stay: iso(daysAgo(r.int(20, 540))),
      newsletter: r.chance(0.72) ? "yes" : "no",
    });
  }
  return rows;
}

const rc = ridgeline(450);
const sl = saltline(400);
writeFileSync(path.join(out, "ridgeline-customers.csv"), csv(rc));
writeFileSync(path.join(out, "saltline-guests.csv"), csv(sl));

const uniq = (rows: Record<string, string | number>[], cols: string[]) => {
  const set = new Set<string>();
  for (const row of rows) for (const c of cols) for (const t of String(row[c]).split(";")) if (t.trim()) set.add(t.trim());
  return set.size;
};
console.log(`ridgeline-customers.csv: ${rc.length} rows, ${uniq(rc, ["favourite_artists", "favourite_brands", "interests"])} unique taste terms`);
console.log(`saltline-guests.csv: ${sl.length} rows, ${uniq(sl, ["favourite_artists", "favourite_films", "favourite_places", "interests"])} unique taste terms`);
