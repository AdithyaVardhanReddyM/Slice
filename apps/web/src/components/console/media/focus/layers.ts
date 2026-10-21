// New layers added from the studio toolbar, sized for the frame and styled from the kit.

import { newId, type Layer, type MediaBrief, type MediaDoc, type MediaKit } from "@slice/backend/convex/mediaTypes";

export type NewLayerKind = "headline" | "subhead" | "body" | "cta" | "shape" | "circle" | "line" | "logo" | "qr";

export const linkOf = (brief: MediaBrief | undefined, kit: MediaKit | undefined) => brief?.link || kit?.url || "";

export function newLayer(kind: NewLayerKind, doc: MediaDoc, kit: MediaKit | undefined, brief: MediaBrief | undefined): Layer | null {
  const W = doc.w;
  const H = doc.h;
  const base = Math.min(W, H);
  const c = kit?.colors;
  const fg = c?.foreground ?? "#111111";
  const id = newId("l");
  switch (kind) {
    case "headline": {
      const size = Math.round(base * 0.085);
      return { id, type: "text", text: "Your headline", role: "headline", font: "heading", size, weight: 700, color: fg, align: "center", valign: "middle", lineHeight: 1.05, x: Math.round(W * 0.08), y: Math.round(H * 0.38), w: Math.round(W * 0.84), h: Math.round(size * 2.4) };
    }
    case "subhead": {
      const size = Math.round(base * 0.05);
      return { id, type: "text", text: "A line that sells it", role: "subhead", font: "body", size, weight: 500, color: fg, align: "center", valign: "top", lineHeight: 1.2, x: Math.round(W * 0.1), y: Math.round(H * 0.5), w: Math.round(W * 0.8), h: Math.round(size * 2.6) };
    }
    case "body": {
      const size = Math.round(base * 0.036);
      return { id, type: "text", text: "A line about the offer", role: "body", font: "body", size, weight: 400, color: fg, align: "center", valign: "top", lineHeight: 1.35, x: Math.round(W * 0.12), y: Math.round(H * 0.56), w: Math.round(W * 0.76), h: Math.round(size * 3) };
    }
    case "cta": {
      const size = Math.round(base * 0.04);
      const w = Math.round(W * 0.44);
      const h = Math.round(size * 2.6);
      const radius = kit?.buttonStyle === "square" ? 0 : kit?.buttonStyle === "rounded" ? Math.round(size * 0.4) : 999;
      return { id, type: "text", text: brief?.cta || "Shop now", role: "cta", font: "body", size, weight: 600, color: c?.primaryForeground ?? "#ffffff", bg: c?.primary ?? "#111111", padX: Math.round(size * 0.9), padY: Math.round(size * 0.4), radius, align: "center", valign: "middle", uppercase: kit?.uppercaseLabels || undefined, x: Math.round((W - w) / 2), y: Math.round(H * 0.8), w, h };
    }
    case "shape": {
      const s = Math.round(base * 0.3);
      return { id, type: "shape", fill: c?.accent ?? "#c8553d", radius: 0, x: Math.round((W - s) / 2), y: Math.round((H - s) / 2), w: s, h: s };
    }
    case "circle": {
      const s = Math.round(base * 0.3);
      return { id, type: "shape", fill: c?.primary ?? "#111111", radius: 9999, x: Math.round((W - s) / 2), y: Math.round((H - s) / 2), w: s, h: s };
    }
    case "line": {
      const w = Math.round(W * 0.5);
      return { id, type: "shape", fill: fg, radius: 0, x: Math.round((W - w) / 2), y: Math.round(H / 2), w, h: Math.max(3, Math.round(base * 0.004)) };
    }
    case "logo": {
      const w = Math.round(W * 0.3);
      const h = Math.round(w * 0.32);
      return { id, type: "logo", src: kit?.logo?.src, text: kit?.wordmark || kit?.name, color: fg, x: Math.round((W - w) / 2), y: Math.round(H * 0.05), w, h };
    }
    case "qr": {
      const url = linkOf(brief, kit);
      if (!url) return null;
      const s = Math.round(base * 0.2);
      return { id, type: "qr", url, color: fg, bg: c?.background ?? "#ffffff", x: Math.round(W - s - W * 0.06), y: Math.round(H - s - H * 0.05), w: s, h: s };
    }
  }
}

export const layerLabel = (l: Layer) => {
  if (l.name) return l.name;
  if (l.type === "text") return l.text.replace(/\s+/g, " ").slice(0, 40) || "Text";
  if (l.type === "image") return l.role === "background" ? "Background photo" : l.role === "product" ? "Product photo" : "Photo";
  if (l.type === "logo") return "Logo";
  if (l.type === "qr") return "QR code";
  // Shapes are named by what they look like, so two of them can be told apart.
  if (l.fill.includes("gradient")) return "Gradient overlay";
  if (Math.min(l.w, l.h) <= 12) return "Line";
  if ((l.radius ?? 0) >= Math.min(l.w, l.h) / 2) return "Circle";
  return "Colour block";
};
