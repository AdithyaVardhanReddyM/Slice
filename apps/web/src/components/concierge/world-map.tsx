"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { WORLD_H, WORLD_LAND_PATH, WORLD_W, projectLatLon } from "./world-land";

export interface MapPinPoint {
  name?: string;
  lat: number;
  lon: number;
}

const ZOOM = 2.6;
const MAX_FIT = 3.2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * A quiet dotted world map. Not interactive: it is there to make a place feel
 * like a place rather than a form field. It covers whatever box it is given (the
 * map is cropped, never letterboxed), so it can soak up spare height in the panel.
 *
 * - `pin`: the chosen place. The map travels there and drops the pushpin.
 * - `pins`: other candidates, shown as small dots. With no `pin` the map fits
 *   them all into view.
 */
export function WorldMap({
  pin,
  pins = [],
  locating = false,
  className,
}: {
  pin: MapPinPoint | null;
  pins?: MapPinPoint[];
  locating?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: WORLD_W, h: WORLD_H });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // With preserveAspectRatio "slice" the box shows this much of the map at rest.
  const k = Math.max(box.w / WORLD_W, box.h / WORLD_H) || 1;
  const vw = Math.min(WORLD_W, box.w / k);
  const vh = Math.min(WORLD_H, box.h / k);

  // Where to look and how close.
  let cx = WORLD_W / 2;
  let cy = WORLD_H / 2;
  let s = 1;
  if (pin) {
    [cx, cy] = projectLatLon(pin.lat, pin.lon);
    s = ZOOM;
  } else if (pins.length) {
    const pts = pins.map((p) => projectLatLon(p.lat, p.lon));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    cx = (minX + maxX) / 2;
    cy = (minY + maxY) / 2;
    const pad = 60;
    s = clamp(Math.min(vw / (maxX - minX + pad), vh / (maxY - minY + pad)), 1, MAX_FIT);
  }
  // Keep the window inside the map so coastal cities don't show empty cream.
  cx = clamp(cx, vw / (2 * s), WORLD_W - vw / (2 * s));
  cy = clamp(cy, vh / (2 * s), WORLD_H - vh / (2 * s));
  const tx = WORLD_W / 2 - cx * s;
  const ty = WORLD_H / 2 - cy * s;
  const [px, py] = pin ? projectLatLon(pin.lat, pin.lon) : [0, 0];

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden rounded-2xl bg-[var(--cream)]", className)}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          {/* The grid tightens as the map zooms so the dots stay the same size on screen. */}
          <pattern id="slice-map-dots" width={7 / s} height={7 / s} patternUnits="userSpaceOnUse">
            <circle cx={3.5 / s} cy={3.5 / s} r={1.7 / s} fill="currentColor" />
          </pattern>
          <filter id="slice-pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
        </defs>
        <g
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${s})`,
            transition: "transform 0.8s cubic-bezier(0.2, 0.7, 0.2, 1)",
          }}
        >
          <path d={WORLD_LAND_PATH} fill="url(#slice-map-dots)" className="text-[#d8d1c2]" />
          {pins.map((p, i) => {
            if (pin && p.lat === pin.lat && p.lon === pin.lon) return null;
            const [x, y] = projectLatLon(p.lat, p.lon);
            return (
              // Counter-scaled like the pin so the dots keep their size.
              <g key={i} transform={`translate(${x} ${y}) scale(${1 / s})`}>
                <circle r="4.5" className="fill-[var(--tang)]" stroke="#fff" strokeWidth="1.8" />
              </g>
            );
          })}
          {pin && (
            // Counter-scaled so the pin keeps its size while the map zooms. The tip is at (0,0).
            <g transform={`translate(${px} ${py}) scale(${1.25 / s})`}>
              <ellipse rx="9" ry="3.5" className="map-pulse fill-[var(--tang)]" />
              {/* The OS pushpin emoji (glossy ball on a needle on Apple devices), tip at (0,0). */}
              <g className="map-pin">
                <ellipse cy="0.8" rx="4" ry="1.6" fill="#17150f" opacity="0.3" filter="url(#slice-pin-shadow)" />
                <text
                  y="-1"
                  textAnchor="middle"
                  fontSize="26"
                  style={{ fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif" }}
                >
                  📍
                </text>
              </g>
            </g>
          )}
        </g>
      </svg>
      {(pin?.name || locating) && (
        <span className="absolute bottom-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-medium shadow-sm backdrop-blur">
          <MapPin className="size-3.5 text-[var(--tang)]" />
          {pin?.name ?? "Finding it…"}
        </span>
      )}
    </div>
  );
}
