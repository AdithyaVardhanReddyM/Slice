// The email renderer: one function set for the editor canvas, previews,
// tests and sends. Output is production email HTML: 600 px table layout,
// role="presentation" tables, inline styles on every element with bgcolor
// beside CSS backgrounds, bulletproof buttons, a hidden preheader, a mobile
// media query that stacks `.col` cells, Outlook (Word engine) fallbacks in
// conditional comments, and no SVG (Gmail drops it). Plain TypeScript (no
// Convex imports, no DOM): it runs in Convex, Next and the browser.
//
// See docs/email-plan.md ("emailRender.ts") for the contract.

import type {
  Align,
  Box,
  ButtonBlock,
  ColorRef,
  CouponBlock,
  DividerBlock,
  EmailBlock,
  EmailDoc,
  EmailFooterInfo,
  EmailItem,
  EmailKit,
  EmailSection,
  EmailTheme,
  FooterBlock,
  HeadingBlock,
  ImageBlock,
  ItemsBlock,
  LogoBlock,
  MergeKey,
  QuoteBlock,
  SocialBlock,
  SocialNetwork,
  SpacerBlock,
  TextBlock,
  VideoBlock,
} from "./emailTypes";
import { MERGE_TAGS } from "./emailTypes";
import { DEFAULT_HEADING_SIZE, decodeEntities, escapeHtml, htmlToText, safeHref } from "./emailDoc";
import { bodyBold, contrast, fontStack, googleFontsHrefs, headingWeight, isColorToken, isDark, linkOn, mix, mutedOn, onColor, parseColor, resolveColor, sameColor } from "./emailThemes";

export interface RenderContext {
  /** Items for items blocks, by id. Missing ids are skipped. */
  items: Record<string, EmailItem>;
  brand: { name: string; logo?: EmailKit["logo"]; wordmark?: string; footer?: EmailFooterInfo };
  /** Recipient values for merge tags; absent → fallbacks / example values in "edit". */
  merge?: Partial<Record<MergeKey, string>>;
  links?: {
    unsubscribe?: string; // default "#unsubscribe"
    viewOnline?: string;
    /** Rewrites every href for click tracking (blockId lets the report group clicks). */
    track?: (href: string, blockId: string) => string;
    /** 1x1 open pixel URL appended to the body. */
    openPixel?: string;
  };
  /** "edit": adds data-block-id/data-section-id attributes, shows merge tags as chips, no tracking. */
  mode: "send" | "preview" | "edit";
}

/** What renderBlockHtml needs beyond the RenderContext. `first` / `last` drop the default outer spacing. */
export type BlockRenderContext = RenderContext & {
  theme: EmailTheme;
  /** The fill behind the block: its column's background, else its section's. */
  sectionBackground?: ColorRef;
  /** Inner width of the column in px (after column padding). */
  columnWidthPx: number;
  first?: boolean;
  last?: boolean;
};

/* Small helpers --------------------------------------------------------------- */

const attr = (s: string) => escapeHtml(s);
const boxCss = (b: Box) => `${b[0]}px ${b[1]}px ${b[2]}px ${b[3]}px`;
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Inline style string from a camelCase style object (undefined and "" skipped). */
export function styleString(s: Record<string, string | undefined>): string {
  return Object.entries(s)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${kebab(k)}:${v}`)
    .join(";");
}

const compact = (s: Record<string, string | undefined>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) if (v !== undefined && v !== "") out[k] = v;
  return out;
};

const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

const fillOf = (ref: ColorRef | undefined, theme: EmailTheme) => resolveColor(ref, theme) ?? theme.colors.surface;

/** A nested table's align attribute: only "center" (align="left"/"right" floats the table and text wraps beside it). */
const tableAlign = (a: Align) => (a === "center" ? ' align="center"' : "");

const alignMargin = (a: Align) => (a === "center" ? "0 auto" : a === "right" ? "0 0 0 auto" : "0");

/** Outer spacing a block gets when it has no padding of its own. */
const DEFAULT_PAD: Record<EmailBlock["type"], Box> = {
  logo: [0, 0, 0, 0],
  heading: [0, 0, 12, 0],
  text: [0, 0, 16, 0],
  image: [0, 0, 16, 0],
  button: [8, 0, 16, 0],
  divider: [12, 0, 12, 0],
  spacer: [0, 0, 0, 0],
  items: [0, 0, 16, 0],
  social: [0, 0, 16, 0],
  quote: [0, 0, 16, 0],
  coupon: [0, 0, 16, 0],
  video: [0, 0, 16, 0],
  footer: [0, 0, 0, 0],
};

function padFor(b: EmailBlock, ctx: BlockRenderContext): Box {
  if (b.padding) return b.padding;
  const d: Box = b.type === "heading" ? (b.level === 1 ? [0, 0, 16, 0] : b.level === 3 ? [0, 0, 8, 0] : [0, 0, 12, 0]) : [...DEFAULT_PAD[b.type]];
  return [ctx.first ? 0 : d[0], d[1], ctx.last ? 0 : d[2], d[3]];
}

/* Merge tags -------------------------------------------------------------------- */

const MERGE_RE = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^}]*))?\}\}/g;
const mergeLabel = (k: string) => MERGE_TAGS.find((t) => t.key === k)?.label ?? k.replace(/_/g, " ");

/**
 * Fill `{{key}}` / `{{key|fallback}}` in (already escaped) HTML. send / preview:
 * the recipient's value, else the fallback, else nothing. edit: an inline chip
 * `<span data-merge="key">First name</span>` the editor turns back into the tag.
 */
export function fillMerge(text: string, merge: RenderContext["merge"], mode: RenderContext["mode"]): string {
  return String(text ?? "").replace(MERGE_RE, (_m, rawKey: string, fb: string | undefined) => {
    const key = rawKey.toLowerCase();
    if (mode === "edit") {
      const fallback = fb?.trim() ? ` data-fallback="${attr(decodeEntities(fb.trim()))}"` : "";
      return `<span data-merge="${attr(key)}"${fallback} contenteditable="false" style="display:inline-block;padding:0 0.45em;margin:0 0.05em;border-radius:999px;background-color:rgba(127,127,127,0.16);box-shadow:inset 0 0 0 1px rgba(127,127,127,0.3);font-size:0.82em;line-height:1.45;font-weight:500;vertical-align:0.06em;white-space:nowrap">${escapeHtml(mergeLabel(key))}</span>`;
    }
    const v = merge?.[key as MergeKey];
    if (v !== undefined && v !== null && String(v).trim()) return escapeHtml(String(v));
    return fb !== undefined ? fb.trim() : "";
  });
}

/** Merge tags in plain text: value, else fallback, else nothing. */
export function fillMergePlain(text: string, merge: RenderContext["merge"]): string {
  return String(text ?? "").replace(MERGE_RE, (_m, k: string, fb: string | undefined) => {
    const v = merge?.[k.toLowerCase() as MergeKey];
    return v && String(v).trim() ? String(v) : decodeEntities(fb?.trim() ?? "");
  });
}

const mergeOf = (ctx: RenderContext): RenderContext["merge"] => ({ brand: ctx.brand.name, ...(ctx.merge ?? {}) });

/** A plain-text field (label, name, code) as HTML with merge tags filled. */
const plainHtml = (s: string, ctx: RenderContext) => fillMerge(escapeHtml(s ?? ""), mergeOf(ctx), ctx.mode);

/** A link target: merge tags filled (URL-encoded), tracked in send mode, escaped for the attribute. */
function hrefFor(raw: string | undefined, blockId: string, ctx: RenderContext): string {
  let h = safeHref(raw ?? "#");
  if (ctx.mode !== "edit") {
    const merge = mergeOf(ctx);
    h = h.replace(MERGE_RE, (_m, k: string, fb: string | undefined) => {
      const v = merge?.[k.toLowerCase() as MergeKey];
      return encodeURIComponent(v && String(v).trim() ? String(v) : decodeEntities(fb?.trim() ?? ""));
    });
  }
  if (ctx.mode === "send" && ctx.links?.track && /^https?:\/\//i.test(h)) h = ctx.links.track(h, blockId);
  return attr(h);
}

/** Sanitised inline / rich HTML made email-ready: links styled and tracked, paragraphs and lists spaced. */
function richHtml(html: string, ctx: RenderContext, blockId: string, opts: { link: string; gap: number }): string {
  let out = fillMerge(html, mergeOf(ctx), ctx.mode);
  out = out.replace(/<a href="([^"]*)">/g, (_m, h: string) => `<a href="${hrefFor(decodeEntities(h), blockId, ctx)}" target="_blank" style="color:${opts.link};text-decoration:underline">`);
  const p = `<p style="margin:0 0 ${opts.gap}px 0">`;
  const ul = (tag: string) => `<${tag} style="margin:0 0 ${opts.gap}px 0;padding:0 0 0 22px">`;
  out = out.replace(/<p>/g, p).replace(/<ul>/g, ul("ul")).replace(/<ol>/g, ul("ol")).replace(/<li>/g, '<li style="margin:0 0 6px 0">');
  // The last paragraph or list sits flush with the block's own spacing.
  const tail = /(<(p|ul|ol) style="margin:0 0 )\d+(px 0[^"]*">)(?![\s\S]*<(p|ul|ol) style=)/;
  if (/<\/(p|ul|ol)>\s*$/.test(out)) out = out.replace(tail, "$10$3");
  return out;
}

/* Text styles --------------------------------------------------------------------- */

const headingLineHeight = (size: number) => (size >= 44 ? 1.08 : size >= 32 ? 1.15 : size >= 24 ? 1.22 : 1.3);

interface ButtonLook {
  fill: string;
  label: string;
  variant: "solid" | "outline";
  radius: number;
  fontSize: number;
  padY: number;
  padX: number;
  uppercase: boolean;
}

const BUTTON_SIZES = { sm: { fs: 13, py: 9, px: 18 }, md: { fs: 15, py: 13, px: 28 }, lg: { fs: 17, py: 16, px: 36 } } as const;

/** The email's plain fills (surface, muted, backdrop), as opposed to colour bands. */
function isPlain(bg: ColorRef | undefined, theme: EmailTheme): boolean {
  if (!bg || bg === "surface" || bg === "muted" || bg === "backdrop") return true;
  const hex = resolveColor(bg, theme);
  const c = theme.colors;
  return [c.surface, c.muted, c.backdrop].some((x) => sameColor(hex, x));
}

function buttonLook(b: ButtonBlock, theme: EmailTheme, bg?: ColorRef): ButtonLook {
  const bgHex = fillOf(bg, theme);
  const variant = b.variant ?? "solid";
  let fillRef: ColorRef = b.color ?? "primary";
  let fill = resolveColor(fillRef, theme) ?? theme.colors.primary;
  // A button on a band of its own colour (or one it can't be seen on) takes the
  // band's text colour; outline buttons on any colour band do too.
  const needs = variant === "solid" ? 1.4 : 2.5;
  if (!b.color && (sameColor(fill, bgHex) || contrast(fill, bgHex) < needs || (variant === "outline" && !isPlain(bg, theme)))) {
    fill = onColor(bg, theme);
    fillRef = fill;
  }
  const label = resolveColor(b.textColor, theme) ?? (variant === "solid" ? onColor(fillRef, theme) : fill);
  const shape = b.shape ?? theme.button.shape;
  const size = BUTTON_SIZES[b.size ?? "md"];
  const uppercase = theme.button.uppercase;
  return {
    fill,
    label,
    variant,
    radius: shape === "pill" ? 999 : shape === "rounded" ? Math.min(12, Math.max(4, theme.radius)) : 0,
    fontSize: uppercase ? size.fs - 1 : size.fs,
    padY: size.py,
    padX: size.px,
    uppercase,
  };
}

/**
 * A text colour on a fill. A theme token that all but disappears there (a
 * yellow accent on a white band) gives way to the fill's readable colour;
 * fixed hex colours are the merchant's call and stay.
 */
function textColor(ref: ColorRef | undefined, theme: EmailTheme, bg?: ColorRef): string {
  const c = resolveColor(ref, theme);
  if (!c) return onColor(bg, theme);
  if (isColorToken(ref) && contrast(c, fillOf(bg, theme)) < 2) return onColor(bg, theme);
  return c;
}

/**
 * The text style of a heading, text block or button label, as a React-ready
 * camelCase style object. The renderer and the editor's inline editing share it.
 */
export function textStyle(block: HeadingBlock | TextBlock | ButtonBlock, theme: EmailTheme, sectionBackground?: ColorRef): Record<string, string> {
  const hf = fontStack(theme.fonts.heading);
  const bf = fontStack(theme.fonts.body);
  const ink = (ref: ColorRef | undefined) => textColor(ref, theme, sectionBackground);
  if (block.type === "heading") {
    const size = block.size ?? DEFAULT_HEADING_SIZE[block.level] ?? 26;
    const body = block.font === "body";
    return compact({
      margin: "0",
      fontFamily: body ? bf : hf,
      fontSize: `${size}px`,
      lineHeight: `${Math.round(size * headingLineHeight(size))}px`,
      fontWeight: String(block.weight ?? (body ? bodyBold(theme) : headingWeight(theme))),
      color: ink(block.color),
      letterSpacing: block.letterSpacing !== undefined ? `${block.letterSpacing}px` : block.uppercase ? "0.06em" : undefined,
      textTransform: block.uppercase ? "uppercase" : undefined,
      textAlign: block.align,
    });
  }
  if (block.type === "text") {
    const size = block.size ?? 16;
    return compact({
      fontFamily: bf,
      fontSize: `${size}px`,
      lineHeight: `${Math.round(size * (block.lineHeight ?? 1.6))}px`,
      color: ink(block.color),
      textAlign: block.align,
    });
  }
  const look = buttonLook(block, theme, sectionBackground);
  return compact({
    fontFamily: bf,
    fontSize: `${look.fontSize}px`,
    lineHeight: `${Math.round(look.fontSize * 1.25)}px`,
    fontWeight: String(bodyBold(theme)),
    color: look.label,
    letterSpacing: look.uppercase ? "0.08em" : "0.01em",
    textTransform: look.uppercase ? "uppercase" : undefined,
    textAlign: "center",
  });
}

/** The section's box as a React-ready style object (the editor canvas wraps sections in it). */
export function sectionStyle(section: EmailSection, theme: EmailTheme): Record<string, string> {
  const bg = resolveColor(section.background, theme);
  return compact({
    backgroundColor: bg,
    backgroundImage: section.backgroundImage
      ? `linear-gradient(${scrim(bg ?? theme.colors.surface)}, ${scrim(bg ?? theme.colors.surface)}), url("${section.backgroundImage.replace(/"/g, "%22")}")`
      : undefined,
    backgroundSize: section.backgroundImage ? "cover" : undefined,
    backgroundPosition: section.backgroundImage ? "center" : undefined,
    backgroundRepeat: section.backgroundImage ? "no-repeat" : undefined,
    padding: boxCss(section.padding ?? DEFAULT_SECTION_PADDING),
    color: onColor(section.background, theme),
  });
}

export const DEFAULT_SECTION_PADDING: Box = [24, 32, 24, 32];

/* Blocks ------------------------------------------------------------------------------ */

/** The block's own table: its spacing, alignment, hide-on rules and (edit) data attributes. */
function wrapBlock(b: EmailBlock, ctx: BlockRenderContext, inner: string, align: Align = "left"): string {
  const pad = padFor(b, ctx);
  const hide = ctx.mode === "edit" ? undefined : b.hideOn;
  const cls = hide === "mobile" ? ' class="hide-m"' : hide === "desktop" ? ' class="show-m"' : "";
  const hidden = hide === "desktop" ? "display:none;max-height:0;overflow:hidden;mso-hide:all;" : "";
  const data = ctx.mode === "edit" ? ` data-block-id="${attr(b.id)}" data-block-type="${b.type}"` : "";
  return `<table ${TABLE} width="100%"${cls}${data} style="${hidden}width:100%;border-collapse:collapse"><tr><td align="${align}" style="padding:${boxCss(pad)};text-align:${align}">${inner}</td></tr></table>`;
}

/** A soft placeholder (edit mode only) for blocks that have nothing to show yet. */
function placeholder(ctx: BlockRenderContext, label: string, height: number, radius: number): string {
  const bgHex = fillOf(ctx.sectionBackground, ctx.theme);
  const fg = onColor(ctx.sectionBackground, ctx.theme);
  const fill = mix(bgHex, fg, 0.06);
  const line = mix(bgHex, fg, 0.25);
  return `<table ${TABLE} width="100%" style="width:100%;border-collapse:separate"><tr><td height="${height}" align="center" valign="middle" bgcolor="${fill}" style="height:${height}px;background-color:${fill};border:1px dashed ${line};border-radius:${radius}px;font-family:${fontStack(ctx.theme.fonts.body)};font-size:13px;line-height:18px;color:${mix(fg, bgHex, 0.35)};text-align:center">${escapeHtml(label)}</td></tr></table>`;
}

function headingHtml(b: HeadingBlock, ctx: BlockRenderContext): string {
  const st = textStyle(b, ctx.theme, ctx.sectionBackground);
  const size = parseInt(st.fontSize, 10);
  const cls = [b.font === "body" ? "bf" : "hf", size >= 30 ? `fs${size}` : ""].filter(Boolean).join(" ");
  const html = richHtml(b.text, ctx, b.id, { link: st.color, gap: 0 });
  const content = html || (ctx.mode === "edit" ? `<span style="opacity:0.4">Heading</span>` : "");
  if (!content) return "";
  return wrapBlock(b, ctx, `<h${b.level} class="${cls}" style="${styleString(st)};mso-line-height-rule:exactly">${content}</h${b.level}>`, b.align);
}

function textHtml(b: TextBlock, ctx: BlockRenderContext): string {
  const st = textStyle(b, ctx.theme, ctx.sectionBackground);
  const size = parseInt(st.fontSize, 10);
  const html = richHtml(b.html, ctx, b.id, { link: resolveColor(b.color, ctx.theme) ? st.color : linkOn(ctx.sectionBackground, ctx.theme), gap: Math.round(size * 0.85) });
  const content = html || (ctx.mode === "edit" ? `<span style="opacity:0.4">Write something…</span>` : "");
  if (!content) return "";
  return wrapBlock(b, ctx, `<div class="bf" style="${styleString(st)};mso-line-height-rule:exactly">${content}</div>`, b.align);
}

function imageHtml(b: ImageBlock, ctx: BlockRenderContext): string {
  const pad = padFor(b, ctx);
  const colW = Math.max(40, ctx.columnWidthPx - pad[1] - pad[3]);
  const w = Math.round((colW * b.width) / 100);
  const fullBleed = ctx.columnWidthPx >= ctx.theme.width - 1;
  const radius = b.radius ?? (fullBleed ? 0 : ctx.theme.radius);
  if (!b.src) return ctx.mode === "edit" ? wrapBlock(b, ctx, placeholder(ctx, "Add an image", Math.round(w * 0.56), radius), b.align) : "";
  const alt = ctx.mode === "edit" ? b.alt : fillMergePlain(b.alt, mergeOf(ctx));
  const img = `<img src="${attr(b.src)}" alt="${attr(alt)}" width="${w}"${b.width === 100 ? ' class="fluid"' : ""} style="display:block;width:100%;max-width:${w}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:${radius}px;margin:${alignMargin(b.align)}">`;
  const inner = b.href ? `<a href="${hrefFor(b.href, b.id, ctx)}" target="_blank" style="text-decoration:none">${img}</a>` : img;
  return wrapBlock(b, ctx, inner, b.align);
}

function buttonHtml(b: ButtonBlock, ctx: BlockRenderContext): string {
  const look = buttonLook(b, ctx.theme, ctx.sectionBackground);
  const st = textStyle(b, ctx.theme, ctx.sectionBackground);
  const border = look.variant === "outline" ? 2 : 0;
  const py = look.padY - border;
  const px = look.padX - border;
  const full = !!b.fullWidth;
  const tdStyle = [
    `border-radius:${look.radius}px`,
    look.variant === "solid" ? `background-color:${look.fill}` : "",
    border ? `border:${border}px solid ${look.fill}` : "",
    `mso-padding-alt:${py}px ${px}px`,
  ]
    .filter(Boolean)
    .join(";");
  const aStyle = `display:${full ? "block" : "inline-block"};padding:${py}px ${px}px;${styleString(st)};text-decoration:none;border-radius:${look.radius}px;mso-line-height-rule:exactly`;
  const label = plainHtml(b.label, ctx);
  const inner = `<table ${TABLE}${full ? ' width="100%"' : ""} ${tableAlign(b.align)} style="border-collapse:separate;${full ? "width:100%;" : ""}margin:${full ? "0" : alignMargin(b.align)}"><tr><td align="center"${look.variant === "solid" ? ` bgcolor="${look.fill}"` : ""} style="${tdStyle}"><a href="${hrefFor(b.href, b.id, ctx)}" target="_blank" class="bf" style="${aStyle}">${label}</a></td></tr></table>`;
  return wrapBlock(b, ctx, inner, b.align);
}

function dividerHtml(b: DividerBlock, ctx: BlockRenderContext): string {
  const bg = ctx.sectionBackground;
  const bgHex = fillOf(bg, ctx.theme);
  const onSurface = !bg || bg === "surface" || sameColor(bgHex, ctx.theme.colors.surface);
  let color = resolveColor(b.color, ctx.theme) ?? (onSurface ? ctx.theme.colors.border : mix(onColor(bg, ctx.theme), bgHex, 0.72));
  // A token that vanishes on this fill (a yellow accent on white) falls back to the primary colour.
  if (b.color && isColorToken(b.color) && contrast(color, bgHex) < 1.4) color = contrast(ctx.theme.colors.primary, bgHex) >= 1.4 ? ctx.theme.colors.primary : onColor(bg, ctx.theme);
  const inner = `<table ${TABLE} width="${b.width}%" align="center" style="width:${b.width}%;margin:0 auto;border-collapse:collapse"><tr><td style="border-top:${b.thickness}px ${b.style} ${color};font-size:0;line-height:0;mso-line-height-rule:exactly">&nbsp;</td></tr></table>`;
  return wrapBlock(b, ctx, inner, "center");
}

function spacerHtml(b: SpacerBlock, ctx: BlockRenderContext): string {
  const inner = `<table ${TABLE} width="100%" style="width:100%"><tr><td height="${b.height}" style="height:${b.height}px;font-size:0;line-height:${b.height}px;mso-line-height-rule:exactly">&nbsp;</td></tr></table>`;
  return wrapBlock(b, ctx, inner, "left");
}

function logoHtml(b: LogoBlock, ctx: BlockRenderContext): string {
  const logo = ctx.brand.logo;
  const name = ctx.brand.wordmark || ctx.brand.name || "Your brand";
  let inner: string;
  if (logo?.src) {
    // A dark logo on a dark section disappears: draw its light version there when the kit has one.
    const src = logo.light && !logo.onDark && isDark(fillOf(ctx.sectionBackground, ctx.theme)) ? logo.light : logo.src;
    inner = `<img src="${attr(src)}" alt="${attr(logo.alt || ctx.brand.name)}" width="${b.width}" style="display:block;width:100%;max-width:${b.width}px;height:auto;border:0;outline:none;text-decoration:none;margin:${alignMargin(b.align)}">`;
  } else {
    const size = Math.max(18, Math.min(38, Math.round(b.width / 5.2)));
    const color = onColor(ctx.sectionBackground, ctx.theme);
    inner = `<div class="hf" style="font-family:${fontStack(ctx.theme.fonts.heading)};font-size:${size}px;line-height:${Math.round(size * 1.15)}px;font-weight:${headingWeight(ctx.theme)};letter-spacing:-0.01em;color:${color};text-align:${b.align};mso-line-height-rule:exactly">${escapeHtml(name)}</div>`;
  }
  if (b.href) inner = `<a href="${hrefFor(b.href, b.id, ctx)}" target="_blank" style="text-decoration:none;color:inherit">${inner}</a>`;
  return wrapBlock(b, ctx, inner, b.align);
}

/* Items --------------------------------------------------------------------------------- */

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

interface ItemLook {
  fg: string;
  muted: string;
  frame: string;
  link: string;
  tint: string;
  radius: number;
  hf: string;
  bf: string;
  hw: number;
  bw: number;
}

function itemLook(ctx: BlockRenderContext): ItemLook {
  const t = ctx.theme;
  const bg = ctx.sectionBackground;
  const bgHex = fillOf(bg, t);
  const fg = onColor(bg, t);
  // Covers sit on a soft panel: muted on the email surface, the surface on a muted band, a tint elsewhere.
  const frame = sameColor(bgHex, t.colors.muted) ? t.colors.surface : sameColor(bgHex, t.colors.surface) ? t.colors.muted : mix(bgHex, fg, isDark(bgHex) ? 0.1 : 0.06);
  const accent = contrast(t.colors.accent, bgHex) >= 1.2 ? t.colors.accent : t.colors.primary;
  return {
    fg,
    muted: mutedOn(bg, t),
    frame,
    link: linkOn(bg, t),
    // A pale wash of the accent that still shows on the fill.
    tint: [0.82, 0.74, 0.64, 0.5].map((x) => mix(accent, bgHex, x)).find((c) => contrast(c, bgHex) >= 1.18) ?? mix(accent, bgHex, 0.5),
    radius: t.radius,
    hf: fontStack(t.fonts.heading),
    bf: fontStack(t.fonts.body),
    hw: headingWeight(t),
    bw: bodyBold(t),
  };
}

const isBook = (it: EmailItem) => it.kind === "book";

/** The item's picture at the given width: books as covers on a panel, everything else as a photo. */
function itemImage(it: EmailItem, w: number, look: ItemLook, href: string | null, coverH?: number): string {
  if (!it.image) return "";
  const link = (html: string) => (href ? `<a href="${href}" target="_blank" style="text-decoration:none">${html}</a>` : html);
  if (isBook(it)) {
    const ch = coverH ?? Math.round(Math.min(w * 0.62, 170) * 1.5);
    const cw = Math.round(ch / 1.5);
    const pv = Math.round(Math.max(14, Math.min(26, w * 0.1)));
    const img = `<img src="${attr(it.image)}" alt="${attr(it.name)}" width="${cw}" height="${ch}" style="display:block;margin:0 auto;width:auto;height:${ch}px;max-width:100%;border:0;outline:none;border-radius:2px;box-shadow:0 2px 8px rgba(0,0,0,0.18)">`;
    return `<table ${TABLE} width="100%" style="width:100%;border-collapse:separate"><tr><td align="center" valign="middle" height="${ch}" bgcolor="${look.frame}" style="height:${ch}px;padding:${pv}px 8px;background-color:${look.frame};border-radius:${look.radius}px;text-align:center">${link(img)}</td></tr></table>`;
  }
  return link(
    `<img src="${attr(it.image)}" alt="${attr(it.name)}" width="${w}" class="fluid" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;outline:none;border-radius:${look.radius}px">`,
  );
}

/** Name, subtitle, price, description, reason and button under (or beside) the picture. */
function itemText(b: ItemsBlock, it: EmailItem, ctx: BlockRenderContext, look: ItemLook, opts: { align: Align; nameSize: number; descMax: number; href: string | null }): string {
  const rows: string[] = [];
  const font = (f: string, size: number, lh: number, weight: number | string, color: string, extra = "") =>
    `font-family:${f};font-size:${size}px;line-height:${lh}px;font-weight:${weight};color:${color};mso-line-height-rule:exactly;${extra}`;
  const name = escapeHtml(it.name);
  rows.push(
    `<div class="hf" style="${font(look.hf, opts.nameSize, Math.round(opts.nameSize * 1.25), look.hw, look.fg)}">${opts.href ? `<a href="${opts.href}" target="_blank" style="color:${look.fg};text-decoration:none">${name}</a>` : name}</div>`,
  );
  if (b.show.subtitle && it.subtitle) rows.push(`<div class="bf" style="${font(look.bf, 14, 20, 400, look.muted, "padding-top:2px")}">${escapeHtml(it.subtitle)}</div>`);
  if (b.show.price && it.price) rows.push(`<div class="bf" style="${font(look.bf, 14, 20, look.bw, look.fg, "padding-top:6px")}">${escapeHtml(it.price)}</div>`);
  if (b.show.description && it.description) rows.push(`<div class="bf" style="${font(look.bf, 14, 21, 400, look.muted, "padding-top:8px")}">${escapeHtml(truncate(it.description, opts.descMax))}</div>`);
  const reason = b.show.reason ? b.reasons?.[it.id] : undefined;
  if (reason)
    rows.push(
      `<table ${TABLE}${tableAlign(opts.align)} style="margin:${alignMargin(opts.align)};border-collapse:separate"><tr><td bgcolor="${look.tint}" style="padding:5px 10px;border-radius:8px;background-color:${look.tint};${font(look.bf, 12, 17, 500, look.fg)};text-align:${opts.align}">${plainHtml(reason, ctx)}</td></tr></table>`,
    );
  const reasonPad = reason ? "padding-top:10px" : "";
  if (reason) rows[rows.length - 1] = `<div style="${reasonPad}">${rows[rows.length - 1]}</div>`;
  if (b.show.button && opts.href) {
    const btn: ButtonBlock = { id: b.id, type: "button", label: b.buttonLabel, href: it.url ?? "#", align: opts.align, size: "sm", variant: "outline" };
    const lk = buttonLook(btn, ctx.theme, ctx.sectionBackground);
    const st = textStyle(btn, ctx.theme, ctx.sectionBackground);
    rows.push(
      `<div style="padding-top:14px"><table ${TABLE}${tableAlign(opts.align)} style="margin:${alignMargin(opts.align)};border-collapse:separate"><tr><td align="center" style="border:1.5px solid ${lk.fill};border-radius:${lk.radius}px;mso-padding-alt:7px 16px"><a href="${opts.href}" target="_blank" class="bf" style="display:inline-block;padding:7px 16px;${styleString(st)};font-size:${lk.uppercase ? 12 : 13}px;line-height:16px;text-decoration:none;border-radius:${lk.radius}px">${plainHtml(b.buttonLabel, ctx)}</a></td></tr></table></div>`,
    );
  }
  return rows.join("");
}

function itemsGrid(b: ItemsBlock, items: (EmailItem | null)[], ctx: BlockRenderContext, colW: number, look: ItemLook): string {
  const cols = b.columns;
  const gutter = cols === 1 ? 0 : cols === 2 ? 24 : 20;
  const content = Math.floor((colW - gutter * (cols - 1)) / cols);
  const rowGap = 28;
  const books = items.some((it) => !it || isBook(it));
  // One cover height across the grid so rows line up.
  const coverH = Math.round(Math.min(content * 0.66, cols === 1 ? 160 : cols === 2 ? 136 : 112) * 1.5);
  const nameSize = cols === 3 ? 16 : cols === 2 ? 18 : 20;
  const lastRowStart = Math.floor((items.length - 1) / cols) * cols;
  const cells = items.map((it, i) => {
    const pos = i % cols;
    const pl = cols === 1 ? 0 : pos === 0 ? 0 : gutter / 2;
    const pr = cols === 1 ? 0 : pos === cols - 1 ? 0 : gutter / 2;
    const cellW = content + pl + pr;
    const pb = i >= lastRowStart ? 0 : rowGap;
    let body: string;
    if (!it) {
      body = itemPlaceholder(look, coverH);
    } else {
      const href = it.url ? hrefFor(it.url, b.id, ctx) : null;
      body = (b.show.image ? itemImage(it, content, look, href, books ? coverH : undefined) : "") + `<div style="padding-top:${b.show.image && it.image ? 14 : 0}px">${itemText(b, it, ctx, look, { align: "center", nameSize, descMax: cols === 3 ? 90 : 140, href })}</div>`;
    }
    const ghostOpen = i === 0 ? `<!--[if mso]><table ${TABLE} width="${colW}"><tr><td width="${cellW}" valign="top"><![endif]-->` : i % cols === 0 ? `<!--[if mso]></td></tr><tr><td width="${cellW}" valign="top"><![endif]-->` : `<!--[if mso]></td><td width="${cellW}" valign="top"><![endif]-->`;
    const div = `<div class="${cols > 1 ? "ic" : ""}" style="display:inline-block;vertical-align:top;width:100%;max-width:${cellW}px"><table ${TABLE} width="100%" style="width:100%"><tr><td class="${cols > 1 ? "icp" : ""}" valign="top" style="padding:0 ${pr}px ${pb}px ${pl}px;text-align:center">${body}</td></tr></table></div>`;
    return ghostOpen + div;
  });
  return `<table ${TABLE} width="100%" style="width:100%"><tr><td align="center" style="font-size:0;line-height:0;text-align:center">${cells.join("")}<!--[if mso]></td></tr></table><![endif]--></td></tr></table>`;
}

function itemsList(b: ItemsBlock, items: (EmailItem | null)[], ctx: BlockRenderContext, colW: number, look: ItemLook): string {
  const imgW = colW >= 400 ? 128 : 96;
  const rows = items.map((it, i) => {
    const sep = i === 0 ? "" : `border-top:1px solid ${mix(fillOf(ctx.sectionBackground, ctx.theme), look.fg, 0.14)};`;
    const pad = `${i === 0 ? 0 : 20}px 0 ${i === items.length - 1 ? 0 : 20}px 0`;
    if (!it) return `<tr><td style="${sep}padding:${pad}">${itemPlaceholder(look, 120)}</td></tr>`;
    const href = it.url ? hrefFor(it.url, b.id, ctx) : null;
    const pic = b.show.image && it.image ? itemImage(it, imgW, look, href, isBook(it) ? Math.round(imgW * 0.78 * 1.5) : undefined) : "";
    const text = itemText(b, it, ctx, look, { align: "left", nameSize: 19, descMax: 220, href });
    const inner = pic
      ? `<table ${TABLE} width="100%" style="width:100%"><tr><td width="${imgW}" valign="top" style="width:${imgW}px;padding-right:20px">${pic}</td><td valign="${isBook(it) ? "middle" : "top"}" style="text-align:left">${text}</td></tr></table>`
      : text;
    return `<tr><td style="${sep}padding:${pad}">${inner}</td></tr>`;
  });
  return `<table ${TABLE} width="100%" style="width:100%;border-collapse:collapse">${rows.join("")}</table>`;
}

/** A blank card for edit mode: the panel plus two quiet text bars. */
function itemPlaceholder(look: ItemLook, coverH: number): string {
  const h = Math.min(coverH, 200);
  const bar = (width: string, height: number, after: number) =>
    `<table ${TABLE} width="${width}" align="center" style="margin:0 auto"><tr><td height="${height}" style="height:${height}px;padding:0;font-size:0;line-height:0;background-color:${mix(look.frame, look.fg, 0.12)};border-radius:4px">&nbsp;</td></tr></table><div style="height:${after}px;font-size:0;line-height:0">&nbsp;</div>`;
  const cover = `<table ${TABLE} width="100%" style="width:100%;border-collapse:separate"><tr><td align="center" valign="middle" height="${h + 32}" style="height:${h + 32}px;background-color:${look.frame};border-radius:${look.radius}px"><table ${TABLE} width="${Math.round(h / 1.5)}" style="margin:0 auto;border-collapse:separate"><tr><td height="${h}" style="height:${h}px;border:1.5px dashed ${mix(look.frame, look.fg, 0.28)};border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr></table>`;
  return `${cover}<div style="height:14px;font-size:0;line-height:0">&nbsp;</div>${bar("70%", 12, 8)}${bar("45%", 10, 0)}`;
}

function itemsHtml(b: ItemsBlock, ctx: BlockRenderContext): string {
  const pad = padFor(b, ctx);
  const colW = Math.max(120, ctx.columnWidthPx - pad[1] - pad[3]);
  const look = itemLook(ctx);
  const limit = b.pick === "taste" ? b.count : 12;
  const items = b.itemIds
    .map((id) => ctx.items[id])
    .filter((x): x is EmailItem => !!x)
    .slice(0, limit);
  if (!items.length) {
    if (ctx.mode !== "edit") return "";
    const n = Math.min(b.layout === "list" ? 2 : b.columns, Math.max(1, b.count));
    const note = b.pick === "taste" ? "Picks appear here, chosen by each reader's taste" : "Choose the items to show here";
    const caption = `<div class="bf" style="font-family:${look.bf};font-size:13px;line-height:18px;color:${look.muted};text-align:center;padding:0 0 12px 0">${note}</div>`;
    const blanks = Array.from({ length: n }, () => null);
    return wrapBlock(b, ctx, caption + (b.layout === "list" ? itemsList(b, blanks, ctx, colW, look) : itemsGrid(b, blanks, ctx, colW, look)), "center");
  }
  const inner = b.layout === "list" ? itemsList(b, items, ctx, colW, look) : itemsGrid(b, items, ctx, colW, look);
  return wrapBlock(b, ctx, inner, b.layout === "list" ? "left" : "center");
}

/* Social, quote, coupon, video, footer ---------------------------------------------- */

/** icons8 glyph names; PNG with the colour in the URL (Gmail drops SVG). */
const SOCIAL_ICON: Record<SocialNetwork, string> = {
  instagram: "instagram-new",
  facebook: "facebook-new",
  x: "twitterx",
  tiktok: "tiktok",
  youtube: "youtube-play",
  linkedin: "linkedin",
  pinterest: "pinterest",
  threads: "threads",
  website: "globe",
};

const SOCIAL_NAME: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  threads: "Threads",
  website: "Website",
};

export const socialIconUrl = (network: SocialNetwork, hex: string) => `https://img.icons8.com/ios-filled/100/${hex.replace("#", "").toLowerCase()}/${SOCIAL_ICON[network] ?? "globe"}.png`;

function socialHtml(b: SocialBlock, ctx: BlockRenderContext): string {
  let links = b.links.length ? b.links : (ctx.brand.footer?.socials ?? []);
  if (!links.length && ctx.brand.footer?.website) links = [{ network: "website", url: ctx.brand.footer.website }];
  if (!links.length) {
    if (ctx.mode !== "edit") return "";
    links = (["instagram", "facebook", "x"] as SocialNetwork[]).map((network) => ({ network, url: "#" }));
  }
  const bgHex = fillOf(ctx.sectionBackground, ctx.theme);
  const color = b.style === "light" ? "#ffffff" : b.style === "brand" && contrast(ctx.theme.colors.primary, bgHex) >= 2 ? ctx.theme.colors.primary : onColor(ctx.sectionBackground, ctx.theme);
  const size = b.size ?? 24;
  const gap = Math.round(size * 0.45);
  const cells = links
    .map(
      (l, i) =>
        `<td style="padding:0 ${i === links.length - 1 ? 0 : gap}px 0 ${i === 0 ? 0 : gap}px"><a href="${hrefFor(l.url, b.id, ctx)}" target="_blank" style="text-decoration:none"><img src="${socialIconUrl(l.network, color)}" alt="${SOCIAL_NAME[l.network] ?? "Link"}" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;border:0;outline:none"></a></td>`,
    )
    .join("");
  return wrapBlock(b, ctx, `<table ${TABLE}${tableAlign(b.align)} style="margin:${alignMargin(b.align)}"><tr>${cells}</tr></table>`, b.align);
}

function quoteHtml(b: QuoteBlock, ctx: BlockRenderContext): string {
  const t = ctx.theme;
  const bg = ctx.sectionBackground;
  const bgHex = fillOf(bg, t);
  const fg = onColor(bg, t);
  const plainLen = htmlToText(b.text).length;
  const size = plainLen > 220 ? 17 : plainLen > 120 ? 19 : 22;
  const markColor = isPlain(bg, t) ? ([t.colors.accent, t.colors.primary].find((c) => contrast(c, bgHex) >= 2) ?? fg) : fg;
  const hf = fontStack(t.fonts.heading);
  const bf = fontStack(t.fonts.body);
  const text = richHtml(b.text, ctx, b.id, { link: fg, gap: 0 });
  if (!text && ctx.mode !== "edit") return "";
  // Georgia's curly mark reads as a quote in every theme; display sans marks look like slashes.
  const mark = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:72px;line-height:60px;height:44px;overflow:hidden;color:${markColor};text-align:${b.align};mso-line-height-rule:exactly">&ldquo;</div>`;
  const body = `<div class="hf" style="font-family:${hf};font-size:${size}px;line-height:${Math.round(size * 1.45)}px;font-weight:400;color:${fg};text-align:${b.align};mso-line-height-rule:exactly">${text || '<span style="opacity:0.4">A few words from a happy customer</span>'}</div>`;
  let who = "";
  if (b.author || b.role) {
    const name = b.author ? `<div class="bf" style="font-family:${bf};font-size:14px;line-height:20px;font-weight:${bodyBold(t)};color:${fg}">${plainHtml(b.author, ctx)}</div>` : "";
    const role = b.role ? `<div class="bf" style="font-family:${bf};font-size:13px;line-height:18px;color:${mutedOn(bg, t)}">${plainHtml(b.role, ctx)}</div>` : "";
    const avatar = b.avatar
      ? `<td valign="middle" style="padding-right:12px"><img src="${attr(b.avatar)}" alt="${attr(b.author ?? "")}" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:22px;border:0;object-fit:cover"></td>`
      : "";
    who = `<div style="padding-top:18px"><table ${TABLE}${tableAlign(b.align)} style="margin:${alignMargin(b.align)}"><tr>${avatar}<td valign="middle" style="text-align:${avatar ? "left" : b.align}">${name}${role}</td></tr></table></div>`;
  }
  return wrapBlock(b, ctx, mark + body + who, b.align);
}

function couponHtml(b: CouponBlock, ctx: BlockRenderContext): string {
  const t = ctx.theme;
  const bg = ctx.sectionBackground;
  const bgHex = fillOf(bg, t);
  const fg = onColor(bg, t);
  const line = isPlain(bg, t) && contrast(t.colors.primary, bgHex) >= 3 ? t.colors.primary : fg;
  const onSurface = sameColor(bgHex, t.colors.surface);
  const fill = onSurface ? t.colors.muted : undefined;
  const pad = padFor(b, ctx);
  const w = Math.min(440, ctx.columnWidthPx - pad[1] - pad[3]);
  const bf = fontStack(t.fonts.body);
  const label = `<div class="bf" style="font-family:${bf};font-size:15px;line-height:22px;color:${fg}">${plainHtml(b.label, ctx)}</div>`;
  const code = `<div class="bf" style="font-family:${bf};font-size:30px;line-height:38px;font-weight:${bodyBold(t)};letter-spacing:4px;color:${line};padding:8px 0 4px 0;mso-line-height-rule:exactly">${plainHtml(b.code, ctx)}</div>`;
  const note = b.note ? `<div class="bf" style="font-family:${bf};font-size:12px;line-height:18px;color:${mutedOn(bg, t)};padding-top:4px">${plainHtml(b.note, ctx)}</div>` : "";
  const inner = `<table ${TABLE} width="${w}"${tableAlign(b.align)} style="width:100%;max-width:${w}px;margin:${alignMargin(b.align)};border-collapse:separate"><tr><td align="center"${fill ? ` bgcolor="${fill}"` : ""} style="padding:22px 24px;border:2px dashed ${line};border-radius:${Math.min(t.radius, 16)}px;${fill ? `background-color:${fill};` : ""}text-align:center">${label}${code}${note}</td></tr></table>`;
  return wrapBlock(b, ctx, inner, b.align);
}

function videoHtml(b: VideoBlock, ctx: BlockRenderContext): string {
  const pad = padFor(b, ctx);
  const colW = Math.max(80, ctx.columnWidthPx - pad[1] - pad[3]);
  const w = Math.round((colW * b.width) / 100);
  const h = Math.round((w * 9) / 16);
  const radius = ctx.columnWidthPx >= ctx.theme.width - 1 ? 0 : ctx.theme.radius;
  if (!b.thumbnail) return ctx.mode === "edit" ? wrapBlock(b, ctx, placeholder(ctx, "Add a video link and a poster image", h, radius), b.align) : "";
  const href = hrefFor(b.href, b.id, ctx);
  const dark = "#1a1a1a";
  const play = `<table ${TABLE} align="center" style="margin:0 auto;border-collapse:separate"><tr><td width="68" height="68" align="center" valign="middle" bgcolor="#111111" style="width:68px;height:68px;border-radius:34px;background-color:rgba(0,0,0,0.62);text-align:center"><img src="https://img.icons8.com/ios-filled/100/ffffff/play.png" alt="Play" width="26" height="26" style="display:inline-block;width:26px;height:26px;border:0;margin-left:4px;vertical-align:middle"></td></tr></table>`;
  const inner = `<table ${TABLE} width="${w}"${tableAlign(b.align)} style="width:100%;max-width:${w}px;margin:${alignMargin(b.align)};border-collapse:separate"><tr><td class="vh" background="${attr(b.thumbnail)}" bgcolor="${dark}" height="${h}" valign="middle" align="center" style="height:${h}px;background-color:${dark};background-image:url('${attr(b.thumbnail)}');background-size:cover;background-position:center;background-repeat:no-repeat;border-radius:${radius}px"><!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${w}px;height:${h}px;"><v:fill type="frame" src="${attr(b.thumbnail)}" color="${dark}" /><v:textbox inset="0,0,0,0"><![endif]--><a href="${href}" target="_blank" title="${attr(b.alt)}" style="display:block;text-decoration:none"><table ${TABLE} width="100%" style="width:100%"><tr><td class="vh" height="${h}" valign="middle" align="center" style="height:${h}px">${play}</td></tr></table></a><!--[if gte mso 9]></v:textbox></v:rect><![endif]--></td></tr></table>`;
  return wrapBlock(b, ctx, inner, b.align);
}

function footerHtml(b: FooterBlock, ctx: BlockRenderContext): string {
  const t = ctx.theme;
  const bg = ctx.sectionBackground;
  const muted = mutedOn(bg, t);
  const bf = fontStack(t.fonts.body);
  const font = `font-family:${bf};font-size:12px;line-height:19px;color:${muted};text-align:${b.align};mso-line-height-rule:exactly`;
  const parts: string[] = [];
  const text = richHtml(b.text, ctx, b.id, { link: muted, gap: 0 });
  if (text) parts.push(`<div class="bf" style="${font}">${text}</div>`);
  const address = b.address || ctx.brand.footer?.address;
  if (address) parts.push(`<div class="bf" style="${font};padding-top:${text ? 8 : 0}px">${plainHtml(address, ctx)}</div>`);
  const unsub = ctx.links?.unsubscribe || "#unsubscribe";
  const linkStyle = `color:${muted};text-decoration:underline`;
  const links = [`<a href="${attr(ctx.mode === "edit" ? "#unsubscribe" : unsub)}" target="_blank" style="${linkStyle}">${plainHtml(b.unsubscribeLabel || "Unsubscribe", ctx)}</a>`];
  if (b.viewOnline) links.push(`<a href="${attr(ctx.mode === "edit" ? "#view-online" : ctx.links?.viewOnline || "#view-online")}" target="_blank" style="${linkStyle}">View in browser</a>`);
  parts.push(`<div class="bf" style="${font};padding-top:${parts.length ? 14 : 0}px">${links.join(`<span style="padding:0 8px">&middot;</span>`)}</div>`);
  return wrapBlock(b, ctx, parts.join(""), b.align);
}

/**
 * One block as self-contained markup (its own table). Its look depends only on
 * the width it is given, so the editor canvas can place it inside its own
 * wrappers. Returns "" for blocks with nothing to show outside edit mode.
 */
export function renderBlockHtml(block: EmailBlock, ctx: BlockRenderContext): string {
  switch (block.type) {
    case "heading":
      return headingHtml(block, ctx);
    case "text":
      return textHtml(block, ctx);
    case "image":
      return imageHtml(block, ctx);
    case "button":
      return buttonHtml(block, ctx);
    case "divider":
      return dividerHtml(block, ctx);
    case "spacer":
      return spacerHtml(block, ctx);
    case "logo":
      return logoHtml(block, ctx);
    case "items":
      return itemsHtml(block, ctx);
    case "social":
      return socialHtml(block, ctx);
    case "quote":
      return quoteHtml(block, ctx);
    case "coupon":
      return couponHtml(block, ctx);
    case "video":
      return videoHtml(block, ctx);
    case "footer":
      return footerHtml(block, ctx);
    default:
      return "";
  }
}

/* Sections and the document ---------------------------------------------------------- */

/** Pixel widths of a section's columns (after its padding and gaps); the last one takes the rounding. */
export function columnWidths(section: EmailSection, theme: EmailTheme): number[] {
  const pad = section.padding ?? DEFAULT_SECTION_PADDING;
  const inner = Math.max(100, (theme.width || 600) - pad[1] - pad[3]);
  const n = section.columns.length;
  const gap = n > 1 ? (section.gap ?? 24) : 0;
  const avail = inner - gap * (n - 1);
  const ws = section.columns.map((c) => Math.floor(avail * c.width));
  if (n) ws[n - 1] = avail - ws.slice(0, -1).reduce((a, b) => a + b, 0);
  return ws;
}

/** One section as a table row of the email body (`<tr>…</tr>`). */
export function renderSectionHtml(section: EmailSection, ctx: RenderContext & { theme: EmailTheme }): string {
  const theme = ctx.theme;
  const pad = section.padding ?? DEFAULT_SECTION_PADDING;
  const widths = columnWidths(section, theme);
  const n = section.columns.length;
  const gap = n > 1 ? (section.gap ?? 24) : 0;
  const stack = n > 1 && section.stackOnMobile !== false;
  const inner = widths.reduce((a, b) => a + b, 0) + gap * (n - 1);
  const edit = ctx.mode === "edit";

  const cells: string[] = [];
  section.columns.forEach((c, i) => {
    const cp: Box = c.padding ?? [0, 0, 0, 0];
    const bgRef = c.background ?? section.background;
    const colInner = Math.max(40, widths[i] - cp[1] - cp[3]);
    const blocks = c.blocks
      .map((b, j) => renderBlockHtml(b, { ...ctx, theme, sectionBackground: bgRef, columnWidthPx: colInner, first: j === 0, last: j === c.blocks.length - 1 }))
      .join("");
    const colBg = resolveColor(c.background, theme);
    const valign = c.verticalAlign ?? "top";
    const empty = edit
      ? `<div style="padding:18px 8px;border:1px dashed ${mix(fillOf(bgRef, theme), onColor(bgRef, theme), 0.25)};font-family:${fontStack(theme.fonts.body)};font-size:13px;line-height:18px;text-align:center;color:${mutedOn(bgRef, theme)}">Drop elements here</div>`
      : "&nbsp;";
    const pct = Math.round((widths[i] / inner) * 10000) / 100;
    cells.push(
      `<td${stack ? ' class="col"' : ""}${edit ? ` data-column-id="${attr(c.id)}"` : ""} width="${widths[i]}" valign="${valign}"${colBg ? ` bgcolor="${colBg}"` : ""} style="width:${n > 1 ? `${pct}%` : `${widths[i]}px`};vertical-align:${valign};padding:${boxCss(cp)};${colBg ? `background-color:${colBg};` : ""}">${blocks || empty}</td>`,
    );
    if (i < n - 1 && gap) cells.push(`<td${stack ? ' class="colgap"' : ""} width="${gap}" style="width:${gap}px;font-size:0;line-height:0">&nbsp;</td>`);
  });

  const bg = resolveColor(section.background, theme);
  const img = section.backgroundImage;
  const fallback = bg ?? theme.colors.surface;
  const cls = [pad[1] >= 24 && pad[3] >= 24 ? "sp" : "", pad[0] >= 48 ? "spt" : "", pad[2] >= 48 ? "spb" : ""].filter(Boolean).join(" ");
  const data = edit ? ` data-section-id="${attr(section.id)}"` : "";
  const columns = `<table ${TABLE} width="100%" style="width:100%"><tr>${cells.join("")}</tr></table>`;
  if (!img) {
    const style = `${bg ? `background-color:${bg};` : ""}padding:${boxCss(pad)}`;
    return `<tr><td${cls ? ` class="${cls}"` : ""}${data}${bg ? ` bgcolor="${bg}"` : ""} style="${style}">${columns}</td></tr>`;
  }
  // Photo backgrounds: the section colour as a fallback (Outlook gets the photo
  // through VML) and as a translucent scrim so text on a busy photo stays legible.
  const vmlOpen = `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${theme.width}px;"><v:fill type="frame" src="${attr(img)}" color="${fallback}" /><v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0"><![endif]-->`;
  const vmlClose = `<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->`;
  const outer = `background-color:${fallback};background-image:url('${attr(img)}');background-size:cover;background-position:center;background-repeat:no-repeat;padding:0`;
  return `<tr><td${data} bgcolor="${fallback}" background="${attr(img)}" style="${outer}">${vmlOpen}<table ${TABLE} width="100%" style="width:100%"><tr><td${cls ? ` class="${cls}"` : ""} style="background-color:${scrim(fallback)};padding:${boxCss(pad)}">${columns}</td></tr></table>${vmlClose}</td></tr>`;
}

const SCRIM_ALPHA = 0.55;
function scrim(color: string): string {
  const rgb = parseColor(color) ?? [0, 0, 0];
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${SCRIM_ALPHA})`;
}

const PREHEADER_FILL = "&#847;&zwnj;&nbsp;".repeat(110);

/** The full email: a complete `<!doctype html>` document. */
export function renderEmail(doc: EmailDoc, ctx: RenderContext): string {
  const theme = doc.theme;
  const W = theme.width || 600;
  const c = theme.colors;
  const merge = mergeOf(ctx);
  const sections = doc.sections.map((s) => renderSectionHtml(s, { ...ctx, theme })).join("");
  const subject = fillMerge(escapeHtml(doc.subject || ""), merge, ctx.mode === "edit" ? "preview" : ctx.mode);
  const preheader = doc.preheader ? fillMerge(escapeHtml(doc.preheader), merge, ctx.mode === "edit" ? "preview" : ctx.mode) : "";
  const fonts = googleFontsHrefs(theme);
  const fontLinks = fonts.length ? `<!--[if !mso]><!-->${fonts.map((h) => `<link href="${attr(h)}" rel="stylesheet" type="text/css">`).join("")}<!--<![endif]-->` : "";

  // Mobile type sizes for the big headings this email uses.
  const sizes = [...new Set([...sections.matchAll(/class="[^"]*\bfs(\d+)\b/g)].map((m) => +m[1]))];
  const fsRules = sizes
    .map((s) => {
      const m = Math.max(26, Math.round(s * 0.76));
      return `.fs${s}{font-size:${m}px!important;line-height:${Math.round(m * headingLineHeight(m))}px!important}`;
    })
    .join("");

  const style = `<style type="text/css">
:root{color-scheme:light;supported-color-schemes:light}
html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important}
body{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;height:auto}
a{text-decoration:none}
h1,h2,h3,p{margin:0}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important}
#MessageViewBody a{color:inherit;text-decoration:none;font-size:inherit;font-family:inherit;font-weight:inherit;line-height:inherit}
u + .body a{color:inherit;text-decoration:none;font-size:inherit;font-family:inherit;font-weight:inherit;line-height:inherit}
@media only screen and (max-width:620px){
.outer{padding:0!important}
.wrap{width:100%!important;max-width:100%!important}
.col{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box}
.colgap{display:block!important;width:100%!important;height:20px!important;line-height:20px!important}
.sp{padding-left:20px!important;padding-right:20px!important}
.spt{padding-top:36px!important}
.spb{padding-bottom:36px!important}
.fluid{width:100%!important;max-width:100%!important;height:auto!important}
.hide-m{display:none!important;max-height:0!important;overflow:hidden!important;mso-hide:all!important}
.show-m{display:table!important;max-height:none!important;overflow:visible!important}
.ic{width:50%!important;max-width:50%!important}
.icp{padding:0 6px 24px 6px!important}
.vh{height:190px!important}
${fsRules}
}
</style>`;
  const msoStyle = `<!--[if mso]><style type="text/css">body,table,td,div,p,a,span,li,h1,h2,h3{font-family:${theme.fonts.body.fallback || "Arial, sans-serif"}!important}.hf{font-family:${theme.fonts.heading.fallback || "Georgia, serif"}!important}</style><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->`;

  const pixel = ctx.mode === "send" && ctx.links?.openPixel ? `<img src="${attr(ctx.links.openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;overflow:hidden">` : "";

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${subject}</title>
${fontLinks}
${msoStyle}
${style}
</head>
<body class="body" bgcolor="${c.backdrop}" style="margin:0;padding:0;word-spacing:normal;background-color:${c.backdrop}">
${preheader ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${c.backdrop}">${preheader}${PREHEADER_FILL}</div>` : ""}
<table ${TABLE} width="100%" bgcolor="${c.backdrop}" style="width:100%;background-color:${c.backdrop}"><tr><td class="outer" align="center" style="padding:24px 12px">
<!--[if mso]><table ${TABLE} width="${W}" align="center"><tr><td><![endif]-->
<table ${TABLE} class="wrap" width="${W}" align="center" bgcolor="${c.surface}" style="width:100%;max-width:${W}px;margin:0 auto;background-color:${c.surface}">
${sections}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
${pixel}
</body>
</html>`;
}

/* Plain text ------------------------------------------------------------------------- */

const wrapText = (s: string) => s.replace(/[ \t]+/g, " ").trim();

/** Links in [brackets], headings on their own lines, items as lines: the text/plain part of a send. */
export function renderPlainText(doc: EmailDoc, ctx: RenderContext): string {
  const merge = mergeOf(ctx);
  const out: string[] = [];
  const href = (h: string | undefined, id: string) => {
    const s = hrefFor(h, id, { ...ctx, mode: ctx.mode === "edit" ? "preview" : ctx.mode });
    return decodeEntities(s);
  };
  const txt = (html: string, id: string) =>
    wrapText(
      htmlToText(
        fillMergePlain(html, merge).replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_m, h: string, label: string) => {
          const u = href(decodeEntities(h), id);
          const l = htmlToText(label);
          return u === l || u === "#" ? l : `${l} [${u}]`;
        }),
      ).replace(/\n /g, "\n"),
    );
  if (doc.preheader) out.push(fillMergePlain(doc.preheader, merge));
  for (const s of doc.sections)
    for (const c of s.columns)
      for (const b of c.blocks) {
        switch (b.type) {
          case "logo":
            break;
          case "heading": {
            const t = txt(b.text, b.id);
            if (t) out.push(b.level === 1 ? `${t}\n${"=".repeat(Math.min(60, t.length))}` : t);
            break;
          }
          case "text": {
            const t = htmlToText(
              fillMergePlain(b.html, merge).replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_m, h: string, label: string) => {
                const u = href(decodeEntities(h), b.id);
                return `${htmlToText(label)}${u && u !== "#" ? ` [${u}]` : ""}`;
              }),
            );
            if (t) out.push(t);
            break;
          }
          case "image":
            if (b.href && b.alt) out.push(`${fillMergePlain(b.alt, merge)} [${href(b.href, b.id)}]`);
            break;
          case "button": {
            const u = href(b.href, b.id);
            out.push(`${fillMergePlain(b.label, merge)}${u !== "#" ? `: ${u}` : ""}`);
            break;
          }
          case "divider":
            out.push("---");
            break;
          case "items": {
            const limit = b.pick === "taste" ? b.count : 12;
            const lines = b.itemIds
              .map((id) => ctx.items[id])
              .filter((x): x is EmailItem => !!x)
              .slice(0, limit)
              .map((it) => {
                const head = [it.name, b.show.subtitle ? it.subtitle : "", b.show.price ? it.price : ""].filter(Boolean).join(" · ");
                const reason = b.show.reason && b.reasons?.[it.id] ? `\n  ${fillMergePlain(b.reasons[it.id], merge)}` : "";
                return `- ${head}${reason}${it.url ? `\n  ${href(it.url, b.id)}` : ""}`;
              });
            if (lines.length) out.push(lines.join("\n"));
            break;
          }
          case "social": {
            const links = b.links.length ? b.links : (ctx.brand.footer?.socials ?? []);
            if (links.length) out.push(links.map((l) => `${SOCIAL_NAME[l.network] ?? "Link"}: ${href(l.url, b.id)}`).join("\n"));
            break;
          }
          case "quote": {
            const t = txt(b.text, b.id);
            if (t) out.push(`"${t}"${b.author ? `\n— ${fillMergePlain(b.author, merge)}${b.role ? `, ${fillMergePlain(b.role, merge)}` : ""}` : ""}`);
            break;
          }
          case "coupon":
            out.push(`${fillMergePlain(b.label, merge)}\nCode: ${fillMergePlain(b.code, merge)}${b.note ? `\n${fillMergePlain(b.note, merge)}` : ""}`);
            break;
          case "video":
            out.push(`${fillMergePlain(b.alt, merge)}: ${href(b.href, b.id)}`);
            break;
          case "footer": {
            const lines = [txt(b.text, b.id), b.address || ctx.brand.footer?.address || "", `${fillMergePlain(b.unsubscribeLabel || "Unsubscribe", merge)}: ${ctx.links?.unsubscribe || "#unsubscribe"}`];
            if (b.viewOnline && ctx.links?.viewOnline) lines.push(`View in browser: ${ctx.links.viewOnline}`);
            out.push(`--\n${lines.filter(Boolean).join("\n")}`);
            break;
          }
          case "spacer":
            break;
        }
      }
  return out
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
