// Designed email templates for the "Create a campaign" gallery. Each is a
// full EmailDoc written with theme tokens (surface, muted, primary, accent,
// text) so `applyTheme` restyles it for any brand, with curated Pexels photos
// and placeholder copy any business can adapt (a shop, a café, a hotel, a
// festival, a studio). Ids are
// deterministic per template so server and client renders agree.
// Plain TypeScript, no Convex imports.

import type { EmailDoc, EmailSectionInput, EmailTemplate, EmailTheme, TemplateCategory } from "./emailTypes";
import { blankDoc, validateEmailDoc } from "./emailDoc";
import { DEFAULT_THEME, themePreset } from "./emailThemes";
import { button, col, cols, coupon, divider, footer, heading, image, items, kicker, logo, pexels, quote, section, social, text } from "./emailPresets";

/** Stable ids: "<template>-s1", "<template>-s1c1", "<template>-b1". */
function seedIds(prefix: string, sections: EmailSectionInput[]): EmailSectionInput[] {
  let b = 0;
  return sections.map((s, i) => ({
    ...s,
    id: `${prefix}-s${i + 1}`,
    columns: s.columns.map((c, j) => ({ ...c, id: `${prefix}-s${i + 1}c${j + 1}`, blocks: c.blocks.map((blk) => ({ ...blk, id: `${prefix}-b${++b}` })) })),
  }));
}

/** The same ids for a doc built with random ones (the blank template). */
function stableIds(doc: EmailDoc, prefix: string): EmailDoc {
  let b = 0;
  doc.sections.forEach((s, i) => {
    s.id = `${prefix}-s${i + 1}`;
    s.columns.forEach((c, j) => {
      c.id = `${prefix}-s${i + 1}c${j + 1}`;
      c.blocks.forEach((blk) => (blk.id = `${prefix}-b${++b}`));
    });
  });
  return doc;
}

function template(
  id: string,
  name: string,
  purpose: string,
  category: TemplateCategory,
  personal: boolean,
  meta: { subject: string; preheader: string; theme?: string },
  sections: EmailSectionInput[],
): EmailTemplate {
  const theme: EmailTheme = (meta.theme && themePreset(meta.theme)) || DEFAULT_THEME;
  const { doc } = validateEmailDoc({ kind: "email", version: 0, subject: meta.subject, preheader: meta.preheader, theme, sections: seedIds(id, sections) });
  return { id, name, purpose, category, personal, doc };
}

/** The footer most templates end with. */
const footerSection = (o: { background?: string } = {}) =>
  section("Footer", [col([social({ padding: [0, 0, 18, 0] }), footer()])], { background: o.background ?? "muted", padding: [32, 40, 36, 40] });

const P = (...paras: string[]) => paras.map((p) => `<p>${p}</p>`).join("");

/* Templates -------------------------------------------------------------------- */

const welcome = template(
  "welcome",
  "Welcome",
  "Say hello to new subscribers",
  "Welcome",
  false,
  { subject: "Welcome in, {{first_name|friend}}", preheader: "Here's what to expect from us, plus a little gift for your first order.", theme: "forest" },
  [
    section("Header", [col([logo()])], { background: "primary", padding: [36, 40, 12, 40] }),
    section(
      "Hero",
      [
        col([
          heading("Welcome in, {{first_name|friend}}.", { size: 42 }),
          text("Thanks for joining us. We're a small team that cares about every detail, and we're so glad you're here.", { size: 17 }),
          button("Take a look around", { variant: "outline", padding: [12, 0, 36, 0] }),
          image(pexels(5424933, 1200, 720), "A customer and a shop owner smiling over a paper bag", { padding: [0, 0, 0, 0] }),
        ]),
      ],
      { background: "primary", padding: [20, 40, 40, 40] },
    ),
    section("Intro", [col([heading("What you'll get from us", { level: 2 })])], { padding: [44, 40, 4, 40] }),
    section(
      "What to expect",
      cols(
        [heading("01", { level: 3, color: "primary", size: 28, padding: [0, 0, 6, 0] }), heading("What's new, first", { level: 3, size: 18, padding: [0, 0, 6, 0] }), text("A short note whenever something new arrives.", { size: 15 })],
        [heading("02", { level: 3, color: "primary", size: 28, padding: [0, 0, 6, 0] }), heading("Picks for you", { level: 3, size: 18, padding: [0, 0, 6, 0] }), text("Recommendations chosen for what you actually like.", { size: 15 })],
        [heading("03", { level: 3, color: "primary", size: 28, padding: [0, 0, 6, 0] }), heading("Invites and events", { level: 3, size: 18, padding: [0, 0, 6, 0] }), text("First word on launches, events and members-only offers.", { size: 15 })],
      ),
      { padding: [16, 40, 44, 40], gap: 24 },
    ),
    section(
      "Welcome gift",
      [
        col([
          heading("A little welcome gift", { level: 2, size: 26 }),
          text("Take 10% off your first order or visit.", { padding: [0, 0, 20, 0] }),
          coupon("WELCOME10", "10% off your first order", { note: "Valid for 30 days. One use per customer." }),
          button("Shop now"),
        ]),
      ],
      { background: "muted", padding: [44, 40, 44, 40] },
    ),
    footerSection({ background: "surface" }),
  ],
);

const newsletter = template(
  "newsletter",
  "Monthly newsletter",
  "A monthly round-up of news and picks",
  "Newsletter",
  false,
  { subject: "This month with us", preheader: "What's new, two dates for your diary and a few words from our team.", theme: "ink" },
  [
    section(
      "Header",
      [col([logo({ align: "left", width: 130 })], { width: 0.5, verticalAlign: "middle" }), col([text("The monthly update", { align: "right", size: 13, color: "primary" })], { width: 0.5, verticalAlign: "middle" })],
      { padding: [28, 40, 12, 40], stackOnMobile: false },
    ),
    section(
      "Title",
      [col([heading("This month with us", { align: "left", size: 44, padding: [0, 0, 20, 0] }), divider({ color: "text", padding: [0, 0, 0, 0] })])],
      { padding: [24, 40, 28, 40] },
    ),
    section("Image band", [col([image(pexels(2890018, 1200, 560), "A warmly lit small shop with a woman at work behind the counter", { padding: [0, 0, 0, 0], radius: 0 })])], { padding: [0, 0, 0, 0] }),
    section(
      "What we're up to",
      [
        col([
          heading("What we're up to", { level: 2, align: "left" }),
          text(
            P(
              "It's been a busy few weeks. We refreshed our space, welcomed some new faces to the team and hosted our busiest evening yet. Thank you to everyone who came along.",
              "Below you'll find what's new, two dates for your diary and a few things our team can't stop talking about.",
            ),
            { align: "left" },
          ),
          button("See what's new", { align: "left" }),
        ]),
      ],
      { padding: [36, 40, 12, 40] },
    ),
    section(
      "Stories",
      cols(
        [
          image(pexels(3937667, 600, 420), "Friends laughing around a candle-lit table", { padding: [0, 0, 16, 0] }),
          heading("Our evenings, now twice a month", { level: 3, align: "left" }),
          text("So many of you came last time that we're adding a second date.", { align: "left", size: 15 }),
          button("Save a seat", { align: "left", variant: "outline", size: "sm" }),
        ],
        [
          image(pexels(3951844, 600, 420), "Hands writing a note on a card", { padding: [0, 0, 16, 0] }),
          heading("A note from our team", { level: 3, align: "left" }),
          text("The small details we fuss over, and why they matter.", { align: "left", size: 15 }),
          button("Meet the team", { align: "left", variant: "outline", size: "sm" }),
        ],
      ),
      { padding: [28, 40, 28, 40], gap: 24 },
    ),
    section("Picks", [col([heading("Our picks this month", { level: 2, align: "left", padding: [0, 0, 20, 0] }), items({ columns: 3, buttonLabel: "View" })])], { padding: [28, 40, 40, 40] }),
    footerSection(),
  ],
);

const newArrivals = template(
  "new-arrivals",
  "New arrivals",
  "Show what just came in",
  "Products",
  false,
  { subject: "Just landed: new arrivals", preheader: "Fresh in this week, and a few favourites our team can't stop talking about.", theme: "paper" },
  [
    section("Top bar", [col([text("Free shipping on orders over $40", { size: 13, padding: [0, 0, 0, 0] })])], { background: "text", padding: [10, 24, 10, 24] }),
    section("Header", [col([logo()])], { padding: [28, 40, 24, 40] }),
    section("Photo", [col([image(pexels(32282974, 1200, 720), "Colourful handmade mugs on display in a shop", { padding: [0, 0, 0, 0], radius: 0 })])], { padding: [0, 0, 0, 0] }),
    section(
      "Hero",
      [
        col([
          heading("Just landed", { size: 52 }),
          text("Fresh in this week: the new pieces our team can't stop talking about. Take a look before they're gone.", { size: 17 }),
          button("Shop new arrivals", { variant: "outline" }),
        ]),
      ],
      { padding: [44, 48, 20, 48] },
    ),
    section("New this week", [col([divider({ padding: [0, 0, 32, 0] }), heading("New this week", { level: 2, size: 24, padding: [0, 0, 24, 0] }), items({ columns: 3, buttonLabel: "View" })])], { padding: [12, 40, 44, 40] }),
    section(
      "Staff pick",
      [
        col([image(pexels(6755612, 600, 720), "Hand-poured candles in glass jars on a wooden table", { padding: [0, 0, 0, 0] })], { width: 0.45, verticalAlign: "middle" }),
        col(
          [
            kicker("Team pick", { align: "left" }),
            heading("The one we keep recommending", { level: 2, align: "left" }),
            text("Every team has a favourite. This is ours: simple, well made and loved by everyone who tries it.", { align: "left", size: 15 }),
            button("Find out why", { align: "left" }),
          ],
          { width: 0.55, verticalAlign: "middle" },
        ),
      ],
      { background: "muted", padding: [40, 40, 40, 40], gap: 32 },
    ),
    footerSection({ background: "surface" }),
  ],
);

const pickedForYou = template(
  "picked-for-you",
  "Picked for you",
  "Recommend picks by each customer's taste",
  "Products",
  true,
  { subject: "{{first_name|Hi there}}, we picked these for you", preheader: "A few things chosen for your taste, by a team that knows the range inside out.", theme: "sunset" },
  [
    section("Header", [col([logo()])], { padding: [28, 40, 24, 40] }),
    section(
      "Hero",
      [
        col([
          kicker("Chosen for your taste", { color: undefined }),
          heading("Picked for you, {{first_name|there}}", { size: 36, personal: true }),
          text("We went through everything with your taste in mind. Here are a few picks that feel like you.", { size: 17, personal: true }),
        ]),
      ],
      { background: "accent", padding: [48, 48, 48, 48], evidence: "Written for each person from their taste profile." },
    ),
    section(
      "Picks",
      [col([items({ pick: "taste", count: 4, columns: 2, personal: true, buttonLabel: "View", show: { image: true, subtitle: true, description: false, price: true, button: true, reason: true } })])],
      { padding: [40, 40, 16, 40], evidence: "Ranked against each person's own taste profile." },
    ),
    section(
      "Why these",
      [col([divider({ padding: [0, 0, 20, 0] }), text("Picked from the things you told us you love. Not quite right? Just reply and tell us what you're in the mood for.", { size: 14 })])],
      { padding: [8, 48, 36, 48] },
    ),
    section(
      "Consult",
      [col([heading("Want a hand-picked selection?", { level: 2, size: 24 }), text("Set up a free 15-minute chat with our team, in person or over video."), button("Set up a chat")])],
      { background: "muted", padding: [40, 48, 40, 48] },
    ),
    footerSection({ background: "surface" }),
  ],
);

const flashSale = template(
  "flash-sale",
  "Flash sale",
  "A short sale with a code",
  "Promotion",
  false,
  { subject: "Flash sale: 20% off everything", preheader: "48 hours only. Use the code at checkout, in person or online.", theme: "forest" },
  [
    section("Header", [col([logo()])], { background: "accent", padding: [28, 40, 4, 40] }),
    section(
      "Hero",
      [
        col([
          kicker("48 hours only", { color: undefined, padding: [0, 0, 8, 0] }),
          heading("Flash sale", { size: 72, uppercase: true, letterSpacing: 1, padding: [0, 0, 12, 0] }),
          text("20% off everything, in person and online, until Sunday at midnight.", { size: 18, padding: [0, 0, 24, 0] }),
          coupon("FLASH20", "Use this code at checkout", { note: "Ends Sunday 11:59 pm. Excludes gift cards." }),
          button("Shop the sale", { size: "lg" }),
        ]),
      ],
      { background: "accent", padding: [20, 40, 48, 40] },
    ),
    section("Grab first", [col([heading("What we'd grab first", { level: 2, size: 24, padding: [0, 0, 24, 0] }), items({ columns: 3, buttonLabel: "Shop now" })])], { padding: [44, 40, 28, 40] }),
    section("Fine print", [col([text("Discount applies to items in stock and can't be combined with other offers.", { size: 13 })])], { padding: [0, 48, 36, 48] }),
    footerSection(),
  ],
);

const eventInvite = template(
  "event-invite",
  "Event invite",
  "Save the date for an event or launch",
  "Events",
  false,
  { subject: "Save the date: our autumn evening", preheader: "Join us on Thursday, November 14 for a night of good company. Places are free but limited.", theme: "ocean" },
  [
    section("Header", [col([logo()])], { background: "text", padding: [36, 40, 8, 40] }),
    section(
      "Hero",
      [
        col([
          kicker("Save the date", { color: "accent", letterSpacing: 3 }),
          heading("Our autumn evening", { size: 46 }),
          text("Join us Thursday, November 14 at 7 pm", { size: 17 }),
        ]),
      ],
      { background: "text", padding: [28, 40, 28, 40] },
    ),
    section("Art", [col([image(pexels(13568041, 1200, 700), "Dark blue waves of light on a deep navy background", { padding: [0, 0, 0, 0] })])], { background: "text", padding: [0, 40, 0, 40] }),
    section(
      "Details",
      [
        col([
          text("Join us for an evening of conversation, live music and a first look at what's coming next. Drinks, snacks and good company included.", { size: 17 }),
          button("Reserve your place", { color: "accent", size: "lg" }),
        ]),
      ],
      { background: "text", padding: [32, 48, 52, 48] },
    ),
    section(
      "When and where",
      cols(
        [heading("When", { level: 3, align: "left", size: 18, padding: [0, 0, 6, 0] }), text("Thursday, November 14<br>Doors 6:30 pm, starts at 7 pm", { align: "left", size: 15 })],
        [heading("Where", { level: 3, align: "left", size: 18, padding: [0, 0, 6, 0] }), text("At our place, address in your invite<br>Places are limited, so please RSVP", { align: "left", size: 15 })],
      ),
      { padding: [36, 48, 36, 48], gap: 32 },
    ),
    footerSection(),
  ],
);

const spotlight = template(
  "product-spotlight",
  "Product spotlight",
  "Put one product or service centre stage",
  "Products",
  false,
  { subject: "Something new on your doorstep every month", preheader: "Chosen by our team, packed by hand and sent with a note.", theme: "paper" },
  [
    section("Header", [col([logo()])], { background: "muted", padding: [32, 40, 8, 40] }),
    section(
      "Hero",
      [
        col([
          heading("Something new on your doorstep every month", { size: 38 }),
          text("Our team picks something special for you each month, packs it by hand and sends it with a note on why it made the cut.", { size: 17 }),
          button("Join the club", { variant: "outline" }),
        ]),
      ],
      { background: "muted", padding: [24, 48, 44, 48] },
    ),
    section("Photo", [col([image(pexels(3298036, 1200, 760), "A parcel wrapped in brown paper and twine", { padding: [0, 0, 0, 0], radius: 0 })])], { padding: [0, 0, 0, 0] }),
    section("How it works", [col([heading("How it works", { level: 2 })])], { padding: [44, 40, 4, 40] }),
    section(
      "Steps",
      cols(
        [heading("Tell us what you love", { level: 3, size: 18, padding: [0, 0, 6, 0] }), text("A few favourites and what you're into is all we need.", { size: 15 })],
        [heading("We pick and pack", { level: 3, size: 18, padding: [0, 0, 6, 0] }), text("Our team chooses your box and writes you a note.", { size: 15 })],
        [heading("Enjoy, then repeat", { level: 3, size: 18, padding: [0, 0, 6, 0] }), text("Tell us how it landed and next month gets even better.", { size: 15 })],
      ),
      { padding: [16, 40, 40, 40], gap: 24 },
    ),
    section(
      "Quote",
      [col([quote("Every month it's something I'd never have found on my own, and every month it's exactly right.", { author: "Priya S.", role: "Member since 2023" })])],
      { background: "muted", padding: [44, 56, 40, 56] },
    ),
    section("Price", [col([heading("From $24 a month", { level: 2, size: 28 }), text("Free delivery. Pause or cancel any time."), button("Start your subscription", { size: "lg" })])], { padding: [44, 40, 48, 40] }),
    footerSection(),
  ],
);

const weMissYou = template(
  "we-miss-you",
  "We miss you",
  "Win back customers who've gone quiet",
  "Re-engage",
  true,
  { subject: "It's been a while, {{first_name|friend}}", preheader: "A lot has changed since your last visit. We saved you a few picks.", theme: "sunset" },
  [
    section("Header", [col([logo()])], { padding: [28, 40, 24, 40] }),
    section(
      "Hero",
      [
        col([
          heading("It's been a while, {{first_name|friend}}", { size: 38, personal: true }),
          text("A lot has changed since your last visit. We saved a few picks we think you'll like.", { size: 17, personal: true }),
          button("Come and see", { color: "surface", shape: "pill", padding: [12, 0, 36, 0] }),
          image(pexels(13383083, 1200, 720), "A woman enjoying a coffee by a sunny café window", { padding: [0, 0, 0, 0] }),
        ]),
      ],
      { background: "accent", padding: [48, 40, 40, 40], evidence: "Written for each person from their taste profile." },
    ),
    section(
      "Saved for you",
      [col([heading("Saved for you", { level: 2, size: 26, padding: [0, 0, 24, 0] }), items({ pick: "taste", count: 3, columns: 3, personal: true, buttonLabel: "View" })])],
      { padding: [44, 40, 36, 40], evidence: "Ranked against each person's own taste profile." },
    ),
    section(
      "Welcome back",
      [col([text("A little something to welcome you back:", { padding: [0, 0, 16, 0] }), coupon("COMEBACK15", "15% off your next order", { note: "Valid for two weeks, in person or online." }), button("Come back and see")])],
      { background: "muted", padding: [36, 40, 40, 40] },
    ),
    footerSection({ background: "surface" }),
  ],
);

const giftGuide = template(
  "gift-guide",
  "Gift guide",
  "Gift ideas for everyone on the list",
  "Promotion",
  false,
  { subject: "The gift guide is here", preheader: "Thoughtful ideas for everyone on your list, wrapped for free.", theme: "blush" },
  [
    section("Header", [col([logo()])], { background: "muted", padding: [32, 40, 8, 40] }),
    section(
      "Title",
      [col([heading("The gift guide", { size: 52 }), text("Thoughtful ideas for everyone on your list, wrapped for free.", { size: 17 })])],
      { background: "muted", padding: [20, 48, 28, 48] },
    ),
    section(
      "Photos",
      cols(
        [image(pexels(3873488, 600, 640), "White gift boxes tied with red ribbons", { padding: [0, 0, 0, 0] })],
        [image(pexels(1693650, 600, 640), "Presents wrapped in kraft paper with pine sprigs", { padding: [0, 0, 0, 0] })],
      ),
      { background: "muted", padding: [0, 40, 44, 40], gap: 16, stackOnMobile: false },
    ),
    section(
      "For everyone",
      [col([heading("For the one who has everything", { level: 2, align: "left", size: 26 }), text("Ideas they won't have found yet, chosen by our team.", { align: "left", padding: [0, 0, 24, 0] }), items({ columns: 3, buttonLabel: "Gift it" })])],
      { padding: [44, 40, 28, 40] },
    ),
    section(
      "Wrapping",
      [
        col([image(pexels(6918481, 600, 600), "Hands writing on an envelope with a fountain pen", { padding: [0, 0, 0, 0] })], { width: 0.5, verticalAlign: "middle" }),
        col(
          [
            heading("Wrapped and ready", { level: 2, align: "left", size: 26 }),
            text("Every gift comes wrapped for free, with a handwritten card in your words.", { align: "left", size: 15 }),
            button("Shop gifts", { align: "left", variant: "outline" }),
          ],
          { width: 0.5, verticalAlign: "middle" },
        ),
      ],
      { padding: [16, 40, 44, 40], gap: 28 },
    ),
    section(
      "Gift card",
      [col([heading("Still stuck? Give a gift card.", { level: 2, size: 26 }), text("Delivered by email in minutes, to spend in person or online."), button("Buy a gift card")])],
      { background: "primary", padding: [44, 48, 44, 48] },
    ),
    footerSection({ background: "surface" }),
  ],
);

const reviews = template(
  "reviews",
  "What people say",
  "Share reviews and kind words",
  "Announcement",
  false,
  { subject: "What our customers are saying", preheader: "A few kind words from customers this month, and a thank-you from us.", theme: "forest" },
  [
    section("Header", [col([logo()])], { background: "primary", padding: [32, 40, 8, 40] }),
    section(
      "Title",
      [col([heading("What customers are saying", { size: 36 }), text("A few notes from customers this month. Thank you for every one of them.", { size: 17 })])],
      { background: "primary", padding: [16, 48, 48, 48] },
    ),
    section(
      "Reviews",
      [
        col([
          quote("The kind of place where you come in for one thing and leave with three, and every one of them is right.", { author: "Maya O.", role: "Brooklyn", padding: [0, 0, 28, 0] }),
          divider({ width: 12, thickness: 2, color: "accent", padding: [0, 0, 28, 0] }),
          quote("They remembered what I liked and had it ready for me. That never happens anywhere else.", { author: "Daniel K.", role: "Regular since 2022", padding: [0, 0, 28, 0] }),
          divider({ width: 12, thickness: 2, color: "accent", padding: [0, 0, 28, 0] }),
          quote("My go-to for gifts. The team always knows exactly what to suggest.", { author: "Rosa M.", role: "Customer since 2019" }),
        ]),
      ],
      { padding: [48, 56, 20, 56] },
    ),
    section("Leave a review", [col([text("Loved something from us? We'd love to hear about it."), button("Leave a review", { color: "accent", size: "lg" })])], { padding: [20, 40, 52, 40] }),
    footerSection(),
  ],
);

const letter = template(
  "letter",
  "A letter from us",
  "A plain, personal note",
  "Letter",
  false,
  { subject: "A note from all of us", preheader: "A few words from our team, with thanks for another year together.", theme: "paper" },
  [
    section("Header", [col([logo({ align: "left", width: 120 })])], { padding: [40, 56, 8, 56] }),
    section(
      "Letter",
      [
        col([
          text(
            P(
              "Dear {{first_name|friend}},",
              "When we started, we hoped to build a place people would feel at home: somewhere to linger, ask questions and find something they love. Thanks to you, that's exactly what it has become.",
              "This year you came to our events in the rain, trusted us with gifts for people you love, and told us what you'd like to see next. We're better for it.",
              "We have plenty planned for the months ahead, but mostly we wanted to say thank you. Our door is always open if you'd like to drop by.",
              "Warmly,<br>Everyone at {{brand}}",
              "<i>P.S. If there's something you've been looking for, just reply to this email. We love a challenge.</i>",
            ),
            { align: "left", size: 17, lineHeight: 1.7 },
          ),
        ]),
      ],
      { padding: [28, 56, 32, 56] },
    ),
    section("Footer", [col([divider({ padding: [0, 0, 20, 0] }), footer({ align: "left" })])], { padding: [8, 56, 44, 56] }),
  ],
);

const announcement = template(
  "announcement",
  "Announcement",
  "Share big news",
  "Announcement",
  false,
  { subject: "Big news: we're opening a second location", preheader: "More space, a new neighbourhood and room for events. Here's everything you need to know.", theme: "ink" },
  [
    section("Header", [col([logo()])], { padding: [36, 40, 8, 40] }),
    section(
      "Hero",
      [
        col([
          kicker("Some news"),
          heading("We're opening a second location", { size: 48 }),
          text("This spring we're opening our doors in a new neighbourhood, with more space, a quiet corner to linger and room for events.", { size: 17 }),
          button("See the new space", { variant: "outline", padding: [12, 0, 0, 0] }),
        ]),
      ],
      { padding: [32, 48, 36, 48] },
    ),
    section("Photo", [col([image(pexels(10623540, 1200, 760), "A warmly lit café front at dusk", { padding: [0, 0, 0, 0] })])], { padding: [0, 40, 44, 40] }),
    section(
      "Facts",
      cols(
        [heading("March 2", { level: 3, size: 22, padding: [0, 0, 6, 0] }), text("Opening day, with treats and a few surprises.", { size: 15 })],
        [heading("More room", { level: 3, size: 22, padding: [0, 0, 6, 0] }), text("Space to browse, sit and stay as long as you like.", { size: 15 })],
        [heading("Events weekly", { level: 3, size: 22, padding: [0, 0, 6, 0] }), text("Workshops, tastings and evenings with friends.", { size: 15 })],
      ),
      { background: "muted", padding: [40, 40, 40, 40], gap: 24 },
    ),
    section("RSVP", [col([text("Come and celebrate with us on opening day."), button("Add it to my calendar")])], { padding: [36, 40, 44, 40] }),
    footerSection(),
  ],
);

/** The twelve designed templates, in gallery order. */
export const EMAIL_TEMPLATES: EmailTemplate[] = [welcome, newsletter, newArrivals, pickedForYou, flashSale, eventInvite, spotlight, weMissYou, giftGuide, reviews, letter, announcement];

/** Start from scratch: a logo header, an empty body and a footer. */
export const BLANK_TEMPLATE: EmailTemplate = {
  id: "blank",
  name: "Blank",
  purpose: "Start from an empty email",
  category: "Letter",
  personal: false,
  doc: stableIds(blankDoc(DEFAULT_THEME, "{{brand}}"), "blank"),
};

export const templateById = (id: string): EmailTemplate | undefined => (id === "blank" ? BLANK_TEMPLATE : EMAIL_TEMPLATES.find((t) => t.id === id));

/** A template's doc for a brand: a fresh copy in the brand's theme. */
export function templateDoc(id: string, theme: EmailTheme): EmailDoc | null {
  const t = templateById(id);
  if (!t) return null;
  return { ...(JSON.parse(JSON.stringify(t.doc)) as EmailDoc), theme };
}
