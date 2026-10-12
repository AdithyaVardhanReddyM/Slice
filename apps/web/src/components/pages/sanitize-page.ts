// Sanitiser for builder-written pages (HtmlDoc). Runs on the server with a
// real parser (sanitize-html) and an allowlist: layout, text, media, forms
// and inline SVG pass; anything that can run script does not. The CSS is
// text-filtered separately.

import sanitizeHtml from "sanitize-html";

const SVG_TAGS = ["svg", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "g", "defs", "use", "symbol", "title", "desc", "clipPath", "linearGradient", "radialGradient", "stop", "mask", "pattern", "text", "tspan"];
const SVG_ATTRS = [
  "viewBox", "xmlns", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule", "fill-opacity", "stroke-opacity", "opacity",
  "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "transform", "preserveAspectRatio", "offset", "stop-color", "stop-opacity", "gradientUnits", "clip-path", "mask", "href", "focusable",
];

const GLOBAL_ATTRS = ["class", "id", "style", "title", "lang", "dir", "tabindex", "hidden", "role", "data-*", "aria-*"];

export const PAGE_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags.filter((t) => !["iframe", "script", "style"].includes(t)),
    "img", "picture", "source", "figure", "figcaption", "video", "audio",
    "header", "footer", "main", "nav", "section", "article", "aside", "address", "time", "mark", "small", "sup", "sub", "abbr", "cite", "q", "kbd", "details", "summary", "hr", "br", "wbr", "dl", "dt", "dd",
    "form", "input", "button", "label", "select", "option", "optgroup", "textarea", "fieldset", "legend", "output", "progress", "meter",
    ...SVG_TAGS,
  ],
  allowedAttributes: {
    "*": GLOBAL_ATTRS,
    a: ["href", "target", "rel", "name", "download"],
    img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding", "fetchpriority", "referrerpolicy"],
    source: ["src", "srcset", "sizes", "type", "media"],
    video: ["src", "poster", "autoplay", "muted", "loop", "playsinline", "controls", "preload", "width", "height"],
    audio: ["src", "controls", "loop", "muted", "preload"],
    time: ["datetime"],
    form: ["name", "autocomplete", "novalidate"],
    input: ["type", "name", "value", "placeholder", "required", "disabled", "readonly", "checked", "min", "max", "step", "minlength", "maxlength", "pattern", "autocomplete", "inputmode", "list"],
    button: ["type", "name", "value", "disabled"],
    select: ["name", "required", "disabled", "multiple", "autocomplete"],
    option: ["value", "selected", "disabled", "label"],
    optgroup: ["label", "disabled"],
    textarea: ["name", "rows", "cols", "placeholder", "required", "disabled", "readonly", "minlength", "maxlength", "autocomplete"],
    label: ["for"],
    fieldset: ["disabled", "name"],
    details: ["open"],
    ol: ["start", "reversed", "type"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    ...Object.fromEntries(SVG_TAGS.map((t) => [t, SVG_ATTRS])),
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"], source: ["http", "https", "data"], use: ["https", "http"] },
  allowedSchemesAppliedToAttributes: ["href", "src", "srcset", "poster", "cite", "action", "formaction"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  // Keep style attributes verbatim; `cleanInlineStyle` below screens them.
  parseStyleAttributes: false,
  transformTags: {
    a: (tagName, attribs) => {
      const a = { ...attribs };
      if (a.target === "_blank") a.rel = "noopener noreferrer";
      return { tagName, attribs: a };
    },
    svg: (tagName, attribs) => ({ tagName, attribs: { ...attribs, "aria-hidden": attribs["aria-hidden"] ?? "true", focusable: "false" } }),
  },
  // Only forms the tracker owns may exist; a stray `action` would post elsewhere.
  exclusiveFilter: (frame) => frame.tag === "form" && !frame.attribs["data-pg-form"],
};

const BAD_INLINE_STYLE = /javascript:|expression\s*\(|behavior\s*:|-moz-binding|@import|url\s*\(\s*["']?\s*(?!https?:|data:image\/)/i;

/** Drop style attributes that reach for script or foreign resources. */
function cleanInlineStyle(html: string): string {
  return html.replace(/\s+style\s*=\s*("[^"]*"|'[^']*')/gi, (full, value: string) => (BAD_INLINE_STYLE.test(value) ? "" : full));
}

export function sanitizePageHtml(input: string): string {
  if (!input) return "";
  return cleanInlineStyle(sanitizeHtml(input, PAGE_SANITIZE));
}

const CSS_DROP_RULES: RegExp[] = [
  /@import\b[^;]*;?/gi,
  /@charset\b[^;]*;?/gi,
  /@namespace\b[^;]*;?/gi,
];
const CSS_BAD_DECL = /(expression\s*\(|behavior\s*:|-moz-binding\s*:|javascript:)/i;

/**
 * Page CSS: strip at-rules that pull in resources and declarations that can
 * run script; only http(s)/data:image urls survive. Everything else, including
 * @media, @keyframes, @font-face-free @supports, passes through.
 */
export function sanitizePageCss(input: string): string {
  if (!input) return "";
  let css = input.replace(/<\/?style[^>]*>/gi, "").replace(/<!--|-->/g, "");
  for (const re of CSS_DROP_RULES) css = css.replace(re, "");
  // @font-face could point anywhere; fonts come from meta.fonts instead.
  css = css.replace(/@font-face\s*\{[^}]*\}/gi, "");
  css = css.replace(/url\s*\(\s*(["']?)([^)"']*)\1\s*\)/gi, (full, _q: string, target: string) => {
    const t = target.trim().toLowerCase();
    return t.startsWith("https://") || t.startsWith("http://") || t.startsWith("data:image/") ? full : "none";
  });
  // Drop whole declarations that carry something executable.
  css = css.replace(/[^;{}]+:[^;{}]*;?/g, (decl) => (CSS_BAD_DECL.test(decl) ? "" : decl));
  return css;
}
