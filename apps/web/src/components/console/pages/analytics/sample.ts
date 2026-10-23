"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { briefOf, docOf, isHtmlDoc, type AudienceProfile, type Brand, type PageDoc, type Variant } from "@/lib/pages/types";
import type { Overview, PageRow } from "../brand-analytics";
import type { ActivityRow, DayRow, Heatmap, LeadRow, Stats } from "./page-analytics";

// Sample analytics: believable traffic made up in the browser, so a merchant can
// see how the reports read once real visitors arrive. It stands in for the
// pagesEvents queries with the same shapes, is the same for a page and day on
// every visit (seeded by page id and date), and is never written anywhere.
//
// Group pages get daily totals shaped by weekday, hour, growth and a campaign
// spike; a page for one person (a lead) gets that person's few visits instead.

/* Setting ------------------------------------------------------------------------- */

const KEY = "slice.pages.analytics.sample";
const listeners = new Set<() => void>();
// Fallback when storage is unavailable (private windows, blocked site data).
let memory = false;

function read(): boolean {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v !== null) return v === "1";
  } catch {
    // fall through to memory
  }
  return memory;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Whether Analytics shows sample data; a per-browser preference. */
export function useSampleSetting(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    memory = next;
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // memory holds it for this tab
    }
    listeners.forEach((l) => l());
  }, []);
  return [on, set];
}

const SampleContext = createContext<SampleAnalytics | null>(null);
export const SampleProvider = SampleContext.Provider;
/** The generator while sample data is on; null means read the real queries. */
export const useSample = () => useContext(SampleContext);

/* Randomness ------------------------------------------------------------------------ */

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const seeded = (...parts: (string | number)[]): Random => mulberry(hash(parts.join("|")));

type Weights = [string, number][];

function pick(r: Random, options: Weights): string {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [value, w] of options) {
    x -= w;
    if (x <= 0) return value;
  }
  return options[options.length - 1][0];
}

const pickOne = <T,>(r: Random, list: T[]): T => list[Math.floor(r() * list.length)];
const between = (r: Random, lo: number, hi: number) => lo + (hi - lo) * r();
/** Centre-weighted 0..1, for clicks that land near the middle of a button. */
const centred = (r: Random) => (r() + r() + r()) / 3;
/** Every weight nudged by up to ±spread, so no two pages share a mix. */
const jitter = (r: Random, w: Weights, spread = 0.3): Weights => w.map(([k, n]) => [k, n * (1 - spread + 2 * spread * r())]);

/** `total` split by weight into whole numbers that add up (largest remainder). */
function split(total: number, weights: Weights): Record<string, number> {
  const sum = weights.reduce((s, [, w]) => s + w, 0);
  const out: Record<string, number> = {};
  if (!total || !sum) return out;
  const parts = weights.map(([k, w]) => ({ k, exact: (total * w) / sum }));
  let left = total;
  for (const p of parts) {
    out[p.k] = Math.floor(p.exact);
    left -= out[p.k];
  }
  for (const p of [...parts].sort((a, b) => (b.exact % 1) - (a.exact % 1)).slice(0, left)) out[p.k] += 1;
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

/* Time ------------------------------------------------------------------------------ */

const DAY = 864e5;
const HOUR = 36e5;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(day + "T00:00:00.000Z");

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = dayStart(from); t <= dayStart(to); t += DAY) out.push(dayKey(t));
  return out;
}

// Visits by local hour and weekday (Sun..Sat).
const HOUR_CURVE = [0.2, 0.1, 0.07, 0.05, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0, 1.05, 1.2, 1.15, 1.0, 0.95, 1.0, 1.1, 1.25, 1.4, 1.45, 1.25, 0.85, 0.45];
const HOUR_TOTAL = HOUR_CURVE.reduce((s, x) => s + x, 0);
const WEEKDAY = [0.82, 1.0, 1.04, 1.06, 1.02, 0.96, 0.84];
const localHour = (utcHour: number, utc: number) => (((utcHour + utc) % 24) + 24) % 24;

/* Places ----------------------------------------------------------------------------- */

// Country and UTC offset (northern summer time, which covers most of the window).
const CITY: Record<string, { country: string; utc: number }> = {
  "new york": { country: "US", utc: -4 }, brooklyn: { country: "US", utc: -4 }, boston: { country: "US", utc: -4 }, miami: { country: "US", utc: -4 },
  chicago: { country: "US", utc: -5 }, austin: { country: "US", utc: -5 }, dallas: { country: "US", utc: -5 }, houston: { country: "US", utc: -5 },
  nashville: { country: "US", utc: -5 }, denver: { country: "US", utc: -6 }, seattle: { country: "US", utc: -7 }, portland: { country: "US", utc: -7 },
  "los angeles": { country: "US", utc: -7 }, "san francisco": { country: "US", utc: -7 }, toronto: { country: "CA", utc: -4 }, montreal: { country: "CA", utc: -4 },
  vancouver: { country: "CA", utc: -7 }, london: { country: "GB", utc: 1 }, manchester: { country: "GB", utc: 1 }, edinburgh: { country: "GB", utc: 1 },
  dublin: { country: "IE", utc: 1 }, lisbon: { country: "PT", utc: 1 }, lisboa: { country: "PT", utc: 1 }, porto: { country: "PT", utc: 1 },
  madrid: { country: "ES", utc: 2 }, barcelona: { country: "ES", utc: 2 }, paris: { country: "FR", utc: 2 }, marseille: { country: "FR", utc: 2 },
  lyon: { country: "FR", utc: 2 }, berlin: { country: "DE", utc: 2 }, munich: { country: "DE", utc: 2 }, hamburg: { country: "DE", utc: 2 },
  amsterdam: { country: "NL", utc: 2 }, copenhagen: { country: "DK", utc: 2 }, stockholm: { country: "SE", utc: 2 }, milan: { country: "IT", utc: 2 },
  rome: { country: "IT", utc: 2 }, "são paulo": { country: "BR", utc: -3 }, "sao paulo": { country: "BR", utc: -3 }, "rio de janeiro": { country: "BR", utc: -3 },
  sydney: { country: "AU", utc: 11 }, melbourne: { country: "AU", utc: 11 }, tokyo: { country: "JP", utc: 9 },
};
const COUNTRY: Record<string, string> = {
  "united states": "US", usa: "US", "united kingdom": "GB", england: "GB", portugal: "PT", spain: "ES", france: "FR", germany: "DE",
  netherlands: "NL", ireland: "IE", italy: "IT", brazil: "BR", canada: "CA", australia: "AU", japan: "JP", denmark: "DK", sweden: "SE",
};
const UTC: Record<string, number> = { US: -5, CA: -4, MX: -6, BR: -3, GB: 1, IE: 1, PT: 1, ES: 2, FR: 2, DE: 2, NL: 2, IT: 2, DK: 2, SE: 2, IN: 5, JP: 9, AU: 11 };
// Visitors from outside the home market.
const ABROAD: Record<string, Weights> = {
  US: [["CA", 44], ["GB", 22], ["MX", 16], ["DE", 9], ["AU", 9]],
  PT: [["ES", 20], ["GB", 18], ["FR", 15], ["DE", 12], ["BR", 10], ["NL", 8], ["IE", 6], ["IT", 6], ["US", 5]],
  other: [["US", 30], ["GB", 18], ["DE", 12], ["FR", 10], ["ES", 8], ["NL", 7], ["CA", 6], ["AU", 5], ["IT", 4]],
};
const CITIES: Record<string, string[]> = {
  US: ["New York", "Chicago", "Los Angeles", "Austin", "Seattle", "Boston", "Miami", "Denver"],
  PT: ["Lisbon", "Porto", "Braga", "Coimbra", "Faro", "Setúbal"],
  GB: ["London", "Manchester", "Bristol", "Edinburgh"],
  ES: ["Madrid", "Barcelona", "Seville", "Valencia"],
  FR: ["Paris", "Lyon", "Bordeaux"],
  DE: ["Berlin", "Hamburg", "Munich", "Cologne"],
  BR: ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba"],
  NL: ["Amsterdam", "Rotterdam", "Utrecht"],
  CA: ["Toronto", "Vancouver", "Montreal"],
  IE: ["Dublin", "Cork"],
  IT: ["Milan", "Rome"],
  MX: ["Mexico City", "Guadalajara"],
  AU: ["Sydney", "Melbourne"],
  IN: ["Bengaluru", "Mumbai"],
};
// Visitors to a city's page come from the city and around it.
const AROUND: Record<string, string[]> = {
  chicago: ["Evanston", "Oak Park", "Naperville"],
  austin: ["Round Rock", "Pflugerville", "San Marcos"],
  "new york": ["Brooklyn", "Jersey City", "Hoboken"],
  berlin: ["Potsdam", "Leipzig"],
  "são paulo": ["Campinas", "Guarulhos", "Santo André"],
  lisbon: ["Cascais", "Sintra", "Almada"],
  london: ["Croydon", "Richmond"],
};

const placeOf = (city: string | undefined) => (city ? CITY[city.trim().toLowerCase()] : undefined);

/** The brand's home country, read from the places its site mentions. */
function homeOf(brand: Brand): string {
  for (const loc of briefOf(brand)?.locations ?? []) {
    const parts = loc.toLowerCase().split(",").map((s) => s.trim());
    for (const p of [...parts].reverse()) {
      if (COUNTRY[p]) return COUNTRY[p];
      if (CITY[p]) return CITY[p].country;
    }
  }
  return "US";
}

/* Clickable elements ------------------------------------------------------------------- */

/** A clickable element in a section, its box in 0..1 units of the section (measured from the rendered page). */
export interface Target {
  sectionId: string;
  label: string;
  cta: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Control = Pick<Target, "sectionId" | "label" | "cta">;

const CONTROLS = "a[href], button, [role=button], summary, select, [data-cta]";

const topSections = (doc: Document) =>
  Array.from(doc.querySelectorAll<HTMLElement>("[data-section]")).filter((el) => !el.parentElement?.closest("[data-section]"));

/** Each control once, as the tracker labels it: the data-cta name, else its text or image alt. */
function controlsIn(section: HTMLElement): { el: HTMLElement; label: string; cta: boolean }[] {
  const seen = new Set<HTMLElement>();
  const out: { el: HTMLElement; label: string; cta: boolean }[] = [];
  for (const node of section.querySelectorAll<HTMLElement>(CONTROLS)) {
    const el = node.closest<HTMLElement>("[data-cta]") ?? node;
    if (seen.has(el) || !section.contains(el)) continue;
    seen.add(el);
    const text = el.dataset.cta ?? (el.textContent?.trim() || el.querySelector("img")?.getAttribute("alt") || el.getAttribute("aria-label") || "");
    out.push({ el, label: text.replace(/\s+/g, " ").trim().slice(0, 60), cta: el.hasAttribute("data-cta") });
  }
  return out;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Controls with their boxes, from the page as rendered in the click map's preview. */
export function measureTargets(doc: Document): Target[] {
  const out: Target[] = [];
  for (const section of topSections(doc)) {
    const id = section.dataset.section;
    const s = section.getBoundingClientRect();
    if (!id || s.width < 8 || s.height < 8) continue;
    for (const c of controlsIn(section)) {
      const r = c.el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      const x = clamp01((r.left - s.left) / s.width);
      const y = clamp01((r.top - s.top) / s.height);
      out.push({ sectionId: id, label: c.label, cta: c.cta, x, y, w: Math.min(1 - x, r.width / s.width), h: Math.min(1 - y, r.height / s.height) });
    }
  }
  return out;
}

const parsed = new WeakMap<object, Document | null>();
function parsedDoc(variant: Variant | null): Document | null {
  const doc = docOf(variant);
  if (!isHtmlDoc(doc) || typeof DOMParser === "undefined") return null;
  if (!parsed.has(doc)) parsed.set(doc, new DOMParser().parseFromString(doc.html, "text/html"));
  return parsed.get(doc) ?? null;
}

/** Controls by section without layout, for the activity feed. */
function controlsOf(variant: Variant | null): Control[] {
  const doc = parsedDoc(variant);
  if (!doc) return [];
  return topSections(doc).flatMap((section) => controlsIn(section).map((c) => ({ sectionId: section.dataset.section ?? "", label: c.label, cta: c.cta })));
}

/** Whether the page has a form anyone could send. */
export function hasForm(variant: Variant | null): boolean {
  const doc = docOf(variant);
  if (isHtmlDoc(doc)) return /<form\b/i.test(doc.html);
  return !!(doc as PageDoc | null)?.sections?.some((s) => s.type === "form");
}

/** The form's field names and where it sits, for sample leads. */
function formOf(variant: Variant | null): { sectionId: string; fields: string[] } {
  const doc = docOf(variant);
  const html = parsedDoc(variant);
  const form = html?.querySelector("form");
  if (form) {
    const fields = Array.from(form.querySelectorAll<HTMLInputElement>("input[name], select[name], textarea[name]"))
      .filter((el) => !["hidden", "submit", "button", "checkbox"].includes(el.type))
      .map((el) => el.name);
    return { sectionId: form.closest<HTMLElement>("[data-section]")?.dataset.section ?? "form", fields: fields.length ? [...new Set(fields)] : ["name", "email"] };
  }
  const section = (doc as PageDoc | null)?.sections?.find((s) => s.type === "form") as { id: string; fields?: { name: string }[] } | undefined;
  return { sectionId: section?.id ?? "form", fields: section?.fields?.map((f) => f.name) ?? ["name", "email"] };
}

/* Page models --------------------------------------------------------------------------- */

interface Visit {
  at: number;
  device: string;
  browser: string;
  country: string;
  city?: string;
  source: string;
  views: number;
  clicks: number;
  cta: boolean;
  engagedMs: number;
}

interface Model {
  id: string;
  /** A page for one person: their visits, not a crowd's totals. */
  personal: boolean;
  person?: string;
  utc: number;
  countries: Weights;
  city?: string;
  sources: Weights;
  devices: Weights;
  /** Visitors on an ordinary weekday 60 days ago. */
  base: number;
  /** Growth over the 60 days (0.4 = 40% more visitors today). */
  growth: number;
  /** Days ago a campaign went out. */
  spikes: number[];
  ctaRate: number;
  clicksPerSession: number;
  engagedS: number;
  leads: boolean;
  /** How quickly visitors drop off down the page, per section. */
  keep: [number, number];
  cta: { label: string; href: string };
  visits: Visit[];
}

const SOURCES: Record<string, Weights> = {
  location: [["direct", 22], ["search", 18], ["social", 25], ["ads", 24], ["email", 7], ["referral", 4]],
  segment: [["social", 38], ["ads", 30], ["search", 10], ["direct", 13], ["email", 6], ["referral", 3]],
  list: [["email", 56], ["social", 14], ["direct", 15], ["qr", 8], ["ads", 7]],
  default: [["direct", 30], ["search", 27], ["social", 20], ["ads", 10], ["email", 9], ["referral", 4]],
};

const LEAD_GOALS = new Set(["waitlist", "booking", "subscription"]);

function devicesFor(name: string): Weights {
  if (/under|younger|student|\b1[89]\b|\b2[0-4]\b/i.test(name)) return [["mobile", 74], ["desktop", 22], ["tablet", 4]];
  if (/\b(3[5-9]|4\d|5\d)\b|older|parents|professional/i.test(name)) return [["mobile", 50], ["desktop", 44], ["tablet", 6]];
  return [["mobile", 59], ["desktop", 36], ["tablet", 5]];
}

function browserOf(r: Random, device: string): string {
  if (device === "tablet") return "Safari";
  if (device === "mobile") return r() < 0.58 ? (r() < 0.86 ? "Safari" : "Chrome") : pick(r, [["Chrome", 80], ["Samsung Internet", 15], ["Firefox", 5]]);
  return pick(r, [["Chrome", 60], ["Safari", 22], ["Edge", 13], ["Firefox", 5]]);
}

// Browser share within each device.
const BROWSERS: Record<string, Weights> = {
  mobile: [["Safari", 0.58 * 0.86], ["Chrome", 0.58 * 0.14 + 0.42 * 0.8], ["Samsung Internet", 0.42 * 0.15], ["Firefox", 0.42 * 0.05]],
  desktop: [["Chrome", 0.6], ["Safari", 0.22], ["Edge", 0.13], ["Firefox", 0.05]],
  tablet: [["Safari", 1]],
};

function browserWeights(byDevice: Record<string, number>): Weights {
  const out = new Map<string, number>();
  for (const [device, n] of Object.entries(byDevice)) for (const [b, w] of BROWSERS[device] ?? []) out.set(b, (out.get(b) ?? 0) + n * w);
  return [...out.entries()];
}

function modelOf(page: PageRow, home: string): Model {
  const r = seeded(page._id, "model");
  const audience = page.audiences?.[0];
  const kind = audience?.kind ?? "default";
  const city = (audience?.profile as AudienceProfile | undefined)?.geo?.[0]?.name;
  const place = placeOf(city);
  const country = place?.country ?? home;
  const abroad = ABROAD[country] ?? ABROAD.other;
  const personal = kind === "lead";
  // A city's page draws mostly from that country; a taste or age group from the home market and travellers.
  const local = country === "US" ? (city ? 0.95 : 0.92) : city ? 0.8 : 0.56;
  const mix = new Map<string, number>([[country, local * 100]]);
  for (const [k, w] of jitter(r, abroad)) if (k !== country) mix.set(k, (mix.get(k) ?? 0) + w * (1 - local));
  // People from the brand's own country look at its pages for elsewhere too.
  if (country !== home) mix.set(home, (mix.get(home) ?? 0) + 5);
  const countries: Weights = [...mix.entries()];
  const group = kind === "location" || (city && kind === "custom") ? "location" : kind === "people" || kind === "csv" ? "list" : kind === "default" ? "default" : "segment";
  const cta = page.brief?.cta ?? { label: "", href: "" };
  return {
    id: page._id,
    personal,
    person: personal ? audience?.name : undefined,
    utc: place?.utc ?? UTC[country] ?? 0,
    countries,
    city,
    sources: jitter(r, SOURCES[group]),
    devices: jitter(r, devicesFor(audience?.name ?? ""), 0.15),
    base: Math.round(between(r, 26, 120) * (group === "list" ? 0.6 : 1)),
    growth: between(r, -0.12, 0.7),
    spikes: [Math.floor(between(r, 3, 26)), Math.floor(between(r, 33, 56))],
    ctaRate: personal ? 0 : between(r, 0.035, 0.095),
    clicksPerSession: between(r, 0.8, 1.35),
    engagedS: between(r, 42, 105),
    leads: LEAD_GOALS.has(page.brief?.goal ?? ""),
    keep: personal ? [0.94, 0.99] : [0.84, 0.95],
    cta,
    visits: personal ? visitsOf(page._id, country, place?.utc ?? UTC[country] ?? 0, city) : [],
  };
}

/** One person opening their page: first from the email, then a return visit or two. */
function visitsOf(id: string, country: string, utc: number, city: string | undefined): Visit[] {
  const r = seeded(id, "visits");
  const now = Date.now();
  const outcome = r();
  const count = outcome < 0.78 ? 2 + Math.floor(r() * 2) : 1;
  const applies = outcome < 0.62;
  let daysAgo = Math.floor(between(r, 6, 19));
  const out: Visit[] = [];
  for (let i = 0; i < count && daysAgo >= 0; i++) {
    const local = Number(pick(r, [["8", 2], ["12", 3], ["13", 2], ["19", 3], ["20", 4], ["21", 3], ["22", 1]]));
    let at = dayStart(dayKey(now - daysAgo * DAY)) + (local - utc) * HOUR + Math.floor(r() * 50) * 60_000;
    if (at > now) at = now - Math.floor(between(r, 2, 9)) * HOUR;
    const device = i === count - 1 && applies && r() < 0.5 ? "desktop" : r() < 0.72 ? "mobile" : "desktop";
    const last = i === count - 1;
    out.push({
      at,
      device,
      browser: browserOf(r, device),
      country,
      city,
      source: i === 0 ? "email" : r() < 0.6 ? "direct" : "email",
      views: 1 + (r() < 0.25 ? 1 : 0),
      clicks: 1 + Math.floor(r() * 4) + (applies && last ? 1 : 0),
      cta: applies && last && count > 1,
      engagedMs: Math.round(between(r, 70, 290) * 1000),
    });
    daysAgo -= 1 + Math.floor(r() * 5);
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Share of today's traffic that has already happened, in the audience's day. */
function elapsedShare(utc: number, now: number) {
  const hours = (now - dayStart(dayKey(now))) / HOUR;
  let done = 0;
  for (let h = 0; h < 24; h++) done += HOUR_CURVE[localHour(h, utc)] * clamp01(hours - h);
  return done / HOUR_TOTAL;
}

/** Sessions on a full day, before today's cut-off. */
function fullDay(m: Model, day: string, now: number) {
  const daysAgo = Math.round((dayStart(dayKey(now)) - dayStart(day)) / DAY);
  const dow = new Date(day + "T12:00:00.000Z").getUTCDay();
  const r = seeded(m.id, day);
  let spike = 1;
  for (const s of m.spikes) spike += s === daysAgo ? 1.5 : s === daysAgo + 1 ? 0.55 : s === daysAgo + 2 ? 0.2 : 0;
  const visitors = m.base * WEEKDAY[dow] * (1 + m.growth * (1 - Math.min(60, daysAgo) / 60)) * spike * between(r, 0.86, 1.14);
  return { r, visitors, daysAgo };
}

function dayRow(m: Model, day: string, now: number): DayRow {
  if (m.personal) {
    const row: DayRow = { day, views: 0, sessions: 0, visitors: 0, clicks: 0, ctaClicks: 0, formSubmits: 0, engagedMs: 0 };
    for (const v of m.visits) {
      if (dayKey(v.at) !== day) continue;
      row.visitors = 1;
      row.sessions += 1;
      row.views += v.views;
      row.clicks += v.clicks;
      row.ctaClicks += v.cta ? 1 : 0;
      row.engagedMs += v.engagedMs;
    }
    return row;
  }
  const f = fullDay(m, day, now);
  if (f.daysAgo < 0) return { day, views: 0, sessions: 0, visitors: 0, clicks: 0, ctaClicks: 0, formSubmits: 0, engagedMs: 0 };
  const r = f.r;
  const visitors = Math.round(f.visitors * (f.daysAgo === 0 ? elapsedShare(m.utc, now) : 1));
  const sessions = Math.round(visitors * between(r, 1.08, 1.22));
  const views = Math.round(sessions * between(r, 1.05, 1.16));
  return {
    day,
    visitors,
    sessions,
    views,
    clicks: Math.round(sessions * m.clicksPerSession * between(r, 0.9, 1.1)),
    ctaClicks: Math.round(views * m.ctaRate * between(r, 0.75, 1.25)),
    formSubmits: m.leads ? Math.round(views * 0.024 * between(r, 0.5, 1.5)) : 0,
    engagedMs: Math.round(sessions * m.engagedS * 1000 * between(r, 0.88, 1.12)),
  };
}

/** Fewer presses on header and footer links than on the page's own content. */
const placeWeight = (sectionId: string) => (/header|nav/i.test(sectionId) ? 0.45 : /footer/i.test(sectionId) ? 0.3 : 1);

/** Where visitors drop off: the share of sessions that saw each section. */
function reachOf(m: Model, sectionIds: string[]): number[] {
  const r = seeded(m.id, "reach");
  let reach = 1;
  return sectionIds.map((id, i) => {
    if (i > 1) reach *= between(r, m.keep[0], m.keep[1]);
    // The footer is seen by fewer people than the section above it.
    return /footer/i.test(id) ? reach * between(r, 0.7, 0.85) : reach;
  });
}

/* The generator ------------------------------------------------------------------------- */

export interface SampleAnalytics {
  overview(days: number): Overview[];
  stats(pageId: string, from: string, to: string): Stats;
  heatmap(pageId: string, targets: Target[], sectionIds: string[], from: string, to: string): Heatmap;
  recent(pageId: string, variant: Variant | null): ActivityRow[];
  forms(pageId: string, variant: Variant | null): LeadRow[];
}

const FIRST = ["Alex", "Sam", "Jordan", "Priya", "Marta", "Noah", "Inês", "Tomás", "Hannah", "Leo", "Maya", "Diego", "Chloe", "Ravi", "Sofia", "Ben"];
const LAST = ["Silva", "Costa", "Miller", "Chen", "Patel", "Ruiz", "Novak", "Okafor", "Moreau", "Schmidt", "Reyes", "Walsh", "Kim", "Ferreira"];

function leadValue(field: string, r: Random, name: { first: string; last: string }, city: string): string {
  const f = field.toLowerCase();
  if (/first/.test(f)) return name.first;
  if (/last|surname/.test(f)) return name.last;
  if (/name/.test(f)) return `${name.first} ${name.last}`;
  if (/mail/.test(f)) return `${name.first}.${name.last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@example.com";
  if (/phone|tel/.test(f)) return `+1 555 ${String(Math.floor(r() * 9000) + 1000)}`;
  if (/city|town/.test(f)) return city;
  if (/guest|party|people|size/.test(f)) return String(2 + Math.floor(r() * 4));
  if (/date|when/.test(f)) return dayKey(Date.now() + Math.floor(between(r, 3, 40)) * DAY);
  return "";
}

export function createSample(brand: Brand, pages: PageRow[]): SampleAnalytics {
  const home = homeOf(brand);
  const now = Date.now();
  const models = new Map(pages.map((p) => [p._id as string, modelOf(p, home)]));
  const rowCache = new Map<string, DayRow>();
  const model = (pageId: string) => models.get(pageId);
  const rows = (m: Model, days: string[]) =>
    days.map((day) => {
      const key = `${m.id}|${day}`;
      let row = rowCache.get(key);
      if (!row) {
        row = dayRow(m, day, now);
        rowCache.set(key, row);
      }
      return row;
    });

  const cityFor = (m: Model, r: Random, country: string) => {
    const place = placeOf(m.city);
    if (m.city && place?.country === country && r() < 0.88) return r() < 0.75 ? m.city : pickOne(r, AROUND[m.city.toLowerCase()] ?? [m.city]);
    const list = CITIES[country];
    return list ? pickOne(r, list) : undefined;
  };

  const emptyStats = (from: string, to: string): Stats => ({
    daily: daysBetween(from, to).map((day) => ({ day, views: 0, sessions: 0, visitors: 0, clicks: 0, ctaClicks: 0, formSubmits: 0, engagedMs: 0 })),
    byDevice: {},
    byBrowser: {},
    byCountry: {},
    bySource: {},
    hourly: Array.from({ length: 24 }, () => new Array<number>(7).fill(0)),
  });

  return {
    overview(span) {
      const days = Array.from({ length: span }, (_, i) => dayKey(now - (span - 1 - i) * DAY));
      const prevDays = Array.from({ length: span }, (_, i) => dayKey(now - (2 * span - 1 - i) * DAY));
      const summary = (list: DayRow[]) => {
        const t = { views: 0, sessions: 0, visitors: 0, ctaClicks: 0, formSubmits: 0, engagedMs: 0 };
        for (const d of list) {
          t.views += d.views;
          t.sessions += d.sessions;
          t.visitors += d.visitors;
          t.ctaClicks += d.ctaClicks;
          t.formSubmits += d.formSubmits;
          t.engagedMs += d.engagedMs;
        }
        return {
          views: t.views,
          visitors: t.visitors,
          ctaClicks: t.ctaClicks,
          formSubmits: t.formSubmits,
          avgEngagedMs: t.sessions ? Math.round(t.engagedMs / t.sessions) : 0,
          ctaRate: t.views ? t.ctaClicks / t.views : 0,
        };
      };
      return pages.map((p) => {
        const m = models.get(p._id)!;
        const cur = rows(m, days);
        return { pageId: p._id, ...summary(cur), prev: summary(rows(m, prevDays)), trend: cur.map((d) => d.visitors) };
      });
    },

    stats(pageId, from, to) {
      const m = model(pageId);
      if (!m) return emptyStats(from, to);
      const days = daysBetween(from, to);
      const daily = rows(m, days);
      const hourly = Array.from({ length: 24 }, () => new Array<number>(7).fill(0));
      if (m.personal) {
        const inRange = m.visits.filter((v) => days.includes(dayKey(v.at)));
        const count = (key: (v: Visit) => string) => {
          const out: Record<string, number> = {};
          for (const v of inRange) out[key(v)] = (out[key(v)] ?? 0) + v.views;
          return out;
        };
        for (const v of inRange) hourly[new Date(v.at).getUTCHours()][new Date(v.at).getUTCDay()] += v.views;
        return { daily, byDevice: count((v) => v.device), byBrowser: count((v) => v.browser), byCountry: count((v) => v.country), bySource: count((v) => v.source), hourly };
      }
      // Views spread over the hours of each day, in the audience's time zone.
      const today = dayKey(now);
      const nowHour = new Date(now).getUTCHours();
      const exact = Array.from({ length: 24 }, () => new Array<number>(7).fill(0));
      for (const d of daily) {
        const dow = new Date(d.day + "T12:00:00.000Z").getUTCDay();
        const hours = Array.from({ length: 24 }, (_, h) => (d.day === today && h > nowHour ? 0 : HOUR_CURVE[localHour(h, m.utc)]));
        const total = hours.reduce((s, x) => s + x, 0);
        if (total) hours.forEach((w, h) => (exact[h][dow] += (d.views * w) / total));
      }
      exact.forEach((row, h) => row.forEach((n, dow) => (hourly[h][dow] = Math.round(n))));
      const views = daily.reduce((s, d) => s + d.views, 0);
      const byDevice = split(views, m.devices);
      return {
        daily,
        byDevice,
        byBrowser: split(views, browserWeights(byDevice)),
        byCountry: split(views, m.countries),
        bySource: split(views, m.sources),
        hourly,
      };
    },

    heatmap(pageId, targets, sectionIds, from, to) {
      const m = model(pageId);
      if (!m || !sectionIds.length) return { points: [], sections: {} };
      const daily = rows(m, daysBetween(from, to));
      const sessions = daily.reduce((s, d) => s + d.sessions, 0);
      const clicks = daily.reduce((s, d) => s + d.clicks, 0);
      const reach = reachOf(m, sectionIds);
      const reachBy = new Map(sectionIds.map((id, i) => [id, reach[i]]));
      const sections: Heatmap["sections"] = {};
      sectionIds.forEach((id, i) => (sections[id] = { seen: Math.round(sessions * reach[i]), clicks: 0 }));
      const r = seeded(m.id, "heat", from, to);
      const main = m.cta.label.toLowerCase();
      const usable = targets.filter((t) => reachBy.has(t.sectionId));
      // The page's own CTA draws most presses, other CTAs next; nav and footer links fewer.
      const weightOf = (t: Target) => {
        const base = t.cta ? (main && t.label.toLowerCase().includes(main) ? 10 : 2.5) : 1;
        return base * placeWeight(t.sectionId) * (reachBy.get(t.sectionId) ?? 0);
      };
      const weighted = usable.map((t, i) => [String(i), weightOf(t)] as [string, number]);
      const strayBy: Weights = sectionIds.map((id, i) => [id, reach[i]]);
      // The real query reads at most 5000 clicks.
      const n = Math.min(clicks, 5000);
      const points: Heatmap["points"] = [];
      for (let i = 0; i < n; i++) {
        if (!weighted.length || r() < 0.12) {
          // A click on text or an image: no element label, as with real visitors.
          const sectionId = pick(r, strayBy);
          points.push({ sectionId, x: 0.06 + 0.88 * centred(r), y: 0.08 + 0.84 * r() });
          continue;
        }
        const t = usable[Number(pick(r, weighted))];
        points.push({ sectionId: t.sectionId, x: t.x + t.w * centred(r), y: t.y + t.h * centred(r), label: t.label || undefined });
      }
      const scale = n ? clicks / n : 0;
      const counts = new Map<string, number>();
      for (const p of points) counts.set(p.sectionId, (counts.get(p.sectionId) ?? 0) + 1);
      for (const [id, c] of counts) if (sections[id]) sections[id].clicks = Math.round(c * scale);
      return { points, sections };
    },

    recent(pageId, variant) {
      const m = model(pageId);
      if (!m) return [];
      const controls = controlsOf(variant);
      const order = [...new Set(controls.map((c) => c.sectionId))];
      const reach = new Map(reachOf(m, order).map((n, i) => [order[i], n]));
      const weightsOf = (list: Control[]): Weights => list.map((c, i) => [String(i), placeWeight(c.sectionId) * (reach.get(c.sectionId) ?? 0)]);
      // The page's CTA appears in several places (header, hero, closing band); presses spread over them.
      const label = m.cta.label.toLowerCase();
      const ctas = controls.filter((c) => c.cta && label && c.label.toLowerCase().includes(label));
      const mains = ctas.length ? ctas : controls.filter((c) => c.cta);
      const mainBy = weightsOf(mains);
      const others = controls.filter((c) => !c.cta && c.label);
      const otherBy = weightsOf(others);
      const offsite = /^https?:\/\//.test(m.cta.href);
      const out: ActivityRow[] = [];
      const add = (row: Omit<ActivityRow, "_id">) => out.push({ ...row, _id: `sample-${m.id}-${out.length}` as ActivityRow["_id"] });
      const session = (r: Random, at: number, v: Omit<Visit, "at" | "views" | "engagedMs">, sessionId: string) => {
        const base = { sessionId, device: v.device, country: v.country, city: v.city, source: v.source };
        add({ ...base, type: "pageview", at });
        let t = at;
        for (let c = 0; c < Math.min(v.clicks, 3) && others.length; c++) {
          t += between(r, 6, 80) * 1000;
          const o = others[Number(pick(r, otherBy))];
          add({ ...base, type: "click", at: t, label: o.label, sectionId: o.sectionId });
        }
        if (v.cta) {
          t += between(r, 10, 120) * 1000;
          const main = mains.length ? mains[Number(pick(r, mainBy))] : undefined;
          const label = main?.label || m.cta.label;
          add({ ...base, type: "cta_click", at: t, label, sectionId: main?.sectionId });
          if (offsite) add({ ...base, type: "outbound", at: t + 400, label, sectionId: main?.sectionId });
        }
      };

      if (m.personal) {
        const r = seeded(m.id, "recent");
        m.visits.forEach((v, i) => session(r, v.at, { ...v, clicks: Math.min(v.clicks, 2) }, `sample-s${i}`));
      } else {
        // Sessions arrive at today's pace for each hour, walking back from now.
        const r = seeded(m.id, "recent", dayKey(now), new Date(now).getUTCHours());
        const perDay = fullDay(m, dayKey(now), now).visitors * 1.15;
        let at = now - between(r, 0.5, 6) * 60_000;
        for (let s = 0; out.length < 40 && s < 80; s++) {
          const device = pick(r, m.devices);
          const country = pick(r, m.countries);
          session(
            r,
            at,
            {
              device,
              browser: browserOf(r, device),
              country,
              city: cityFor(m, r, country),
              source: pick(r, m.sources),
              clicks: r() < 0.5 ? (r() < 0.7 ? 1 : 2) : 0,
              cta: r() < m.ctaRate * 2.4,
            },
            `sample-s${s}`,
          );
          const perHour = Math.max(0.05, (perDay * HOUR_CURVE[localHour(new Date(at).getUTCHours(), m.utc)]) / HOUR_TOTAL);
          at -= (-Math.log(1 - r()) / perHour) * HOUR;
        }
      }
      return out.filter((e) => e.at <= now).sort((a, b) => b.at - a.at);
    },

    forms(pageId, variant) {
      const m = model(pageId);
      if (!m?.leads) return [];
      const form = formOf(variant);
      const days = daysBetween(dayKey(now - 59 * DAY), dayKey(now));
      const out: LeadRow[] = [];
      for (const d of rows(m, days)) {
        const r = seeded(m.id, "leads", d.day);
        for (let i = 0; i < d.formSubmits; i++) {
          const name = { first: pickOne(r, FIRST), last: pickOne(r, LAST) };
          const country = pick(r, m.countries);
          const city = cityFor(m, r, country) ?? "";
          const hour = localHour(Math.floor(between(r, 8, 23)), -m.utc);
          const at = Math.min(now - 60_000, dayStart(d.day) + hour * HOUR + Math.floor(r() * 60) * 60_000);
          const fields = Object.fromEntries(form.fields.map((f) => [f, leadValue(f, r, name, city)]));
          out.push({ _id: `sample-lead-${m.id}-${d.day}-${i}` as LeadRow["_id"], at, sectionId: form.sectionId, fields });
        }
      }
      return out.sort((a, b) => b.at - a.at).slice(0, 200);
    },
  };
}
