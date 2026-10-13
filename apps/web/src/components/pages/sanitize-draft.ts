// The live draft preview's sanitiser: the same allowlist as published pages
// (sanitize-rules.ts), applied with the browser's own parser. DOMParser
// documents are inert (no scripts, no image loads), so the markup is cleaned
// before any of it reaches a live document. The published page is always
// sanitised again on the server with sanitize-html.

import { BAD_INLINE_STYLE, EXTRA_TAGS, GLOBAL_ATTRS, TAG_ATTRS } from "./sanitize-rules";

// sanitize-html's default allowedTags (minus iframe/script/style), which the server list starts from.
const BASE_TAGS = [
  "address", "article", "aside", "footer", "header", "h1", "h2", "h3", "h4", "h5", "h6", "hgroup", "main", "nav", "section",
  "blockquote", "dd", "div", "dl", "dt", "figcaption", "figure", "hr", "li", "ol", "p", "pre", "ul",
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i", "kbd", "mark", "q", "rb", "rp", "rt", "rtc", "ruby", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
  "caption", "col", "colgroup", "table", "tbody", "td", "tfoot", "th", "thead", "tr",
];

const ALLOWED = new Set([...BASE_TAGS, ...EXTRA_TAGS].map((t) => t.toLowerCase()));
/** Removed with everything inside them. */
const DROP = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "link", "meta", "base", "frame", "frameset", "applet"]);
const GLOBAL = new Set(GLOBAL_ATTRS.filter((a) => !a.endsWith("*")));
const PER_TAG = new Map(Object.entries(TAG_ATTRS).map(([tag, attrs]) => [tag.toLowerCase(), new Set(attrs.map((a) => a.toLowerCase()))]));
const URL_ATTRS = new Set(["href", "src", "srcset", "poster", "cite", "action", "formaction", "xlink:href"]);

function safeUrl(value: string, tag: string): boolean {
  const v = value.replace(/[\u0000- ]+/g, "").toLowerCase();
  if (v.startsWith("//")) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(v)?.[1];
  if (!scheme) return true;
  if (["http", "https", "mailto", "tel"].includes(scheme)) return true;
  return scheme === "data" && (tag === "img" || tag === "source") && v.startsWith("data:image/");
}

function cleanAttributes(el: Element, tag: string) {
  const own = PER_TAG.get(tag);
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    const allowed = GLOBAL.has(name) || name.startsWith("data-") || name.startsWith("aria-") || !!own?.has(name);
    if (!allowed || name.startsWith("on")) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (URL_ATTRS.has(name)) {
      const urls = name === "srcset" ? attr.value.split(",").map((s) => s.trim().split(/\s+/)[0]) : [attr.value];
      if (!urls.every((u) => safeUrl(u, tag))) el.removeAttribute(attr.name);
    } else if (name === "style" && BAD_INLINE_STYLE.test(attr.value)) el.removeAttribute(attr.name);
  }
  if (tag === "svg") {
    el.setAttribute("aria-hidden", el.getAttribute("aria-hidden") ?? "true");
    el.setAttribute("focusable", "false");
  }
}

function clean(parent: Element) {
  for (const el of [...parent.children]) {
    const tag = el.tagName.toLowerCase();
    if (DROP.has(tag) || (tag === "form" && !el.hasAttribute("data-pg-form"))) {
      el.remove();
      continue;
    }
    clean(el);
    if (!ALLOWED.has(tag)) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    cleanAttributes(el, tag);
  }
}

/** The cleaned body of `html` (possibly cut off mid-page), parsed but inert. */
export function sanitizeDraft(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
  clean(doc.body);
  return doc.body;
}
