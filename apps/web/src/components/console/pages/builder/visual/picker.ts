"use client";
"use no memo";
// Reads the live preview DOM while picking, so the compiler must not cache it.

// "Select an element" for the builder chat: the preview page becomes a picker
// (outline on hover, its name beside it, a crosshair), and the element the
// merchant clicks is described for the composer's pill and for the builder:
// what it is, where it is, its text and its markup. The preview is the
// published route (same-origin), so this works on its DOM directly.

import { useEffect, useRef, type RefObject } from "react";
import { EditOverlay } from "./overlay";
import { KIND_NAME, PG_ID, clip, kindOf, nameOf, pickable, sectionOf, textOf, type SectionNames } from "./model";

export interface PickedElement {
  /** Unique per pick, so two pills stay apart even for one element. */
  key: string;
  /** What the pill and the message call it: "Headline · Passes and tickets". */
  label: string;
  tag: string;
  /** The data-section it sits in. */
  section: string;
  text: string;
  /** Its markup (trimmed), so the builder can find it in the page. */
  html: string;
  /** Its data-pg-id, when the merchant edited it by hand. */
  id?: string;
}

/** "Headline · Passes and tickets", "Button · Get tickets", "Hero section". */
function pillLabel(el: Element, names: SectionNames, win: Window): string {
  const kind = kindOf(el, win);
  if (kind === "section" || kind === "header" || kind === "footer" || kind === "nav") return nameOf(el, names, win);
  const name = kind === "heading" || kind === "text" ? nameOf(el, names, win) : KIND_NAME[kind];
  const snippet = kind === "image" ? (el.getAttribute("alt") ?? "") : textOf(el);
  return snippet ? `${name} · ${clip(snippet, 34)}` : name;
}

export function describeElement(el: Element, names: SectionNames, win: Window): PickedElement {
  const html = el.outerHTML.replace(/\s+/g, " ");
  return {
    key: Math.random().toString(36).slice(2, 10),
    label: pillLabel(el, names, win),
    tag: el.tagName.toLowerCase(),
    section: sectionOf(el)?.getAttribute("data-section") ?? "",
    text: clip(textOf(el), 240),
    html: html.length > 2000 ? `${html.slice(0, 2000)}…` : html,
    ...(el.getAttribute(PG_ID) ? { id: el.getAttribute(PG_ID)! } : {}),
  };
}

/**
 * While `active`, clicking in the preview picks an element instead of using
 * the page; Escape (in the page or the console) cancels. `frameKey` changes
 * when the preview iframe is replaced, so the picker follows it.
 */
export function useElementPicker({
  frame,
  frameKey,
  active,
  names,
  onPick,
  onCancel,
}: {
  frame: RefObject<HTMLIFrameElement | null>;
  frameKey: string;
  active: boolean;
  names: SectionNames;
  onPick: (picked: PickedElement, el: Element) => void;
  onCancel: () => void;
}) {
  const handlers = useRef({ onPick, onCancel, names });
  useEffect(() => {
    handlers.current = { onPick, onCancel, names };
  });

  useEffect(() => {
    if (!active) return;
    const iframe = frame.current;
    if (!iframe) return;
    let stop = () => {};

    const attach = () => {
      stop();
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!win || !doc?.documentElement || !doc.head) return;
      // HTML pages put their markup in .pg-page-body; pages from the old section builder only have .pg-root.
      const root = () => doc.querySelector(".pg-page-body") ?? doc.querySelector(".pg-root");
      const target = (e: Event) => {
        const r = root();
        return r ? pickable(e.target, r) : null;
      };
      const overlay = new EditOverlay(doc, () => {});
      const cursor = doc.createElement("style");
      cursor.textContent = "*, *::before, *::after { cursor: crosshair !important; }";
      doc.head.appendChild(cursor);

      const onMove = (e: PointerEvent) => {
        const el = target(e);
        overlay.setHover(el, el ? pillLabel(el, handlers.current.names, win) : "");
      };
      const onLeave = () => overlay.setHover(null);
      const block = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
      };
      const onClick = (e: MouseEvent) => {
        block(e);
        const el = target(e);
        if (el) handlers.current.onPick(describeElement(el, handlers.current.names, win), el);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        handlers.current.onCancel();
      };
      const listeners: [string, EventListener][] = [
        ["pointermove", onMove as EventListener],
        ["mousedown", block],
        ["click", onClick as EventListener],
        ["auxclick", block],
        ["submit", block],
        ["dragstart", block],
        ["keydown", onKey as EventListener],
      ];
      for (const [type, fn] of listeners) win.addEventListener(type, fn, true);
      doc.addEventListener("pointerleave", onLeave);
      stop = () => {
        for (const [type, fn] of listeners) win.removeEventListener(type, fn, true);
        doc.removeEventListener("pointerleave", onLeave);
        overlay.destroy();
        cursor.remove();
        stop = () => {};
      };
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handlers.current.onCancel();
    };
    attach();
    iframe.addEventListener("load", attach);
    window.addEventListener("keydown", onKey);
    return () => {
      stop();
      iframe.removeEventListener("load", attach);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, frame, frameKey]);
}

/** A short highlight on the element that was just picked. */
export function flash(el: Element) {
  (el as HTMLElement).animate?.([{ outline: "2px solid #2563eb", outlineOffset: "2px" }, { outline: "2px solid transparent", outlineOffset: "6px" }], { duration: 700, easing: "ease-out" });
}
