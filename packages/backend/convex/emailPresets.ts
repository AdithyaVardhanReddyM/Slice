// Ready-made pieces for the editor's Add panel: whole sections ("Made for
// you"), single elements and column layouts. All are inputs without ids
// (callers run them through `withIds` from emailDoc.ts) and use theme tokens
// so they adopt the brand's colours and fonts. The block builders here are
// shared with emailTemplates.ts. Plain TypeScript, no Convex imports.

import type {
  Align,
  ButtonBlock,
  CouponBlock,
  DividerBlock,
  EmailBlock,
  EmailColumnInput,
  EmailSectionInput,
  FooterBlock,
  HeadingBlock,
  ImageBlock,
  ItemsBlock,
  LogoBlock,
  QuoteBlock,
  SocialBlock,
  SpacerBlock,
  TextBlock,
  VideoBlock,
} from "./emailTypes";

/* Builders ----------------------------------------------------------------- */

/** A block as presets and templates write it: no id yet. */
export type BlockInput = Omit<EmailBlock, "id"> & { id?: string };
type In<T extends EmailBlock> = Omit<T, "id" | "type">;

/** A Pexels photo at a given width; `h` crops to that height (centred). */
export const pexels = (id: number, w = 1200, h?: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}${h ? `&h=${h}&fit=crop` : ""}`;

export const heading = (text: string, o: Partial<In<HeadingBlock>> = {}): BlockInput => ({ type: "heading", text, level: 1, align: "center", ...o });
export const kicker = (text: string, o: Partial<In<HeadingBlock>> = {}): BlockInput =>
  heading(text, { level: 3, size: 13, uppercase: true, letterSpacing: 2, font: "body", color: "primary", padding: [0, 0, 12, 0], ...o });
export const text = (html: string, o: Partial<In<TextBlock>> = {}): BlockInput => ({ type: "text", html, align: "center", ...o });
export const image = (src: string, alt: string, o: Partial<In<ImageBlock>> = {}): BlockInput => ({ type: "image", src, alt, width: 100, align: "center", source: "pexels", ...o });
export const button = (label: string, o: Partial<In<ButtonBlock>> = {}): BlockInput => ({ type: "button", label, href: "#", align: "center", ...o });
export const divider = (o: Partial<In<DividerBlock>> = {}): BlockInput => ({ type: "divider", thickness: 1, width: 100, style: "solid", ...o });
export const spacer = (height = 24): BlockInput => ({ type: "spacer", height }) as In<SpacerBlock> & { type: "spacer" };
export const logo = (o: Partial<In<LogoBlock>> = {}): BlockInput => ({ type: "logo", width: 150, align: "center", ...o });
export const items = (o: Partial<In<ItemsBlock>> = {}): BlockInput => ({
  type: "items",
  itemIds: [],
  pick: "manual",
  count: 3,
  columns: 3,
  layout: "grid",
  show: { image: true, subtitle: true, description: false, price: true, button: true, reason: true },
  buttonLabel: "Shop now",
  ...o,
});
export const social = (o: Partial<In<SocialBlock>> = {}): BlockInput => ({ type: "social", links: [], align: "center", style: "dark", ...o });
export const quote = (q: string, o: Partial<In<QuoteBlock>> = {}): BlockInput => ({ type: "quote", text: q, align: "center", ...o });
export const coupon = (code: string, label: string, o: Partial<In<CouponBlock>> = {}): BlockInput => ({ type: "coupon", code, label, align: "center", ...o });
export const video = (thumbnail: string, alt: string, o: Partial<In<VideoBlock>> = {}): BlockInput => ({ type: "video", thumbnail, href: "#", alt, width: 100, align: "center", ...o });
export const footer = (o: Partial<In<FooterBlock>> = {}): BlockInput => ({
  type: "footer",
  text: "You're receiving this because you signed up for emails from {{brand}}.",
  align: "center",
  unsubscribeLabel: "Unsubscribe",
  ...o,
});

export const col = (blocks: BlockInput[], o: Partial<Omit<EmailColumnInput, "blocks">> = {}): EmailColumnInput => ({ width: 1, blocks, ...o });
export const section = (label: string, columns: EmailColumnInput[], o: Partial<Omit<EmailSectionInput, "columns" | "label">> = {}): EmailSectionInput => ({ label, ...o, columns });
/** Equal-width columns. */
export const cols = (...blocks: BlockInput[][]): EmailColumnInput[] => blocks.map((b) => col(b, { width: 1 / blocks.length }));

/** Photos the presets use (Pexels, checked to load). */
export const PHOTOS = {
  counter: pexels(7772165, 1200, 760),
  gathering: pexels(5638815, 1200, 800),
  cafeWindow: pexels(13383083, 1200, 760),
  latte: pexels(10204269, 600, 600),
  flatlay: pexels(25361524, 600, 600),
  candles: pexels(6755612, 600, 600),
  coffees: pexels(1058920, 600, 600),
  parcel: pexels(3298036, 600, 600),
  shopInterior: pexels(2890018, 1200, 700),
  crowd: pexels(5192291, 1200, 676),
  giftBoxes: pexels(3873488, 600, 600),
} as const;

/* Sections ------------------------------------------------------------------ */

export type SectionPresetGroup = "Header" | "Hero" | "Text" | "Items" | "Gallery" | "Quote" | "Promotion" | "Footer" | "Layout";

export interface SectionPreset {
  id: string;
  group: SectionPresetGroup;
  label: string;
  section: EmailSectionInput;
}

const PAD: [number, number, number, number] = [32, 40, 32, 40];

export const SECTION_PRESETS: SectionPreset[] = [
  // Header
  { id: "header-centred", group: "Header", label: "Logo, centred", section: section("Header", [col([logo()])], { padding: [28, 40, 20, 40] }) },
  {
    id: "header-link",
    group: "Header",
    label: "Logo and link",
    section: section(
      "Header",
      [col([logo({ align: "left", width: 130 })], { width: 0.5, verticalAlign: "middle" }), col([text('<a href="#">Visit the shop</a>', { align: "right", size: 14 })], { width: 0.5, verticalAlign: "middle" })],
      { padding: [24, 40, 20, 40], stackOnMobile: false },
    ),
  },
  { id: "header-band", group: "Header", label: "Logo on colour", section: section("Header", [col([logo()])], { background: "primary", padding: [28, 40, 28, 40] }) },

  // Hero
  {
    id: "hero-image-top",
    group: "Hero",
    label: "Image, then headline",
    section: section(
      "Hero",
      [col([image(PHOTOS.counter, "A customer chatting with a shop owner at the counter", { padding: [0, 0, 28, 0] }), heading("A headline that says it all"), text("One or two sentences that tell customers why this email is worth their time."), button("Shop now")])],
      { padding: [8, 40, 40, 40] },
    ),
  },
  {
    id: "hero-band",
    group: "Hero",
    label: "Colour band",
    section: section("Hero", [col([heading("Something worth opening", { size: 40 }), text("A short line that sets up the rest of the email.", { size: 17 }), button("Find out more", { variant: "outline" })])], {
      background: "primary",
      padding: [56, 40, 56, 40],
    }),
  },
  {
    id: "hero-split",
    group: "Hero",
    label: "Image beside headline",
    section: section(
      "Hero",
      [
        col([image(PHOTOS.latte, "A cup of coffee with latte art on a wooden table", { padding: [0, 0, 0, 0] })], { width: 0.5, verticalAlign: "middle" }),
        col([heading("New this season", { align: "left", size: 30 }), text("Tell customers what's new and why they'll care.", { align: "left" }), button("Take a look", { align: "left" })], { width: 0.5, verticalAlign: "middle" }),
      ],
      { padding: PAD, gap: 28 },
    ),
  },
  {
    id: "hero-photo",
    group: "Hero",
    label: "Headline over photo",
    section: section("Hero", [col([heading("Stay a while", { size: 44 }), text("Big photo, few words, one clear button.", { size: 17 }), button("Visit us", { color: "surface" })])], {
      background: "text",
      backgroundImage: PHOTOS.gathering,
      padding: [96, 40, 96, 40],
    }),
  },

  // Text
  {
    id: "text-heading",
    group: "Text",
    label: "Heading and paragraph",
    section: section("Text", [col([heading("A clear heading", { level: 2, align: "left" }), text("<p>Write a short paragraph here. Keep it to a few sentences so it's easy on a phone.</p>", { align: "left" })])], { padding: PAD }),
  },
  {
    id: "text-two",
    group: "Text",
    label: "Two columns of text",
    section: section(
      "Text",
      cols(
        [heading("First point", { level: 3, align: "left" }), text("A sentence or two about it.", { align: "left", size: 15 })],
        [heading("Second point", { level: 3, align: "left" }), text("A sentence or two about it.", { align: "left", size: 15 })],
      ),
      { padding: PAD, gap: 28 },
    ),
  },
  {
    id: "text-button",
    group: "Text",
    label: "Paragraph and button",
    section: section("Text", [col([text("A friendly note that leads to one thing you'd like customers to do."), button("Do the thing")])], { padding: PAD }),
  },

  // Items
  {
    id: "items-grid",
    group: "Items",
    label: "Grid of three",
    section: section("Items", [col([heading("Our picks", { level: 2 }), items({ columns: 3 })])], { padding: PAD }),
  },
  {
    id: "items-taste",
    group: "Items",
    label: "Picks by taste",
    section: section(
      "Picks",
      [col([heading("Picked for you, {{first_name|there}}", { level: 2, personal: true }), items({ pick: "taste", count: 4, columns: 2, personal: true, buttonLabel: "Take a look" })])],
      { padding: PAD, evidence: "Written for each person from their taste profile." },
    ),
  },
  {
    id: "items-list",
    group: "Items",
    label: "List with descriptions",
    section: section("Items", [col([heading("Worth your time", { level: 2, align: "left" }), items({ layout: "list", columns: 1, count: 3, show: { image: true, subtitle: true, description: true, price: true, button: true, reason: true } })])], {
      padding: PAD,
    }),
  },

  // Gallery
  {
    id: "gallery-two",
    group: "Gallery",
    label: "Two images",
    section: section("Gallery", cols([image(PHOTOS.flatlay, "A styled flat lay of a candle, magazines and accessories", { padding: [0, 0, 0, 0] })], [image(PHOTOS.candles, "Hand-poured candles in glass jars", { padding: [0, 0, 0, 0] })]), {
      padding: PAD,
      gap: 16,
      stackOnMobile: false,
    }),
  },
  {
    id: "gallery-three",
    group: "Gallery",
    label: "Three images",
    section: section(
      "Gallery",
      cols(
        [image(PHOTOS.coffees, "Two cups of coffee on a sunny table", { padding: [0, 0, 0, 0] })],
        [image(PHOTOS.parcel, "A parcel wrapped in brown paper and twine", { padding: [0, 0, 0, 0] })],
        [image(PHOTOS.giftBoxes, "White gift boxes tied with red ribbons", { padding: [0, 0, 0, 0] })],
      ),
      { padding: PAD, gap: 12, stackOnMobile: false },
    ),
  },
  {
    id: "gallery-wide",
    group: "Gallery",
    label: "Wide image and caption",
    section: section("Gallery", [col([image(PHOTOS.shopInterior, "A warmly lit small shop with a woman at work", { padding: [0, 0, 12, 0] }), text("A short caption about the photo.", { size: 14 })])], { padding: PAD }),
  },

  // Quote
  {
    id: "quote-plain",
    group: "Quote",
    label: "Testimonial",
    section: section("Quote", [col([quote("The kind of place where you come in for one thing and leave with three, and every one of them is right.", { author: "A happy customer", role: "Regular since 2021" })])], { padding: [40, 48, 40, 48] }),
  },
  {
    id: "quote-band",
    group: "Quote",
    label: "Quote on colour",
    section: section("Quote", [col([quote("They remembered what I liked and had it waiting for me. That never happens.", { author: "Sam R." })])], { background: "accent", padding: [44, 48, 44, 48] }),
  },

  // Promotion
  {
    id: "promo-coupon",
    group: "Promotion",
    label: "Coupon",
    section: section("Offer", [col([heading("A little thank-you", { level: 2 }), coupon("THANKYOU10", "10% off your next order", { note: "Valid for 30 days." }), button("Shop now")])], { background: "muted", padding: [36, 40, 36, 40] }),
  },
  {
    id: "promo-sale",
    group: "Promotion",
    label: "Sale banner",
    section: section("Sale", [col([kicker("This weekend only", { color: undefined }), heading("Sale", { size: 60, uppercase: true, letterSpacing: 2 }), text("Up to 30% off selected favourites.", { size: 18 }), button("Shop the sale", { size: "lg" })])], {
      background: "accent",
      padding: [48, 40, 48, 40],
    }),
  },
  {
    id: "promo-bar",
    group: "Promotion",
    label: "Announcement bar",
    section: section("Bar", [col([text("Free shipping on orders over $40", { size: 13, padding: [0, 0, 0, 0] })])], { background: "text", padding: [10, 24, 10, 24] }),
  },

  // Footer
  { id: "footer-social", group: "Footer", label: "Social and footer", section: section("Footer", [col([social({ padding: [0, 0, 18, 0] }), footer()])], { background: "muted", padding: [32, 40, 36, 40] }) },
  { id: "footer-dark", group: "Footer", label: "Footer on dark", section: section("Footer", [col([logo({ width: 110, padding: [0, 0, 18, 0] }), social({ padding: [0, 0, 18, 0] }), footer({ viewOnline: true })])], { background: "text", padding: [36, 40, 40, 40] }) },
  { id: "footer-minimal", group: "Footer", label: "Minimal footer", section: section("Footer", [col([divider({ padding: [0, 0, 20, 0] }), footer({ align: "left" })])], { padding: [8, 40, 36, 40] }) },
];

/* Single elements -------------------------------------------------------------- */

export interface BlockPreset {
  id: string;
  label: string;
  block: BlockInput;
}

export const BLOCK_PRESETS: BlockPreset[] = [
  { id: "heading", label: "Heading", block: heading("Add a heading", { level: 1 }) },
  { id: "subheading", label: "Subheading", block: heading("Add a subheading", { level: 3 }) },
  { id: "paragraph", label: "Paragraph", block: text("<p>Write a few friendly sentences here.</p>") },
  { id: "image", label: "Image", block: image(PHOTOS.counter, "A customer chatting with a shop owner at the counter") },
  { id: "button", label: "Button", block: button("Shop now") },
  { id: "button-outline", label: "Outline button", block: button("Learn more", { variant: "outline" }) },
  { id: "divider", label: "Divider", block: divider() },
  { id: "divider-short", label: "Short divider", block: divider({ width: 15, thickness: 3, color: "primary" }) },
  { id: "spacer", label: "Spacer", block: spacer(32) },
  { id: "items", label: "Items", block: items() },
  { id: "social", label: "Social links", block: social() },
  { id: "quote", label: "Quote", block: quote("A few kind words from a customer.", { author: "Customer name" }) },
  { id: "coupon", label: "Coupon", block: coupon("SAVE10", "10% off your next order", { note: "Valid for 30 days." }) },
  { id: "video", label: "Video", block: video(PHOTOS.crowd, "Watch the video") },
  { id: "logo", label: "Logo", block: logo() },
  { id: "footer", label: "Footer", block: footer() },
];

/* Column layouts ------------------------------------------------------------------ */

export interface LayoutPreset {
  id: string;
  label: string;
  section: EmailSectionInput;
}

const sideText = (align: Align): BlockInput[] => [heading("A short heading", { level: 2, align, size: 24 }), text("A sentence or two that goes with the picture.", { align }), button("Learn more", { align, variant: "outline", size: "sm" })];

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "one", label: "One column", section: section("Section", [col([text("<p>Start writing, or add elements here.</p>")])], { padding: PAD }) },
  {
    id: "image-text",
    label: "Image left, text right",
    section: section("Section", [col([image(PHOTOS.coffees, "Two cups of coffee on a sunny table", { padding: [0, 0, 0, 0] })], { width: 0.5, verticalAlign: "middle" }), col(sideText("left"), { width: 0.5, verticalAlign: "middle" })], {
      padding: PAD,
      gap: 28,
    }),
  },
  {
    id: "text-image",
    label: "Text left, image right",
    section: section("Section", [col(sideText("left"), { width: 0.5, verticalAlign: "middle" }), col([image(PHOTOS.candles, "Hand-poured candles in glass jars", { padding: [0, 0, 0, 0] })], { width: 0.5, verticalAlign: "middle" })], {
      padding: PAD,
      gap: 28,
    }),
  },
  {
    id: "two-images",
    label: "Two images",
    section: section("Section", cols([image(PHOTOS.flatlay, "A styled flat lay of a candle, magazines and accessories", { padding: [0, 0, 0, 0] })], [image(PHOTOS.giftBoxes, "White gift boxes tied with red ribbons", { padding: [0, 0, 0, 0] })]), { padding: PAD, gap: 16 }),
  },
  {
    id: "three",
    label: "Three columns",
    section: section(
      "Section",
      cols(
        [heading("One", { level: 3 }), text("A short line.", { size: 15 })],
        [heading("Two", { level: 3 }), text("A short line.", { size: 15 })],
        [heading("Three", { level: 3 }), text("A short line.", { size: 15 })],
      ),
      { padding: PAD, gap: 20 },
    ),
  },
];
