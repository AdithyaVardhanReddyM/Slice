// Sanitiser for builder-written pages (HtmlDoc). Runs on the server with a
// real parser (sanitize-html) and an allowlist: layout, text, media, forms
// and inline SVG pass; anything that can run script does not. The CSS is
// text-filtered separately.

import sanitizeHtml from "sanitize-html";
import { BAD_INLINE_STYLE, EXTRA_TAGS, GLOBAL_ATTRS, TAG_ATTRS } from "./sanitize-rules";

export { sanitizePageCss } from "./sanitize-rules";

export const PAGE_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags.filter((t) => !["iframe", "script", "style"].includes(t)), ...EXTRA_TAGS],
  allowedAttributes: { "*": GLOBAL_ATTRS, ...TAG_ATTRS },
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

/** Drop style attributes that reach for script or foreign resources. */
function cleanInlineStyle(html: string): string {
  return html.replace(/\s+style\s*=\s*("[^"]*"|'[^']*')/gi, (full, value: string) => (BAD_INLINE_STYLE.test(value) ? "" : full));
}

export function sanitizePageHtml(input: string): string {
  if (!input) return "";
  return cleanInlineStyle(sanitizeHtml(input, PAGE_SANITIZE));
}

