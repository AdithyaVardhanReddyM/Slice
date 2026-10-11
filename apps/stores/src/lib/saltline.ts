import { createCatalogApi, slugify, type Product } from "@slice/demo-catalogs";
import { saltline as saltlineCatalog } from "@slice/demo-catalogs/saltline";

export const saltline = createCatalogApi(saltlineCatalog);

/** Editorial photos live in the catalog as "Scenes" so fetch-images can pull them; the site hides them. */
export const sceneSrc = (slug: string): string | undefined => saltline.get(slug)?.images[0];

export const rooms = (city?: string) =>
  saltline.inCategory("Rooms").filter((p) => !city || p.subcategory === city);
export const experiences = (city?: string) =>
  saltline.inCategory("Experiences").filter((p) => !city || p.tags.includes(city.toLowerCase()));
export const offers = () => saltline.inCategory("Offers");

/** Which hotel an experience or room belongs to. */
export const cityOf = (p: Product): Hotel | undefined =>
  hotels.find((h) => p.subcategory === h.city || p.tags.includes(h.slug));

export const href = {
  home: "/saltline",
  hotels: "/saltline/hotels",
  hotel: (slug: string) => `/saltline/hotels/${slug}`,
  room: (p: Product) => `/saltline/hotels/${slugify(p.subcategory)}/rooms/${p.slug}`,
  experiences: "/saltline/experiences",
  experience: (p: Product) => `/saltline/experiences/${p.slug}`,
  offers: "/saltline/offers",
  offer: (p: Product) => `/saltline/offers/${p.slug}`,
  journal: "/saltline/journal",
  post: (slug: string) => `/saltline/journal/${slug}`,
  about: "/saltline/about",
  locations: "/saltline/locations",
  plan: (params?: Record<string, string>) => {
    const q = params ? new URLSearchParams(params).toString() : "";
    return `/saltline/plan${q ? `?${q}` : ""}`;
  },
  product: (p: Product) =>
    p.category === "Rooms" ? href.room(p) : p.category === "Experiences" ? href.experience(p) : href.offer(p),
};

export const styleLabel = (id: string) => saltline.store.styles.find((s) => s.id === id)?.label ?? id;

export interface Hotel {
  slug: string;
  city: string;
  country: string;
  name: string;
  neighbourhood: string;
  address: string[];
  phone: string;
  email: string;
  roomsCount: number;
  opened: string;
  opening?: string;
  intro: string;
  building: string;
  restaurant: { name: string; blurb: string; hours: string; scene: string };
  neighbourhoodNotes: { title: string; body: string }[];
  scene: string;
  mapQuery: string;
}

export const hotels: Hotel[] = [
  {
    slug: "lisbon",
    city: "Lisbon",
    country: "Portugal",
    name: "Saltline Lisbon",
    neighbourhood: "Santos, between Cais do Sodré and the river",
    address: ["Rua da Boavista 74", "1200-068 Lisboa", "Portugal"],
    phone: "+351 21 555 0174",
    email: "lisbon@saltlinehotels.com",
    roomsCount: 48,
    opened: "2019",
    intro:
      "A 1920s shipping office on a quiet street in Santos, four minutes' walk from the river and ten from Cais do Sodré station. Forty-eight rooms over five floors, pine floors and tall sash windows, and a rooftop that looks over the rooftops to the 25 de Abril bridge.",
    building:
      "The building was the Lisbon office of a Porto shipping line until 1986 and sat empty for two decades. We kept the coffered ceilings, the marble stair and the brass post boxes in the lobby, and added a lift, a rooftop and a kitchen. Most of the furniture was made within an hour of the city, and the tiles in every bathroom were glazed by hand in Caldas da Rainha.",
    restaurant: {
      name: "Maré",
      blurb:
        "Our ground-floor restaurant takes its name from the tide, and its menu from the fish market at Docapesca each morning. Chef Inês Carvalho cooks over charcoal: sardines in summer, sea bass and clams in bulhão pato year round, bread from the wood oven, and a wine list weighted towards small growers in the Alentejo and the Azores. Breakfast for guests is here too, with pastéis de nata from a bakery two streets away.",
      hours: "Breakfast 7:30 to 11:00. Lunch 12:30 to 15:00. Dinner 19:00 to 23:00, closed Sunday evening.",
      scene: "scene-restaurant-mare",
    },
    neighbourhoodNotes: [
      { title: "Along the river", body: "Walk east along the water to the Time Out Market and Praça do Comércio, or west under the bridge to Belém for the monastery and the custard tarts everybody argues about. The riverside path is flat and good for a morning run." },
      { title: "Santos and Madragoa", body: "Our own streets are residential, with small grocers, a few antique dealers and the tiled façades the walk on our experiences page is about. The National Museum of Ancient Art is eight minutes away and almost never busy." },
      { title: "Out at night", body: "Cais do Sodré is the late-night street, five minutes away and loud. Closer and calmer: the wine bars of Bairro Alto's lower edge and the jazz room at Hot Clube on a weeknight." },
    ],
    scene: "scene-lisbon",
    mapQuery: "Rua da Boavista 74, 1200-068 Lisboa, Portugal",
  },
  {
    slug: "copenhagen",
    city: "Copenhagen",
    country: "Denmark",
    name: "Saltline Copenhagen",
    neighbourhood: "Frederiksstaden, on the harbour at Toldbodgade",
    address: ["Toldbodgade 18", "1253 København K", "Denmark"],
    phone: "+45 33 55 01 82",
    email: "copenhagen@saltlinehotels.com",
    roomsCount: 62,
    opened: "2021",
    intro:
      "A nineteenth-century customs warehouse on the harbour between Nyhavn and the Little Mermaid, with the Opera House across the water. Sixty-two rooms inside the original Douglas fir frame, a wood-fired sauna raft at the end of the quay and a restaurant whose fish comes off the boats you can see from the window.",
    building:
      "Built in 1855 to hold goods under customs bond, the warehouse kept its timber frame, iron shutters and hoist beams through a century of use and a decade of neglect. We added insulation, warmth and silence, and left the rest alone. The furniture is mostly second-hand Danish from the 1950s and 60s, bought piece by piece over two years from auctions in Jutland.",
    restaurant: {
      name: "Kaj",
      blurb:
        "Named for the quay it sits on. Chef Sofie Lund serves a short menu that changes most days: Øresund fish, vegetables from our plot on Amager, Danish cheeses and a lot of pickling and smoking. A counter for eight does the tasting menu five nights a week; the room does lunch and dinner à la carte. The bar pours natural wine, local beer and an aquavit list that deserves more attention than it gets.",
      hours: "Breakfast 7:00 to 10:30. Lunch 12:00 to 15:00. Dinner 18:00 to 22:30, closed Sunday and Monday.",
      scene: "scene-restaurant-kaj",
    },
    neighbourhoodNotes: [
      { title: "The harbour", body: "Swim from our sauna raft or the public baths at Islands Brygge, rent a kayak at Nyhavn, or take the harbour bus across to the Opera and Christianshavn. The water is clean enough to drink, nearly." },
      { title: "Frederiksstaden", body: "Royal palaces, the Marble Church and the Design Museum are all within ten minutes on foot. Bredgade is the street for antiques and the auction houses where most of our furniture came from." },
      { title: "By bike", body: "Every room comes with a bike. Nørrebro's cafés and Jægersborggade are fifteen minutes away, Louisiana is a long, beautiful ride up the coast, and the city's cycle lanes mean you never share the road." },
    ],
    scene: "scene-copenhagen",
    mapQuery: "Toldbodgade 18, 1253 København K, Denmark",
  },
  {
    slug: "barcelona",
    city: "Barcelona",
    country: "Spain",
    name: "Saltline Barcelona",
    neighbourhood: "Barri Gòtic, two streets from the port",
    address: ["Carrer de la Mercè 21", "08002 Barcelona", "Spain"],
    phone: "+34 93 555 01 96",
    email: "barcelona@saltlinehotels.com",
    roomsCount: 54,
    opened: "2023",
    intro:
      "An eighteenth-century merchant's townhouse on a narrow street in the Gothic Quarter, five minutes from the sea and two from the Born. Fifty-four rooms around a planted courtyard, vaulted ceilings and hydraulic tile, and a roof with a pool, a restaurant and a view across the old town to the water.",
    building:
      "The house belonged to a family of textile merchants and later held a printing works, a dance school and a very long-running bar. We restored the painted ceilings on the first floor, reclaimed every hydraulic tile we could lift and relaid them, and opened the courtyard back to the sky. The roof was flat and empty; it now has a 20-metre pool and a lot of jasmine.",
    restaurant: {
      name: "Terrat",
      blurb:
        "The rooftop restaurant, open to guests and the city. Chef Marc Vila shops the Boqueria most mornings and cooks Catalan food without ceremony: calçots in season, grilled vegetables with romesco, rice from the Delta, fish from the Barceloneta boats. Vermouth hour on Sundays is a fixture. The pool is next to the tables, which is either a problem or the point.",
      hours: "Breakfast 7:30 to 11:00. Lunch 13:00 to 16:00. Dinner 20:00 to 23:30, daily. Vermouth hour Sundays at 13:00.",
      scene: "scene-restaurant-terrat",
    },
    neighbourhoodNotes: [
      { title: "The old town", body: "The cathedral, the Picasso Museum and the galleries of El Born are all under ten minutes on foot through streets built before cars. Mornings are quiet; by late afternoon you will want the roof." },
      { title: "The sea", body: "Barceloneta beach is a twelve-minute walk. Swim early, before the crowds, then eat at one of the fishermen's bars on Carrer de la Maquinista. Our sailing afternoon leaves from the marina at Port Vell." },
      { title: "Further out", body: "Gràcia for an evening of small squares and bars, Montjuïc for the Miró Foundation and the gardens, and the train from Sants to Sitges or the Penedès wineries in under an hour." },
    ],
    scene: "scene-barcelona",
    mapQuery: "Carrer de la Mercè 21, 08002 Barcelona, Spain",
  },
  {
    slug: "marseille",
    city: "Marseille",
    country: "France",
    name: "Saltline Marseille",
    neighbourhood: "Vieux Port, on the Quai de Rive Neuve",
    address: ["38 Quai de Rive Neuve", "13007 Marseille", "France"],
    phone: "+33 4 91 55 01 20",
    email: "marseille@saltlinehotels.com",
    roomsCount: 58,
    opened: "2027",
    opening: "Opening spring 2027",
    intro:
      "Our fourth hotel: a former ship chandler's warehouse on the south quay of the Old Port, fifty-eight rooms, a courtyard restaurant and a roof facing Notre-Dame de la Garde. Opening spring 2027. Join the list for the founders' rate and first choice of dates.",
    building:
      "The warehouse supplied rope, sailcloth and tinned food to fishing boats for a century. We are keeping the vaulted stone ground floor for the restaurant and bar and building rooms into the upper floors with sea-facing shutters. The roof will have a pool, a bar and the best view of the basilica in the city.",
    restaurant: { name: "Chandler", blurb: "A courtyard restaurant under the old stone vaults. Provençal and North African cooking, bouillabaisse on Fridays, natural wines from the hills behind the city.", hours: "Opening spring 2027.", scene: "scene-marseille" },
    neighbourhoodNotes: [],
    scene: "scene-marseille",
    mapQuery: "38 Quai de Rive Neuve, 13007 Marseille, France",
  },
];

export const openHotels = hotels.filter((h) => !h.opening);
export const hotel = (slug: string) => hotels.find((h) => h.slug === slug);

/** Tier order shown on hotel pages. */
export const tierRank = (p: Product) => Number(p.tags.find((t) => t.startsWith("tier-"))?.split("-")[1] ?? 9);

export interface Post {
  slug: string;
  title: string;
  standfirst: string;
  date: string;
  author: string;
  readingTime: string;
  scene: string;
  hotel: string;
  body: string[];
  related: string[];
}

export const posts: Post[] = [
  {
    slug: "lisbon-in-january",
    title: "Lisbon in January",
    standfirst: "The light is low, the tables are free and the city belongs to the people who live there. Our general manager on the best month to come.",
    date: "2026-09-22",
    author: "Rita Antunes, general manager, Saltline Lisbon",
    readingTime: "5 min read",
    scene: "scene-journal-lisbon-light",
    hotel: "lisbon",
    body: [
      "Everyone asks when to come to Lisbon and everyone expects me to say May or September. I say January. The sun is out most days, it is 15 degrees at lunchtime, and the light comes in flat and gold across the river at four in the afternoon in a way it never does in summer.",
      "The city is also, for a few weeks, back in the hands of the people who live in it. You can get a table at Maré on a Saturday without asking a week ahead. The 28 tram has seats. The queue for the custard tarts in Belém is ten minutes instead of forty, and the National Tile Museum is empty enough that you can stand in front of the 36-metre panorama of the city as long as you like.",
      "What to do with the days: the market breakfast still runs three mornings a week and is better in winter, when the citrus and the first strawberries from the Algarve arrive. The surf at Caparica is bigger and the lessons go out in 4/3 wetsuits; it is cold for two minutes and then it is fine. The galleries in Marvila reopen after the holidays with new shows and no crowds.",
      "What to do with the evenings: eat. January is when Inês puts the long braises and the cabidela on the menu, and when the natural wine dinner on Thursdays becomes a smaller, slower thing with people who have come specifically for it. Then walk home along the river. It is dark by six, and the bridge is lit.",
      "We run our Winter light offer from early January to the end of February: three nights in a Classic Room with the market breakfast and the wine dinner included, for less than the room alone would cost in June. It is not a trick to fill rooms. It is the month we would choose ourselves.",
    ],
    related: ["winter-light-in-lisbon", "lisbon-market-breakfast-campo-de-ourique", "lisbon-classic-room"],
  },
  {
    slug: "the-cold-water-habit",
    title: "The cold water habit",
    standfirst: "Why half our Copenhagen guests end up in the harbour at 7:30 in the morning, and how to do it without regret.",
    date: "2026-08-14",
    author: "Jonas Friis, head of guest experience, Saltline Copenhagen",
    readingTime: "4 min read",
    scene: "scene-journal-winter-swim",
    hotel: "copenhagen",
    body: [
      "The harbour at Toldbodgade is 18 degrees in August and about 4 in February. People swim in it all year. When we opened the sauna raft at the end of our quay in 2022 we thought it would be a summer thing; it is busiest in January.",
      "The routine, if you have never done it: ten or twelve minutes in the sauna at around 80 degrees, then straight down the ladder into the water. Do not jump; the shock is enough without it. Breathe out slowly, stay in for twenty or thirty seconds the first time, climb out, and go back into the heat. Three rounds is about right. Coffee and a cardamom bun on the deck afterwards are not optional.",
      "Why people get attached to it is harder to explain than how to do it. The first minute after you climb out is the clearest you will feel all day. Danish friends talk about it as the thing that makes winter bearable, and after a few years here I understand what they mean.",
      "Practicalities: the slot is 7:30 to 9:00, four guests at a time, and it books out most days so reserve the night before at reception. We provide towels, robes and sandals, and the water is tested weekly by the city; it has been swimmable every week since 2019. If you are pregnant or have a heart condition, talk to us first and we will suggest the public baths at Islands Brygge, which are gentler.",
      "If you want to go further, the Harbour Room and the Toldbod Suite look straight down onto the raft, which is either an invitation or a reproach depending on the morning.",
    ],
    related: ["copenhagen-harbour-swim-and-sauna", "copenhagen-harbour-room", "copenhagen-toldbod-suite"],
  },
  {
    slug: "how-marc-shops-the-boqueria",
    title: "How Marc shops the Boqueria",
    standfirst: "Four stalls, one rule and a standing order for anchovies. A morning with the chef of Terrat.",
    date: "2026-07-03",
    author: "Clara Font, Saltline Barcelona",
    readingTime: "5 min read",
    scene: "scene-journal-barcelona-market",
    hotel: "barcelona",
    body: [
      "Marc Vila has been shopping the Boqueria since he was a teenager working in his uncle's bar on Carrer del Carme, and he still does it himself four mornings a week. He arrives at 8:15, before the tour groups, with a trolley and a list he will mostly ignore.",
      "The rule is that he buys what looks best, not what the menu says. The menu is written at 10:30, after the shopping. On the morning I went with him the plan was monkfish; the monkfish looked tired and the red prawns from Palamós did not, so dinner was prawns. The stall is Peixos Fermí, third from the Rambla entrance on the left, and he has bought from the same family for twelve years.",
      "Mushrooms come from Petràs, who has the stall at the back with the handwritten signs. In autumn it is rovellons and trompetes; in spring, morels if you are lucky. Vegetables are from two stalls, one for tomatoes and peppers and one for everything else, because Marc says nobody is good at everything. The anchovies are a standing order from a stall that cures its own, forty tins a month, and they are what you get with the vermouth on Sundays.",
      "The last stop is always a counter, usually Pinotxo or El Quim, for a plate of chickpeas with blood sausage and a glass of cava at nine in the morning. This is not a treat; it is lunch for a chef who will not sit down again until four.",
      "You can go with him on Fridays. The market and tapas lunch experience is Marc's shopping morning with six guests attached, and it ends at the counter, as it should.",
    ],
    related: ["barcelona-boqueria-market-and-tapas-lunch", "barcelona-rooftop-vermouth-hour", "barcelona-classic-room"],
  },
];

export const post = (slug: string) => posts.find((p) => p.slug === slug);

export const formatDate = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

export { slugify };
