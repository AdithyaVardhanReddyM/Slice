"use client";

// Export surface for the agent (slice_media/render.py). Playwright opens this
// page at the doc's pixel size with window.__MEDIA__ = { doc, kit, mode } set,
// waits for window.__MEDIA_READY__, then screenshots:
//   "poster": the whole frame (a video's first frame, layers settled).
//   "layers": only the layer ids passed to window.__mediaShow(ids), on a
//             transparent frame, for ffmpeg to lay over the shots.
// No auth, no Convex: everything it draws arrives in the init script.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cleanDoc, type MediaDoc, type MediaKit } from "@slice/backend/convex/mediaTypes";
import { KitFonts, Stage } from "@/components/console/media/stage";

interface Payload {
  doc: unknown;
  kit?: MediaKit;
  mode?: "poster" | "layers";
}

declare global {
  interface Window {
    __MEDIA__?: Payload;
    __MEDIA_READY__?: boolean;
    __mediaShow?: (ids: string[]) => Promise<void>;
  }
}

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (k: number) => (k <= 0 ? resolve() : requestAnimationFrame(() => step(k - 1)));
    step(n);
  });

/** Every <img> in the page decoded (or failed), and every QR drawn. */
async function settled() {
  await document.fonts?.ready;
  const imgs = [...document.images];
  await Promise.all(imgs.map((img) => (img.complete ? img.decode().catch(() => {}) : new Promise<void>((r) => ((img.onload = img.onerror = () => r()))))));
  const want = document.querySelectorAll("[data-qr]").length;
  for (let i = 0; i < 40 && document.querySelectorAll("[data-qr-ready]").length < want; i++) await new Promise((r) => setTimeout(r, 50));
  // Text fitting runs in layout effects; two frames let them settle after the fonts.
  await frames(2);
}

const noop = () => () => {};

function parse(p: Payload | null | undefined): { payload: { doc: MediaDoc; kit?: MediaKit; mode: "poster" | "layers" } | null; error: string | null } {
  if (p === null) return { payload: null, error: null };
  if (!p) return { payload: null, error: "No window.__MEDIA__" };
  try {
    return { payload: { doc: cleanDoc(p.doc), kit: p.kit, mode: p.mode === "layers" ? "layers" : "poster" }, error: null };
  } catch (e) {
    return { payload: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export default function RenderMediaPage() {
  // The init script sets window.__MEDIA__ before hydration; the server renders nothing.
  const raw = useSyncExternalStore(noop, () => window.__MEDIA__, () => null);
  const { payload, error } = useMemo(() => parse(raw), [raw]);
  const [shown, setShown] = useState<string[] | null>(null);
  const only = shown ?? (payload?.mode === "layers" ? [] : null);

  useEffect(() => {
    if (!payload) return;
    let live = true;
    window.__mediaShow = async (ids: string[]) => {
      setShown(Array.isArray(ids) ? ids.map(String) : []);
      await frames(2);
      await settled();
    };
    void settled().then(() => {
      if (live) window.__MEDIA_READY__ = true;
    });
    return () => {
      live = false;
    };
  }, [payload]);

  if (error) return <pre style={{ padding: 16, color: "#b00" }}>{error}</pre>;
  if (!payload) return null;
  const { doc, kit, mode } = payload;
  return (
    <>
      <style>{`html,body{margin:0;padding:0;background:transparent!important;overflow:hidden}nextjs-portal{display:none!important}`}</style>
      <KitFonts kit={kit} />
      <div style={{ position: "fixed", left: 0, top: 0, width: doc.w, height: doc.h }}>
        <Stage doc={doc} kit={kit} settled stillOnly={mode === "poster"} only={mode === "layers" ? only ?? [] : null} showPending={false} />
      </div>
    </>
  );
}
