// Email documents: the forgiving validator every write goes through (the
// agent writes docs, so it coerces rather than rejects), edit operations, the
// inline-HTML sanitiser, personalisation overlays and small lookups. Plain
// TypeScript (no Convex imports, no DOM): it runs in Convex, in Next server
// and client components and in the browser.
//
// See docs/email-plan.md and emailTypes.ts for the shapes.

import type {
  Align,
  BlockType,
  Box,
  ButtonBlock,
  CouponBlock,
  DividerBlock,
  EmailBlock,
  EmailColumn,
  EmailColumnInput,
  EmailDoc,
  EmailFont,
  EmailOp,
  EmailSection,
  EmailSectionInput,
  EmailTheme,
  FooterBlock,
  HeadingBlock,
  ImageBlock,
  ItemsBlock,
  Personalization,
  QuoteBlock,
  SocialBlock,
  SocialNetwork,
  TextBlock,
} from "./emailTypes";
import { BLOCK_TYPES } from "./emailTypes";
import { DEFAULT_THEME, isColorRef, isColorValue, normalizeHex, themePreset } from "./emailThemes";

/* Ids ---------------------------------------------------------------------- */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** "b_k3x9q2mf": the prefix, an underscore and 8 random characters. */
export function newId(prefix: string): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${prefix.replace(/_+$/, "") || "x"}_${s}`;
}

/* Small coercions ---------------------------------------------------------- */

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const int = (v: unknown, min: number, max: number, fallback: number) => Math.round(num(v, min, max, fallback));

function optNum(v: unknown, min: number, max: number): number | undefined {
  const n = num(v, min, max, NaN);
  return Number.isFinite(n) ? n : undefined;
}

const bool = (v: unknown) => v === true || v === "true" || v === 1;

function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (list as readonly string[]).includes(s) ? (s as T) : fallback;
}

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").slice(0, max);

/** Plain text field (labels, alt, codes): tags stripped, entities decoded, trimmed. Merge tags survive. */
const plain = (v: unknown, max = 300): string => htmlToText(str(v, max * 4)).replace(/\s+/g, " ").trim().slice(0, max);

const ALIGNS: readonly Align[] = ["left", "center", "right"];
const align = (v: unknown, fallback: Align): Align => (v === "centre" || v === "middle" ? "center" : oneOf(v, ALIGNS, fallback));

/** [top, right, bottom, left] from a number, [v, h], [t, h, b], [t, r, b, l] or {top, right, bottom, left}. */
function box(v: unknown, max = 160): Box | undefined {
  let a: unknown[] | undefined;
  if (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) a = [v, v, v, v];
  else if (Array.isArray(v) && v.length) {
    if (v.length === 1) a = [v[0], v[0], v[0], v[0]];
    else if (v.length === 2) a = [v[0], v[1], v[0], v[1]];
    else if (v.length === 3) a = [v[0], v[1], v[2], v[1]];
    else a = v.slice(0, 4);
  } else if (isObj(v)) a = [v.top ?? 0, v.right ?? 0, v.bottom ?? 0, v.left ?? 0];
  if (!a) return undefined;
  const out = a.map((x) => int(x, 0, max, NaN));
  return out.some((x) => !Number.isFinite(x)) ? undefined : (out as Box);
}

const colorRef = (v: unknown) => (isColorRef(v) ? (v as string).trim() : undefined);

/** An http(s) URL, or "" when it isn't one. */
function url(v: unknown): string {
  const s = str(v, 2000).trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
}

/** A link target: http(s), mailto, tel, an in-page anchor or a merge tag. Anything else becomes "#". */
export function safeHref(v: unknown): string {
  const s = str(v, 2000).trim();
  if (!s) return "#";
  const probe = s.replace(/[\u0000- ]/g, "");
  if (/^(https?:\/\/|mailto:|tel:)/i.test(probe) && !/["<>]/.test(s)) return s;
  if (/^#[\w-]*$/.test(s) || /^\{\{\s*[a-z_]+/i.test(s)) return s;
  return "#";
}

/* Sanitiser ---------------------------------------------------------------- */

const INLINE_TAGS = new Set(["a", "b", "strong", "i", "em", "u", "br", "span"]);
const RICH_TAGS = new Set([...INLINE_TAGS, "p", "ul", "ol", "li"]);
/** Dropped together with everything inside them. */
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "head", "title", "textarea", "select", "canvas", "audio", "video"]);
/** Known elements whose tags are dropped but whose text stays; the rest of `<...>` reads as text. */
const KNOWN_TAGS = new Set(
  "html body main div section article header footer nav aside h1 h2 h3 h4 h5 h6 blockquote small sup sub mark s strike del ins font center label code pre abbr cite q time table tbody thead tfoot tr td th img hr input form figure figcaption picture source meta link button big tt kbd var dfn bdi bdo wbr dl dt dd caption col colgroup address details summary".split(" "),
);
/** Boundaries: a line break in inline text, a paragraph in rich text. */
const BLOCKISH = new Set(["p", "div", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "li", "tr", "center", "pre", "address", "figure", "figcaption", "dd", "dt", "ul", "ol", "table", "main", "aside", "nav"]);

const TOKEN_RE = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|[^<]+|</g;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  eacute: "é",
  zwnj: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text for HTML: keeps existing entities, escapes bare &, < and >. */
export const escapeText = (s: string) =>
  s.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain string → safe attribute value / text (everything escaped). */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(src))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

/** The span styles text formatting may carry: color, font-weight, text-decoration. */
function cleanStyle(style: string): string {
  const keep: string[] = [];
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim().toLowerCase().replace(/\s*!important$/, "");
    if (prop === "color" && (isColorValue(val) || /^[a-z]{3,20}$/.test(val))) keep.push(`color:${val}`);
    else if (prop === "font-weight" && /^(normal|bold|[1-9]00)$/.test(val)) keep.push(`font-weight:${val}`);
    else if (prop === "text-decoration" && /^(none|underline|line-through|underline line-through)$/.test(val)) keep.push(`text-decoration:${val}`);
  }
  return keep.join(";");
}

interface Open {
  name: string;
  /** Written to the output (false for dropped wrappers whose close tag must still be consumed). */
  emit: boolean;
  /** Merge-chip span or a drop-with-content element: its contents are skipped. */
  skip?: boolean;
}

function sanitize(html: string, rich: boolean, max: number): string {
  const input = str(html, max * 2);
  const allowed = rich ? RICH_TAGS : INLINE_TAGS;
  // Rich text that uses paragraphs anywhere gets loose runs wrapped in <p> too.
  const blockMode = rich && /<(p|ul|ol|li|div|h[1-6]|blockquote|section)\b/i.test(input);
  const out: string[] = [];
  const stack: Open[] = [];
  const skipping = () => stack.some((o) => o.skip);
  const lastOut = () => out[out.length - 1] ?? "";

  const closeTo = (i: number) => {
    while (stack.length > i) {
      const o = stack.pop()!;
      if (o.emit) out.push(`</${o.name}>`);
    }
  };
  const openIndex = (name: string) => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === name) return i;
    return -1;
  };
  const inBlock = () => stack.some((o) => o.emit && (o.name === "p" || o.name === "li" || o.name === "ul" || o.name === "ol"));
  const ensureParagraph = () => {
    if (blockMode && !inBlock()) {
      out.push("<p>");
      stack.push({ name: "p", emit: true });
    }
  };
  const lineBreak = () => {
    if (out.length && lastOut() !== "<br>") out.push("<br>");
  };

  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(input))) {
    const tok = m[0];
    if (tok.startsWith("<!--")) continue;
    if (m[2] === undefined) {
      // Text (or a lone "<").
      if (skipping()) continue;
      const text = tok === "<" ? "&lt;" : escapeText(tok);
      if (blockMode && !inBlock()) {
        if (!text.trim()) continue;
        ensureParagraph();
      }
      out.push(text);
      continue;
    }
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const attrs = m[3] ?? "";

    if (DROP_WITH_CONTENT.has(name)) {
      if (closing) {
        const i = openIndex(name);
        if (i >= 0) closeTo(i);
      } else if (m[4] !== "/") stack.push({ name, emit: false, skip: true });
      continue;
    }
    if (skipping() && !(closing && name === "span")) continue;

    if (closing) {
      const i = openIndex(name);
      if (i >= 0) closeTo(i);
      if (BLOCKISH.has(name) && !allowed.has(name)) {
        if (rich) {
          // A closing div / h2 that stood in for a paragraph.
          const p = openIndex("p");
          if (p >= 0) closeTo(p);
        } else lineBreak();
      }
      continue;
    }

    if (name === "br") {
      if (blockMode && !inBlock()) continue;
      out.push("<br>");
      continue;
    }

    if (!allowed.has(name)) {
      if (!KNOWN_TAGS.has(name) && !BLOCKISH.has(name) && !RICH_TAGS.has(name)) {
        // Not an element we know ("<3", "<Name>"): show it as text.
        if (blockMode && !inBlock()) ensureParagraph();
        out.push(escapeText(tok));
        continue;
      }
      if (BLOCKISH.has(name)) {
        if (rich) {
          // div / h2 / blockquote → a paragraph.
          const p = openIndex("p");
          if (p >= 0) closeTo(p);
          if (!inBlock()) {
            out.push("<p>");
            stack.push({ name: "p", emit: true });
          }
          stack.push({ name, emit: false });
        } else {
          lineBreak();
          stack.push({ name, emit: false });
        }
      } else if (m[4] !== "/" && !["img", "hr", "input", "meta", "link", "source", "col", "wbr"].includes(name)) {
        stack.push({ name, emit: false });
      } else if (name === "hr") {
        const p = openIndex("p");
        if (!rich) lineBreak();
        else if (p >= 0) closeTo(p);
      }
      continue;
    }

    const a = parseAttrs(attrs);
    if (name === "a") {
      const href = safeHref(a.href);
      if (href === "#" && (a.href ?? "").trim() !== "#") {
        stack.push({ name, emit: false });
        continue;
      }
      ensureParagraph();
      out.push(`<a href="${escapeHtml(href)}">`);
      stack.push({ name, emit: true });
      continue;
    }
    if (name === "span") {
      if (a["data-merge"] && /^[a-z_]{1,32}$/.test(a["data-merge"])) {
        // An editor merge chip: back to its tag, contents skipped.
        const fb = plain(a["data-fallback"] ?? "", 60).replace(/[{}|]/g, "");
        ensureParagraph();
        out.push(`{{${a["data-merge"]}${fb ? `|${escapeText(fb)}` : ""}}}`);
        stack.push({ name, emit: false, skip: true });
        continue;
      }
      const style = cleanStyle(a.style ?? "");
      if (!style) {
        stack.push({ name, emit: false });
        continue;
      }
      ensureParagraph();
      out.push(`<span style="${escapeHtml(style)}">`);
      stack.push({ name, emit: true });
      continue;
    }
    if (name === "p" || name === "ul" || name === "ol") {
      const p = openIndex("p");
      if (p >= 0) closeTo(p);
      if (name === "p" && openIndex("ul") < 0 && openIndex("ol") < 0) {
        out.push("<p>");
        stack.push({ name, emit: true });
      } else if (name !== "p") {
        out.push(`<${name}>`);
        stack.push({ name, emit: true });
      }
      continue;
    }
    if (name === "li") {
      const li = openIndex("li");
      if (li >= 0 && li > Math.max(openIndex("ul"), openIndex("ol"))) closeTo(li);
      if (openIndex("ul") < 0 && openIndex("ol") < 0) {
        const p = openIndex("p");
        if (p >= 0) closeTo(p);
        out.push("<ul>");
        stack.push({ name: "ul", emit: true });
      }
      out.push("<li>");
      stack.push({ name, emit: true });
      continue;
    }
    // b, strong, i, em, u
    ensureParagraph();
    out.push(`<${name}>`);
    stack.push({ name, emit: true });
  }
  closeTo(0);

  let html2 = out.join("");
  // Tidy: no empty formatting or paragraphs, no leading / trailing breaks.
  for (let i = 0; i < 3; i++) html2 = html2.replace(/<(b|strong|i|em|u|span|a)\b[^>]*>\s*<\/\1>/g, "");
  html2 = html2.replace(/<p>(?:\s|<br>|&nbsp;)*<\/p>/g, "").replace(/<(ul|ol)>\s*<\/\1>/g, "");
  html2 = html2.replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, "").replace(/(<br>){3,}/g, "<br><br>");
  html2 = html2.replace(/<p>(?:<br>)+/g, "<p>").replace(/(?:<br>)+<\/p>/g, "</p>");
  return html2.slice(0, max);
}

/** Inline HTML for headings, quotes and footers: a[href], b, strong, i, em, u, br, span[style]. */
export const sanitizeInline = (html: string): string => sanitize(html, false, 4000);

/** Text-block HTML: the inline set plus p, ul, ol, li. */
export const sanitizeRich = (html: string): string => sanitize(html, true, 20000);

/** Plain text from HTML (paragraphs and breaks become newlines). */
export function htmlToText(html: string): string {
  return decodeEntities(
    String(html ?? "")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|h[1-6]|blockquote)>/gi, "\n\n")
      .replace(/<\/(li|ul|ol|tr)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text written into a text block's html: blank lines → paragraphs, line breaks → <br>. */
function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeText(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/* Normalisation ------------------------------------------------------------ */

const TYPE_ALIASES: Record<string, BlockType> = {
  paragraph: "text",
  body: "text",
  richtext: "text",
  title: "heading",
  headline: "heading",
  subheading: "heading",
  cta: "button",
  link: "button",
  hr: "divider",
  line: "divider",
  rule: "divider",
  space: "spacer",
  gap: "spacer",
  products: "items",
  picks: "items",
  books: "items",
  catalog: "items",
  socials: "social",
  testimonial: "quote",
  review: "quote",
  img: "image",
  photo: "image",
  picture: "image",
  promo: "coupon",
  code: "coupon",
};

const NETWORKS: readonly SocialNetwork[] = ["instagram", "facebook", "x", "tiktok", "youtube", "linkedin", "pinterest", "threads", "website"];

/** Sizes the renderer uses when a block has no padding of its own. */
export const DEFAULT_HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 34, 2: 26, 3: 20 };

const DEFAULT_SHOW = { image: true, subtitle: true, description: false, price: true, button: true, reason: true };

interface Norm {
  used: Set<string>;
  problems: string[];
}

function takeId(n: Norm, v: unknown, prefix: string, where: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s && ID_RE.test(s) && !n.used.has(s)) {
    n.used.add(s);
    return s;
  }
  if (s && n.used.has(s)) n.problems.push(`${where}: duplicate id "${s}", gave it a new one`);
  let id = newId(prefix);
  while (n.used.has(id)) id = newId(prefix);
  n.used.add(id);
  return id;
}

function blockType(raw: Raw): BlockType | null {
  const t = typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "";
  if ((BLOCK_TYPES as string[]).includes(t)) return t as BlockType;
  return TYPE_ALIASES[t] ?? null;
}

function normBlock(n: Norm, input: unknown, where: string): EmailBlock | null {
  if (!isObj(input)) {
    n.problems.push(`${where}: block is not an object, dropped`);
    return null;
  }
  const raw = input;
  const type = blockType(raw);
  if (!type) {
    n.problems.push(`${where}: unknown block type "${str(raw.type, 40)}", dropped`);
    return null;
  }
  const id = takeId(n, raw.id, "b", where);
  const base: { id: string; personal?: boolean; padding?: Box; hideOn?: "mobile" | "desktop" } = { id };
  if (bool(raw.personal)) base.personal = true;
  const padding = box(raw.padding);
  if (padding) base.padding = padding;
  if (raw.hideOn === "mobile" || raw.hideOn === "desktop") base.hideOn = raw.hideOn;
  const color = colorRef(raw.color);

  switch (type) {
    case "logo":
      return { ...base, type, width: int(raw.width, 40, 600, 140), align: align(raw.align, "center"), ...(url(raw.href) ? { href: url(raw.href) } : {}) };
    case "heading": {
      const rawType = typeof raw.type === "string" ? raw.type.toLowerCase() : "";
      const lv = typeof raw.level === "string" ? parseInt(raw.level.replace(/\D/g, ""), 10) : raw.level;
      const level = (int(lv, 1, 3, rawType === "subheading" ? 2 : 1) as 1 | 2 | 3);
      const text = sanitizeInline(str(raw.text ?? raw.html ?? raw.content, 8000));
      const b: HeadingBlock = { ...base, type, text, level, align: align(raw.align, "left") };
      if (color) b.color = color;
      const size = optNum(raw.size, 12, 96);
      if (size !== undefined) b.size = Math.round(size);
      if (raw.font === "heading" || raw.font === "body") b.font = raw.font;
      const weight = optNum(raw.weight, 100, 900);
      if (weight !== undefined) b.weight = Math.round(weight / 100) * 100;
      const ls = optNum(raw.letterSpacing, -5, 20);
      if (ls !== undefined) b.letterSpacing = Math.round(ls * 10) / 10;
      if (bool(raw.uppercase)) b.uppercase = true;
      return b;
    }
    case "text": {
      let html = str(raw.html ?? "", 40000);
      if (!html && typeof (raw.text ?? raw.content) === "string") {
        const t = str(raw.text ?? raw.content, 40000);
        html = /<[a-z][^>]*>/i.test(t) ? t : textToHtml(t);
      }
      const b: TextBlock = { ...base, type, html: sanitizeRich(html), align: align(raw.align, "left") };
      if (color) b.color = color;
      const size = optNum(raw.size, 10, 40);
      if (size !== undefined) b.size = Math.round(size);
      const lh = optNum(raw.lineHeight, 1, 3);
      if (lh !== undefined) b.lineHeight = Math.round(lh * 100) / 100;
      return b;
    }
    case "image": {
      const src = url(raw.src ?? raw.url ?? raw.image);
      const alt = plain(raw.alt, 300);
      if (src && !alt) n.problems.push(`${where}: image ${id} has no alt text`);
      const b: ImageBlock = { ...base, type, src, alt, width: int(raw.width, 10, 100, 100), align: align(raw.align, "center") };
      if (raw.href) b.href = safeHref(raw.href);
      const radius = optNum(raw.radius, 0, 60);
      if (radius !== undefined) b.radius = Math.round(radius);
      if (raw.source) b.source = plain(raw.source, 20);
      if (raw.credit) b.credit = plain(raw.credit, 120);
      return b;
    }
    case "button": {
      const b: ButtonBlock = {
        ...base,
        type,
        label: plain(raw.label ?? raw.text, 80) || "Shop now",
        href: safeHref(raw.href ?? raw.url),
        align: align(raw.align, "center"),
      };
      if (bool(raw.fullWidth)) b.fullWidth = true;
      if (raw.variant === "outline" || raw.variant === "solid") b.variant = raw.variant;
      if (color) b.color = color;
      const tc = colorRef(raw.textColor);
      if (tc) b.textColor = tc;
      if (raw.size === "sm" || raw.size === "md" || raw.size === "lg") b.size = raw.size;
      if (raw.shape === "square" || raw.shape === "rounded" || raw.shape === "pill") b.shape = raw.shape;
      return b;
    }
    case "divider": {
      const b: DividerBlock = {
        ...base,
        type,
        thickness: int(raw.thickness, 1, 12, 1),
        width: int(raw.width, 5, 100, 100),
        style: oneOf(raw.style, ["solid", "dashed", "dotted"] as const, "solid"),
      };
      if (color) b.color = color;
      return b;
    }
    case "spacer":
      return { ...base, type, height: int(raw.height, 4, 240, 24) };
    case "items": {
      const ids = Array.isArray(raw.itemIds) ? [...new Set(raw.itemIds.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))].slice(0, 12) : [];
      const show = isObj(raw.show) ? raw.show : {};
      const reasons: Record<string, string> = {};
      if (isObj(raw.reasons)) for (const [k, v] of Object.entries(raw.reasons)) if (plain(v, 140)) reasons[k] = plain(v, 140);
      const pick = oneOf(raw.pick, ["manual", "taste"] as const, ids.length ? "manual" : "taste");
      const b: ItemsBlock = {
        ...base,
        type,
        itemIds: ids,
        pick,
        count: int(raw.count, 1, 12, ids.length || 3),
        columns: int(raw.columns, 1, 3, 3) as 1 | 2 | 3,
        layout: oneOf(raw.layout, ["grid", "list"] as const, "grid"),
        show: {
          image: show.image === undefined ? DEFAULT_SHOW.image : bool(show.image),
          subtitle: show.subtitle === undefined ? DEFAULT_SHOW.subtitle : bool(show.subtitle),
          description: show.description === undefined ? DEFAULT_SHOW.description : bool(show.description),
          price: show.price === undefined ? DEFAULT_SHOW.price : bool(show.price),
          button: show.button === undefined ? DEFAULT_SHOW.button : bool(show.button),
          reason: show.reason === undefined ? DEFAULT_SHOW.reason : bool(show.reason),
        },
        buttonLabel: plain(raw.buttonLabel, 40) || "Shop now",
      };
      if (Object.keys(reasons).length) b.reasons = reasons;
      return b;
    }
    case "social": {
      const links = (Array.isArray(raw.links) ? raw.links : [])
        .filter(isObj)
        .map((l) => ({ network: oneOf(l.network === "twitter" ? "x" : l.network, NETWORKS, "website"), url: url(l.url) }))
        .filter((l) => l.url)
        .slice(0, 9);
      const b: SocialBlock = { ...base, type, links, align: align(raw.align, "center"), style: oneOf(raw.style, ["dark", "light", "brand"] as const, "dark") };
      const size = optNum(raw.size, 16, 48);
      if (size !== undefined) b.size = Math.round(size);
      return b;
    }
    case "quote": {
      const b: QuoteBlock = { ...base, type, text: sanitizeInline(str(raw.text ?? raw.quote, 4000)), align: align(raw.align, "center") };
      if (plain(raw.author, 80)) b.author = plain(raw.author, 80);
      if (plain(raw.role, 80)) b.role = plain(raw.role, 80);
      if (url(raw.avatar)) b.avatar = url(raw.avatar);
      return b;
    }
    case "coupon": {
      const b: CouponBlock = { ...base, type, code: plain(raw.code, 40) || "WELCOME10", label: plain(raw.label, 120) || "Your code", align: align(raw.align, "center") };
      if (plain(raw.note, 200)) b.note = plain(raw.note, 200);
      return b;
    }
    case "video":
      return {
        ...base,
        type,
        thumbnail: url(raw.thumbnail ?? raw.src ?? raw.poster),
        href: safeHref(raw.href ?? raw.url),
        alt: plain(raw.alt, 200) || "Watch the video",
        width: int(raw.width, 10, 100, 100),
        align: align(raw.align, "center"),
      };
    case "footer": {
      const label = plain(raw.unsubscribeLabel, 60);
      if (!label) n.problems.push(`${where}: footer ${id} had no unsubscribe label, set "Unsubscribe"`);
      const b: FooterBlock = { ...base, type, text: sanitizeInline(str(raw.text, 4000)), align: align(raw.align, "center"), unsubscribeLabel: label || "Unsubscribe" };
      if (plain(raw.address, 300)) b.address = plain(raw.address, 300);
      if (bool(raw.viewOnline)) b.viewOnline = true;
      return b;
    }
  }
}

/** Fractions summing to 1: percentages and px widths are scaled; missing ones share equally. */
function fixWidths(widths: unknown[]): number[] {
  const n = widths.length;
  if (!n) return [];
  const vals = widths.map((w) => num(w, 0, 10000, NaN));
  if (vals.some((v) => !Number.isFinite(v) || v <= 0)) {
    const known = vals.filter((v) => Number.isFinite(v) && v > 0 && v < 1);
    const rest = 1 - known.reduce((a, b) => a + b, 0);
    const missing = vals.filter((v) => !(Number.isFinite(v) && v > 0 && v < 1)).length;
    if (rest > 0.05 * missing && missing) return round(vals.map((v) => (Number.isFinite(v) && v > 0 && v < 1 ? v : rest / missing)));
    return round(vals.map(() => 1 / n));
  }
  const sum = vals.reduce((a, b) => a + b, 0);
  return round(vals.map((v) => v / sum));

  function round(ws: number[]): number[] {
    // Keep columns usable (≥ 10%) and the total exactly 1.
    const clamped = ws.map((w) => Math.max(0.1, w));
    const s = clamped.reduce((a, b) => a + b, 0);
    const out = clamped.map((w) => Math.round((w / s) * 10000) / 10000);
    out[out.length - 1] = Math.round((1 - out.slice(0, -1).reduce((a, b) => a + b, 0)) * 10000) / 10000;
    return out;
  }
}

function normColumnFields(raw: Raw): Omit<EmailColumn, "id" | "blocks" | "width"> {
  const out: Omit<EmailColumn, "id" | "blocks" | "width"> = {};
  if (raw.verticalAlign === "top" || raw.verticalAlign === "middle" || raw.verticalAlign === "bottom") out.verticalAlign = raw.verticalAlign;
  const bg = colorRef(raw.background);
  if (bg) out.background = bg;
  const p = box(raw.padding);
  if (p) out.padding = p;
  return out;
}

function normColumns(n: Norm, rawCols: unknown[], where: string): EmailColumn[] {
  let cols = rawCols.filter(isObj);
  if (cols.length > 4) {
    n.problems.push(`${where}: ${cols.length} columns, kept the first 4`);
    cols = cols.slice(0, 4);
  }
  if (!cols.length) cols = [{ blocks: [] }];
  const widths = fixWidths(cols.map((c) => c.width));
  return cols.map((c, i) => {
    const id = takeId(n, c.id, "c", `${where} column ${i + 1}`);
    const blocks = (Array.isArray(c.blocks) ? c.blocks : [])
      .map((b, j) => normBlock(n, b, `${where} column ${i + 1} block ${j + 1}`))
      .filter((b): b is EmailBlock => !!b);
    return { id, width: widths[i], blocks, ...normColumnFields(c) };
  });
}

function normSectionFields(raw: Raw): Omit<EmailSection, "id" | "columns"> {
  const out: Omit<EmailSection, "id" | "columns"> = {};
  if (plain(raw.label, 60)) out.label = plain(raw.label, 60);
  const bg = colorRef(raw.background);
  if (bg) out.background = bg;
  if (url(raw.backgroundImage)) out.backgroundImage = url(raw.backgroundImage);
  const p = box(raw.padding);
  if (p) out.padding = p;
  const gap = optNum(raw.gap, 0, 64);
  if (gap !== undefined) out.gap = Math.round(gap);
  if (raw.stackOnMobile === false || raw.stackOnMobile === "false") out.stackOnMobile = false;
  if (str(raw.evidence).trim()) out.evidence = plain(raw.evidence, 600);
  return out;
}

function normSection(n: Norm, raw: unknown, where: string): EmailSection | null {
  if (!isObj(raw)) {
    n.problems.push(`${where}: section is not an object, dropped`);
    return null;
  }
  const id = takeId(n, raw.id, "s", where);
  // A section written as a bare block list becomes one column.
  const rawCols = Array.isArray(raw.columns) ? raw.columns : Array.isArray(raw.blocks) ? [{ width: 1, blocks: raw.blocks }] : [];
  return { id, ...normSectionFields(raw), columns: normColumns(n, rawCols, where) };
}

function normFont(raw: unknown, fallback: EmailFont): EmailFont {
  if (!isObj(raw) || !plain(raw.family, 60)) return { ...fallback };
  const f: EmailFont = { family: plain(raw.family, 60).replace(/["';]/g, ""), fallback: plain(raw.fallback, 200) || fallback.fallback };
  if (bool(raw.google)) f.google = true;
  if (Array.isArray(raw.weights)) {
    const w = [...new Set(raw.weights.map((x) => int(x, 100, 900, 0)).filter((x) => x > 0 && x % 100 === 0))].sort((a, b) => a - b);
    if (w.length) f.weights = w;
  }
  return f;
}

/** A complete theme from whatever was given; missing parts come from `fallback`. */
export function normalizeTheme(raw: unknown, fallback: EmailTheme = DEFAULT_THEME): EmailTheme {
  if (!isObj(raw)) return { ...fallback, colors: { ...fallback.colors }, fonts: { ...fallback.fonts }, button: { ...fallback.button } };
  const rc = isObj(raw.colors) ? raw.colors : {};
  const colors = { ...fallback.colors };
  for (const k of Object.keys(colors) as (keyof EmailTheme["colors"])[]) colors[k] = normalizeHex(typeof rc[k] === "string" ? (rc[k] as string) : undefined, fallback.colors[k]);
  const rf = isObj(raw.fonts) ? raw.fonts : {};
  const rb = isObj(raw.button) ? raw.button : {};
  const t: EmailTheme = {
    colors,
    fonts: { heading: normFont(rf.heading, fallback.fonts.heading), body: normFont(rf.body, fallback.fonts.body) },
    radius: int(raw.radius, 0, 40, fallback.radius),
    button: { shape: oneOf(rb.shape, ["square", "rounded", "pill"] as const, fallback.button.shape), uppercase: rb.uppercase === undefined ? fallback.button.uppercase : bool(rb.uppercase) },
    width: int(raw.width, 480, 760, fallback.width || 600),
  };
  if (plain(raw.id, 40)) t.id = plain(raw.id, 40);
  if (plain(raw.name, 60)) t.name = plain(raw.name, 60);
  return t;
}

/** Longer emails get clipped by Gmail (102 KB) long before this. */
export const MAX_SECTIONS = 40;

/** A footer section to append when a doc has none. */
function footerSection(n: Norm, brandName?: string): EmailSection {
  return {
    id: takeId(n, undefined, "s", "footer"),
    label: "Footer",
    background: "muted",
    padding: [28, 32, 32, 32],
    columns: [
      {
        id: takeId(n, undefined, "c", "footer"),
        width: 1,
        blocks: [
          {
            id: takeId(n, undefined, "b", "footer"),
            type: "footer",
            text: brandName ? `You're receiving this because you signed up for emails from ${escapeText(brandName)}.` : "You're receiving this because you signed up for our emails.",
            align: "center",
            unsubscribeLabel: "Unsubscribe",
          },
        ],
      },
    ],
  };
}

const isFooterSection = (s: EmailSection) => s.columns.some((c) => c.blocks.some((b) => b.type === "footer"));

/**
 * Normalise anything into a valid EmailDoc: coerces types, assigns and dedupes
 * ids, clamps numbers, defaults missing fields per block type, drops unknown
 * blocks, fixes column widths, sanitises HTML and makes sure an unsubscribe
 * footer exists. Never throws; everything it changed is reported in problems.
 */
export function validateEmailDoc(input: unknown): { doc: EmailDoc; problems: string[] } {
  const n: Norm = { used: new Set(), problems: [] };
  const raw = isObj(input) ? input : {};
  if (!isObj(input)) n.problems.push("doc is not an object; started an empty one");
  const theme = normalizeTheme(raw.theme);
  if (!isObj(raw.theme)) n.problems.push("theme missing; used the default theme");
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((s, i) => normSection(n, s, `section ${i + 1}`))
    .filter((s): s is EmailSection => !!s);
  if (sections.length > MAX_SECTIONS) {
    n.problems.push(`${sections.length} sections; kept the first ${MAX_SECTIONS}`);
    sections.length = MAX_SECTIONS;
  }
  if (!sections.some(isFooterSection)) {
    sections.push(footerSection(n));
    n.problems.push("no footer block: added a footer section with an unsubscribe link");
  }
  const doc: EmailDoc = {
    kind: "email",
    version: int(raw.version, 0, Number.MAX_SAFE_INTEGER, 0),
    subject: plain(raw.subject, 200),
    preheader: plain(raw.preheader, 300),
    theme,
    sections,
  };
  return { doc, problems: n.problems };
}

/* Lookups ------------------------------------------------------------------- */

export function findSection(doc: EmailDoc, id: string): { section: EmailSection; index: number } | null {
  const index = doc.sections.findIndex((s) => s.id === id);
  return index >= 0 ? { section: doc.sections[index], index } : null;
}

export function findColumn(doc: EmailDoc, id: string): { column: EmailColumn; section: EmailSection; index: number } | null {
  for (const section of doc.sections) {
    const index = section.columns.findIndex((c) => c.id === id);
    if (index >= 0) return { column: section.columns[index], section, index };
  }
  return null;
}

export function findBlock(doc: EmailDoc, id: string): { block: EmailBlock; column: EmailColumn; section: EmailSection; index: number } | null {
  for (const section of doc.sections)
    for (const column of section.columns) {
      const index = column.blocks.findIndex((b) => b.id === id);
      if (index >= 0) return { block: column.blocks[index], column, section, index };
    }
  return null;
}

export function allBlocks(doc: EmailDoc): { block: EmailBlock; column: EmailColumn; section: EmailSection }[] {
  const out: { block: EmailBlock; column: EmailColumn; section: EmailSection }[] = [];
  for (const section of doc.sections) for (const column of section.columns) for (const block of column.blocks) out.push({ block, column, section });
  return out;
}

export const personalBlocks = (doc: EmailDoc): EmailBlock[] => allBlocks(doc).filter((x) => x.block.personal).map((x) => x.block);

function idsIn(doc: EmailDoc): Set<string> {
  const used = new Set<string>();
  for (const s of doc.sections) {
    used.add(s.id);
    for (const c of s.columns) {
      used.add(c.id);
      for (const b of c.blocks) used.add(b.id);
    }
  }
  return used;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/* Ids for inputs ------------------------------------------------------------ */

function assignIds(x: unknown, fresh: boolean): void {
  if (Array.isArray(x)) {
    x.forEach((y) => assignIds(y, fresh));
    return;
  }
  if (!isObj(x)) return;
  const prefix = Array.isArray(x.columns) ? "s" : Array.isArray(x.blocks) ? "c" : typeof x.type === "string" ? "b" : "";
  if (prefix && (fresh || typeof x.id !== "string" || !x.id)) x.id = newId(prefix);
  if (Array.isArray(x.sections)) assignIds(x.sections, fresh);
  if (Array.isArray(x.columns)) assignIds(x.columns, fresh);
  if (Array.isArray(x.blocks)) assignIds(x.blocks, fresh);
}

/** A copy of a section, column or block input (or a list of them) with ids filled in where missing. */
export function withIds<T>(input: unknown): T {
  const out = clone(input);
  assignIds(out, false);
  return out as T;
}

/** A deep copy with every section, column and block id replaced (duplicate a block or section). */
export function cloneWithNewIds<T>(x: T): T {
  const out = clone(x);
  assignIds(out, true);
  return out;
}

/* Operations ---------------------------------------------------------------- */

const FOOTERISH = (s: EmailSection) => isFooterSection(s) || /footer/i.test(s.label ?? "");

/**
 * Apply edit operations. Pure: returns a new doc. A bad op is skipped and
 * reported in `problems`; `changed` lists the ids (or "subject" / "theme")
 * the ops touched. The result goes through `validateEmailDoc`, so it is
 * always a valid doc. Callers bump `version`.
 */
export function applyOps(doc: EmailDoc, ops: EmailOp[]): { doc: EmailDoc; problems: string[]; changed: string[] } {
  const d = clone(doc);
  const problems: string[] = [];
  const changed = new Set<string>();
  const list = Array.isArray(ops) ? ops : [];
  if (!Array.isArray(ops)) problems.push("ops is not a list");

  list.forEach((rawOp, i) => {
    const where = `op ${i + 1}`;
    try {
      if (!isObj(rawOp)) throw new Error("not an object");
      const op = rawOp as unknown as EmailOp & Raw;
      const n: Norm = { used: idsIn(d), problems };
      switch (op.op) {
        case "update_block": {
          const f = findBlock(d, str(op.id));
          if (!f) throw new Error(`no block "${str(op.id)}"`);
          const set: Raw = isObj(op.set) ? { ...(op.set as Raw) } : {};
          delete set.id;
          delete set.type;
          n.used.delete(f.block.id);
          const merged = { ...f.block, ...set, id: f.block.id, type: f.block.type } as Raw;
          for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
          if (f.block.type === "items" && isObj(set.show)) merged.show = { ...f.block.show, ...set.show };
          const b = normBlock(n, merged, where);
          if (!b) throw new Error("block became invalid");
          f.column.blocks[f.index] = b;
          changed.add(b.id);
          break;
        }
        case "insert_block": {
          const f = findColumn(d, str(op.columnId));
          if (!f) throw new Error(`no column "${str(op.columnId)}"`);
          const b = normBlock(n, op.block, where);
          if (!b) throw new Error("invalid block");
          const blocks = f.column.blocks;
          const at = op.index === undefined || op.index === null ? blocks.length : int(op.index, 0, blocks.length, blocks.length);
          blocks.splice(at, 0, b);
          changed.add(b.id);
          break;
        }
        case "remove_block": {
          const f = findBlock(d, str(op.id));
          if (!f) throw new Error(`no block "${str(op.id)}"`);
          f.column.blocks.splice(f.index, 1);
          changed.add(f.block.id);
          break;
        }
        case "move_block": {
          const f = findBlock(d, str(op.id));
          if (!f) throw new Error(`no block "${str(op.id)}"`);
          const to = findColumn(d, str(op.columnId));
          if (!to) throw new Error(`no column "${str(op.columnId)}"`);
          f.column.blocks.splice(f.index, 1);
          const at = int(op.index, 0, to.column.blocks.length, to.column.blocks.length);
          to.column.blocks.splice(at, 0, f.block);
          changed.add(f.block.id);
          break;
        }
        case "update_section": {
          const f = findSection(d, str(op.id));
          if (!f) throw new Error(`no section "${str(op.id)}"`);
          const set: Raw = isObj(op.set) ? { ...(op.set as Raw) } : {};
          delete set.id;
          delete set.columns;
          const { id, columns, ...fields } = f.section;
          const merged: Raw = { ...fields, ...set };
          d.sections[f.index] = { id, ...normSectionFields(merged), columns };
          changed.add(id);
          break;
        }
        case "insert_section": {
          const s = normSection(n, op.section, where);
          if (!s) throw new Error("invalid section");
          let at: number;
          if (op.after === "start") at = 0;
          else if (typeof op.after === "string" && op.after) {
            const f = findSection(d, op.after);
            if (!f) problems.push(`${where}: no section "${op.after}" to insert after; added at the end`);
            at = f ? f.index + 1 : d.sections.length;
          } else at = d.sections.length;
          // "At the end" means above the footer, unless this is a footer.
          if ((op.after === undefined || op.after === null) && !isFooterSection(s))
            while (at > 0 && FOOTERISH(d.sections[at - 1])) at--;
          d.sections.splice(at, 0, s);
          changed.add(s.id);
          break;
        }
        case "remove_section": {
          const f = findSection(d, str(op.id));
          if (!f) throw new Error(`no section "${str(op.id)}"`);
          d.sections.splice(f.index, 1);
          changed.add(f.section.id);
          break;
        }
        case "move_section": {
          const f = findSection(d, str(op.id));
          if (!f) throw new Error(`no section "${str(op.id)}"`);
          d.sections.splice(f.index, 1);
          d.sections.splice(int(op.index, 0, d.sections.length, d.sections.length), 0, f.section);
          changed.add(f.section.id);
          break;
        }
        case "set_columns": {
          const f = findSection(d, str(op.sectionId));
          if (!f) throw new Error(`no section "${str(op.sectionId)}"`);
          if (!Array.isArray(op.columns) || !op.columns.length) throw new Error("columns must be a non-empty list");
          const old = new Map(f.section.columns.flatMap((c) => c.blocks).map((b) => [b.id, b] as const));
          const oldColIds = f.section.columns.map((c) => c.id);
          // Ids of this section are free to reuse; the rest of the doc keeps its own.
          for (const c of f.section.columns) {
            n.used.delete(c.id);
            for (const b of c.blocks) n.used.delete(b.id);
          }
          const inputs = (op.columns as unknown[]).filter(isObj).map((c) => ({
            ...c,
            blocks: (Array.isArray(c.blocks) ? c.blocks : []).map((b) => {
              // { id } alone (or without a type) refers to a block already in the section.
              if (isObj(b) && typeof b.id === "string" && old.has(b.id) && !b.type) return { ...old.get(b.id), ...b, type: old.get(b.id)!.type };
              return b;
            }),
          }));
          if (inputs.every((c) => !c.blocks.length) && old.size) inputs[0].blocks = [...old.values()];
          const cols = normColumns(n, inputs, where);
          cols.forEach((c, j) => {
            if (!(op.columns as unknown as Raw[])[j]?.id && oldColIds[j] && !cols.some((x) => x.id === oldColIds[j])) c.id = oldColIds[j];
          });
          const kept = new Set(cols.flatMap((c) => c.blocks.map((b) => b.id)));
          const dropped = [...old.keys()].filter((id) => !kept.has(id));
          if (dropped.length) problems.push(`${where}: the new columns left out blocks ${dropped.join(", ")}; they were removed`);
          f.section.columns = cols;
          changed.add(f.section.id);
          break;
        }
        case "update_column": {
          const f = findColumn(d, str(op.id));
          if (!f) throw new Error(`no column "${str(op.id)}"`);
          const set: Raw = isObj(op.set) ? (op.set as Raw) : {};
          const { id, blocks, width } = f.column;
          const merged: Raw = { ...f.column, ...set };
          for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
          f.section.columns[f.index] = { id, blocks, width, ...normColumnFields(merged) };
          if (set.width !== undefined && f.section.columns.length > 1) {
            // Resize this column; the others share the rest in their old proportions.
            let w = num(set.width, 0, 100, width);
            if (w > 1) w = w / 100;
            w = Math.min(0.9, Math.max(0.1, w));
            const others = f.section.columns.filter((_, j) => j !== f.index);
            const otherSum = others.reduce((a, c) => a + c.width, 0) || 1;
            const ws = f.section.columns.map((c, j) => (j === f.index ? w : (c.width / otherSum) * (1 - w)));
            fixWidths(ws).forEach((x, j) => (f.section.columns[j].width = x));
          }
          changed.add(id);
          break;
        }
        case "set_subject": {
          if (op.subject !== undefined) d.subject = plain(op.subject, 200);
          if (op.preheader !== undefined) d.preheader = plain(op.preheader, 300);
          changed.add("subject");
          break;
        }
        case "set_theme": {
          const set: Raw = isObj(op.set) ? (op.set as Raw) : {};
          const presetBase = typeof set.id === "string" && !set.colors ? themePreset(set.id) : undefined;
          const base = presetBase ?? d.theme;
          const merged: Raw = {
            ...base,
            ...set,
            colors: { ...base.colors, ...(isObj(set.colors) ? set.colors : {}) },
            fonts: { ...base.fonts, ...(isObj(set.fonts) ? set.fonts : {}) },
            button: { ...base.button, ...(isObj(set.button) ? set.button : {}) },
          };
          d.theme = normalizeTheme(merged, base);
          changed.add("theme");
          break;
        }
        default:
          throw new Error(`unknown op "${str((rawOp as Raw).op, 40)}"`);
      }
    } catch (e) {
      problems.push(`${where}: ${e instanceof Error ? e.message : String(e)}; skipped`);
    }
  });

  const v = validateEmailDoc(d);
  return { doc: v.doc, problems: [...problems, ...v.problems], changed: [...changed] };
}

/* Personalisation ------------------------------------------------------------ */

/** The fields a person's version may replace, per block type. */
export const PERSONAL_FIELDS: Partial<Record<BlockType, string[]>> = {
  heading: ["text"],
  text: ["html"],
  image: ["src", "alt", "href"],
  button: ["label", "href"],
  items: ["itemIds", "reasons"],
  quote: ["text", "author"],
};

/** The doc as one person sees it: overrides on blocks marked personal; subject / preheader when given. */
export function applyPersonalization(doc: EmailDoc, p: Personalization | null | undefined): EmailDoc {
  if (!p) return doc;
  const d = clone(doc);
  if (typeof p.subject === "string" && p.subject.trim()) d.subject = plain(p.subject, 200);
  if (typeof p.preheader === "string" && p.preheader.trim()) d.preheader = plain(p.preheader, 300);
  const overrides = isObj(p.blocks) ? p.blocks : {};
  for (const [id, set] of Object.entries(overrides)) {
    const f = findBlock(d, id);
    if (!f || !f.block.personal || !isObj(set)) continue;
    const fields = PERSONAL_FIELDS[f.block.type] ?? [];
    const merged: Raw = { ...f.block };
    for (const k of fields) if ((set as Raw)[k] !== undefined && (set as Raw)[k] !== null) merged[k] = (set as Raw)[k];
    const b = normBlock({ used: new Set(), problems: [] }, merged, id);
    if (b) f.column.blocks[f.index] = b;
  }
  return d;
}

/* New docs and summaries ------------------------------------------------------ */

/** A logo header, an empty body and a footer. */
export function blankDoc(theme: EmailTheme, brandName: string): EmailDoc {
  const n: Norm = { used: new Set(), problems: [] };
  const footer = footerSection(n, brandName);
  footer.columns[0].blocks.unshift({ id: takeId(n, undefined, "b", "social"), type: "social", links: [], align: "center", style: "dark", padding: [0, 0, 16, 0] });
  return {
    kind: "email",
    version: 0,
    subject: "",
    preheader: "",
    theme,
    sections: [
      {
        id: takeId(n, undefined, "s", "header"),
        label: "Header",
        padding: [28, 32, 20, 32],
        columns: [{ id: takeId(n, undefined, "c", "header"), width: 1, blocks: [{ id: takeId(n, undefined, "b", "logo"), type: "logo", width: 150, align: "center" }] }],
      },
      { id: takeId(n, undefined, "s", "body"), label: "Body", padding: [24, 32, 32, 32], columns: [{ id: takeId(n, undefined, "c", "body"), width: 1, blocks: [] }] },
      footer,
    ],
  };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A short human label for a block: "Heading: Welcome in", "Button: Shop now". */
export function blockLabel(b: EmailBlock): string {
  const name = b.type[0].toUpperCase() + b.type.slice(1);
  switch (b.type) {
    case "heading":
      return `${name}: ${clip(htmlToText(b.text), 40)}`;
    case "text":
      return `Text: ${clip(htmlToText(b.html).replace(/\s+/g, " "), 40)}`;
    case "button":
      return `Button: ${clip(b.label, 30)}`;
    case "image":
      return `Image: ${clip(b.alt || "no alt text", 40)}`;
    case "items":
      return b.pick === "taste" ? `Picks (by taste, ${b.count})` : `Items (${b.itemIds.length})`;
    case "quote":
      return `Quote${b.author ? `: ${clip(b.author, 30)}` : ""}`;
    case "coupon":
      return `Coupon: ${b.code}`;
    default:
      return name;
  }
}

function blockLine(b: EmailBlock): string {
  const flags = [b.personal ? "personal" : "", b.hideOn ? `hidden on ${b.hideOn}` : ""].filter(Boolean).join(", ");
  const tail = flags ? ` (${flags})` : "";
  switch (b.type) {
    case "heading":
      return `heading h${b.level} ${b.align}: "${clip(htmlToText(b.text), 90)}"${tail}`;
    case "text":
      return `text: "${clip(htmlToText(b.html).replace(/\s+/g, " "), 140)}"${tail}`;
    case "image":
      return `image ${b.width}%: alt "${clip(b.alt, 60)}"${b.href ? ` → ${clip(b.href, 60)}` : ""}${b.src ? "" : " (no src)"}${tail}`;
    case "button":
      return `button ${b.variant ?? "solid"}: "${b.label}" → ${clip(b.href, 70)}${tail}`;
    case "items":
      return `items ${b.layout} ${b.columns} cols, pick ${b.pick}, count ${b.count}, ids [${b.itemIds.join(", ")}]${tail}`;
    case "quote":
      return `quote: "${clip(htmlToText(b.text), 90)}"${b.author ? ` — ${b.author}` : ""}${tail}`;
    case "coupon":
      return `coupon ${b.code}: "${b.label}"${tail}`;
    case "divider":
      return `divider ${b.width}% ${b.thickness}px ${b.style}`;
    case "spacer":
      return `spacer ${b.height}px`;
    case "social":
      return `social: ${b.links.map((l) => l.network).join(", ") || "brand links"}`;
    case "video":
      return `video: "${clip(b.alt, 60)}" → ${clip(b.href, 60)}${tail}`;
    case "footer":
      return `footer: "${clip(htmlToText(b.text), 80)}", unsubscribe "${b.unsubscribeLabel}"`;
    case "logo":
      return `logo ${b.width}px ${b.align}`;
  }
}

/** A compact outline of the doc for the agent: subject, theme, then every section, column and block with ids. */
export function docSummary(doc: EmailDoc): string {
  const t = doc.theme;
  const lines = [
    `Subject: ${doc.subject || "(none)"}`,
    `Preheader: ${doc.preheader || "(none)"}`,
    `Theme: ${t.name ?? t.id ?? "custom"} — ${t.fonts.heading.family} / ${t.fonts.body.family}; primary ${t.colors.primary}, accent ${t.colors.accent}, surface ${t.colors.surface}; buttons ${t.button.shape}`,
    `Sections (${doc.sections.length}):`,
  ];
  doc.sections.forEach((s, i) => {
    const bits = [s.background ? `bg ${s.background}` : "", s.backgroundImage ? "bg image" : "", s.columns.length > 1 ? `${s.columns.length} columns ${s.columns.map((c) => Math.round(c.width * 100)).join("/")}` : ""].filter(Boolean);
    lines.push(`${i + 1}. [${s.id}] ${s.label ?? "Section"}${bits.length ? ` (${bits.join(", ")})` : ""}`);
    if (s.evidence) lines.push(`   evidence: ${clip(s.evidence, 160)}`);
    s.columns.forEach((c, j) => {
      const indent = s.columns.length > 1 ? "     " : "   ";
      if (s.columns.length > 1) lines.push(`   column ${j + 1} [${c.id}]${c.background ? ` bg ${c.background}` : ""}`);
      else lines.push(`   column [${c.id}]`);
      if (!c.blocks.length) lines.push(`${indent}(empty)`);
      for (const b of c.blocks) lines.push(`${indent}- [${b.id}] ${blockLine(b)}`);
    });
  });
  return lines.join("\n");
}
