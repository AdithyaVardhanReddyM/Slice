// Shared shapes for the Email service: the brand's email kit, the email
// document the builder and the agent edit, per-recipient personalisation,
// edit operations and the send / event vocabulary. Plain TypeScript (no
// Convex imports) so apps/web, the backend and the agent's HTTP routes read
// one definition. Convex stores docs and kits as v.any() and trusts
// `validateEmailDoc` (emailDoc.ts) at the edges.
//
// See docs/email-plan.md for the whole service.

import type { AudienceProfile } from "./pagesTypes";

export type { AudienceProfile };

/* Brand ------------------------------------------------------------------ */

export interface EmailFont {
  /** CSS family name, e.g. "Fraunces". */
  family: string;
  /** Fallback stack, e.g. "Georgia, 'Times New Roman', serif". Email clients without web fonts use this. */
  fallback: string;
  /** Load from fonts.googleapis.com (Apple Mail, iOS and the editor show it; Gmail falls back). */
  google?: boolean;
  weights?: number[];
}

/** What the brand looks like and sounds like, read once from its homepage and edited by the merchant. */
export interface EmailKit {
  logo?: { src: string; alt: string; /** The mark is light and needs a dark background. */ onDark?: boolean };
  /** Square icon or favicon, for small tiles. */
  icon?: string;
  /** Text wordmark when there is no logo image. */
  wordmark?: string;
  colors: {
    background: string;
    foreground: string;
    primary: string;
    primaryForeground: string;
    accent: string;
    muted: string;
    surface: string;
  };
  fonts: { heading: EmailFont; body: EmailFont };
  buttonStyle: "pill" | "rounded" | "square";
  /** Corner radius of images and cards. */
  radius: "none" | "sm" | "md" | "lg";
  uppercaseLabels: boolean;
  voice: { summary: string; do: string[]; avoid: string[] };
}

/** What the business does, in a few lines. */
export interface EmailAbout {
  /** One paragraph: what the business is and sells. */
  summary: string;
  /** Who it sells to. */
  audience: string;
  categories: string[];
  /** City or area, when the business is local. */
  location?: string;
}

export type SocialNetwork = "instagram" | "facebook" | "x" | "tiktok" | "youtube" | "linkedin" | "pinterest" | "threads" | "website";

export interface EmailFooterInfo {
  /** Postal address; required by anti-spam law in most places. */
  address: string;
  website: string;
  socials: { network: SocialNetwork; url: string }[];
}

/** Who the email comes from. The address is `${fromLocal}@${domain}`. */
export interface EmailSender {
  fromName: string;
  /** Local part, e.g. "hello". */
  fromLocal: string;
  /** Where replies go: the merchant's real inbox. */
  replyTo?: string;
}

export type DomainStatus = "not_started" | "pending" | "verified" | "failed" | "temporary_failure";

export interface DnsRecord {
  /** "SPF" | "DKIM" | "MX" | "DMARC" (Resend's `record`). */
  record: string;
  name: string;
  /** "TXT" | "MX" | "CNAME" */
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
  status: string;
}

export interface EmailDomain {
  name: string;
  /** Resend domain id. */
  resendId?: string;
  status: DomainStatus;
  records: DnsRecord[];
  checkedAt?: number;
  error?: string;
}

/** A thing the brand sells or offers, which picks blocks feature. Stored in `emailItems`. */
export interface EmailItem {
  /** The emailItems row id. */
  id: string;
  name: string;
  /** Author, maker, brand or date line under the name. */
  subtitle?: string;
  /** "book" | "product" | "event" | "offer" | "service" */
  kind: string;
  description: string;
  price?: string;
  image?: string;
  url?: string;
  /** Merchant words that help match taste: "literary fiction", "translated", "debut". */
  tags: string[];
  /** The matching Qloo entity, for taste ranking. */
  qloo?: { id: string; name: string; type: string; tags?: string[] };
}

/* Theme ------------------------------------------------------------------- */

export interface EmailTheme {
  /** Preset id ("brand", "ink", ...) or undefined when edited by hand. */
  id?: string;
  name?: string;
  colors: {
    /** Behind the email card (the client's canvas). */
    backdrop: string;
    /** The email body. */
    surface: string;
    text: string;
    muted: string;
    /** Buttons and links. */
    primary: string;
    onPrimary: string;
    /** Highlight fills: hero bands, coupon boxes. */
    accent: string;
    onAccent: string;
    border: string;
  };
  fonts: { heading: EmailFont; body: EmailFont };
  /** Image and card corner radius in px. */
  radius: number;
  button: { shape: "square" | "rounded" | "pill"; uppercase: boolean };
  /** Content width in px; 600 unless a template says otherwise. */
  width: number;
}

/**
 * A colour slot. Theme tokens follow theme changes (a template keeps working in
 * any theme); a hex string is a fixed colour. Text on a section whose
 * background is a token uses the matching "on" colour unless the block sets one.
 */
export type ColorRef = "surface" | "backdrop" | "primary" | "accent" | "muted" | "text" | "border" | (string & {});

/* Document ---------------------------------------------------------------- */

export type Align = "left" | "center" | "right";
/** [top, right, bottom, left] in px. */
export type Box = [number, number, number, number];

interface BlockBase {
  /** Stable id; ops, selection, personalisation and click tracking key on it. */
  id: string;
  /**
   * A taste slot: rewritten for each person when the campaign goes to a
   * customer list one by one. Ignored for group campaigns.
   */
  personal?: boolean;
  padding?: Box;
  hideOn?: "mobile" | "desktop";
}

export interface LogoBlock extends BlockBase {
  type: "logo";
  /** Rendered width in px. */
  width: number;
  align: Align;
  href?: string;
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  /** Inline HTML: b, strong, i, em, u, a, br, span. Merge tags allowed. */
  text: string;
  level: 1 | 2 | 3;
  align: Align;
  color?: ColorRef;
  /** px; defaults by level (34 / 26 / 20). */
  size?: number;
  font?: "heading" | "body";
  weight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
}

export interface TextBlock extends BlockBase {
  type: "text";
  /** Paragraph HTML: p, br, b, strong, i, em, u, a, span, ul, ol, li. Merge tags allowed. */
  html: string;
  align: Align;
  color?: ColorRef;
  /** px, default 16. */
  size?: number;
  /** Unitless, default 1.6. */
  lineHeight?: number;
}

export interface ImageBlock extends BlockBase {
  type: "image";
  src: string;
  alt: string;
  href?: string;
  /** Percent of the column, 10..100. */
  width: number;
  align: Align;
  /** px; defaults to the theme radius. */
  radius?: number;
  /** "pexels" | "upload" | "brand" | "item" | "generated" */
  source?: string;
  credit?: string;
}

export interface ButtonBlock extends BlockBase {
  type: "button";
  label: string;
  href: string;
  align: Align;
  fullWidth?: boolean;
  variant?: "solid" | "outline";
  /** Fill (solid) or border and label (outline). Defaults to theme primary. */
  color?: ColorRef;
  textColor?: ColorRef;
  size?: "sm" | "md" | "lg";
  shape?: "square" | "rounded" | "pill";
}

export interface DividerBlock extends BlockBase {
  type: "divider";
  color?: ColorRef;
  thickness: number;
  /** Percent of the column. */
  width: number;
  style: "solid" | "dashed" | "dotted";
}

export interface SpacerBlock extends BlockBase {
  type: "spacer";
  height: number;
}

/** A grid or list of the brand's items (books, products, events). */
export interface ItemsBlock extends BlockBase {
  type: "items";
  /** emailItems ids, in order. For a personal block the person's picks replace them. */
  itemIds: string[];
  /** "manual": the merchant's choice. "taste": chosen by the audience's (or person's) taste. */
  pick: "manual" | "taste";
  /** How many to show when picking by taste. */
  count: number;
  columns: 1 | 2 | 3;
  layout: "grid" | "list";
  show: { image: boolean; subtitle: boolean; description: boolean; price: boolean; button: boolean; reason: boolean };
  buttonLabel: string;
  /** Why each item fits the reader, by item id ("Because you loved Normal People"). */
  reasons?: Record<string, string>;
}

export interface SocialBlock extends BlockBase {
  type: "social";
  links: { network: SocialNetwork; url: string }[];
  align: Align;
  /** Icon colouring. */
  style: "dark" | "light" | "brand";
  /** Icon size in px. */
  size?: number;
}

export interface QuoteBlock extends BlockBase {
  type: "quote";
  text: string;
  author?: string;
  role?: string;
  avatar?: string;
  align: Align;
}

export interface CouponBlock extends BlockBase {
  type: "coupon";
  code: string;
  /** Line above the code, e.g. "15% off your next order". */
  label: string;
  /** Small print under it. */
  note?: string;
  align: Align;
}

export interface VideoBlock extends BlockBase {
  type: "video";
  /** Poster image; the renderer overlays a play button. */
  thumbnail: string;
  href: string;
  alt: string;
  width: number;
  align: Align;
}

export interface FooterBlock extends BlockBase {
  type: "footer";
  /** Inline HTML. Defaults are filled from the brand's footer info. */
  text: string;
  address?: string;
  align: Align;
  unsubscribeLabel: string;
  /** Adds a "View in browser" link. */
  viewOnline?: boolean;
}

export type EmailBlock =
  | LogoBlock
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | ItemsBlock
  | SocialBlock
  | QuoteBlock
  | CouponBlock
  | VideoBlock
  | FooterBlock;

export type BlockType = EmailBlock["type"];

export const BLOCK_TYPES: BlockType[] = ["logo", "heading", "text", "image", "button", "divider", "spacer", "items", "social", "quote", "coupon", "video", "footer"];

export interface EmailColumn {
  id: string;
  /** Fraction of the content width; a section's columns sum to 1. */
  width: number;
  blocks: EmailBlock[];
  verticalAlign?: "top" | "middle" | "bottom";
  background?: ColorRef;
  padding?: Box;
}

export interface EmailSection {
  id: string;
  /** Shown in the layers list and the agent's view: "Header", "Hero", "Picks", "Footer". */
  label?: string;
  background?: ColorRef;
  backgroundImage?: string;
  /** Default [24, 32, 24, 32]. */
  padding?: Box;
  /** Gap between columns in px. */
  gap?: number;
  /** Columns stack on phones unless false. */
  stackOnMobile?: boolean;
  columns: EmailColumn[];
  /** Why the section says what it says (cites Qloo evidence). Console only, never sent. */
  evidence?: string;
}

export interface EmailDoc {
  kind: "email";
  /** Bumped on every save (hand edit, agent write, theme change). */
  version: number;
  subject: string;
  /** Inbox preview text after the subject. */
  preheader: string;
  theme: EmailTheme;
  sections: EmailSection[];
}

/* Personalisation ----------------------------------------------------------- */

/** One person's version of a campaign: overrides on the personal blocks. Stored in `emailVersions`. */
export interface Personalization {
  subject?: string;
  preheader?: string;
  /** Block id → fields to replace (only on blocks marked `personal`). */
  blocks: Record<string, Partial<EmailBlock>>;
  /** One or two sentences for the merchant: what changed for this person and why (cites taste evidence). */
  why?: string;
}

/**
 * Merge tags, written `{{first_name}}` or with a fallback `{{first_name|friend}}`.
 * Filled per recipient at send; the editor shows them as chips.
 */
export const MERGE_TAGS = [
  { key: "first_name", label: "First name", example: "Maya" },
  { key: "last_name", label: "Last name", example: "Okafor" },
  { key: "name", label: "Full name", example: "Maya Okafor" },
  { key: "email", label: "Email", example: "maya@example.com" },
  { key: "city", label: "City", example: "Brooklyn" },
  { key: "brand", label: "Brand name", example: "Folio & Fern" },
] as const;

export type MergeKey = (typeof MERGE_TAGS)[number]["key"];

/* Edit operations (agent tool `edit_email`, Convex `/email/ops`, the editor's history) */

export type EmailOp =
  /** Replace fields on a block (shallow merge; `type` and `id` cannot change). */
  | { op: "update_block"; id: string; set: Partial<EmailBlock> }
  /** Insert a block into a column at `index` (end when omitted). Ids missing on the block are assigned. */
  | { op: "insert_block"; columnId: string; index?: number; block: Omit<EmailBlock, "id"> & { id?: string } }
  | { op: "remove_block"; id: string }
  /** Move a block to another (or the same) column at `index`. */
  | { op: "move_block"; id: string; columnId: string; index: number }
  /** Replace fields on a section (not its columns). */
  | { op: "update_section"; id: string; set: Partial<Omit<EmailSection, "id" | "columns">> }
  /** Insert a whole section after `after` (a section id), at the top when "start", at the end when omitted. */
  | { op: "insert_section"; after?: string; section: EmailSectionInput }
  | { op: "remove_section"; id: string }
  | { op: "move_section"; id: string; index: number }
  /** Replace a section's columns (layout change); blocks keep their ids. */
  | { op: "set_columns"; sectionId: string; columns: EmailColumnInput[] }
  | { op: "update_column"; id: string; set: Partial<Omit<EmailColumn, "id" | "blocks">> }
  | { op: "set_subject"; subject?: string; preheader?: string }
  /** Shallow-merge into the theme; nested `colors`, `fonts`, `button` merge one level deeper. */
  | { op: "set_theme"; set: Partial<EmailTheme> };

/** A section as the agent or a preset writes it: ids optional, assigned on insert. */
export interface EmailSectionInput extends Omit<EmailSection, "id" | "columns"> {
  id?: string;
  columns: EmailColumnInput[];
}

export interface EmailColumnInput extends Omit<EmailColumn, "id" | "blocks"> {
  id?: string;
  blocks: (Omit<EmailBlock, "id"> & { id?: string })[];
}

/* Templates --------------------------------------------------------------- */

export type TemplateCategory = "Welcome" | "Newsletter" | "Promotion" | "Products" | "Events" | "Re-engage" | "Announcement" | "Letter";

export interface EmailTemplate {
  id: string;
  name: string;
  /** What it is for, shown under the thumbnail: "Recommend books by taste". */
  purpose: string;
  category: TemplateCategory;
  /** Templates built around taste slots get a "Personal" badge. */
  personal: boolean;
  /** Written with theme tokens so `applyTheme` restyles it for any brand. */
  doc: EmailDoc;
}

/* Campaigns, audiences, sends --------------------------------------------- */

/** "draft" | "scheduled" | "sending" | "sent" | "failed" */
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

/** "group": one email for a taste group. "people": a version per person. */
export type AudienceKind = "group" | "people";

export interface CampaignStats {
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  failed: number;
}

export const emptyStats = (): CampaignStats => ({
  recipients: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
  failed: 0,
});

/** "queued" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "failed" | "skipped" */
export type SendStatus = "queued" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "failed" | "skipped";

/** How a brand sends: its own verified domain, the platform's shared domain, or demo (simulated, nothing leaves). */
export type SendingMode = "domain" | "shared" | "demo" | "none";

/** Max people in a one-by-one list (each is compiled and personalised separately). */
export const MAX_PEOPLE_LIST = 50;
/** Max rows in a contact upload. */
export const MAX_CONTACT_ROWS = 2000;
