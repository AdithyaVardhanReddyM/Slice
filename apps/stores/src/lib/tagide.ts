import { createCatalogApi, slugify, type Product } from "@slice/demo-catalogs";
import { tagide as tagideCatalog } from "@slice/demo-catalogs/tagide";

export const tagide = createCatalogApi(tagideCatalog);

/** Editorial photos live in the catalog as "Scenes" so fetch-images can pull them; the site hides them. */
export const sceneSrc = (slug: string): string | undefined => tagide.get(slug)?.images[0];

const eurFormat = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const eur = (n: number) => eurFormat.format(n);

export const passes = () => tagide.inCategory("Tickets", "Festival passes");
export const dayTickets = () => tagide.inCategory("Tickets", "Day tickets");
export const travelPackages = () => tagide.inCategory("Tickets", "Travel packages");
export const allTickets = () => tagide.inCategory("Tickets");

export const href = {
  home: "/tagide",
  lineup: "/tagide/lineup",
  act: (slug: string) => `/tagide/lineup/${slug}`,
  tickets: "/tagide/tickets",
  ticket: (p: Product) => `/tagide/tickets#${p.slug}`,
  travel: "/tagide/travel",
  grounds: "/tagide/grounds",
  info: "/tagide/info",
};

export const festival = {
  name: "Tágide Festival",
  short: "Tágide",
  edition: "6th edition",
  dates: "11–13 June 2027",
  datesLong: "Friday 11 to Sunday 13 June 2027",
  start: "2027-06-11",
  end: "2027-06-13",
  venue: "Parque Tejo",
  city: "Lisboa",
  country: "Portugal",
  address: ["Parque Tejo, Passeio do Tejo", "1990-096 Lisboa", "Portugal"],
  email: "ola@tagidefestival.pt",
  press: "press@tagidefestival.pt",
  phone: "+351 21 555 0611",
  capacity: "45,000 a day",
  phase: { name: "Phase 1", until: "30 November 2026", next: "Phase 2 from 1 December" },
  lineupAnnounced: "12 October 2026",
};

export type DayId = "fri" | "sat" | "sun";
export interface Day {
  id: DayId;
  label: string;
  short: string;
  date: string;
  iso: string;
}
export const days: Day[] = [
  { id: "fri", label: "Friday", short: "Fri", date: "11 June", iso: "2027-06-11" },
  { id: "sat", label: "Saturday", short: "Sat", date: "12 June", iso: "2027-06-12" },
  { id: "sun", label: "Sunday", short: "Sun", date: "13 June", iso: "2027-06-13" },
];
export const day = (id: DayId) => days.find((d) => d.id === id)!;

export type StageId = "tejo" | "ponte" | "armazem" | "jardim";
export interface Stage {
  id: StageId;
  name: string;
  full: string;
  blurb: string;
  hours: string;
  capacity: string;
  scene: string;
  tone: "orange" | "lilac" | "ink" | "cream";
}
export const stages: Stage[] = [
  {
    id: "tejo",
    name: "Tejo",
    full: "Tejo stage",
    blurb: "The main stage, on the river with the Vasco da Gama bridge behind it. Headliners, sing-alongs, confetti, the photo everyone takes.",
    hours: "16:00 to 00:30",
    capacity: "35,000",
    scene: "scene-stage-tejo",
    tone: "orange",
  },
  {
    id: "ponte",
    name: "Ponte",
    full: "Ponte stage",
    blurb: "The second stage, under the big tent by the east gate. Afrobeats, hip-hop, Brazil and the pop acts that will headline in three years.",
    hours: "17:00 to 01:30",
    capacity: "15,000",
    scene: "scene-stage-ponte",
    tone: "lilac",
  },
  {
    id: "armazem",
    name: "Armazém",
    full: "Armazém",
    blurb: "A former river warehouse with the roof kept on and the sound system turned up. House, techno and breaks from ten until the sun comes up.",
    hours: "21:00 to 06:00 (04:00 Sunday)",
    capacity: "6,000",
    scene: "scene-stage-armazem",
    tone: "ink",
  },
  {
    id: "jardim",
    name: "Jardim",
    full: "Jardim stage",
    blurb: "A small stage in the park's garden, with the crowd on the grass. Songwriters, folk, Americana and fado, finished by ten so the river stays quiet.",
    hours: "16:00 to 22:00",
    capacity: "5,000",
    scene: "scene-stage-jardim",
    tone: "cream",
  },
];
export const stage = (id: StageId) => stages.find((s) => s.id === id)!;

export interface Act {
  slug: string;
  name: string;
  origin: string;
  genre: string;
  day: DayId;
  stage: StageId;
  /** 1 = headliner, 2 = second line, 3 = the rest. Sets the poster type size. */
  tier: 1 | 2 | 3;
  time: string;
  blurb: string;
}

/** Act slugs drop diacritics first, so "Rosalía" is /rosalia, not /rosal-a. */
const actSlug = (name: string) => slugify(name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

const act = (name: string, origin: string, genre: string, d: DayId, s: StageId, tier: 1 | 2 | 3, time: string, blurb: string): Act => ({
  slug: actSlug(name),
  name,
  origin,
  genre,
  day: d,
  stage: s,
  tier,
  time,
  blurb,
});

export const acts: Act[] = [
  // Friday
  act("Fred again..", "London", "Electronic", "fri", "tejo", 1, "23:30", "Friday's closer, with the Actual Life records and whatever he has made on the plane. Last time he played Lisbon it was a club; this time it is the river."),
  act("Charli XCX", "London", "Pop", "fri", "tejo", 2, "21:30", "Brat and everything since, played loud enough for the bridge. The sunset slot that will feel like midnight."),
  act("Burna Boy", "Lagos", "Afrobeats", "fri", "tejo", 2, "19:30", "The African Giant with a full band and horns on the main stage as the heat goes out of the day."),
  act("Fontaines D.C.", "Dublin", "Post-punk", "fri", "tejo", 3, "17:45", "Romance and the two records before it. Guitars on the main stage while the sun is still high."),
  act("Dino D'Santiago", "Lisboa", "Cape Verdean soul", "fri", "tejo", 3, "16:15", "Opens the festival with morna, funaná and batida from the Lisbon that made them. The right first act."),
  act("Peggy Gou", "Seoul / Berlin", "House", "fri", "ponte", 2, "00:30", "Closes the Ponte on Friday with house that sounds like a summer. Expect the tent to spill out into the park."),
  act("Little Simz", "London", "Hip-hop", "fri", "ponte", 2, "22:30", "One of the sharpest writers alive, with a band that plays like a film score. Not to be watched from the bar."),
  act("Nia Archives", "Manchester", "Jungle", "fri", "ponte", 3, "20:45", "Jungle, sung. Breakbeats at 170 with a voice on top, before the night properly starts."),
  act("Wet Leg", "Isle of Wight", "Indie rock", "fri", "ponte", 3, "19:00", "Chaise Longue and the harder, better second album. Early evening, tent, everybody shouting the words."),
  act("Pongo", "Lisboa", "Kuduro", "fri", "ponte", 3, "17:15", "Angola by way of Lisbon's suburbs: kuduro that moves a tent faster than anything else on the bill."),
  act("DJ Koze", "Hamburg", "House", "fri", "armazem", 2, "03:30", "The Armazém's Friday peak: warm, strange, funny house records from the man who made Pick Up."),
  act("Honey Dijon", "Chicago", "House", "fri", "armazem", 3, "01:45", "Chicago house with Chicago attitude. Two hours that take the warehouse from midnight to somewhere else."),
  act("Overmono", "London", "Breaks", "fri", "armazem", 3, "00:00", "Brothers, breaks and a live show that hits like a chest-plate. Opens the Armazém's long night."),
  act("Marcel Dettmann", "Berlin", "Techno", "fri", "armazem", 3, "05:00", "Berghain's resident until the sun is up over the river. Bring your sunglasses for the walk out."),
  act("Branko", "Lisboa", "Global club", "fri", "armazem", 3, "22:30", "Buraka Som Sistema's co-founder plays the Armazém's first set: Lisbon club music with the whole world in it."),
  act("Bon Iver", "Wisconsin", "Folk", "fri", "jardim", 2, "21:00", "SABLE, fABLE and the older songs, at dusk in the garden. The set people plan their Friday around."),
  act("Waxahatchee", "Kansas City", "Americana", "fri", "jardim", 3, "19:30", "Tigers Blood and Saint Cloud, with a band that knows when to stay out of the way."),
  act("Ana Frango Elétrico", "Rio de Janeiro", "Brazilian pop", "fri", "jardim", 3, "18:00", "Rio's disco-tinged, horn-heavy pop. The Jardim's dancing hour."),
  act("Salvador Sobral", "Lisboa", "Jazz pop", "fri", "jardim", 3, "16:30", "Opens the Jardim with a trio and the voice that won Eurovision by whispering."),

  // Saturday
  act("Rosalía", "Barcelona", "Flamenco pop", "sat", "tejo", 1, "23:30", "Saturday's headliner: MOTOMAMI, El Mal Querer and the new record, with dancers, on the river. The ticket most of Madrid is buying."),
  act("Lana Del Rey", "Los Angeles", "Pop", "sat", "tejo", 2, "21:15", "The ballads at golden hour, the bridge turning pink behind her. The slot was booked around the sunset."),
  act("Kaytranada", "Montréal", "Dance / R&B", "sat", "tejo", 2, "19:15", "A main-stage DJ set from the producer who made house records for people who don't go to house nights."),
  act("Chappell Roan", "Missouri", "Pop", "sat", "tejo", 3, "17:30", "Midwest Princess on a Lisbon afternoon. Costumes, choreography, a crowd that knows every word."),
  act("Capicua", "Porto", "Hip-hop", "sat", "tejo", 3, "16:00", "Portugal's best rapper, from Porto, opening the main stage on Saturday with a full band."),
  act("Tems", "Lagos", "R&B / Afrobeats", "sat", "ponte", 2, "00:30", "Born in the Wild, closing the Ponte on Saturday night. A voice that fills a tent without trying."),
  act("Doechii", "Tampa", "Hip-hop", "sat", "ponte", 2, "22:30", "Alligator Bites Never Heal, live, with the jazz band. The set everybody will say they saw."),
  act("The Last Dinner Party", "London", "Baroque pop", "sat", "ponte", 3, "20:45", "Prelude to Ecstasy and the second record, in full costume, in a tent by the river."),
  act("Yves Tumor", "Turin", "Art rock", "sat", "ponte", 3, "19:00", "Glam, noise and a frontperson who owns a stage before the first chord."),
  act("Marina Sena", "Minas Gerais", "Brazilian pop", "sat", "ponte", 3, "17:15", "Brazil's biggest new pop voice: Coisas Naturais and Vício Inerente, early evening at the Ponte."),
  act("Jamie xx", "London", "Electronic", "sat", "armazem", 2, "03:00", "In Waves at the warehouse's peak hour. The Armazém's biggest Saturday booking."),
  act("Four Tet", "London", "Electronic", "sat", "armazem", 2, "01:15", "Two hours, no plan, and somehow the best set of the weekend every year he plays."),
  act("Bicep", "Belfast", "Electronic", "sat", "armazem", 3, "23:30", "Chroma, live: lasers, breakbeats and the Belfast duo's wall of screens."),
  act("Ellen Allien", "Berlin", "Techno", "sat", "armazem", 3, "05:00", "BPitch's founder plays the sunrise slot. Berlin techno while Lisbon wakes up."),
  act("Nídia", "Lisboa", "Batida", "sat", "armazem", 3, "22:00", "Príncipe's producer opens the Armazém on Saturday with batida from Vale da Amoreira."),
  act("Khruangbin", "Houston", "Psychedelic soul", "sat", "jardim", 2, "21:00", "Thai funk, dub and a Texan guitar in a garden at dusk. The set the Jardim was built for."),
  act("Kacey Musgraves", "Texas", "Country", "sat", "jardim", 2, "19:15", "Deeper Well and Golden Hour, on the grass, with the sun going down behind the stage."),
  act("Mitski", "New York", "Indie", "sat", "jardim", 3, "17:30", "The Land Is Inhospitable, with strings. Quiet enough to hear the river."),
  act("Carminho", "Lisboa", "Fado", "sat", "jardim", 3, "16:00", "Fado from one of its great living voices, opening the Jardim on Saturday afternoon."),

  // Sunday
  act("Tyler, the Creator", "Los Angeles", "Hip-hop", "sun", "tejo", 1, "23:00", "Closes the festival. CHROMAKOPIA and IGOR with the full production, the last confetti over the river."),
  act("Hozier", "Wicklow", "Folk rock", "sun", "tejo", 2, "21:00", "Unreal Unearth on the main stage at sunset. Forty thousand people singing Take Me to Church to a bridge."),
  act("Chris Stapleton", "Kentucky", "Country", "sun", "tejo", 2, "19:00", "The voice. Country and soul with a band that could play anywhere, playing the river at seven."),
  act("Rema", "Benin City", "Afrobeats", "sun", "tejo", 3, "17:15", "HEIS and Calm Down on the main stage on Sunday afternoon. The set the Ponte crowd walks over for."),
  act("Bárbara Tinoco", "Lisboa", "Portuguese pop", "sun", "tejo", 3, "15:45", "Opens Sunday's main stage: Lisbon pop songs the whole city knows the words to."),
  act("FKA twigs", "London", "Art pop", "sun", "ponte", 2, "00:00", "EUSEXUA, live, closing the Ponte on Sunday. Dance, pole and a voice that cuts through the tent."),
  act("Caroline Polachek", "New York", "Art pop", "sun", "ponte", 3, "22:15", "Desire, I Want to Turn Into You, sung like it is the last night. Which it is."),
  act("IDLES", "Bristol", "Punk", "sun", "ponte", 2, "20:30", "TANGK and the rest. Joy as an act of resistance, in a tent, on a Sunday."),
  act("Asake", "Lagos", "Afrobeats / Fuji", "sun", "ponte", 3, "18:45", "Lungu Boy and Mr Money With The Vibe, with the choir. Sunday evening at the Ponte."),
  act("Beach House", "Baltimore", "Dream pop", "sun", "ponte", 3, "17:00", "Once Twice Melody in a tent with the sides rolled up and the light coming in."),
  act("Floating Points", "Manchester", "Electronic", "sun", "armazem", 2, "02:00", "Cascade, live, closing the Armazém for the year. Finished by four so you can make a Monday flight."),
  act("Caribou", "London", "Electronic", "sun", "armazem", 3, "00:15", "Honey and the live band, the Armazém's Sunday midnight."),
  act("Helena Hauff", "Hamburg", "Electro", "sun", "armazem", 3, "03:30", "Hard, fast electro and acid on vinyl. The last hour of the weekend."),
  act("Folamour", "Lyon", "House", "sun", "armazem", 3, "22:30", "French disco house with a trumpet. The friendliest set in the warehouse."),
  act("DJ Marfox", "Lisboa", "Batida", "sun", "armazem", 3, "21:00", "The godfather of Lisbon's batida scene opens the Armazém's last night."),
  act("Big Thief", "Brooklyn", "Folk rock", "sun", "jardim", 2, "21:00", "Dragon New Warm Mountain I Believe in You, in a garden, with the river behind. Sunday's Jardim closer."),
  act("Marisa Monte", "Rio de Janeiro", "MPB", "sun", "jardim", 2, "19:15", "Thirty years of Brazilian songs, on the grass at sunset. The Jardim's biggest Brazilian booking."),
  act("Jason Isbell", "Alabama", "Americana", "sun", "jardim", 3, "17:30", "Weathervanes and the 400 Unit. Songs that make a field go quiet."),
  act("Bonny Light Horseman", "New York", "Folk", "sun", "jardim", 3, "16:00", "Keep Me on Your Mind, three voices, one guitar, Sunday afternoon in the garden."),
];

export const actBySlug = (slug: string) => acts.find((a) => a.slug === slug);
export const actsOn = (d: DayId) => acts.filter((a) => a.day === d);
export const actsAt = (s: StageId, d?: DayId) => acts.filter((a) => a.stage === s && (!d || a.day === d));
export const headliners = () => acts.filter((a) => a.tier === 1);
export const secondLine = () => acts.filter((a) => a.tier === 2);
/** Poster order: tier first, then the stage order, then time. */
export const posterOrder = (list: Act[]) =>
  [...list].sort((a, b) => a.tier - b.tier || stageIndex(a.stage) - stageIndex(b.stage) || a.time.localeCompare(b.time));
const stageIndex = (s: StageId) => stages.findIndex((x) => x.id === s);
/** Running order on one stage: afternoon first, the after-midnight slots last. */
export const runningOrder = (list: Act[]) => [...list].sort((a, b) => slotMinutes(a.time) - slotMinutes(b.time));
const slotMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h < 12 ? h + 24 : h) * 60 + m;
};
export const sameDayOthers = (a: Act, take = 4) =>
  acts.filter((b) => b.slug !== a.slug && (b.stage === a.stage || b.day === a.day)).sort((x, y) => (x.stage === a.stage ? -1 : 0) - (y.stage === a.stage ? -1 : 0) || x.tier - y.tier).slice(0, take);

export interface LastYearQuote {
  name: string;
  from: string;
  quote: string;
  saw: string;
}
export const lastYear: LastYearQuote[] = [
  { name: "Inês Carvalho", from: "Lisboa", quote: "I live twenty minutes away and still camped. Walking back to the tent under the bridge at 6am with the river going pink is the whole point.", saw: "Armazém, all three nights" },
  { name: "Tomás Herrera", from: "Madrid", quote: "Flew in Friday with eight friends, flew back Monday with no voice. The Ponte tent on Saturday was the best crowd I have been in.", saw: "Ponte stage, Saturday" },
  { name: "Lena Fischer", from: "Berlin", quote: "I came for the warehouse and stayed for the garden. Nobody told me the seated stage would be the thing I talk about.", saw: "Jardim, Friday" },
  { name: "Sophie Okafor", from: "London", quote: "The travel package was easier than booking a weekend in Brighton. Hotel, shuttle, wristband in the post. I did nothing.", saw: "Tejo stage, every night" },
  { name: "Rafael Moreira", from: "São Paulo", quote: "Ten hours on a plane and worth every one. Three Brazilian acts on the bill, a Portuguese crowd that knew the songs, and the city after.", saw: "Ponte and Jardim" },
  { name: "Camille Durand", from: "Paris", quote: "We planned around the Jardim and the sunsets and ended up at the Armazém until it closed. Plan less.", saw: "Everything, by accident" },
];

export const originCities = [
  { city: "Madrid", how: "1h15 flight, or the overnight train to Santa Apolónia", packageSlug: "travel-package-madrid" },
  { city: "London", how: "2h40 flight to Lisbon, Gatwick or Stansted", packageSlug: "travel-package-london" },
  { city: "Berlin", how: "3h30 direct flight, Thursday out for the warm-up", packageSlug: "travel-package-berlin" },
  { city: "Paris", how: "2h30 flight, several a day from Orly and CDG" },
  { city: "São Paulo", how: "10h overnight direct, land Thursday morning", packageSlug: "travel-package-sao-paulo" },
  { city: "Porto", how: "2h50 on the Alfa Pendular to Oriente, 15 minutes from the gate" },
];

export const faqs: { q: string; a: string }[] = [
  { q: "When do the gates open?", a: "Friday at 16:00, Saturday and Sunday at 14:00. The Armazém runs until 06:00 on Friday and Saturday and until 04:00 on Sunday. The Jardim finishes by 22:00 every night." },
  { q: "How do I get to Parque Tejo?", a: "Metro or train to Oriente (red line, or any train into Lisbon), then the free festival shuttle, which runs every five minutes from 13:00 until an hour after the last set. On foot it is 25 minutes along the river from Oriente." },
  { q: "Is there an age limit?", a: "No. Under 16s come free with a ticket-holding adult and get their own wristband at the gate. The Armazém is 18 and over after midnight." },
  { q: "Can I bring my own tent?", a: "Yes, with the three-day pass plus camping. Campo Tejo opens Thursday at noon and closes Monday at noon. Pre-pitched tents can be added when you buy." },
  { q: "What can I bring in?", a: "An empty bottle up to one litre (there are free water points), sun cream, a small bag. No glass, no professional cameras, no umbrellas. Lockers are by each gate." },
  { q: "Is the festival cashless?", a: "Yes. Your wristband is your wallet; top up online before you come or at any bar. Unused balance is refunded automatically after the festival." },
  { q: "Are the stages accessible?", a: "All four stages have raised viewing platforms, the paths are paved or boarded, and the accessible shuttle runs from Oriente. Carers come free. Email access@tagidefestival.pt and we will plan it with you." },
  { q: "What if an act cancels?", a: "Lineups change; tickets are not refunded if an act cancels, but if a headliner does we will say so on this page and on the app within an hour of knowing." },
  { q: "Can I resell my ticket?", a: "Only through our official resale, which opens in March. Tickets bought anywhere else may not scan." },
];

export const slug = slugify;
