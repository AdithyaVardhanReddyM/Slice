// Plain helpers the campaign editor's parts share: names and icons per block
// type, the words a block shows, selection shapes, the render context the
// canvas and previews pass to the email renderer, and style conversion for
// the React wrappers around rendered blocks.

import {
  Clapperboard,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  Minus,
  MousePointerClick,
  MoveVertical,
  PanelBottom,
  Quote,
  Share2,
  Stamp,
  TicketPercent,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type {
  BlockType,
  ColorRef,
  EmailBlock,
  EmailDoc,
  EmailSection,
  EmailTheme,
  MergeKey,
} from "@slice/backend/convex/emailTypes";

export const BLOCK_LABEL: Record<BlockType, string> = {
  logo: "Logo",
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Spacer",
  items: "Items",
  social: "Social links",
  quote: "Quote",
  coupon: "Coupon",
  video: "Video",
  footer: "Footer",
};

export const BLOCK_ICON: Record<BlockType, LucideIcon> = {
  logo: Stamp,
  heading: Heading,
  text: Type,
  image: ImageIcon,
  button: MousePointerClick,
  divider: Minus,
  spacer: MoveVertical,
  items: LayoutGrid,
  social: Share2,
  quote: Quote,
  coupon: TicketPercent,
  video: Clapperboard,
  footer: PanelBottom,
};

/** Blocks whose words are typed in place on the canvas (double click). */
export const INLINE_TYPES: ReadonlySet<BlockType> = new Set(["heading", "text", "button", "quote"]);

/** Blocks the agent can rewrite per person (the fields `Personalization` may replace). */
export const PERSONAL_TYPES: ReadonlySet<BlockType> = new Set(["heading", "text", "image", "button", "items", "quote"]);

export type Selection = { kind: "section" | "column" | "block"; id: string };

export type Device = "desktop" | "phone";

/** Phone canvas width: the narrowest common phone, where columns stack. */
export const PHONE_WIDTH = 375;

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** HTML to its words: tags dropped, entities decoded, whitespace folded. */
export function plain(html: string | undefined): string {
  if (!html) return "";
  return decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|li|div)>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** The words a block shows, for layers, pills and the agent. */
export function blockText(block: EmailBlock): string {
  switch (block.type) {
    case "heading":
      return plain(block.text);
    case "text":
      return plain(block.html);
    case "button":
      return block.label;
    case "image":
      return block.alt;
    case "video":
      return block.alt;
    case "quote":
      return plain(block.text);
    case "coupon":
      return `${block.label} ${block.code}`.trim();
    case "footer":
      return plain(block.text);
    case "items":
      return block.pick === "taste" ? `${block.count} picks by taste` : `${block.itemIds.length} items`;
    case "social":
      return block.links.map((l) => l.network).join(", ");
    default:
      return "";
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "Heading: Your autumn reading list". */
export function blockLabel(block: EmailBlock, max = 40): string {
  const words = blockText(block);
  return words ? `${BLOCK_LABEL[block.type]}: ${clip(words, max)}` : BLOCK_LABEL[block.type];
}

/** A section's name: its label, else what its first heading says, else its place. */
export function sectionName(section: EmailSection, index: number): string {
  if (section.label) return section.label;
  for (const c of section.columns) for (const b of c.blocks) if (b.type === "heading" && plain(b.text)) return clip(plain(b.text), 28);
  return `Section ${index + 1}`;
}

/** The section holding the footer block (unsubscribe, address). */
export const isFooterSection = (s: EmailSection) => s.columns.some((c) => c.blocks.some((b) => b.type === "footer"));

/** Style maps from the renderer use CSS names ("background-color"); React wants camelCase. */
export function reactStyle(rec: Record<string, string> | undefined): CSSProperties {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    out[k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = String(v);
  }
  return out as CSSProperties;
}

/** Sample values merge tags show in the editor when no person is chosen. */
export function sampleMerge(brandName: string): Partial<Record<MergeKey, string>> {
  return { first_name: "Maya", last_name: "Okafor", name: "Maya Okafor", email: "maya@example.com", city: "Brooklyn", brand: brandName };
}

/** A contact's merge values. */
export function mergeFor(
  contact: { name?: string; firstName?: string; lastName?: string; email?: string; city?: string } | null | undefined,
  brandName: string,
): Partial<Record<MergeKey, string>> {
  if (!contact) return { brand: brandName };
  const first = contact.firstName ?? contact.name?.split(" ")[0];
  return {
    first_name: first,
    last_name: contact.lastName ?? contact.name?.split(" ").slice(1).join(" ") ?? undefined,
    name: contact.name,
    email: contact.email,
    city: contact.city,
    brand: brandName,
  };
}

/** Theme tokens a colour field offers, in the order a merchant thinks of them. */
export const COLOR_TOKENS: { ref: ColorRef; key: keyof EmailTheme["colors"]; label: string }[] = [
  { ref: "primary", key: "primary", label: "Primary" },
  { ref: "accent", key: "accent", label: "Accent" },
  { ref: "text", key: "text", label: "Text" },
  { ref: "muted", key: "muted", label: "Muted" },
  { ref: "surface", key: "surface", label: "Surface" },
  { ref: "backdrop", key: "backdrop", label: "Backdrop" },
  { ref: "border", key: "border", label: "Border" },
];

/** The five colours a theme card shows. */
export const themeSwatches = (t: EmailTheme) => [t.colors.primary, t.colors.accent, t.colors.text, t.colors.surface, t.colors.backdrop];

/** Every block id in the doc, in reading order. */
export function blockIds(doc: EmailDoc): string[] {
  return doc.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks.map((b) => b.id)));
}

/** Does the selection still point at something in the doc? */
export function selectionExists(doc: EmailDoc, sel: Selection | null): boolean {
  if (!sel) return false;
  for (const s of doc.sections) {
    if (sel.kind === "section" && s.id === sel.id) return true;
    for (const c of s.columns) {
      if (sel.kind === "column" && c.id === sel.id) return true;
      if (sel.kind === "block" && c.blocks.some((b) => b.id === sel.id)) return true;
    }
  }
  return false;
}

/** Inside a text field or an editable: keyboard shortcuts belong to it. */
export function typingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
