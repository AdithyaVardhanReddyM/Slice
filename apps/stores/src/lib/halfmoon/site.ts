// Half Moon Coffee: a small-batch roaster in Half Moon Bay, California, selling
// four coffees online. Brand site for the Media service: brand setup reads its
// homepage, and these four products are what Half Moon's creatives sell.

export const HALFMOON = {
  name: "Half Moon Coffee",
  legalName: "Half Moon Coffee Roasters LLC",
  tagline: "Coffee for every phase.",
  domain: "halfmooncoffee.co",
  email: "hello@halfmooncoffee.co",
  founded: 2019,
  street: "315 Main St",
  city: "Half Moon Bay",
  region: "CA",
  postalCode: "94019",
  country: "US",
  hours: "Roastery café open daily, 7am to 3pm",
  socials: [
    { network: "Instagram", url: "https://instagram.com/halfmooncoffee" },
    { network: "TikTok", url: "https://tiktok.com/@halfmooncoffee" },
    { network: "YouTube", url: "https://youtube.com/@halfmooncoffee" },
  ],
};

export const img = (name: string) => `/halfmoon/img/${name}`;

export const href = {
  home: "/halfmoon",
  coffee: (slug: string) => `/halfmoon/coffee/${slug}`,
  shop: "/halfmoon#coffee",
  club: "/halfmoon#moon-club",
  story: "/halfmoon#story",
  brew: "/halfmoon#brew",
  visit: "/halfmoon#visit",
};

export interface HalfMoonCoffee {
  slug: string;
  name: string;
  kind: string;
  /** One line under the name on its card. */
  line: string;
  description: string;
  origin: string;
  process: string;
  altitude?: string;
  notes: string[];
  brewWith: string;
  price: number;
  size: string;
  /** Pastel behind the product, matched to its packaging. */
  tint: string;
  image: string;
  imageAlt: string;
  photo: string;
  photoAlt: string;
  isCan?: boolean;
}

export const COFFEES: HalfMoonCoffee[] = [
  {
    slug: "first-light",
    name: "First Light",
    kind: "Light roast",
    line: "Ethiopia Guji, washed. Jasmine, peach and bergamot.",
    description: "Our lightest roast: a washed coffee from Guji that tastes like jasmine tea and ripe peach. Made for slow mornings and a pour-over.",
    origin: "Uraga, Guji, Ethiopia",
    process: "Washed",
    altitude: "2,100 m",
    notes: ["Jasmine", "Peach", "Bergamot"],
    brewWith: "Pour-over, filter, AeroPress",
    price: 21,
    size: "12 oz / 340 g",
    tint: "#f8e3d2",
    image: "bag-first-light.webp",
    imageAlt: "A peach Half Moon coffee bag labelled First Light, Ethiopia Guji, light roast",
    photo: "pourover.jpg",
    photoAlt: "A pour-over brewing beside a bag of First Light in morning light",
  },
  {
    slug: "crescent",
    name: "Crescent",
    kind: "Espresso blend",
    line: "Brazil, Colombia and Ethiopia. Dark chocolate, cherry, caramel.",
    description: "A sweet, round espresso that holds up under milk and shines on its own. Three origins, roasted separately, blended on the bench.",
    origin: "Cerrado, Brazil; Huila, Colombia; Sidama, Ethiopia",
    process: "Natural and washed",
    notes: ["Dark chocolate", "Cherry", "Caramel"],
    brewWith: "Espresso, moka pot, milk drinks",
    price: 19,
    size: "12 oz / 340 g",
    tint: "#f7dbe0",
    image: "bag-crescent.webp",
    imageAlt: "A pink Half Moon coffee bag labelled Crescent, espresso blend",
    photo: "espresso.jpg",
    photoAlt: "A double espresso pouring into a pink cup beside a bag of Crescent",
  },
  {
    slug: "eclipse",
    name: "Eclipse",
    kind: "Dark roast",
    line: "Sumatra and Brazil. Molasses, cacao and smoke.",
    description: "The darkest coffee we roast, and still sweet: heavy body, low acidity, molasses and cacao with a little campfire at the finish.",
    origin: "Gayo, Sumatra; Mogiana, Brazil",
    process: "Wet-hulled and natural",
    notes: ["Molasses", "Cacao", "Smoke"],
    brewWith: "French press, drip, cold brew at home",
    price: 18,
    size: "12 oz / 340 g",
    tint: "#e5e3ee",
    image: "bag-eclipse.webp",
    imageAlt: "A black Half Moon coffee bag labelled Eclipse, dark roast",
    photo: "eclipse-night.jpg",
    photoAlt: "A French press and a bag of Eclipse on a walnut table at night",
  },
  {
    slug: "moonrise",
    name: "Moonrise",
    kind: "Cold brew cans",
    line: "Steeped 18 hours, black and unsweetened. Cocoa and orange peel.",
    description: "Colombian and Brazilian coffee steeped cold for 18 hours, then canned black with nothing added. Smooth, bold and ready wherever you are.",
    origin: "Huila, Colombia; Cerrado, Brazil",
    process: "Cold-steeped 18 hours",
    notes: ["Cocoa", "Brown sugar", "Orange peel"],
    brewWith: "Ready to drink, over ice or straight from the can",
    price: 16,
    size: "4 x 8 fl oz cans",
    tint: "#dbeaf7",
    image: "can-moonrise.webp",
    imageAlt: "A navy Half Moon can labelled Moonrise, cold brew coffee",
    photo: "camp.jpg",
    photoAlt: "A can of Moonrise on a red rock at a desert campsite at dusk",
    isCan: true,
  },
];

export const CLUB = {
  name: "Moon Club",
  discount: 15,
  cadences: ["Every 2 weeks", "Every 4 weeks"],
  perks: ["15% off every bag", "Free shipping, always", "Roasted the week it ships", "Skip, swap or cancel any time"],
};

export const STATS = [
  { value: "48h", label: "From our roaster to your door" },
  { value: "100%", label: "Specialty-grade arabica" },
  { value: "4", label: "Roasts, one small roastery" },
];

export const coffeeBySlug = (slug: string) => COFFEES.find((c) => c.slug === slug);
export const money = (n: number) => `$${n.toFixed(2)}`;
export const clubPrice = (c: HalfMoonCoffee) => money(Math.round(c.price * (100 - CLUB.discount)) / 100);
