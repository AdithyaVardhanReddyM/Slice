import { createCatalogApi, slugify, type Product } from "@slice/demo-catalogs";
import { ridgeline as ridgelineCatalog } from "@slice/demo-catalogs/ridgeline";

export const ridgeline = createCatalogApi(ridgelineCatalog);

/** Editorial photos live in the catalog as "Scenes" so fetch-images can pull them; the shop hides them. */
export const scene = (slug: string): Product | undefined => ridgeline.get(slug);
export const sceneSrc = (slug: string): string | undefined => scene(slug)?.images[0];

export const coffees = () => ridgeline.inCategory("Coffee");
export const plans = () => ridgeline.inCategory("Subscriptions");
export const gifts = () => ridgeline.inCategory("Gift sets");
export const shopNav = () => ridgeline.store.nav.filter((g) => g.category !== "Scenes");

export const href = {
  home: "/ridgeline",
  coffee: "/ridgeline/coffee",
  coffeeSub: (sub: string) => `/ridgeline/coffee?type=${slugify(sub)}`,
  product: (p: Product) =>
    p.category === "Subscriptions"
      ? `/ridgeline/subscriptions/${p.slug}`
      : p.category === "Gift sets"
        ? `/ridgeline/gifts/${p.slug}`
        : `/ridgeline/coffee/${p.slug}`,
  subscriptions: "/ridgeline/subscriptions",
  gifts: "/ridgeline/gifts",
  cafes: "/ridgeline/cafes",
  locations: "/ridgeline/locations",
  about: "/ridgeline/about",
  journal: "/ridgeline/journal",
  post: (slug: string) => `/ridgeline/journal/${slug}`,
};

export const styleLabel = (id: string) => ridgeline.store.styles.find((s) => s.id === id)?.label ?? id;

export interface Cafe {
  slug: string;
  city: string;
  name: string;
  neighbourhood: string;
  address: string[];
  phone: string;
  hours: { days: string; open: string }[];
  opening?: string;
  blurb: string;
  scene: string;
  mapQuery: string;
}

export const cafes: Cafe[] = [
  {
    slug: "portland",
    city: "Portland, OR",
    name: "Alberta Street roastery and café",
    neighbourhood: "Alberta Arts District",
    address: ["2211 NE Alberta St", "Portland, OR 97211"],
    phone: "(503) 555-0142",
    hours: [
      { days: "Monday to Friday", open: "7:00 am to 5:00 pm" },
      { days: "Saturday and Sunday", open: "8:00 am to 5:00 pm" },
    ],
    blurb:
      "Where it started in 2016 and where every bag is still roasted. The roaster runs Tuesday to Friday behind a glass wall at the back of the café, so the room smells like whatever is in the drum. A long communal oak table, a short menu of toast and pastries from Little T, and a retail wall with every current coffee open for smelling.",
    scene: "scene-cafe-portland",
    mapQuery: "2211 NE Alberta St, Portland, OR 97211",
  },
  {
    slug: "seattle",
    city: "Seattle, WA",
    name: "Capitol Hill café",
    neighbourhood: "Capitol Hill",
    address: ["1521 12th Ave", "Seattle, WA 98122"],
    phone: "(206) 555-0178",
    hours: [
      { days: "Monday to Friday", open: "6:30 am to 6:00 pm" },
      { days: "Saturday and Sunday", open: "7:30 am to 6:00 pm" },
    ],
    blurb:
      "Opened in 2021 in a former auto-parts shop on 12th Avenue, brick walls and all. This is our busiest espresso bar: two Linea machines, a slow bar for pour-over at the window, and a weekend line that moves faster than it looks. Dogs welcome, laptops welcome until noon.",
    scene: "scene-cafe-seattle",
    mapQuery: "1521 12th Ave, Seattle, WA 98122",
  },
  {
    slug: "austin",
    city: "Austin, TX",
    name: "East Sixth Street café",
    neighbourhood: "East Austin",
    address: ["1900 E 6th St, Suite 101", "Austin, TX 78702"],
    phone: "(512) 555-0199",
    hours: [{ days: "Opening November 2026", open: "Hours to be announced" }],
    opening: "Opening November 2026",
    blurb:
      "Our first café outside the Northwest and our first with a patio. A 1940s brick warehouse a block off East Sixth with a 3-kilo roaster for small lots we will only sell in Texas, a cold brew tap built for 100-degree afternoons, and breakfast tacos from Veracruz All Natural next door. Join the waitlist for opening week invitations and the first bag free.",
    scene: "scene-cafe-austin",
    mapQuery: "1900 E 6th St, Austin, TX 78702",
  },
];

export interface Post {
  slug: string;
  title: string;
  standfirst: string;
  date: string;
  author: string;
  readingTime: string;
  scene: string;
  body: string[];
  related: string[];
}

export const posts: Post[] = [
  {
    slug: "how-we-buy-coffee-in-huila",
    title: "How we buy coffee in Huila",
    standfirst:
      "Six harvests with one family in southern Colombia, and why we pay a fixed price instead of a premium over the market.",
    date: "2026-09-18",
    author: "Dana Whitaker, head of sourcing",
    readingTime: "6 min read",
    scene: "scene-farm",
    body: [
      "Every February I fly to Bogotá, take the short hop to Pitalito and drive forty minutes up a dirt road to Finca La Esperanza. Rosalba Ortiz has farmed the five hectares there since 1998, and we have bought her entire harvest since 2020. This year that was 71 bags of 70 kilos, which is about a third of what we roast in a month.",
      "We agreed early on that we would not price her coffee against the New York C market. The C price has swung between $0.95 and $4.20 a pound in the time we have worked together, and none of those swings had anything to do with what it costs to pick, ferment and dry coffee in Huila. Instead we pay a fixed price per carga that we revisit together every January, based on her costs, her yield and what we can sell the coffee for. This year it is 2.9 million pesos, roughly 2.4 times the local market on the day we signed.",
      "What that buys, beyond coffee we are proud of, is predictability. Rosalba hired a second permanent worker in 2023 and put in a covered drying patio in 2024, because she knew what the harvest would bring in. We get a coffee that tastes the same way every year, red apple and panela and that clean cocoa finish, because nobody is cutting corners to chase a price.",
      "The cupping on the farm is informal. We roast samples on a little gas sample roaster that lives in her kitchen, grind them coarse, pour hot water over the grounds in glasses and slurp from spoons with her son Andrés, who now runs the fermentation tanks. We are not scoring the coffee against anything. We are checking that it tastes like La Esperanza.",
      "If you want to taste what six years of this looks like, the Colombia Huila is on the shelf year round and in most Roaster's Choice deliveries between May and September. We think it is the best value coffee we sell.",
    ],
    related: ["colombia-huila-la-esperanza", "roasters-choice-subscription", "colombia-decaf-sugarcane"],
  },
  {
    slug: "a-better-pour-over-in-four-steps",
    title: "A better pour-over at home, in four steps",
    standfirst: "No scale, no gooseneck kettle, no timer app. The recipe we teach at the Alberta Street brew bar.",
    date: "2026-08-02",
    author: "Theo Marsh, head of coffee",
    readingTime: "4 min read",
    scene: "scene-journal-pour-over",
    body: [
      "People leave our brew classes thinking pour-over needs equipment. It needs about four habits. Here is the version we teach to anyone who has a dripper, a kettle and five minutes.",
      "One: grind right before you brew, a bit coarser than you think. For a V60 or any cone dripper, aim for the texture of coarse sand or raw sugar. If your cup is bitter and the brew takes forever, go coarser. If it is sour and finishes in under two minutes, go finer. That one adjustment fixes most bad cups.",
      "Two: measure with a spoon if you do not own a scale. Two level tablespoons of whole beans is about 22 grams, which wants roughly 350 ml of water, or a large mug. Rinse the paper filter with hot water first and pour that water out.",
      "Three: pour in two stages. Wet the grounds with just enough water to soak them, about twice their weight, and wait 30 to 40 seconds while they bloom and release gas. Then pour the rest in slow circles, keeping the water level steady rather than flooding the cone. Boiling water straight off the kettle is fine for our lighter roasts; let it sit a minute for the darker ones.",
      "Four: taste it and change one thing next time. Not three things. If you like it, you are done, and you now have a recipe. We have a laminated card with these four steps in every Pour-Over Starter Set, and the Ethiopia Guji is the coffee we think shows off the method best.",
    ],
    related: ["pour-over-starter-set", "ethiopia-guji-hambela-washed", "kenya-nyeri-gatomboya-ab"],
  },
  {
    slug: "austin-why-our-third-cafe-is-on-east-sixth",
    title: "Austin: why our third café is on East Sixth",
    standfirst:
      "Opening in November. The building, the roaster that will only serve Texas, and the cold brew tap we built for the heat.",
    date: "2026-10-01",
    author: "Maya Lindqvist, co-founder",
    readingTime: "5 min read",
    scene: "scene-cafe-austin",
    body: [
      "We have been shipping a lot of coffee to Texas for a while. Austin was our fourth-largest subscription city last year, behind Portland, Seattle and San Francisco, and we have never had a place there to pour it. In November that changes, with a café a block off East Sixth Street in a 1940s brick warehouse that used to store sign-painting supplies.",
      "The building chose itself. It has a loading dock that is becoming a patio with live oaks for shade, a sawtooth roof that lets light in without heat, and thick walls that stay cool. The neighbours are Veracruz All Natural, who are supplying the breakfast tacos, and a vintage shop we have already spent too much money in.",
      "Two things will be different from Portland and Seattle. First, a small 3-kilo roaster in the front window for lots we will only sell in Austin, starting with a natural Ethiopia we bought with this café in mind. Second, cold brew on tap, properly: a 16-hour steep of our Cold Brew Blend kegged and poured on nitrogen, because it will be 100 degrees for a lot of the year and we would rather you drink coffee than not.",
      "Hours will be 6:30 am to 6 pm on weekdays and 7:30 to 6 at weekends, with later evenings once we see how the street works. If you join the waitlist on our cafés page we will send an invitation to opening week and a code for a free first bag, redeemable at the counter or online.",
      "We are nervous and excited in roughly equal parts. Come say hello.",
    ],
    related: ["cold-brew-blend-coarse-ground", "trailhead-instant-sticks", "forest-park-house-blend"],
  },
];

export const post = (slug: string) => posts.find((p) => p.slug === slug);

export const formatDate = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export { slugify };
