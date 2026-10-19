"use client";

// Peaks of an audio (or video) file for drawing its waveform, decoded once per
// URL with the Web Audio API. Files on hosts that refuse cross-origin reads
// fall back to a calm placeholder shape, so a track always draws.

import { useEffect, useState } from "react";

const cache = new Map<string, Promise<number[]>>();
const SAMPLES = 400;

async function decode(url: string): Promise<number[]> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(String(res.status));
  const buf = await res.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / SAMPLES));
    const peaks: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      let max = 0;
      for (let j = i * block, end = Math.min(data.length, j + block); j < end; j += 8) max = Math.max(max, Math.abs(data[j]));
      peaks.push(max);
    }
    const top = Math.max(0.01, ...peaks);
    return peaks.map((p) => p / top);
  } finally {
    void ctx.close();
  }
}

/** A stand-in shape when the file can't be read. */
const placeholder = (seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Array.from({ length: SAMPLES }, (_, i) => 0.35 + 0.3 * Math.abs(Math.sin(i * 0.21 + h)) * Math.abs(Math.sin(i * 0.047 + h / 7)));
};

export function useWaveform(url: string | undefined): number[] | null {
  const [peaks, setPeaks] = useState<{ url: string; peaks: number[] } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    let p = cache.get(url);
    if (!p) {
      p = decode(url).catch(() => placeholder(url));
      cache.set(url, p);
    }
    void p.then((x) => live && setPeaks({ url, peaks: x }));
    return () => {
      live = false;
    };
  }, [url]);
  return url && peaks?.url === url ? peaks.peaks : null;
}

/** `n` bars from the peaks, for a span of the file (0..1). */
export function bars(peaks: number[], n: number, from = 0, to = 1): number[] {
  const a = Math.floor(from * peaks.length);
  const b = Math.max(a + 1, Math.ceil(to * peaks.length));
  const span = peaks.slice(a, b);
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const s = Math.floor((i / n) * span.length);
    const e = Math.max(s + 1, Math.floor(((i + 1) / n) * span.length));
    return Math.max(0.04, ...span.slice(s, e));
  });
}
