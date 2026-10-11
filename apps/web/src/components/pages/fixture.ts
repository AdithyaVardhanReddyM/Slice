// Local fixture: a Ridgeline Coffee Roasters landing page that exercises all
// 14 section types with a plausible brand kit. Rendered at /p/_fixture (dev
// only) so the renderer can be reviewed without Convex. Images are Pexels CDN
// placeholders; frames hold their shape if one fails to load.

import type { BrandKit, ImageRef, PageDoc, QuizConfig } from "@slice/backend/convex/pagesTypes";

const px = (id: number, w = 1600): string => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;
const img = (id: number, alt: string, credit?: string, w?: number): ImageRef => ({ src: px(id, w), alt, source: "pexels", credit, ref: String(id) });

export const fixtureBrand = { name: "Ridgeline Coffee Roasters", slug: "ridgeline", url: "https://ridgeline.example" };

export const fixtureKit: BrandKit = {
  wordmark: "Ridgeline",
  colors: {
    background: "#F7F2E9",
    foreground: "#2B1D16",
    primary: "#9A4A2A",
    primaryForeground: "#FFF6EC",
    accent: "#D9A066",
    muted: "#EFE4D3",
    surface: "#FFFCF7",
  },
  fonts: {
    heading: { family: "Fraunces", source: "google", weights: [400, 500, 600], fallback: "Georgia, 'Times New Roman', serif" },
    body: { family: "Figtree", source: "google", weights: [400, 500, 600], fallback: "system-ui, -apple-system, sans-serif" },
  },
  radius: "md",
  density: "regular",
  imagery: { style: "warm natural light, hands and steam, cafés in use", treatment: "soft contrast, no studio white, slight warm grade" },
  voice: {
    summary: "Plain, warm, specific. Talks about farms and cups, not notes and scores.",
    do: ["name the farm and the altitude", "short sentences", "invite people in"],
    avoid: ["tasting-note poetry", "exclamation marks", "artisan, curated, elevated"],
  },
  buttonStyle: "pill",
  uppercaseLabels: false,
};

export const fixtureDoc: PageDoc = {
  meta: {
    title: "Ridgeline is opening in Austin",
    description: "Our third café opens on East 6th in November. Opening-week pours, a founding-member subscription and a few things we love about this city.",
    image: px(302899, 1200),
  },
  header: {
    showLogo: true,
    links: [
      { label: "Coffees", href: "#coffees" },
      { label: "Subscriptions", href: "#offer" },
      { label: "Cafés", href: "#cafes" },
      { label: "Our story", href: "#story" },
    ],
    cta: { label: "Join the opening list", href: "#waitlist", track: "header-waitlist" },
  },
  footer: {
    text: "© 2026 Ridgeline Coffee Roasters, Portland, Seattle and soon Austin.",
    links: [
      { label: "Shipping", href: "https://ridgeline.example/shipping" },
      { label: "Wholesale", href: "https://ridgeline.example/wholesale" },
      { label: "Instagram", href: "https://instagram.com/ridgeline" },
    ],
  },
  sections: [
    {
      id: "hero",
      type: "hero",
      layout: "full",
      eyebrow: "East 6th Street, opening November 14",
      headline: "Austin, we saved you a seat at the bar.",
      subheadline: "Twelve years of roasting in Portland, a second home in Seattle, and now a café built for long mornings on the east side.",
      primaryCta: { label: "Join the opening list", href: "#waitlist", track: "hero-waitlist" },
      secondaryCta: { label: "See the coffees", href: "#coffees" },
      image: img(1813466, "Morning light across the counter of a Ridgeline café", "Photo: Pexels"),
      evidence: "Austin audience: Qloo tags warm, social, neighbourhood-first; leads with place over product.",
    },
    {
      id: "stats",
      type: "stats",
      items: [
        { value: "12", label: "years roasting on the same German drum" },
        { value: "31", label: "farms we buy from directly, most for five seasons or more" },
        { value: "48h", label: "from roast to your door, anywhere in Texas" },
        { value: "3", label: "cafés, counting the one we are building for you" },
      ],
    },
    {
      id: "coffees",
      type: "grid",
      columns: 3,
      eyebrow: "Opening-week lineup",
      headline: "Six coffees we chose with Austin in mind",
      intro: "Bright enough for iced pours in October, round enough for a slow cortado. Every bag ships from the roastery within two days of roasting.",
      items: [
        { id: "c1", title: "Huila, Colombia", description: "Red apple, panela, a long clean finish. Our everyday pour-over.", price: "$19", image: img(2074122, "Roasted coffee beans", undefined, 900), href: "#", badge: "Light roast" },
        { id: "c2", title: "Sidama, Ethiopia", description: "Peach and bergamot, floral when hot, lemonade when iced.", price: "$21", image: img(894695, "Green coffee in a burlap sack", undefined, 900), href: "#", badge: "Washed" },
        { id: "c3", title: "Ridgeline Blend", description: "Brazil and Guatemala. Milk chocolate, hazelnut, built for espresso.", price: "$18", image: img(312418, "Espresso with latte art", undefined, 900), href: "#" },
        { id: "c4", title: "Cold Brew Concentrate", description: "Twenty-hour steep, one part to two parts water, or over ice as is.", price: "$16", image: img(302899, "Iced coffee on a wooden table", undefined, 900), href: "#", badge: "New" },
        { id: "c5", title: "Decaf Chiapas", description: "Sugarcane process. Cocoa and dried fig; nobody can tell.", price: "$19", image: img(1695052, "Coffee cup on a saucer", undefined, 900), href: "#" },
        { id: "c6", title: "Instant Sticks, 8 pack", description: "Freeze-dried Huila for trailheads and hotel rooms.", price: "$14", image: img(1307698, "Coffee on a wooden table", undefined, 900), href: "#" },
      ],
      cta: { label: "Shop all coffees", href: "https://ridgeline.example/coffees", track: "grid-shop-all" },
      evidence: "pick_items ranked iced-friendly and bright coffees first for the Austin profile.",
    },
    {
      id: "method",
      type: "split",
      theme: "muted",
      imageSide: "left",
      eyebrow: "How we roast",
      headline: "Slow, light, and never past the point where the farm disappears.",
      body: "We roast on a 1968 Probat we rebuilt ourselves. Small batches, long development, and a cupping table where every roast is tasted blind before it leaves the building.",
      bullets: ["Every lot is cupped three times before release", "Roast dates on every bag, never 'best by'", "Direct contracts with 31 farms, paid above C-price"],
      image: img(683039, "Pouring water over a filter cone", "Photo: Pexels"),
      cta: { label: "Read about sourcing", href: "#story", track: "split-sourcing" },
    },
    {
      id: "culture",
      type: "culture",
      eyebrow: "What we have been listening to",
      headline: "If your weekends sound like Khruangbin and taste like brisket, you will feel at home here.",
      intro: "We asked around before we signed the lease. These kept coming up, so they are shaping the café: the playlist, the Sunday menu, the art on the walls.",
      items: [
        { name: "Khruangbin", kind: "artist", image: px(1763075, 600), note: "Sunday afternoon playlist" },
        { name: "Franklin Barbecue", kind: "place", image: px(1002740, 600), note: "Brisket breakfast taco collab, opening week" },
        { name: "Spoon", kind: "artist", note: "Austin's own, on heavy rotation" },
        { name: "Yeti", kind: "brand", image: px(3230010, 600), note: "Tumblers at the bar, for the lake" },
        { name: "Dazed and Confused", kind: "film", note: "The outdoor screening we are planning" },
        { name: "Veracruz All Natural", kind: "place", note: "Migas tacos, two blocks away" },
      ],
      footnote: "Cultural references come from Qloo's view of what people in East Austin love, matched against Ridgeline's own customers in Texas.",
      evidence: "Qloo culture: artists Khruangbin, Spoon; places Franklin Barbecue, Veracruz; brands Yeti.",
    },
    {
      id: "story",
      type: "story",
      eyebrow: "Why Austin",
      headline: "A third city, chosen the slow way.",
      paragraphs: [
        "We have shipped more bags to Austin than to any city we do not have a café in for four years running. People kept writing to ask when we would show up. In 2024 we started visiting, drinking coffee, and asking questions.",
        "The answer was always the same: a place to sit for a while. Not a pick-up window, not a laptop farm. A long bar, a few soft chairs, a patio that works in August with enough shade and enough fans.",
        "So that is what we built. The espresso machine is the same one we run in Portland. The pastry case is from an Austin baker we met at a farmers market. The playlist is yours.",
      ],
      image: img(374885, "Barista steaming milk at a café counter", "Photo: Pexels"),
      pullQuote: "A café should feel like someone's kitchen on a good morning. Everything else is details.",
    },
    {
      id: "gallery",
      type: "gallery",
      layout: "strip",
      headline: "The room, three weeks before opening",
      images: [img(1813466, "Café interior with wooden counter", "Pexels", 1200), img(324028, "Barista pouring a latte", "Pexels", 1400), img(2396220, "Coffee and a book on a table", "Pexels", 1200), img(2299028, "Café window seat", "Pexels", 1400), img(851555, "Coffee beans on a table", "Pexels", 1200)],
    },
    {
      id: "offer",
      type: "offer",
      theme: "accent",
      eyebrow: "Founding members",
      headline: "The Austin subscription, with opening-week perks.",
      body: "Two bags a month, picked for you by the roasting team, delivered to your door or held at the East 6th bar. Lock in the founding price for as long as you stay subscribed.",
      price: "$34/mo",
      was: "$42/mo",
      perks: ["Free drip, every visit, forever", "First pick of the opening-week Gesha, 60 bags only", "A Ridgeline x Yeti tumbler in your first box", "Pause or swap coffees anytime"],
      cta: { label: "Become a founding member", href: "https://ridgeline.example/subscribe?plan=austin", track: "offer-subscribe" },
      deadline: "Founding price ends November 30",
      image: img(1695052, "Coffee being poured into a cup", "Photo: Pexels"),
    },
    {
      id: "testimonials",
      type: "testimonials",
      headline: "What Portland and Seattle say",
      quotes: [
        { text: "The only subscription I have kept for more than a year. They remember what I liked and the roast dates are real.", name: "Marisol V.", detail: "Member since 2021, Portland" },
        { text: "I bring every out-of-town friend to the Ballard café. Nobody has ever asked to go anywhere else after.", name: "Daniel O.", detail: "Seattle" },
        { text: "Their Huila on ice got me through two Texas summers. Having the café here is going to be dangerous.", name: "Priya R.", detail: "Austin, ships every month" },
      ],
    },
    {
      id: "cafes",
      type: "locations",
      headline: "Three cafés, one roastery",
      intro: "Austin opens November 14. Portland and Seattle are open daily, 7 to 5.",
      places: [
        { name: "East 6th, Austin", kind: "Opening November 14", address: "1912 E 6th St\nAustin, TX 78702", detail: "Patio, long bar, parking behind the building. Dogs welcome outside.", image: img(4350057, "Café exterior in warm light", undefined, 900), lat: 30.2634, lon: -97.7244 },
        { name: "Alberta Street, Portland", kind: "Café and roastery", address: "2719 NE Alberta St\nPortland, OR 97211", detail: "Where every bag is roasted. Cuppings Saturdays at 10.", image: img(6347888, "Café with wooden tables", undefined, 900), lat: 45.559, lon: -122.637 },
        { name: "Ballard, Seattle", kind: "Café", address: "5311 Ballard Ave NW\nSeattle, WA 98107", detail: "Sunday market mornings get busy. Come early or come late.", image: img(1024359, "Café interior with plants", undefined, 900), lat: 47.6675, lon: -122.3843 },
      ],
      cta: { label: "Get directions", href: "https://maps.google.com/?q=1912+E+6th+St+Austin", track: "locations-directions" },
    },
    {
      id: "faq",
      type: "faq",
      theme: "muted",
      headline: "Before you come by",
      items: [
        { q: "When exactly do you open?", a: "Saturday, November 14 at 7 am. The first 200 drinks are on us. Opening week runs through the 20th with a different guest baker each day." },
        { q: "Will the subscription ship to Austin or can I pick it up?", a: "Both. Choose delivery or bar pick-up when you subscribe, and switch between them any month from your account." },
        { q: "Do you do wholesale for Austin cafés and restaurants?", a: "Yes. We are taking on a handful of partners for the first year so we can train and support them properly. Write to wholesale@ridgeline.example." },
        { q: "Is the café kid and dog friendly?", a: "Kids inside and out, dogs on the patio. There is a water bowl and a shade sail that covers the whole thing." },
      ],
    },
    {
      id: "waitlist",
      type: "form",
      eyebrow: "Opening list",
      headline: "Be the first to know, and the first in line.",
      body: "We will send one email the week before we open with the opening-day plan, the guest bakers and a code for your first pour. Nothing else.",
      fields: [
        { name: "first_name", label: "First name", type: "text", required: true, placeholder: "Your first name" },
        { name: "email", label: "Email", type: "email", required: true, placeholder: "you@example.com" },
        { name: "neighbourhood", label: "Where in Austin are you?", type: "select", options: ["East Austin", "Downtown", "South Congress", "Hyde Park", "Mueller", "Somewhere else"], placeholder: "Pick one" },
        { name: "brew", label: "How do you make coffee at home?", type: "text", placeholder: "Pour-over, espresso, French press..." },
        { name: "note", label: "Anything you want us to know", type: "textarea", placeholder: "A coffee you love, a request for the menu, a playlist suggestion" },
      ],
      submitLabel: "Put me on the list",
      success: "You are on the list. See you on East 6th.",
    },
    {
      id: "hours",
      type: "custom",
      html: `<div style="display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
        <div><h3 style="font-size:1.1rem;margin-bottom:8px">Opening week hours</h3><p>Sat 14 to Fri 20: 7 am to 7 pm<br/>After opening week: 7 am to 5 pm daily</p></div>
        <div><h3 style="font-size:1.1rem;margin-bottom:8px">Guest bakers</h3><p>Sat: Sour Duck · Sun: Quack's · Mon: Comadre Panadería · Tue to Fri: rotating</p></div>
        <div><h3 style="font-size:1.1rem;margin-bottom:8px">Getting there</h3><p>CapMetro 4 and 17 stop at the corner. Bike racks out front, parking behind the building off Chalmers.</p></div>
      </div><script>alert('this is stripped')</script><img src=x onerror="alert(1)" style="display:none" />`,
    },
    {
      id: "cta",
      type: "cta",
      theme: "dark",
      headline: "See you on East 6th.",
      body: "Join the opening list for the plan, the perks and a free first pour. Or just come by on the 14th; the door will be open.",
      cta: { label: "Join the opening list", href: "#waitlist", track: "cta-waitlist" },
      secondary: { label: "Shop coffees now", href: "https://ridgeline.example/coffees", track: "cta-shop" },
    },
  ],
};

export const fixtureQuiz: QuizConfig = {
  questions: [
    {
      id: "q1",
      prompt: "What's on repeat?",
      options: [
        { label: "Khruangbin", votes: { austin: 1 } },
        { label: "Bon Iver", votes: { portland: 1 } },
        { label: "Fleet Foxes", votes: { seattle: 1 } },
      ],
    },
    {
      id: "q2",
      prompt: "A place you'd book",
      options: [
        { label: "Franklin Barbecue", votes: { austin: 1 } },
        { label: "Le Pigeon", votes: { portland: 1 } },
        { label: "The Walrus and the Carpenter", votes: { seattle: 1 } },
      ],
    },
    {
      id: "q3",
      prompt: "A brand you trust",
      options: [
        { label: "Yeti", votes: { austin: 1 } },
        { label: "Danner", votes: { portland: 1 } },
        { label: "Filson", votes: { seattle: 1 } },
      ],
    },
  ],
};
