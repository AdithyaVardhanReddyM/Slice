"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Thumbnail-only CSS: no scrollbars. Interactive previews get a `<base>` so
 * links open in a new tab instead of navigating the frame.
 */
function prepare(html: string, thumbnail: boolean) {
  const inject = thumbnail ? "<style>html,body{overflow:hidden!important}</style>" : '<base target="_blank">';
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
  return `${inject}${html}`;
}

/** Bottom of the email's content: body may be styled 100% tall, so the children say how tall it really is. */
function contentHeight(doc: Document) {
  const body = doc.body;
  if (!body) return 0;
  let bottom = 0;
  for (const el of Array.from(body.children)) bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
  const scroll = doc.defaultView?.scrollY ?? 0;
  const margin = parseFloat(doc.defaultView?.getComputedStyle(body).marginBottom ?? "0") || 0;
  return Math.ceil(bottom ? bottom + scroll + margin : doc.documentElement.scrollHeight);
}

/**
 * An email's HTML in a sandboxed iframe (no scripts ever run), laid out at
 * the email's own width and scaled to fit, so a 600 px email reads the same
 * as a 200 px thumbnail or a full preview. Same-origin is allowed (scripts
 * stay off) so the console can measure the content height and swap in new
 * HTML without reloading, which keeps live previews from flashing.
 */
export function EmailFrame({
  html,
  width = 600,
  scale = "fit",
  maxScale = 1,
  height,
  autoHeight,
  thumbnail = false,
  lazy = true,
  title = "Email preview",
  className,
  style,
}: {
  html: string;
  /** Layout width of the email in px: 600 for desktop, 375 for phone (the email's media queries follow it). */
  width?: number;
  /** A fixed factor, or "fit" to scale the email down to the box's width. */
  scale?: number | "fit";
  /** Upper bound for "fit". */
  maxScale?: number;
  /** Visible height in unscaled px (crops a thumbnail; scrolls an interactive preview). */
  height?: number;
  /** Grow to the content's height. The default when no height is given. */
  autoHeight?: boolean;
  /** Non-interactive: no pointer events, no focus, no scrollbars. */
  thumbnail?: boolean;
  /** Mount the iframe only when it scrolls near the viewport. */
  lazy?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  "use no memo";
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  // The HTML loads once through srcDoc (when the frame mounts); later HTML is swapped into the loaded document.
  const [srcDoc, setSrcDoc] = useState(() => prepare(html, thumbnail));
  const latest = useRef(html);
  const shown = useRef(html);
  const rebind = useRef<() => void>(() => {});
  const measure = autoHeight ?? height === undefined;

  useEffect(() => {
    if (visible) return;
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        // Whatever the HTML is by now, not what it was on the first render.
        shown.current = latest.current;
        setSrcDoc(prepare(latest.current, thumbnail));
        setVisible(true);
        io.disconnect();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, thumbnail]);

  useEffect(() => {
    if (typeof scale === "number") return;
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [scale]);

  // Height: re-read when the document loads, when its content resizes (images, web fonts) and after a swap.
  useEffect(() => {
    const frame = frameRef.current;
    if (!visible || !frame) return;
    let ro: ResizeObserver | null = null;
    const timers: number[] = [];
    const read = () => {
      const doc = frame.contentDocument;
      if (!doc || !measure) return;
      const h = contentHeight(doc);
      if (h > 0) setMeasured((prev) => (prev === h ? prev : h));
    };
    const bind = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      read();
      if (!measure) return;
      ro?.disconnect();
      ro = new ResizeObserver(read);
      for (const el of Array.from(doc.body.children)) ro.observe(el);
      doc.addEventListener("load", read, true);
      doc.fonts?.ready.then(read).catch(() => {});
      timers.push(window.setTimeout(read, 250), window.setTimeout(read, 1200));
    };
    rebind.current = bind;
    frame.addEventListener("load", bind);
    if (frame.contentDocument?.readyState === "complete" && frame.contentDocument.body?.childElementCount) bind();
    return () => {
      frame.removeEventListener("load", bind);
      ro?.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [visible, measure]);

  // New HTML: replace the loaded document's root in place, or reload the frame when it is not ready.
  useEffect(() => {
    latest.current = html;
    const frame = frameRef.current;
    if (html === shown.current || !frame) return;
    shown.current = html;
    const doc = frame.contentDocument;
    if (doc && doc.readyState === "complete" && doc.body?.childElementCount) {
      try {
        const next = new DOMParser().parseFromString(prepare(html, thumbnail), "text/html");
        doc.replaceChild(doc.importNode(next.documentElement, true), doc.documentElement);
        rebind.current();
        return;
      } catch {
        // fall through to a reload
      }
    }
    frame.srcdoc = prepare(html, thumbnail);
  }, [html, thumbnail]);

  const s = typeof scale === "number" ? scale : boxWidth ? Math.min(maxScale, boxWidth / width) : null;
  const frameHeight = height ?? measured ?? Math.round(width * 1.4);
  const offset = s !== null && boxWidth !== null && boxWidth > width * s ? (boxWidth - width * s) / 2 : 0;

  return (
    <div
      ref={boxRef}
      className={cn("relative overflow-hidden", thumbnail && "pointer-events-none select-none", !visible && "bg-neutral-100", className)}
      style={{
        width: typeof scale === "number" ? width * scale : "100%",
        height: s !== null ? frameHeight * s : undefined,
        aspectRatio: s === null ? `${width} / ${frameHeight}` : undefined,
        ...style,
      }}
      aria-hidden={thumbnail || undefined}
    >
      {visible && (
        <iframe
          ref={frameRef}
          title={title}
          srcDoc={srcDoc}
          sandbox={thumbnail ? "allow-same-origin" : "allow-same-origin allow-popups allow-popups-to-escape-sandbox"}
          tabIndex={thumbnail ? -1 : undefined}
          className="absolute top-0 border-0 bg-transparent"
          style={{
            left: offset,
            width,
            height: frameHeight,
            transform: s !== null && s !== 1 ? `scale(${s})` : undefined,
            transformOrigin: "0 0",
            visibility: s === null ? "hidden" : undefined,
          }}
        />
      )}
    </div>
  );
}
