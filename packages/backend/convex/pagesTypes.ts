// Shared shapes for the Pages service: the brand kit, the audience profile,
// the section document a variant renders, and the analytics event protocol.
// Plain TypeScript (no Convex imports) so apps/web, the agent's HTTP routes
// and the backend all read one definition. Convex stores these fields as
// v.any() and trusts `validateDoc` at the edges.

/* Brand ------------------------------------------------------------------ */

export interface BrandColors {
  background: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  muted: string;
  /** Card / panel surface. */
  surface: string;
}

export interface BrandFont {
  /** CSS family name, e.g. "Fraunces". */
  family: string;
  /** "google" loads from fonts.googleapis.com; "system" uses the fallback stack. */
  source: "google" | "system";
  weights?: number[];
  /** Fallback stack, e.g. "Georgia, serif". */
  fallback: string;
}

export interface BrandKit {
  logo?: { src: string; alt: string; /** Dark or light background behind the mark. */ onDark?: boolean };
  /** Text wordmark when no logo image was found. */
  wordmark?: string;
  colors: BrandColors;
  fonts: { heading: BrandFont; body: BrandFont };
  radius: "none" | "sm" | "md" | "lg" | "full";
  density: "compact" | "regular" | "airy";
  /** How the brand photographs things: "warm natural light, product in use, no studio white". */
  imagery: { style: string; treatment: string };
  voice: { summary: string; do: string[]; avoid: string[] };
  /** Casing of buttons and labels. */
  buttonStyle: "pill" | "rounded" | "square";
  uppercaseLabels: boolean;
}

export interface BrandItem {
  id: string;
  name: string;
  /** "product" | "room" | "experience" | "plan" | "service" | "offer" */
  kind: string;
  description: string;
  price?: string;
  image?: string;
  url?: string;
  /** Free-form merchant words that help match taste: "light roast", "sea view". */
  tags: string[];
}

export interface BrandBrief {
  /** One paragraph: what the business is and sells. */
  summary: string;
  categories: string[];
  /** "premium", "accessible", "mid" plus the reasoning. */
  positioning: string;
  /** Who the site appears to sell to. */
  audience: string;
  /** Press, numbers, guarantees as written on the site. */
  proof: string[];
  ctas: string[];
  /** Cities / addresses mentioned. */
  locations: string[];
  items: BrandItem[];
  /** Any brand names mentioned that are not the brand itself (partners, suppliers, stockists). */
  relatedBrands: string[];
  /** Well-known brands whose customers overlap with this one (same category and positioning). Used as Qloo proxies when the brand itself is not a Qloo entity. */
  comparableBrands?: string[];
}

/* Taste profile (same shape the concierge stores) --------------------------- */

export interface ProfileEntity {
  id: string;
  name: string;
  /** Qloo type urn, e.g. "urn:entity:artist". */
  type: string;
  image?: string;
  subtitle?: string;
  lat?: number;
  lon?: number;
  /** "location" | "interest" | "csv" | "brand" */
  source: string;
  /** How many members (CSV) carried this entity; 1 for other sources. */
  count?: number;
}

export interface ProfileTag {
  id: string;
  name: string;
  /** Qloo tag subtype, e.g. "urn:tag:personal_style:qloo". */
  type: string;
  affinity: number;
}

export interface ProfileBrand {
  id: string;
  name: string;
  affinity: number;
  image?: string;
  personalStyle: string[];
  lifestyle: string[];
  emotionalTone: string[];
  industries: string[];
}

export interface AudienceProfile {
  entities: ProfileEntity[];
  tags: ProfileTag[];
  brands: ProfileBrand[];
  /** Qloo skew per bucket, -1..1. */
  demographics?: { age: Record<string, number>; gender: Record<string, number> } | null;
  /** Where the audience is: one city for a location audience, the members' cities for a CSV cluster. */
  geo: { name: string; count: number; lat?: number; lon?: number }[];
  /** Cultural references worth using on the page, by kind. */
  culture: { artists: ProfileEntity[]; films: ProfileEntity[]; places: ProfileEntity[]; books: ProfileEntity[] };
}

export interface AudienceBrief {
  /** One sentence spoken to the merchant: who these people are. */
  summary: string;
  /** How to talk to them: register, length, words. */
  speakTo: string;
  /** Art direction for imagery. */
  imagery: string;
  /** What the hero should lead with. */
  leadWith: string;
  avoid: string[];
  /** Cultural hooks the page can use, each citing the Qloo evidence. */
  hooks: { text: string; evidence: string }[];
  /** Which of the brand's items fit best, by item id, with a reason. */
  items: { id: string; reason: string }[];
}

/* Section document ------------------------------------------------------- */

export interface ImageRef {
  src: string;
  alt: string;
  /** "pexels" | "generated" | "upload" | "brand" */
  source: string;
  credit?: string;
  /** For generated images: the prompt used, so it can be regenerated. */
  prompt?: string;
  /** Pexels photo id or Convex storage id, for bookkeeping. */
  ref?: string;
}

export interface Cta {
  label: string;
  href: string;
  /** Tracked as this label in analytics; defaults to `label`. */
  track?: string;
}

export type SectionTheme = "light" | "dark" | "accent" | "muted";

interface SectionBase {
  /** Stable id ("hero", "s2"); analytics and patches key on it. */
  id: string;
  /** Why this section says what it says; cites the Qloo evidence. Shown in the console only. */
  evidence?: string;
  theme?: SectionTheme;
}

export interface HeroSection extends SectionBase {
  type: "hero";
  eyebrow?: string;
  headline: string;
  subheadline?: string;
  primaryCta: Cta;
  secondaryCta?: Cta;
  image?: ImageRef;
  layout: "full" | "split" | "centered";
}

export interface SplitSection extends SectionBase {
  type: "split";
  eyebrow?: string;
  headline: string;
  body: string;
  bullets?: string[];
  image: ImageRef;
  imageSide: "left" | "right";
  cta?: Cta;
}

export interface GridItem {
  /** Brand item id when it is one of the brand's items. */
  id?: string;
  title: string;
  description?: string;
  price?: string;
  image?: ImageRef;
  href?: string;
  badge?: string;
}

export interface GridSection extends SectionBase {
  type: "grid";
  eyebrow?: string;
  headline?: string;
  intro?: string;
  items: GridItem[];
  columns: 2 | 3 | 4;
  cta?: Cta;
}

export interface StorySection extends SectionBase {
  type: "story";
  eyebrow?: string;
  headline: string;
  paragraphs: string[];
  image?: ImageRef;
  pullQuote?: string;
}

export interface GallerySection extends SectionBase {
  type: "gallery";
  headline?: string;
  images: ImageRef[];
  layout: "strip" | "grid" | "masonry";
}

export interface TestimonialsSection extends SectionBase {
  type: "testimonials";
  headline?: string;
  quotes: { text: string; name: string; detail?: string }[];
}

export interface StatsSection extends SectionBase {
  type: "stats";
  items: { value: string; label: string }[];
}

export interface FaqSection extends SectionBase {
  type: "faq";
  headline?: string;
  items: { q: string; a: string }[];
}

export interface OfferSection extends SectionBase {
  type: "offer";
  eyebrow?: string;
  headline: string;
  body: string;
  price?: string;
  was?: string;
  perks: string[];
  cta: Cta;
  deadline?: string;
  image?: ImageRef;
}

export interface LocationsSection extends SectionBase {
  type: "locations";
  headline?: string;
  intro?: string;
  places: { name: string; detail?: string; address?: string; kind?: string; image?: ImageRef; lat?: number; lon?: number }[];
  cta?: Cta;
}

/** Cultural hooks from Qloo: "If your weekends sound like Khruangbin and taste like Franklin Barbecue". */
export interface CultureSection extends SectionBase {
  type: "culture";
  eyebrow?: string;
  headline: string;
  intro?: string;
  items: { name: string; kind: "artist" | "film" | "place" | "brand" | "book" | "show"; image?: string; note?: string }[];
  footnote?: string;
}

export interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "select" | "textarea";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface FormSection extends SectionBase {
  type: "form";
  eyebrow?: string;
  headline: string;
  body?: string;
  fields: FormField[];
  submitLabel: string;
  success: string;
}

export interface CtaSection extends SectionBase {
  type: "cta";
  headline: string;
  body?: string;
  cta: Cta;
  secondary?: Cta;
}

/** Escape hatch: constrained HTML (no script tags; rendered sanitized). */
export interface CustomSection extends SectionBase {
  type: "custom";
  html: string;
}

export type Section =
  | HeroSection
  | SplitSection
  | GridSection
  | StorySection
  | GallerySection
  | TestimonialsSection
  | StatsSection
  | FaqSection
  | OfferSection
  | LocationsSection
  | CultureSection
  | FormSection
  | CtaSection
  | CustomSection;

export type SectionType = Section["type"];

export const SECTION_TYPES: SectionType[] = [
  "hero", "split", "grid", "story", "gallery", "testimonials", "stats", "faq",
  "offer", "locations", "culture", "form", "cta", "custom",
];

export interface PageDoc {
  meta: { title: string; description: string; /** og image */ image?: string };
  sections: Section[];
  /** Per-variant tweaks within the brand: a darker hero, a warmer accent. */
  theme?: Partial<BrandColors>;
  /** Header shown above the sections. */
  header?: { showLogo: boolean; links?: Cta[]; cta?: Cta };
  footer?: { text?: string; links?: Cta[] };
}

/** Cheap structural check before a doc is saved or rendered. Returns problems, empty when fine. */
export function validateDoc(doc: unknown): string[] {
  const problems: string[] = [];
  const d = doc as Partial<PageDoc> | null;
  if (!d || typeof d !== "object") return ["doc is not an object"];
  if (!d.meta || typeof d.meta.title !== "string") problems.push("meta.title missing");
  if (!Array.isArray(d.sections) || d.sections.length === 0) {
    problems.push("sections missing or empty");
    return problems;
  }
  const ids = new Set<string>();
  d.sections.forEach((s, i) => {
    const sec = s as Partial<Section>;
    if (!sec || typeof sec !== "object") return problems.push(`sections[${i}] is not an object`);
    if (!sec.id || typeof sec.id !== "string") problems.push(`sections[${i}].id missing`);
    else if (ids.has(sec.id)) problems.push(`duplicate section id ${sec.id}`);
    else ids.add(sec.id);
    if (!sec.type || !SECTION_TYPES.includes(sec.type as SectionType)) problems.push(`sections[${i}].type invalid: ${String(sec.type)}`);
    switch (sec.type) {
      case "hero":
        if (!sec.headline) problems.push(`${sec.id}: hero.headline missing`);
        if (!sec.primaryCta?.label) problems.push(`${sec.id}: hero.primaryCta missing`);
        break;
      case "split":
        if (!sec.headline || !sec.body) problems.push(`${sec.id}: split needs headline and body`);
        if (!sec.image?.src) problems.push(`${sec.id}: split.image missing`);
        break;
      case "grid":
        if (!Array.isArray(sec.items) || sec.items.length === 0) problems.push(`${sec.id}: grid.items empty`);
        break;
      case "story":
        if (!Array.isArray(sec.paragraphs) || sec.paragraphs.length === 0) problems.push(`${sec.id}: story.paragraphs empty`);
        break;
      case "gallery":
        if (!Array.isArray(sec.images) || sec.images.length === 0) problems.push(`${sec.id}: gallery.images empty`);
        break;
      case "testimonials":
        if (!Array.isArray(sec.quotes) || sec.quotes.length === 0) problems.push(`${sec.id}: testimonials.quotes empty`);
        break;
      case "stats":
        if (!Array.isArray(sec.items) || sec.items.length === 0) problems.push(`${sec.id}: stats.items empty`);
        break;
      case "faq":
        if (!Array.isArray(sec.items) || sec.items.length === 0) problems.push(`${sec.id}: faq.items empty`);
        break;
      case "offer":
        if (!sec.headline || !sec.cta?.label) problems.push(`${sec.id}: offer needs headline and cta`);
        break;
      case "locations":
        if (!Array.isArray(sec.places) || sec.places.length === 0) problems.push(`${sec.id}: locations.places empty`);
        break;
      case "culture":
        if (!Array.isArray(sec.items) || sec.items.length === 0) problems.push(`${sec.id}: culture.items empty`);
        break;
      case "form":
        if (!Array.isArray(sec.fields) || sec.fields.length === 0) problems.push(`${sec.id}: form.fields empty`);
        break;
      case "cta":
        if (!sec.headline || !sec.cta?.label) problems.push(`${sec.id}: cta needs headline and cta`);
        break;
      case "custom":
        if (typeof sec.html !== "string") problems.push(`${sec.id}: custom.html missing`);
        else if (/<script/i.test(sec.html)) problems.push(`${sec.id}: custom.html may not contain scripts`);
        break;
    }
  });
  return problems;
}

/* Analytics -------------------------------------------------------------- */

export type TrackEventType =
  | "pageview"
  | "heartbeat"
  | "scroll"
  | "section_seen"
  | "click"
  | "cta_click"
  | "form_submit"
  | "quiz_answer"
  | "outbound";

/** What the tracker on a published page sends (batched) to POST /api/pages/track. */
export interface TrackEvent {
  type: TrackEventType;
  /** Client clock, ms since epoch. */
  at: number;
  sectionId?: string;
  /** CTA label or element text. */
  label?: string;
  href?: string;
  /** Click position, normalised 0..1 within the section (heat maps). */
  x?: number;
  y?: number;
  /** Scroll depth 0..1, or engaged ms for a heartbeat. */
  value?: number;
  /** Form payload or quiz answer. */
  data?: Record<string, string>;
}

export interface TrackBatch {
  pageId: string;
  variantId: string;
  /** Per browser, persisted. */
  visitorId: string;
  /** Per visit (30 minutes idle). */
  sessionId: string;
  /** How the variant was chosen: "param" | "lead" | "utm" | "geo" | "cookie" | "quiz" | "default" | "preview". */
  resolvedBy: string;
  path: string;
  referrer?: string;
  utm?: Record<string, string>;
  screen?: { w: number; h: number };
  events: TrackEvent[];
}

/** Device classes the server derives from the user agent. */
export type DeviceClass = "desktop" | "mobile" | "tablet";

/* Variant routing ---------------------------------------------------------- */

export interface RoutingRules {
  /** Query param that names an audience directly (`?a=<audienceId or slug>`). */
  paramKey: string;
  /** Query param carrying a lead/member id (`?g=<memberId>`). */
  leadKey: string;
  /** UTM matches: when `utm_<param>` equals `value`, serve `audienceId`. */
  utm: { param: string; value: string; audienceId: string }[];
  /** Match the request city/country to location audiences. */
  geo: boolean;
  /** Offer the three-question quiz to visitors nothing else resolved. */
  quiz: boolean;
}

export const DEFAULT_ROUTING: RoutingRules = {
  paramKey: "a",
  leadKey: "g",
  utm: [],
  geo: true,
  quiz: true,
};

/** Quiz the router shows when nothing else resolved: options vote for audiences. */
export interface QuizConfig {
  questions: {
    id: string;
    prompt: string;
    options: { label: string; image?: string; votes: Record<string, number> }[];
  }[];
}
