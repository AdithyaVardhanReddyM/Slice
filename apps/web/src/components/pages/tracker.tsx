"use client";

// First-party tracker for published pages. Batches events every 4 s (and on
// pagehide / tab hide via sendBeacon) to POST /api/pages/track. Also posts the
// sections' geometry to the parent window so the console can align its heat
// map overlay on the preview iframe; that part runs even when tracking is
// disabled (console preview).

import { useEffect } from "react";
import type { TrackEvent } from "@slice/backend/convex/pagesTypes";
import { getSessionId, getVisitorId } from "./track-ids";
import type { FormBody, TrackBody, TrackingMeta } from "./types";

const FLUSH_MS = 4000;
const HEARTBEAT_MS = 5000;
const ACTIVE_WINDOW_MS = 30_000;
const ENDPOINT = "/api/pages/track";

export interface SectionGeometry {
  id: string;
  top: number;
  height: number;
}

/** postMessage sent to window.parent on load and whenever the layout changes. */
export interface SectionsMessage {
  type: "pg:sections";
  pageId: string;
  variantId: string;
  sections: SectionGeometry[];
  /** Document height / viewport width, so overlays can scale. */
  height: number;
  width: number;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function collectUtm(): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const sp = new URLSearchParams(location.search);
  sp.forEach((v, k) => {
    const key = k.toLowerCase();
    if (key.startsWith("utm_") || key === "gclid" || key === "fbclid" || key === "msclkid") out[key] = v.slice(0, 200);
  });
  return Object.keys(out).length ? out : undefined;
}

export function Tracker({ meta }: { meta: TrackingMeta }) {
  const { pageId, variantId, resolvedBy, disabled } = meta;
  const city = meta.overrides?.city;
  const country = meta.overrides?.country;

  useEffect(() => {
    /* Section geometry for the console ------------------------------------ */
    const framed = window.parent && window.parent !== window;
    let geoTimer: ReturnType<typeof setTimeout> | undefined;
    const postSections = () => {
      if (!framed) return;
      const sections: SectionGeometry[] = Array.from(document.querySelectorAll<HTMLElement>("[data-section]")).map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.section ?? "", top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
      });
      const msg: SectionsMessage = {
        type: "pg:sections",
        pageId,
        variantId,
        sections,
        height: document.documentElement.scrollHeight,
        width: window.innerWidth,
      };
      window.parent.postMessage(msg, "*");
    };
    const scheduleSections = () => {
      clearTimeout(geoTimer);
      geoTimer = setTimeout(postSections, 120);
    };
    postSections();
    const ro = framed && "ResizeObserver" in window ? new ResizeObserver(scheduleSections) : null;
    ro?.observe(document.documentElement);
    window.addEventListener("load", scheduleSections);
    window.addEventListener("resize", scheduleSections);
    const onParentMessage = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === "pg:measure") postSections();
      if (e.data.type === "pg:scrollTo" && typeof e.data.sectionId === "string") {
        document.querySelector<HTMLElement>(`[data-section="${CSS.escape(e.data.sectionId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("message", onParentMessage);

    /* Forms on builder-written pages: <form data-pg-form> posts to /api/pages/form. */
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || !form.matches("form[data-pg-form]") || form.dataset.state === "sending") return;
      e.preventDefault();
      const fields: Record<string, string> = {};
      new FormData(form).forEach((v, k) => {
        if (typeof v === "string") fields[k] = v.slice(0, 2000);
      });
      const sectionId = form.closest<HTMLElement>("[data-section]")?.dataset.section ?? form.dataset.pgForm ?? "form";
      const success = form.dataset.success || "Thank you. We will be in touch.";
      form.dataset.state = "sending";
      form.querySelector(".pg-form-error")?.remove();
      const done = () => {
        const p = document.createElement("p");
        p.className = "pg-form-success";
        p.setAttribute("role", "status");
        p.textContent = success;
        form.replaceWith(p);
      };
      const fail = () => {
        form.dataset.state = "idle";
        const p = document.createElement("p");
        p.className = "pg-form-error";
        p.textContent = "Something went wrong. Please try again.";
        form.append(p);
      };
      if (disabled) {
        setTimeout(done, 400);
        return;
      }
      const body: FormBody = {
        pageId,
        variantId,
        visitorId: getVisitorId(),
        sessionId: getSessionId(),
        resolvedBy,
        path: location.pathname,
        sectionId,
        fields,
        overrides: city || country ? { city, country } : undefined,
      };
      fetch("/api/pages/form", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        .then((r) => (r.ok ? done() : fail()))
        .catch(fail);
    };
    document.addEventListener("submit", onSubmit);

    if (disabled) {
      window.__pgTrack = () => {};
      return () => {
        clearTimeout(geoTimer);
        ro?.disconnect();
        window.removeEventListener("load", scheduleSections);
        window.removeEventListener("resize", scheduleSections);
        window.removeEventListener("message", onParentMessage);
        document.removeEventListener("submit", onSubmit);
        delete window.__pgTrack;
      };
    }

    /* Event queue ---------------------------------------------------------- */
    const visitorId = getVisitorId();
    const utm = collectUtm();
    const overrides = city || country ? { city, country } : undefined;
    let queue: TrackEvent[] = [];

    const push = (e: Omit<TrackEvent, "at"> & { at?: number }) => {
      queue.push({ ...e, at: e.at ?? Date.now() });
      if (queue.length >= 40) flush(false);
    };

    const flush = (unloading: boolean) => {
      if (queue.length === 0) return;
      const body: TrackBody = {
        pageId,
        variantId,
        visitorId,
        sessionId: getSessionId(),
        resolvedBy,
        path: location.pathname,
        referrer: document.referrer || undefined,
        utm,
        screen: { w: window.screen.width, h: window.screen.height },
        events: queue,
        overrides,
      };
      queue = [];
      const json = JSON.stringify(body);
      if (unloading && typeof navigator.sendBeacon === "function") {
        if (navigator.sendBeacon(ENDPOINT, new Blob([json], { type: "application/json" }))) return;
      }
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
        keepalive: true,
      }).catch(() => {});
    };

    window.__pgTrack = push;

    /* pageview ------------------------------------------------------------- */
    push({ type: "pageview" });
    const firstFlush = setTimeout(() => flush(false), 800);
    const interval = setInterval(() => flush(false), FLUSH_MS);

    /* heartbeat: 5 s of engaged time while visible and recently active ---- */
    let lastActive = Date.now();
    const markActive = () => {
      lastActive = Date.now();
    };
    const activeEvents: (keyof WindowEventMap)[] = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"];
    activeEvents.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActive < ACTIVE_WINDOW_MS) {
        push({ type: "heartbeat", value: HEARTBEAT_MS });
      }
    }, HEARTBEAT_MS);

    /* scroll depth, sent on each +0.1 of max depth -------------------------- */
    let maxDepth = 0;
    let sentDepth = 0;
    const onScroll = () => {
      markActive();
      const doc = document.documentElement;
      const total = Math.max(1, doc.scrollHeight - window.innerHeight);
      const depth = total <= 1 ? 1 : clamp01((window.scrollY + window.innerHeight) / doc.scrollHeight);
      if (depth > maxDepth) maxDepth = depth;
      if (maxDepth - sentDepth >= 0.1 || (maxDepth >= 0.99 && sentDepth < 0.99)) {
        sentDepth = maxDepth;
        push({ type: "scroll", value: Math.round(maxDepth * 100) / 100 });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    /* section_seen: at least half the section, or half the viewport -------- */
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.section;
          if (!id || seen.has(id)) continue;
          const half = entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5;
          if (entry.isIntersecting && half) {
            seen.add(id);
            push({ type: "section_seen", sectionId: id });
          }
        }
      },
      { threshold: [0.1, 0.25, 0.5, 0.75] },
    );
    document.querySelectorAll<HTMLElement>("[data-section]").forEach((el) => io.observe(el));

    /* clicks, CTA clicks, outbound ------------------------------------------ */
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const sectionEl = target.closest<HTMLElement>("[data-section]");
      const sectionId = sectionEl?.dataset.section;
      let x: number | undefined;
      let y: number | undefined;
      if (sectionEl) {
        const r = sectionEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          x = Math.round(clamp01((e.clientX - r.left) / r.width) * 1000) / 1000;
          y = Math.round(clamp01((e.clientY - r.top) / r.height) * 1000) / 1000;
        }
      }
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      const control = target.closest<HTMLElement>("a, button, [role=button], summary, input, select, label");
      const ctaEl = target.closest<HTMLElement>("[data-cta]");
      const text = (ctaEl?.dataset.cta ?? control?.textContent ?? target.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      const href = anchor?.getAttribute("href") ?? undefined;

      push({ type: "click", sectionId, label: text || undefined, href, x, y });
      if (ctaEl) push({ type: "cta_click", sectionId, label: ctaEl.dataset.cta || text, href, x, y });
      if (anchor && /^https?:/i.test(anchor.href) && anchor.host !== location.host) {
        push({ type: "outbound", sectionId, label: text || undefined, href: anchor.href });
        flush(true);
      }
    };
    document.addEventListener("click", onClick, { capture: true });

    /* flush on hide / unload ------------------------------------------------- */
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (maxDepth > sentDepth) {
          sentDepth = maxDepth;
          push({ type: "scroll", value: Math.round(maxDepth * 100) / 100 });
        }
        flush(true);
      }
    };
    const onPageHide = () => onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      flush(true);
      clearTimeout(firstFlush);
      clearInterval(interval);
      clearInterval(heartbeat);
      clearTimeout(geoTimer);
      ro?.disconnect();
      io.disconnect();
      activeEvents.forEach((ev) => window.removeEventListener(ev, markActive));
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("load", scheduleSections);
      window.removeEventListener("resize", scheduleSections);
      window.removeEventListener("message", onParentMessage);
      document.removeEventListener("submit", onSubmit);
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      delete window.__pgTrack;
    };
  }, [pageId, variantId, resolvedBy, disabled, city, country]);

  return null;
}
