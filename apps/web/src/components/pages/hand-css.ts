// The merchant's hand edits (HtmlDoc.hand) as CSS: one rule per element they
// touched, keyed on its data-pg-id, rendered after the page's own stylesheet
// with !important so what they set by hand is always what shows. Shared by
// the published renderer and the console's visual editor; the output still
// goes through sanitizePageCss like the page CSS.

import type { HandEdits, HandElement, HandMotion } from "@slice/backend/convex/pagesTypes";

/** Phone styles apply below this width (the editor's phone preview is 390px). */
export const PHONE_MAX_WIDTH = 767;

const PROP = /^(--)?[a-z][a-z0-9-]*$/;
const BAD_VALUE = /[{};<>]|javascript:|expression\s*\(/i;

/** Entrance keyframes. Individual transform properties, so an element's own `transform` is left alone. */
const ENTRANCE_FROM: Record<string, string> = {
  fade: "opacity: 0;",
  "fade-up": "opacity: 0; translate: 0 32px;",
  "fade-down": "opacity: 0; translate: 0 -32px;",
  "slide-left": "opacity: 0; translate: -48px 0;",
  "slide-right": "opacity: 0; translate: 48px 0;",
  zoom: "opacity: 0; scale: 0.92;",
  blur: "opacity: 0; filter: blur(12px);",
};

const HOVER_EFFECT: Record<string, string> = {
  lift: "translate: 0 -4px; box-shadow: 0 14px 30px -14px rgb(0 0 0 / 0.35);",
  grow: "scale: 1.04;",
  shrink: "scale: 0.97;",
  dim: "opacity: 0.72;",
  glow: "box-shadow: 0 0 0 4px color-mix(in srgb, var(--pg-brand-primary) 32%, transparent);",
};

const EASE_DEFAULT = "cubic-bezier(0.2, 0.7, 0.2, 1)";

export const handSelector = (id: string) => `.pg-page [data-pg-id="${id}"]`;

function block(decls: Record<string, string> | undefined, important = true): string {
  if (!decls) return "";
  return Object.entries(decls)
    .filter(([p, v]) => PROP.test(p) && typeof v === "string" && v.trim() && !BAD_VALUE.test(v))
    .map(([p, v]) => `${p}: ${v.trim()}${important ? " !important" : ""};`)
    .join(" ");
}

function addRule(out: string[], selector: string, body: string) {
  if (body) out.push(`${selector} { ${body} }`);
}

const ms = (n: number | undefined, fallback: number) => `${Math.max(0, Math.min(10_000, Math.round(Number.isFinite(n) ? (n as number) : fallback)))}ms`;
const easing = (m: HandMotion) => (m.easing && !BAD_VALUE.test(m.easing) ? m.easing : EASE_DEFAULT);

/** The CSS for a page's hand edits; empty when there are none. */
export function handCss(hand: HandEdits | undefined | null): string {
  const elements = Object.entries(hand?.elements ?? {}).filter(([id]) => /^[a-z0-9-]{2,24}$/.test(id));
  if (!elements.length) return "";
  const base: string[] = [];
  const hover: string[] = [];
  const phone: string[] = [];
  const motion: string[] = [];
  const scroll: string[] = [];
  const used = new Set<string>();

  for (const [id, el] of elements as [string, HandElement][]) {
    const sel = handSelector(id);
    const m = el.motion ?? {};
    const effect = m.hoverEffect ? HOVER_EFFECT[m.hoverEffect] : undefined;
    const hoverBody = [block(el.hover), effect ? effect.replace(/;/g, " !important;") : ""].filter(Boolean).join(" ");
    // A hover needs a transition to feel right, unless they set their own.
    const transition = hoverBody && !el.style?.transition ? `transition: translate 200ms ease, scale 200ms ease, opacity 200ms ease, box-shadow 200ms ease, background-color 200ms ease, color 200ms ease, border-color 200ms ease !important;` : "";
    addRule(base, sel, [block(el.style), transition].filter(Boolean).join(" "));
    addRule(hover, `${sel}:hover`, hoverBody);
    addRule(phone, sel, block(el.phone));

    if (m.enter && ENTRANCE_FROM[m.enter]) {
      used.add(m.enter);
      const name = `pg-hand-${m.enter}`;
      motion.push(`${sel} { animation: ${name} ${ms(m.duration, 700)} ${easing(m)} ${ms(m.delay, 0)} both !important; }`);
      if (m.trigger === "scroll") {
        scroll.push(
          `${sel} { animation-name: ${name} !important; animation-duration: auto !important; animation-delay: 0s !important; animation-timing-function: ${easing(m)} !important; animation-fill-mode: both !important; animation-timeline: view() !important; animation-range: entry 0% cover 30% !important; }`,
        );
      }
    }
  }

  const out = [...base, ...hover];
  if (phone.length) out.push(`@media (max-width: ${PHONE_MAX_WIDTH}px) {\n${phone.join("\n")}\n}`);
  if (used.size) {
    const keyframes = [...used].map((k) => `@keyframes pg-hand-${k} { from { ${ENTRANCE_FROM[k]} } }`);
    const scrolled = scroll.length ? `\n@supports (animation-timeline: view()) {\n${scroll.join("\n")}\n}` : "";
    out.push(`${keyframes.join("\n")}\n@media (prefers-reduced-motion: no-preference) {\n${motion.join("\n")}${scrolled}\n}`);
  }
  return out.join("\n");
}
