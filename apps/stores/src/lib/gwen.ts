import { createCatalogApi, type Product } from "@slice/demo-catalogs";
import { gwen as gwenCatalog } from "@slice/demo-catalogs/gwen";

export const gwen = createCatalogApi(gwenCatalog);

/** Editorial photos live in the catalog as "Scenes" so fetch-images can pull them; the site hides them. */
export const sceneSrc = (slug: string): string | undefined => gwen.get(slug)?.images[0];

export const perks = (): Product[] => gwen.inCategory("Perks");
export const perk = (slug: string): Product => {
  const p = gwen.get(slug);
  if (!p) throw new Error(`Unknown perk ${slug}`);
  return p;
};

const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const usd = (n: number) => usdFormat.format(n);

export const href = {
  home: "/gwen",
  perks: "/gwen#perks",
  rewards: "/gwen#rewards",
  app: "/gwen#app",
  card: "/gwen#card",
  fees: "/gwen#fees",
  faq: "/gwen#faq",
  apply: "/gwen#apply",
};

export const card = {
  company: "Gwen",
  name: "Gwen Reserve",
  network: "Visa Infinite",
  annualFee: 695,
  authorizedUser: 195,
  apr: "20.74% to 28.49% variable",
  foreignFee: "None",
  latePayment: "Up to $40",
  issuer: "Harlow National Bank, N.A., Member FDIC",
  welcome: { points: 80_000, spend: 6_000, months: 6 },
  /** Cents per point when redeemed through Gwen Travel. */
  pointValue: 1.25,
  material: "Stainless steel core, 18 grams",
  email: "hello@gwen.cards",
  phone: "1-888-555-0143",
  address: ["Gwen Financial, Inc.", "220 Fifth Avenue, 9th floor", "New York, NY 10001"],
};

export const creditsTotal = () => perks().reduce((sum, p) => sum + p.price, 0);

/** How each perk is introduced on the home page. Order is the default order of the page. */
export const perkCopy: Record<string, { value: string; line: string; partners: string[] }> = {
  tables: {
    value: "$300 a year",
    line: "Dinner at 1,400 partner restaurants in 14 cities, $150 back each half of the year.",
    partners: ["New York", "Chicago", "Los Angeles", "Austin", "Miami", "+9 cities"],
  },
  "front-row": {
    value: "$300 a year",
    line: "Concerts, comedy, theatre and games, with presales 48 hours early.",
    partners: ["60 partner venues", "Member entrance"],
  },
  stays: {
    value: "$500 a year",
    line: "900 hotels with breakfast for two, an upgrade when one is free and 4pm checkout.",
    partners: ["Ace Hotel", "The Hoxton", "Rosewood", "Aman", "Six Senses"],
  },
  away: {
    value: "$300 a year",
    line: "A travel credit, 1,600 lounges, Gwen Rooms in six airports and Global Entry paid for.",
    partners: ["JFK", "LAX", "ORD", "SFO", "MIA", "AUS"],
  },
  screen: {
    value: "$20 a month",
    line: "One streaming service on us. Switch any month.",
    partners: ["MUBI", "Criterion Channel", "Crunchyroll", "Max", "Hulu"],
  },
  shop: {
    value: "$200 a year",
    line: "One partner store you pick each January.",
    partners: ["REI", "Saks", "Le Labo", "Aesop", "Apple"],
  },
  move: {
    value: "$25 a month",
    line: "A gym, a studio or the ring on your finger.",
    partners: ["Equinox", "ClassPass", "Peloton", "Oura"],
  },
};

export const earn = [
  { rate: "5x", what: "Flights and hotels", note: "Booked through Gwen Travel" },
  { rate: "3x", what: "Dining, tickets and streaming", note: "Everywhere, no caps" },
  { rate: "1x", what: "Everything else", note: "Points never expire" },
];

export const stats = [
  { value: "$2,140", label: "in credits every year" },
  { value: "1,400", label: "partner restaurants in 14 cities" },
  { value: "1,600+", label: "airport lounges worldwide" },
  { value: "$0", label: "foreign transaction fees" },
];

export const partners = [
  "Ace Hotel",
  "MUBI",
  "Rosewood",
  "REI",
  "Crunchyroll",
  "Le Labo",
  "Equinox",
  "The Hoxton",
  "Criterion Channel",
  "Aesop",
  "Six Senses",
  "Saks Fifth Avenue",
  "ClassPass",
  "Kimpton",
];

export const members = [
  {
    scene: "member-1",
    name: "Priya Raman",
    city: "Brooklyn, NY",
    since: "Member since 2024",
    uses: "Tables",
    quote:
      "I was already eating out twice a week. Now two of those dinners a year are on Gwen, and the Thursday table drops got me into places I'd given up on.",
  },
  {
    scene: "member-2",
    name: "Marcus Hale",
    city: "Denver, CO",
    since: "Member since 2023",
    uses: "Stays",
    quote:
      "The hotel credit paid for a weekend in Telluride, breakfast included. The lounge at DIA did the rest. The fee was covered by March.",
  },
  {
    scene: "member-3",
    name: "Elaine Porter",
    city: "Chicago, IL",
    since: "Member since 2025",
    uses: "Front Row",
    quote:
      "Presales are the reason I switched. I got Lyric Opera seats before they went public, and the credit took $150 off.",
  },
];

export const faq = [
  {
    q: "Will checking eligibility affect my credit score?",
    a: "No. We use a soft inquiry to show whether you're approved and for what limit. A hard inquiry only happens if you accept the offer and open the account.",
  },
  {
    q: "How do the credits work?",
    a: "Each credit is a statement credit. Pay with your Gwen Reserve at an eligible partner and the credit appears within a few days, up to that period's amount. Nothing to enrol in, no codes to remember.",
  },
  {
    q: "Do unused credits roll over?",
    a: "No. Half-year credits reset on 1 January and 1 July, monthly ones on the first of each month. The app reminds you two weeks before anything resets.",
  },
  {
    q: "What are points worth?",
    a: "1.25 cents each when you book travel through Gwen Travel, 1 cent as a statement credit, or transfer them 1:1 to 14 airline and hotel programmes.",
  },
  {
    q: "Can I add someone to my account?",
    a: "Yes. Authorized users are $195 a year each, get their own metal card and lounge access, and their spending earns points for you.",
  },
  {
    q: "Who issues the card?",
    a: "Gwen Reserve is issued by Harlow National Bank, N.A., Member FDIC, pursuant to a license from Visa U.S.A. Inc. Gwen is a financial technology company, not a bank.",
  },
];

export const appFeatures = [
  { title: "Credits apply themselves", text: "Pay with the card at a partner and the credit lands on your statement. No enrolment, no codes." },
  { title: "Reminders before reset", text: "Two weeks before a credit resets, the app tells you what's left and where you can use it." },
  { title: "Freeze in one tap", text: "Lock the card, make virtual numbers for subscriptions and set limits for authorized users." },
  { title: "Apple Pay and Google Pay", text: "Add the card to your wallet the moment you're approved, before the metal one arrives." },
];
