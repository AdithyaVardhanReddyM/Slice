// Mock data for widget creation, setup and install. Client-safe: no catalog
// imports here, so setup components can read it directly.

import type { CatalogSourceKind, SetupStep } from "./types";

/* Steps ------------------------------------------------------------------- */

export const SETUP_STEPS: {
  id: SetupStep;
  label: string;
  summary: string;
  estimate: string;
}[] = [
  {
    id: "store",
    label: "Store profile",
    summary: "What you sell and who for",
    estimate: "2 min",
  },
  {
    id: "catalog",
    label: "Catalog",
    summary: "Connect products, map fields",
    estimate: "3 min",
  },
  {
    id: "taste",
    label: "Taste signals",
    summary: "What the questionnaire asks",
    estimate: "2 min",
  },
  {
    id: "concierge",
    label: "Concierge",
    summary: "Name, voice and guardrails",
    estimate: "2 min",
  },
  {
    id: "appearance",
    label: "Appearance",
    summary: "How it looks on your site",
    estimate: "1 min",
  },
  {
    id: "install",
    label: "Install",
    summary: "Add the script and verify",
    estimate: "1 min",
  },
];

/* Create widget ----------------------------------------------------------- */

export const VERTICALS = [
  { id: "home", label: "Home & living", examples: "Furniture, decor, kitchen" },
  {
    id: "fashion",
    label: "Fashion & apparel",
    examples: "Clothing, shoes, bags",
  },
  { id: "beauty", label: "Beauty", examples: "Skincare, makeup, fragrance" },
  { id: "food", label: "Food & drink", examples: "Wine, coffee, pantry" },
  { id: "books", label: "Books & media", examples: "Books, vinyl, film" },
  { id: "outdoor", label: "Outdoor & sport", examples: "Gear, apparel, bikes" },
  { id: "other", label: "Other", examples: "Anything else" },
] as const;

export type VerticalId = (typeof VERTICALS)[number]["id"];

export const MARKETS = [
  { code: "US", name: "United States", currency: "USD" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "IE", name: "Ireland", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "IT", name: "Italy", currency: "EUR" },
  { code: "ES", name: "Spain", currency: "EUR" },
  { code: "NL", name: "Netherlands", currency: "EUR" },
  { code: "SE", name: "Sweden", currency: "SEK" },
  { code: "DK", name: "Denmark", currency: "DKK" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "NZ", name: "New Zealand", currency: "NZD" },
  { code: "JP", name: "Japan", currency: "JPY" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "MX", name: "Mexico", currency: "MXN" },
  { code: "BR", name: "Brazil", currency: "BRL" },
] as const;

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "SEK",
  "DKK",
  "SGD",
  "INR",
  "MXN",
  "BRL",
] as const;

/* Store profile ------------------------------------------------------------ */

export type PriceTier = "budget" | "mid" | "premium";

export interface StoreProfileDraft {
  description: string;
  sellOptions: string[];
  sells: string[];
  audience: string;
  price: PriceTier;
  priceNote: string;
  voice: string[];
  regions: string[];
  /** Pages the "draft from your site" pass pretends to read. */
  pagesRead: string[];
}

export const VOICE_OPTIONS = [
  "warm",
  "expert",
  "playful",
  "minimal",
  "direct",
  "poetic",
  "irreverent",
  "reassuring",
];

export const REGION_OPTIONS = [
  "United States",
  "Canada",
  "United Kingdom",
  "European Union",
  "Australia",
  "Japan",
];

export const ostroProfile: StoreProfileDraft = {
  description:
    "Ostro is a natural wine club and bottle shop. We import from small growers in Sicily, the Jura, Slovenia and the Loire: low-intervention, mostly organic, many under 2,000 bottles a vintage. Members get three bottles a month with tasting notes; anyone can buy single bottles.",
  sellOptions: [
    "Red",
    "White",
    "Orange & skin-contact",
    "Rosé",
    "Sparkling & pét-nat",
    "Low & no alcohol",
    "Gift sets",
    "Club memberships",
    "Glassware",
  ],
  sells: [
    "Red",
    "White",
    "Orange & skin-contact",
    "Sparkling & pét-nat",
    "Club memberships",
  ],
  audience:
    "Curious drinkers, mostly 28–45, who know what they like to eat and want help finding wine to match. Many are new to natural wine and put off by jargon.",
  price: "mid",
  priceNote: "Most bottles $24–$48",
  voice: ["warm", "expert"],
  regions: ["United States"],
  pagesRead: ["/", "/about", "/club", "/shop/orange", "+ 10 product pages"],
};

/** Hand-written profile parts for the demo stores; description and categories come from their catalogs. */
export const demoProfiles: Record<
  string,
  Pick<
    StoreProfileDraft,
    "audience" | "price" | "priceNote" | "voice" | "regions"
  >
> = {
  marlow: {
    audience:
      "Renters and first-time buyers, 27–42, furnishing small apartments. They care how things are made and want pieces that survive a move.",
    price: "mid",
    priceNote: "Most items $40–$1,200",
    voice: ["warm", "reassuring"],
    regions: ["United States", "Canada"],
  },
  fold: {
    audience:
      "Style-literate shoppers, 22–38, who mix big labels with small studios and shop by look rather than brand.",
    price: "mid",
    priceNote: "Most items $45–$380",
    voice: ["direct", "playful"],
    regions: ["United States", "Canada", "United Kingdom"],
  },
};

/* Catalog ------------------------------------------------------------------ */

export type SliceField =
  | "id"
  | "title"
  | "description"
  | "price"
  | "image"
  | "category"
  | "style"
  | "material"
  | "colors"
  | "tags"
  | "inventory";

export const SLICE_FIELDS: {
  id: SliceField;
  required: boolean;
  help: string;
}[] = [
  { id: "id", required: true, help: "Stable product ID" },
  { id: "title", required: true, help: "Product name" },
  { id: "description", required: true, help: "What taste is matched against" },
  { id: "price", required: true, help: "Numeric, store currency" },
  { id: "image", required: true, help: "Absolute URL" },
  { id: "category", required: true, help: "Used to read intent" },
  { id: "style", required: false, help: "Your style vocabulary" },
  { id: "material", required: false, help: "Material or composition" },
  { id: "colors", required: false, help: "Color names" },
  { id: "tags", required: false, help: "Free-form tags" },
  { id: "inventory", required: false, help: "Stock count or in/out" },
];

export interface MappingRow {
  field: SliceField;
  /** null = not mapped. */
  column: string | null;
  sample: string;
  /** Auto-match confidence, 0–1. */
  confidence: number;
}

export interface CoverageRow {
  field: string;
  value: number;
  /** Coverage once Slice infers missing values from descriptions. */
  projected?: number;
}

export interface SampleProduct {
  id: string;
  title: string;
  brand?: string;
  category: string;
  price: number;
  image: string | null;
  /** Placeholder tint when there's no image. */
  tint?: string;
  style: string[];
  material: string[];
  /** Values Slice would infer when inference is on. */
  inferredStyle?: string[];
  inferredMaterial?: string[];
}

export interface CatalogPreview {
  source: CatalogSourceKind;
  /** File name, feed URL or connected store. */
  label: string;
  rows: number;
  columns: string[];
  mapping: MappingRow[];
  unmapped: string[];
  coverage: CoverageRow[];
  samples: SampleProduct[];
  syncedAgo?: string;
}

export const ostroCatalog: CatalogPreview = {
  source: "upload",
  label: "ostro-catalog.csv",
  rows: 248,
  columns: [
    "sku",
    "name",
    "producer",
    "vintage",
    "description",
    "price_usd",
    "image_url",
    "type",
    "region",
    "grape",
    "style_notes",
    "color",
    "tags",
    "stock_qty",
  ],
  mapping: [
    { field: "id", column: "sku", sample: "OST-ETN-22", confidence: 1 },
    {
      field: "title",
      column: "name",
      sample: "2022 Etna Rosso",
      confidence: 0.98,
    },
    {
      field: "description",
      column: "description",
      sample: "Volcanic and bright: sour cherry, crushed rock, a little smoke…",
      confidence: 1,
    },
    { field: "price", column: "price_usd", sample: "34.00", confidence: 0.96 },
    {
      field: "image",
      column: "image_url",
      sample: "https://cdn.ostro.wine/p/etna-rosso-22.jpg",
      confidence: 0.94,
    },
    { field: "category", column: "type", sample: "Red", confidence: 0.71 },
    {
      field: "style",
      column: "style_notes",
      sample: "light, volcanic, savory",
      confidence: 0.62,
    },
    {
      field: "material",
      column: "grape",
      sample: "Nerello Mascalese",
      confidence: 0.58,
    },
    { field: "colors", column: "color", sample: "ruby", confidence: 0.88 },
    {
      field: "tags",
      column: "tags",
      sample: "natural, organic, sicily",
      confidence: 1,
    },
    { field: "inventory", column: "stock_qty", sample: "41", confidence: 0.93 },
  ],
  unmapped: ["producer", "vintage", "region"],
  coverage: [
    { field: "description", value: 1 },
    { field: "category", value: 1 },
    { field: "image", value: 0.97 },
    { field: "colors", value: 0.88 },
    { field: "material", value: 0.81, projected: 0.96 },
    { field: "tags", value: 0.72 },
    { field: "style", value: 0.64, projected: 0.93 },
  ],
  samples: [
    {
      id: "OST-ETN-22",
      title: "2022 Etna Rosso",
      brand: "Vigna Lavica",
      category: "Red",
      price: 34,
      image: null,
      tint: "#7a1f3d",
      style: ["light", "volcanic"],
      material: ["Nerello Mascalese"],
    },
    {
      id: "OST-BRD-21",
      title: "2021 Ramato “Sottobosco”",
      brand: "Casa Brda",
      category: "Orange & skin-contact",
      price: 29,
      image: null,
      tint: "#c26a1e",
      style: [],
      material: ["Pinot Grigio"],
      inferredStyle: ["textured", "savory"],
    },
    {
      id: "OST-LOI-NV",
      title: "NV Pét-Nat Rosé “Petit Orage”",
      brand: "Les Grès Bleus",
      category: "Sparkling & pét-nat",
      price: 26,
      image: null,
      tint: "#d98a8a",
      style: ["fresh", "fruit-forward"],
      material: [],
      inferredMaterial: ["Gamay", "Grolleau"],
    },
  ],
};

/* Taste signals ------------------------------------------------------------ */

export type TasteDomain =
  | "music"
  | "film"
  | "tv"
  | "books"
  | "dining"
  | "travel"
  | "podcasts"
  | "brands";

export const TASTE_DOMAINS: {
  id: TasteDomain;
  label: string;
  entity: string;
  question: string;
}[] = [
  {
    id: "music",
    label: "Music",
    entity: "urn:entity:artist",
    question: "Who's been on repeat for you lately?",
  },
  {
    id: "film",
    label: "Film",
    entity: "urn:entity:movie",
    question: "Pick a film you'd happily watch again.",
  },
  {
    id: "tv",
    label: "TV",
    entity: "urn:entity:tv_show",
    question: "What are you watching at the moment?",
  },
  {
    id: "books",
    label: "Books",
    entity: "urn:entity:book",
    question: "Which book would you press on a friend?",
  },
  {
    id: "dining",
    label: "Dining",
    entity: "urn:entity:place",
    question: "Where would you book for a birthday dinner?",
  },
  {
    id: "travel",
    label: "Travel",
    entity: "urn:entity:destination",
    question: "Where would you go for a long weekend?",
  },
  {
    id: "podcasts",
    label: "Podcasts",
    entity: "urn:entity:podcast",
    question: "Which podcast is next in your queue?",
  },
  {
    id: "brands",
    label: "Brands",
    entity: "urn:entity:brand",
    question: "Which of these feels most like you?",
  },
];

export const PREVIEW_CITIES = [
  { id: "austin", label: "Austin, TX" },
  { id: "brooklyn", label: "Brooklyn, NY" },
  { id: "london", label: "London, UK" },
] as const;

export type PreviewCity = (typeof PREVIEW_CITIES)[number]["id"];

/** Questionnaire options: "global" when localization is off, else per city (from Qloo insights). */
export const TASTE_OPTIONS: Record<
  TasteDomain,
  Record<"global" | PreviewCity, string[]>
> = {
  music: {
    global: ["Fleetwood Mac", "Frank Ocean", "Radiohead", "Beyoncé"],
    austin: ["Khruangbin", "Black Pumas", "Gary Clark Jr.", "Spoon"],
    brooklyn: [
      "LCD Soundsystem",
      "Yeah Yeah Yeahs",
      "The National",
      "Vampire Weekend",
    ],
    london: ["Little Simz", "Arlo Parks", "Fred again..", "Sampha"],
  },
  film: {
    global: [
      "Past Lives",
      "Amélie",
      "The Grand Budapest Hotel",
      "In the Mood for Love",
    ],
    austin: ["Dazed and Confused", "Boyhood", "Before Sunrise", "Office Space"],
    brooklyn: ["Do the Right Thing", "Frances Ha", "Moonstruck", "Smoke"],
    london: ["Paddington 2", "Aftersun", "Notting Hill", "Withnail and I"],
  },
  tv: {
    global: ["The Bear", "Succession", "Fleabag", "Severance"],
    austin: [
      "Friday Night Lights",
      "King of the Hill",
      "The Bear",
      "Severance",
    ],
    brooklyn: ["Broad City", "Russian Doll", "The Bear", "High Maintenance"],
    london: ["Fleabag", "Top Boy", "Slow Horses", "Bake Off"],
  },
  books: {
    global: [
      "Normal People",
      "The Overstory",
      "Kitchen Confidential",
      "Piranesi",
    ],
    austin: [
      "Lonesome Dove",
      "The Overstory",
      "Salt Fat Acid Heat",
      "Normal People",
    ],
    brooklyn: [
      "A Tree Grows in Brooklyn",
      "The Goldfinch",
      "Normal People",
      "Piranesi",
    ],
    london: ["White Teeth", "Shuggie Bain", "Mrs Dalloway", "Normal People"],
  },
  dining: {
    global: [
      "A natural wine bar",
      "An omakase counter",
      "A long-table trattoria",
      "A taco truck with a line",
    ],
    austin: ["Franklin Barbecue", "Uchi", "Suerte", "Emmer & Rye"],
    brooklyn: ["Lilia", "Di Fara Pizza", "Oxomoco", "Peter Luger"],
    london: ["St. John", "Brat", "Dishoom", "The River Café"],
  },
  travel: {
    global: ["Lisbon", "Kyoto", "Mexico City", "Copenhagen"],
    austin: ["Marfa", "Mexico City", "New Orleans", "Big Bend"],
    brooklyn: ["Hudson Valley", "Montauk", "Mexico City", "Lisbon"],
    london: ["Lisbon", "Cornwall", "Copenhagen", "Sicily"],
  },
  podcasts: {
    global: ["Radiolab", "Song Exploder", "Hidden Brain", "The Daily"],
    austin: ["Song Exploder", "How I Built This", "Radiolab", "The Daily"],
    brooklyn: ["Radiolab", "The Ezra Klein Show", "Song Exploder", "The Daily"],
    london: [
      "Desert Island Discs",
      "The Rest Is History",
      "Table Manners",
      "No Such Thing as a Fish",
    ],
  },
  brands: {
    global: ["Patagonia", "Aesop", "Le Creuset", "Muji"],
    austin: ["YETI", "Tecovas", "Patagonia", "Aesop"],
    brooklyn: ["Aesop", "Le Labo", "Muji", "Patagonia"],
    london: ["Toast", "Aesop", "Labour and Wait", "Muji"],
  },
};

export const defaultDomains: Record<string, TasteDomain[]> = {
  marlow: ["film", "travel", "music", "dining"],
  fold: ["music", "tv", "brands"],
  ostro: ["dining", "travel", "music"],
};

/* Concierge ---------------------------------------------------------------- */

export interface ConciergeDefaults {
  name: string;
  greeting: string;
  persona: string;
  avoid: string[];
  handoffEmail: string;
  launcherLabel: string;
  /** Example exchange for the preview. */
  ask: string;
  replyLead: string;
}

export const conciergeDefaults: Record<string, ConciergeDefaults> = {
  ostro: {
    name: "Nico",
    greeting:
      "Hi, I'm Nico. Tell me what you're cooking or who you're pouring for, and I'll find a bottle.",
    persona:
      "Talk like a friendly sommelier at a neighborhood bottle shop. Name the grape and the region, then say what it tastes like in plain words. Suggest a food pairing when it helps. No scores, no long lists of tasting notes.",
    avoid: ["Health claims", "Competitor shops", "Drinking games"],
    handoffEmail: "cellar@ostro.wine",
    launcherLabel: "Find a bottle",
    ask: "Something for a dinner party, under $40?",
    replyLead: "A few that work on a long table:",
  },
  marlow: {
    name: "Marlow",
    greeting:
      "Hi! Tell me about the room you're working on and I'll pull a few pieces that fit.",
    persona:
      "Warm and practical, like a good showroom host. Mention dimensions when size matters and say how a piece is made. Never pushy; one follow-up question at most.",
    avoid: ["Competitor brands", "Assembly guarantees"],
    handoffEmail: "help@marlow.co",
    launcherLabel: "Ask Marlow",
    ask: "A reading chair for a small living room?",
    replyLead: "Here's what fits a smaller room:",
  },
  fold: {
    name: "Fold",
    greeting:
      "Hey. Tell me what you're dressing for and I'll put together a few options.",
    persona:
      "Direct and a little playful, like a friend with good taste. Talk about fit and fabric, not hype. Mix labels freely; never favour one brand.",
    avoid: ["Body size comments", "Resale value"],
    handoffEmail: "stylists@fold.store",
    launcherLabel: "Style me",
    ask: "A jacket for autumn that isn't black?",
    replyLead: "Three that aren't black:",
  },
};

/* Appearance --------------------------------------------------------------- */

export const ACCENT_SWATCHES = [
  "#17150f",
  "#1f3fbf",
  "#23764a",
  "#b54a00",
  "#7a1f3d",
  "#ff2e88",
];

/* Install ------------------------------------------------------------------ */

export const SCRIPT_SRC = "https://cdn.slice.so/v1/slice.js";

export interface AllowedDomain {
  host: string;
  status: "verified" | "pending";
  primary?: boolean;
}

export const installState: Record<
  string,
  {
    domains: AllowedDomain[];
    lastSeen?: { ago: string; host: string; version: string; page: string };
  }
> = {
  marlow: {
    domains: [
      { host: "marlow.co", status: "verified", primary: true },
      { host: "www.marlow.co", status: "verified" },
      { host: "staging.marlow.co", status: "verified" },
    ],
    lastSeen: {
      ago: "2m ago",
      host: "marlow.co",
      version: "v1.4.2",
      page: "/products/oak-lounge-chair",
    },
  },
  fold: {
    domains: [
      { host: "fold.store", status: "verified", primary: true },
      { host: "*.fold.store", status: "verified" },
    ],
    lastSeen: {
      ago: "just now",
      host: "fold.store",
      version: "v1.4.2",
      page: "/c/outerwear",
    },
  },
  ostro: {
    domains: [{ host: "ostro.wine", status: "pending", primary: true }],
  },
};
