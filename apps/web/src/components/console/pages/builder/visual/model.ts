// The visual editor's model: what an element is called, which elements can
// be picked and typed into, element ids (data-pg-id), the hand-edit layer and
// the plain-words summary of a session's changes for the chat and the builder.
// Pure DOM work; it runs against the canvas iframe's document.

import type { HandEdits, HandElement, HandMotion } from "@slice/backend/convex/pagesTypes";

export type Scope = "style" | "phone" | "hover";

export const PG_ID = "data-pg-id";
/** Attributes the editor sets while it works; never saved. */
const TRANSIENT_ATTRS = ["contenteditable", "spellcheck", "data-pg-editing"];

const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
/** Text-level tags: an element made of these (and text) can be typed into. */
const INLINE = new Set(["A", "ABBR", "B", "BDI", "BDO", "BR", "CITE", "CODE", "DATA", "DFN", "EM", "I", "KBD", "MARK", "Q", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TIME", "U", "VAR", "WBR", "SVG", "LABEL", "OUTPUT"]);
const TEXT_TAGS = new Set([...HEADINGS, "P", "SPAN", "A", "BUTTON", "LI", "LABEL", "FIGCAPTION", "BLOCKQUOTE", "SMALL", "STRONG", "EM", "B", "I", "DT", "DD", "TH", "TD", "SUMMARY", "LEGEND", "Q", "CITE", "TIME", "MARK", "SUP", "SUB", "ADDRESS", "CAPTION", "U", "S"]);
const SKIP = new Set(["BR", "WBR", "SCRIPT", "STYLE", "TEMPLATE", "SOURCE"]);

export const newId = (taken: (id: string) => boolean) => {
  for (;;) {
    const id = `h${Math.random().toString(36).slice(2, 7)}`;
    if (id.length >= 5 && !taken(id)) return id;
  }
};

/* Picking ---------------------------------------------------------------------- */

/** The element the editor treats as hit for `node`: the outer <svg> for its shapes, nothing outside the page body. */
export function pickable(node: EventTarget | Node | null, body: Element): Element | null {
  // Duck-typed: nodes from the canvas iframe are not instances of this window's Node.
  const n = node as Node | null;
  let el: Element | null = n && typeof n.nodeType === "number" ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null;
  if (!el || !body.contains(el) || el === body) return null;
  const svg = el.closest("svg");
  if (svg && body.contains(svg)) el = svg;
  while (el && SKIP.has(el.tagName.toUpperCase())) el = el.parentElement;
  if (!el || el === body || !body.contains(el)) return null;
  return el;
}

/** Can the merchant type into `el`: text, made only of text-level children. */
export function isTextual(el: Element): boolean {
  const tag = el.tagName.toUpperCase();
  if (tag === "SVG" || tag === "IMG" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "VIDEO") return false;
  if (!el.textContent?.trim()) return false;
  const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue?.trim());
  if (!ownText && !TEXT_TAGS.has(tag)) return false;
  for (const child of el.querySelectorAll("*")) {
    const t = child.tagName.toUpperCase();
    if (!INLINE.has(t) && !child.closest("svg")) return false;
  }
  return true;
}

/** Only text inside (no child elements): the inspector can offer a text box. */
export const isPlainText = (el: Element) => isTextual(el) && el.children.length === 0;

/* Naming ----------------------------------------------------------------------- */

export const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

export const textOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

function isButtonLike(el: Element) {
  const tag = el.tagName.toUpperCase();
  if (tag === "BUTTON") return true;
  if (tag !== "A") return false;
  return el.hasAttribute("data-cta") || /\b(btn|button|cta)\b/i.test(el.getAttribute("class") ?? "");
}

export type Kind = "section" | "header" | "footer" | "nav" | "heading" | "text" | "button" | "link" | "image" | "video" | "icon" | "list" | "item" | "form" | "field" | "row" | "stack" | "grid" | "box" | "divider" | "quote";

export function kindOf(el: Element, win?: Window | null): Kind {
  const tag = el.tagName.toUpperCase();
  if (el.hasAttribute("data-section") && tag !== "HEADER" && tag !== "FOOTER") return "section";
  if (tag === "HEADER") return "header";
  if (tag === "FOOTER") return "footer";
  if (tag === "NAV") return "nav";
  if (HEADINGS.has(tag)) return "heading";
  if (isButtonLike(el)) return "button";
  if (tag === "A") return "link";
  if (tag === "IMG" || tag === "PICTURE") return "image";
  if (tag === "VIDEO") return "video";
  if (tag === "SVG") return "icon";
  if (tag === "UL" || tag === "OL" || tag === "DL") return "list";
  if (tag === "LI") return "item";
  if (tag === "FORM") return "form";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return "field";
  if (tag === "HR") return "divider";
  if (tag === "BLOCKQUOTE") return "quote";
  if (TEXT_TAGS.has(tag) && isTextual(el)) return "text";
  const display = win?.getComputedStyle(el).display ?? "";
  if (display.includes("grid")) return "grid";
  if (display.includes("flex")) {
    const dir = win?.getComputedStyle(el).flexDirection ?? "row";
    return dir.startsWith("column") ? "stack" : "row";
  }
  if (isTextual(el)) return "text";
  return "box";
}

export const KIND_NAME: Record<Kind, string> = {
  section: "Section",
  header: "Header",
  footer: "Footer",
  nav: "Navigation",
  heading: "Heading",
  text: "Text",
  button: "Button",
  link: "Link",
  image: "Image",
  video: "Video",
  icon: "Icon",
  list: "List",
  item: "List item",
  form: "Form",
  field: "Field",
  row: "Row",
  stack: "Stack",
  grid: "Grid",
  box: "Box",
  divider: "Divider",
  quote: "Quote",
};

/** Section labels by data-section id, from the doc. */
export type SectionNames = Map<string, string>;

const sectionName = (id: string, names: SectionNames) => names.get(id) ?? id.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** "Headline", "Button “Get tickets”", "Hero section": what the merchant would call it. */
export function nameOf(el: Element, names: SectionNames, win?: Window | null): string {
  const kind = kindOf(el, win);
  const tag = el.tagName.toUpperCase();
  if (kind === "section") return `${sectionName(el.getAttribute("data-section") ?? "", names)} section`;
  if (kind === "heading") return tag === "H1" ? "Headline" : tag === "H2" ? "Heading" : "Subheading";
  if (kind === "button" || kind === "link") {
    const t = clip(textOf(el), 28);
    return t ? `${KIND_NAME[kind]} “${t}”` : KIND_NAME[kind];
  }
  if (kind === "text") return tag === "P" ? "Paragraph" : "Text";
  if (kind === "image") return el.getAttribute("alt") ? `Image “${clip(el.getAttribute("alt") ?? "", 24)}”` : "Image";
  return KIND_NAME[kind];
}

/** The section an element is in (its nearest data-section, or itself). */
export function sectionOf(el: Element): Element | null {
  return el.closest("[data-section]");
}

/** "Headline in Hero": the name plus where it is, for the chat and the builder. */
export function labelOf(el: Element, names: SectionNames, win?: Window | null): string {
  const name = nameOf(el, names, win);
  const section = sectionOf(el);
  if (!section || section === el) return name;
  const where = sectionName(section.getAttribute("data-section") ?? "", names);
  return `${name} in ${where}`;
}

/** A short preview of the element for the layers list. */
export function previewOf(el: Element): string {
  const kind = el.tagName.toUpperCase();
  if (kind === "IMG") return el.getAttribute("alt") ?? "";
  if (isTextual(el)) return clip(textOf(el), 40);
  return "";
}

/* Hand-edit layer ---------------------------------------------------------------- */

export const emptyHand = (): HandEdits => ({ elements: {}, changes: [] });

export const cloneHand = (h: HandEdits): HandEdits => JSON.parse(JSON.stringify(h)) as HandEdits;

export type StyleRecord = Record<string, string>;

/** The value they set for `prop` in `scope`; phone falls back to every-screen values. */
export function handValue(el: HandElement | undefined, scope: Scope, prop: string): { value: string | undefined; inherited: boolean } {
  const own = el?.[scope]?.[prop];
  if (own !== undefined) return { value: own, inherited: false };
  if (scope === "phone" && el?.style?.[prop] !== undefined) return { value: el.style[prop], inherited: true };
  return { value: undefined, inherited: false };
}

/** Writes or clears declarations in a copy of the element's record. */
export function withStyles(el: HandElement, scope: Scope, set: Record<string, string | null>): HandElement {
  const decls: StyleRecord = { ...(el[scope] ?? {}) };
  for (const [prop, value] of Object.entries(set)) {
    if (value === null || value === "") delete decls[prop];
    else decls[prop] = value;
  }
  const next: HandElement = { ...el, at: Date.now() };
  if (Object.keys(decls).length) next[scope] = decls;
  else delete next[scope];
  return next;
}

export function withMotion(el: HandElement, patch: Partial<HandMotion> | null): HandElement {
  const next: HandElement = { ...el, at: Date.now() };
  if (patch === null) {
    delete next.motion;
    return next;
  }
  const m: HandMotion = { ...(el.motion ?? {}), ...patch };
  for (const k of Object.keys(m) as (keyof HandMotion)[]) if (m[k] === undefined || m[k] === "") delete m[k];
  if (!m.enter) {
    delete m.trigger;
    delete m.duration;
    delete m.delay;
    delete m.easing;
  }
  if (Object.keys(m).length) next.motion = m;
  else delete next.motion;
  return next;
}

/** Nothing left but a name: the record can go. */
export const isEmptyRecord = (el: HandElement) => !el.style && !el.phone && !el.hover && !el.motion && el.text === undefined && el.src === undefined && el.href === undefined;

/* Saving ------------------------------------------------------------------------- */

/** The page body's markup as it should be saved: no editor attributes, no ids nobody uses. */
export function serializeBody(body: Element, keepIds: Set<string>): string {
  const copy = body.cloneNode(true) as Element;
  for (const el of copy.querySelectorAll("*")) {
    for (const a of TRANSIENT_ATTRS) el.removeAttribute(a);
    const id = el.getAttribute(PG_ID);
    if (id && !keepIds.has(id)) el.removeAttribute(PG_ID);
  }
  return copy.innerHTML;
}

/** The hand layer to save: records for elements that still exist, labels and text marks refreshed. */
export function finalHand(hand: HandEdits, body: Element, names: SectionNames, win: Window | null, ops: string[]): HandEdits {
  const out: HandEdits = { elements: {}, changes: [...(hand.changes ?? [])] };
  for (const [id, rec] of Object.entries(hand.elements)) {
    const el = body.querySelector(`[${PG_ID}="${CSS.escape(id)}"]`);
    if (!el || isEmptyRecord(rec)) continue;
    const next: HandElement = { ...rec, label: labelOf(el, names, win) };
    if (next.text !== undefined) next.text = textOf(el);
    if (next.src !== undefined) next.src = el.getAttribute("src") ?? "";
    if (next.href !== undefined) next.href = el.getAttribute("href") ?? "";
    out.elements[id] = next;
  }
  const now = Date.now();
  out.changes = [...out.changes, ...ops.map((text) => ({ at: now, text }))].slice(-40);
  return out;
}

/* Summary ------------------------------------------------------------------------- */

const PROP_WORDS: Record<string, string> = {
  "background-color": "background",
  "background-image": "background image",
  background: "background",
  color: "text colour",
  "font-size": "text size",
  "font-weight": "weight",
  "font-family": "font",
  "font-style": "style",
  "line-height": "line height",
  "letter-spacing": "letter spacing",
  "text-align": "alignment",
  "text-transform": "case",
  "text-decoration-line": "decoration",
  "border-radius": "corners",
  "box-shadow": "shadow",
  opacity: "opacity",
  display: "display",
  "flex-direction": "direction",
  "justify-content": "distribution",
  "align-items": "alignment",
  gap: "gap",
  width: "width",
  height: "height",
  "max-width": "max width",
  "min-height": "min height",
  "object-fit": "image fit",
  "aspect-ratio": "aspect ratio",
};

function wordsFor(prop: string): string {
  if (PROP_WORDS[prop]) return PROP_WORDS[prop];
  if (prop.startsWith("padding")) return prop.replace("padding-", "padding ").replace("padding", "padding");
  if (prop.startsWith("margin")) return prop.replace("margin-", "margin ");
  if (prop.startsWith("border")) return prop.replace(/-/g, " ");
  return prop.replace(/-/g, " ");
}

const TOKEN_WORDS: Record<string, string> = {
  "--pg-brand-primary": "the brand's primary colour",
  "--pg-brand-primary-fg": "the brand's colour on primary",
  "--pg-brand-accent": "the brand's accent",
  "--pg-brand-bg": "the brand's background colour",
  "--pg-brand-fg": "the brand's text colour",
  "--pg-brand-muted": "the brand's muted colour",
  "--pg-brand-surface": "the brand's surface colour",
  "--pg-font-heading": "the heading font",
  "--pg-font-body": "the body font",
};

/** Kit tokens in plain words ("var(--pg-brand-fg)" → "the brand's text colour"). */
const valueWords = (v: string) => v.replace(/var\((--pg-[a-z-]+)\)/g, (m, t: string) => TOKEN_WORDS[t] ?? m);

function diffDecls(before: StyleRecord | undefined, after: StyleRecord | undefined): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    const a = before?.[k];
    const b = after?.[k];
    if (a === b) continue;
    out.push(b === undefined ? `${wordsFor(k)} back to the page's style` : `${wordsFor(k)} ${clip(valueWords(b), 60)}`);
  }
  return out;
}

const ENTER_WORDS: Record<string, string> = { fade: "fades in", "fade-up": "fades up", "fade-down": "fades down", "slide-left": "slides in from the left", "slide-right": "slides in from the right", zoom: "zooms in", blur: "comes into focus" };

function diffMotion(a: HandMotion | undefined, b: HandMotion | undefined): string[] {
  const out: string[] = [];
  if ((a?.enter ?? "") !== (b?.enter ?? "") || (a?.trigger ?? "") !== (b?.trigger ?? "")) {
    out.push(b?.enter ? `${ENTER_WORDS[b.enter] ?? b.enter} ${b.trigger === "scroll" ? "when scrolled into view" : "on load"}` : "no entrance animation");
  } else if (b?.enter && (a?.duration !== b.duration || a?.delay !== b.delay || a?.easing !== b.easing)) out.push("entrance timing");
  if ((a?.hoverEffect ?? "") !== (b?.hoverEffect ?? "")) out.push(b?.hoverEffect ? `${b.hoverEffect} on hover` : "no hover effect");
  return out;
}

/** One line per change, in plain words: the structural ops, then what changed on each element. */
export function summarize(before: HandEdits, after: HandEdits, ops: string[]): string[] {
  const lines = [...ops];
  const ids = new Set([...Object.keys(before.elements), ...Object.keys(after.elements)]);
  for (const id of ids) {
    const a = before.elements[id];
    const b = after.elements[id];
    if (!b) {
      // Gone with a removed element (the op says so), or every hand change on it was reset.
      if (a && !ops.some((o) => o.includes(a.label))) lines.push(`${a.label}: back to the builder's design`);
      continue;
    }
    const parts: string[] = [];
    if (b.text !== undefined && b.text !== a?.text) parts.push(`text “${clip(b.text, 90)}”`);
    if (b.src !== undefined && b.src !== a?.src) parts.push("new picture");
    if (b.href !== undefined && b.href !== a?.href) parts.push(`link ${clip(b.href, 60)}`);
    parts.push(...diffDecls(a?.style, b.style));
    const phone = diffDecls(a?.phone, b.phone);
    if (phone.length) parts.push(`on phones: ${phone.join(", ")}`);
    const hover = diffDecls(a?.hover, b.hover);
    if (hover.length) parts.push(`on hover: ${hover.join(", ")}`);
    parts.push(...diffMotion(a?.motion, b.motion));
    if (parts.length) lines.push(`${b.label}: ${parts.join(", ")}`);
  }
  return lines.slice(0, 40);
}
