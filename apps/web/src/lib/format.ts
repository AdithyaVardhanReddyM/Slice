import { NOW } from "./mock/random";

// Formatting pinned to UTC and a fixed "now" so server and client agree.
// When real data lands, swap NOW for Date.now() in a client-only clock.

const nf = new Intl.NumberFormat("en-US");
const cf = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const fmt = {
  int: (n: number) => nf.format(Math.round(n)),
  compact: (n: number) =>
    n >= 10_000
      ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
      : nf.format(Math.round(n)),
  money: (n: number) => cf.format(n),
  pct: (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`,
  delta: (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(1)}%`,
  ms: (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`,
  duration: (sec: number) =>
    sec >= 60
      ? `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`
      : `${sec}s`,
  time: (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }),
  clock: (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
    }),
  date: (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  dateLong: (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  ago: (iso: string) => {
    const s = Math.max(0, Math.round((NOW - new Date(iso).getTime()) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86_400)}d ago`;
  },
};
