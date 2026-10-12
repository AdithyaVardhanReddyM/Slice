"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

// Draws numbered boxes over a preview iframe's sections ([data-section]) and
// keeps them in step with the Insights panel: clicking a section selects it,
// scrolling the page reports which section is in view, and the active
// section's quoted phrases are highlighted in place (CSS Custom Highlight API,
// so the page's DOM is never touched). The preview is same-origin
// (/p/{brand}/{page}?preview=1), so this works on the iframe's document directly.

export interface OverlaySection {
  id: string;
  /** "1", "2", … in page order. */
  n: number;
  title: string;
}

const ORANGE = "#ea580c";
const LAYER_ID = "slice-insights-layer";

const LAYER_CSS = `
:host { all: initial; }
.box { position: absolute; box-sizing: border-box; border-radius: 10px; border: 1.5px dashed rgba(234, 88, 12, 0.5);
  transition: border-color .2s, box-shadow .2s, background-color .2s; pointer-events: none; }
.box.hover { border-style: solid; border-color: rgba(234, 88, 12, 0.75); }
.box.active { border: 2px solid ${ORANGE}; background: rgba(234, 88, 12, 0.035); box-shadow: 0 0 0 5px rgba(234, 88, 12, 0.14); }
.tag { position: absolute; top: 10px; left: 10px; display: inline-flex; align-items: center; gap: 7px; max-width: calc(100% - 20px);
  padding: 4px 11px 4px 4px; border-radius: 999px; background: rgba(17, 17, 17, 0.88); color: #fff;
  font: 500 12.5px/1.2 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; letter-spacing: 0; white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0,0,0,.2); backdrop-filter: blur(6px); transition: background-color .2s; }
.tag span { overflow: hidden; text-overflow: ellipsis; }
.n { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; border-radius: 999px;
  background: rgba(255,255,255,.16); font-weight: 600; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.active .tag { background: ${ORANGE}; }
.active .n { background: rgba(255,255,255,.25); }
`;

const PAGE_CSS = `
::highlight(slice-quote) { background-color: rgba(234, 88, 12, 0.2); }
::highlight(slice-quote-hot) { background-color: rgba(234, 88, 12, 0.45); }
[data-section] { cursor: pointer; }
`;

type HighlightCtor = new (...ranges: Range[]) => unknown;
type FrameWindow = Window & {
  Highlight?: HighlightCtor;
  CSS: typeof CSS & { highlights?: Map<string, unknown> };
};

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** Ranges for `quote` inside `root`, matched on lower-cased text with collapsed whitespace. */
function findRange(doc: Document, root: Element, quote: string): Range | null {
  // First with a space between text nodes (a <br> or a block between words), then without (a word split by inline tags).
  return matchRange(doc, root, quote, true) ?? matchRange(doc, root, quote, false);
}

function matchRange(doc: Document, root: Element, quote: string, joinWithSpace: boolean): Range | null {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  const map: [Text, number][] = [];
  let lastSpace = true;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.data;
    if (joinWithSpace && !lastSpace && value.length) {
      // A virtual space; a range ending on it is clamped to the previous node's end below.
      text += " ";
      map.push(map[map.length - 1]);
      lastSpace = true;
    }
    for (let i = 0; i < value.length; i++) {
      const space = /\s/.test(value[i]);
      if (space && lastSpace) continue;
      text += space ? " " : value[i];
      map.push([node, i]);
      lastSpace = space;
    }
  }
  const at = norm(text).indexOf(norm(quote));
  if (at < 0) return null;
  // norm() only lower-cases, swaps quote marks and collapses spaces (already collapsed), so indices line up.
  const lead = text.length - text.trimStart().length;
  const start = map[at + lead];
  const end = map[at + lead + norm(quote).length - 1];
  if (!start || !end) return null;
  const range = doc.createRange();
  range.setStart(start[0], start[1]);
  range.setEnd(end[0], end[1] + 1);
  return range;
}

function applyHighlights(
  a: { win: FrameWindow; doc: Document } | null,
  s: {
    active: string | null;
    quotes: string[];
    hotQuote: string | null;
    lockUntil: number;
  },
  follow: boolean,
) {
  const reg = a?.win.CSS?.highlights;
  const Ctor = a?.win.Highlight;
  if (!a || !reg || !Ctor) return;
  const root = s.active ? a.doc.querySelector(`[data-section="${CSS.escape(s.active)}"]`) : null;
  const ranges = root ? s.quotes.map((q) => findRange(a.doc, root, q)).filter((r): r is Range => !!r) : [];
  const hot = root && s.hotQuote ? findRange(a.doc, root, s.hotQuote) : null;
  reg.set("slice-quote", new Ctor(...ranges));
  if (hot) reg.set("slice-quote-hot", new Ctor(hot));
  else reg.delete("slice-quote-hot");
  // Bring a phrase the merchant points at into view.
  if (hot && follow) {
    const r = hot.getBoundingClientRect();
    if (r.top < 60 || r.bottom > a.win.innerHeight - 40) {
      s.lockUntil = Date.now() + 900;
      a.win.scrollTo({
        top: r.top + a.win.scrollY - a.win.innerHeight * 0.35,
        behavior: "smooth",
      });
    }
  }
}

export function useSectionOverlay({
  frame,
  sections,
  active,
  quotes,
  hotQuote,
  onSelect,
  onScrollActive,
}: {
  frame: RefObject<HTMLIFrameElement | null>;
  sections: OverlaySection[];
  active: string | null;
  /** Phrases to mark in the active section. */
  quotes: string[];
  /** The phrase the merchant is pointing at in the panel. */
  hotQuote: string | null;
  onSelect: (id: string) => void;
  /** The section in view changed because the page was scrolled (not by scrollTo). */
  onScrollActive: (id: string) => void;
}) {
  const state = useRef({
    sections,
    active,
    quotes,
    hotQuote,
    onSelect,
    onScrollActive,
    lockUntil: 0,
    hover: null as string | null,
  });
  useEffect(() => {
    Object.assign(state.current, {
      sections,
      active,
      quotes,
      hotQuote,
      onSelect,
      onScrollActive,
    });
  });
  const api = useRef<{
    draw: () => void;
    win: FrameWindow;
    doc: Document;
  } | null>(null);

  const attach = useCallback(() => {
    const iframe = frame.current;
    const win = iframe?.contentWindow as FrameWindow | null;
    const doc = iframe?.contentDocument;
    if (!iframe || !win || !doc?.body) return () => {};

    const style = doc.createElement("style");
    style.textContent = PAGE_CSS;
    doc.head.appendChild(style);

    doc.getElementById(LAYER_ID)?.remove();
    const host = doc.createElement("div");
    host.id = LAYER_ID;
    host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;pointer-events:none;";
    doc.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const css = doc.createElement("style");
    css.textContent = LAYER_CSS;
    shadow.appendChild(css);
    const layer = doc.createElement("div");
    shadow.appendChild(layer);

    const els = () => Array.from(doc.querySelectorAll<HTMLElement>("[data-section]")).filter((el) => !el.parentElement?.closest("[data-section]"));

    const draw = () => {
      const { sections: secs, active: act, hover } = state.current;
      const byId = new Map(secs.map((s) => [s.id, s]));
      const frag = doc.createDocumentFragment();
      for (const el of els()) {
        const id = el.dataset.section ?? "";
        const info = byId.get(id);
        if (!info) continue;
        const r = el.getBoundingClientRect();
        if (r.height < 8) continue;
        const box = doc.createElement("div");
        box.className = `box${id === act ? " active" : ""}${id === hover && id !== act ? " hover" : ""}`;
        const inset = 6;
        box.style.left = `${r.left + win.scrollX + inset}px`;
        box.style.top = `${r.top + win.scrollY + 4}px`;
        box.style.width = `${Math.max(0, r.width - inset * 2)}px`;
        box.style.height = `${Math.max(0, r.height - 8)}px`;
        const tag = doc.createElement("div");
        tag.className = "tag";
        const n = doc.createElement("b");
        n.className = "n";
        n.textContent = String(info.n);
        const label = doc.createElement("span");
        label.textContent = info.title;
        tag.append(n, label);
        box.appendChild(tag);
        frag.appendChild(box);
      }
      layer.replaceChildren(frag);
    };

    const inView = () => {
      const probe = win.scrollY + win.innerHeight * 0.32;
      let current: string | null = null;
      for (const el of els()) {
        const top = el.getBoundingClientRect().top + win.scrollY;
        if (top <= probe) current = el.dataset.section ?? null;
      }
      return current ?? els()[0]?.dataset.section ?? null;
    };

    let frameReq = 0;
    const onScroll = () => {
      if (Date.now() < state.current.lockUntil) return;
      cancelAnimationFrame(frameReq);
      frameReq = requestAnimationFrame(() => {
        const id = inView();
        if (id && id !== state.current.active && state.current.sections.some((s) => s.id === id)) state.current.onScrollActive(id);
      });
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-section]") as HTMLElement | null;
      e.preventDefault();
      e.stopPropagation();
      if (el?.dataset.section) state.current.onSelect(el.dataset.section);
    };
    const onMove = (e: MouseEvent) => {
      const id = ((e.target as Element | null)?.closest?.("[data-section]") as HTMLElement | null)?.dataset.section ?? null;
      if (id !== state.current.hover) {
        state.current.hover = id;
        draw();
      }
    };
    const onLeave = () => {
      state.current.hover = null;
      draw();
    };

    // Layout changes include the streamed page being revealed, which moves its nodes: redraw and re-find the phrases.
    const ro = new ResizeObserver(() => {
      draw();
      applyHighlights(api.current, state.current, false);
    });
    ro.observe(doc.body);
    win.addEventListener("scroll", onScroll, { passive: true });
    win.addEventListener("resize", draw);
    win.addEventListener("load", draw);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("mousemove", onMove, { passive: true });
    doc.documentElement.addEventListener("mouseleave", onLeave);
    void doc.fonts?.ready.then(draw);
    api.current = { draw, win, doc };
    draw();
    applyHighlights(api.current, state.current, false);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(frameReq);
      win.removeEventListener("scroll", onScroll);
      win.removeEventListener("resize", draw);
      win.removeEventListener("load", draw);
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("mousemove", onMove);
      doc.documentElement.removeEventListener("mouseleave", onLeave);
      host.remove();
      style.remove();
      api.current = null;
    };
  }, [frame]);

  // Redraw when the active section or the labels change.
  useEffect(() => {
    api.current?.draw();
  }, [active, sections]);

  // Mark the active section's phrases; the hovered one stronger.
  useEffect(() => {
    applyHighlights(api.current, state.current, true);
  }, [active, quotes, hotQuote]);

  /** Scroll the page to a section without the scroll handler fighting back. */
  const scrollTo = useCallback((id: string) => {
    const a = api.current;
    const el = a?.doc.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]`);
    if (!a || !el) return;
    state.current.lockUntil = Date.now() + 1000;
    a.win.scrollTo({
      top: el.getBoundingClientRect().top + a.win.scrollY - 16,
      behavior: "smooth",
    });
  }, []);

  return { attach, scrollTo };
}
