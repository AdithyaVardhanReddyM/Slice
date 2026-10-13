"use client";

// The page as the builder writes it. The console's build canvas iframes
// /p/_draft and posts the draft (kit, fonts, css and the markup so far) as it
// streams in; this renders it like the published page (same .pg-root
// wrapper, kit variables and base CSS), patching the DOM in place so nothing
// already on screen reloads or flickers. It follows the writing down the page
// and tells the parent where the "pen" is, so the Slice cursor can ride it.

import { useEffect, useRef, useState } from "react";
import type { BrandKit } from "@slice/backend/convex/pagesTypes";
import { sanitizeDraft } from "./sanitize-draft";
import { sanitizePageCss } from "./sanitize-rules";
import { googleFontsHref, kitMode, kitToVars } from "./theme";

export interface DraftMessage {
  type: "pg:draft";
  kit: BrandKit;
  fonts: string[];
  css: string;
  html: string;
}

/** Makes `target`'s children match `source`'s, touching only what changed; collects new elements. */
function morph(target: Element, source: Element, added: Element[]) {
  const sources = [...source.childNodes];
  sources.forEach((s, i) => {
    const t = target.childNodes[i];
    if (!t) {
      const n = document.importNode(s, true);
      target.appendChild(n);
      if (n instanceof Element) added.push(n);
      return;
    }
    if (t.nodeType !== s.nodeType || (t instanceof Element && s instanceof Element && t.tagName !== s.tagName)) {
      const n = document.importNode(s, true);
      target.replaceChild(n, t);
      if (n instanceof Element) added.push(n);
      return;
    }
    if (!(s instanceof Element) || !(t instanceof Element)) {
      if (t.nodeValue !== s.nodeValue) t.nodeValue = s.nodeValue;
      return;
    }
    for (const a of [...t.attributes]) if (!s.hasAttribute(a.name)) t.removeAttribute(a.name);
    for (const a of [...s.attributes]) if (t.getAttribute(a.name) !== a.value) t.setAttribute(a.name, a.value);
    morph(t, s, added);
  });
  while (target.childNodes.length > sources.length) target.lastChild?.remove();
}

/** Where the writing is: the end of the last visible text, or the last visible image. Document coordinates. */
function findTip(root: HTMLElement): { x: number; y: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  const candidates: Node[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE ? !!n.nodeValue?.trim() : ["IMG", "svg", "VIDEO", "INPUT", "BUTTON"].includes((n as Element).tagName)) candidates.push(n);
  }
  for (let i = candidates.length - 1; i >= Math.max(0, candidates.length - 40); i--) {
    const n = candidates[i];
    let box: DOMRect | undefined;
    if (n.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = range.getClientRects();
      box = rects[rects.length - 1];
      if (box && box.width > 0) return { x: box.right + window.scrollX, y: box.bottom - box.height * 0.35 + window.scrollY };
    } else {
      box = (n as Element).getBoundingClientRect();
      if (box.width > 0 && box.height > 0) return { x: box.left + box.width * 0.62 + window.scrollX, y: box.top + Math.min(box.height * 0.6, 240) + window.scrollY };
    }
  }
  return null;
}

export function DraftPreview() {
  const [view, setView] = useState<{ kit: BrandKit; kitKey: string; fonts: string[]; css: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const html = useRef("");
  const applied = useRef("");
  const tip = useRef<{ x: number; y: number } | null>(null);
  // Off once the page is written: scroll back to the top, where the finished page opens.
  const follow = useRef(true);

  // Receive the draft from the console.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (e.data?.type === "pg:draft-top") {
        follow.current = false;
        return;
      }
      const d = e.data as DraftMessage;
      if (d?.type !== "pg:draft" || !d.kit) return;
      html.current = d.html ?? "";
      const kitKey = JSON.stringify(d.kit);
      const fonts = d.fonts ?? [];
      setView((v) => (v && v.kitKey === kitKey && v.css === d.css && v.fonts.join() === fonts.join() ? v : { kit: d.kit, kitKey, fonts, css: d.css ?? "" }));
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "pg:draft-ready" }, window.location.origin);
    // A preview, not a page: links and forms go nowhere.
    const stop = (e: Event) => {
      if ((e.target as Element | null)?.closest?.("a, button, form")) e.preventDefault();
    };
    document.addEventListener("click", stop, true);
    document.addEventListener("submit", stop, true);
    document.documentElement.style.scrollbarWidth = "none";
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", stop, true);
      document.removeEventListener("submit", stop, true);
    };
  }, []);

  // Patch the markup in, follow the writing, report the pen.
  useEffect(() => {
    let raf = 0;
    let lastPost = "";
    let lastTip = 0;
    const frame = (now: number) => {
      const el = body.current;
      if (el && html.current !== applied.current) {
        applied.current = html.current;
        const added: Element[] = [];
        morph(el, sanitizeDraft(html.current), added);
        for (const n of added) n.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "ease-out" });
        tip.current = findTip(el) ?? tip.current;
        lastTip = now;
      } else if (el && now - lastTip > 400) {
        // Fonts and images shift the layout after they load.
        tip.current = findTip(el) ?? tip.current;
        lastTip = now;
      }
      const t = follow.current ? tip.current : null;
      if (!follow.current && window.scrollY > 0.5) window.scrollTo({ top: window.scrollY * 0.9, behavior: "instant" });
      if (t) {
        // Keep the newest line a little above the middle; catch up faster the further behind.
        const target = Math.max(0, t.y - window.innerHeight * 0.55);
        const y = window.scrollY;
        const gap = target - y;
        if (Math.abs(gap) > 0.5) window.scrollTo({ top: y + gap * Math.min(0.35, 0.08 + Math.abs(gap) / 1600), behavior: "instant" });
        const vx = Math.round(t.x - window.scrollX);
        const vy = Math.round(t.y - window.scrollY);
        const key = `${vx},${vy}`;
        if (key !== lastPost) {
          lastPost = key;
          window.parent.postMessage({ type: "pg:draft-tip", x: vx, y: vy }, window.location.origin);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!view) return null;
  const fonts = googleFontsHref(view.kit, view.fonts);
  return (
    <div className={`pg-root pg-page pg-mode-${kitMode(view.kit)}`} style={kitToVars(view.kit)} data-draft="">
      {fonts && <link rel="stylesheet" href={fonts} />}
      {view.css && <style dangerouslySetInnerHTML={{ __html: sanitizePageCss(view.css) }} />}
      <div ref={body} className="pg-page-body" />
      {/* Room below the writing, so the newest line can sit mid-screen while the page is still short. */}
      <div aria-hidden style={{ height: "70vh" }} />
    </div>
  );
}
