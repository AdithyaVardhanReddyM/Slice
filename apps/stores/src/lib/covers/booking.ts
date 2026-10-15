// Covers booking maths: London dates, opening sittings and which tables are
// free. All of it is deterministic (a hash of the restaurant, day and time), so
// a restaurant shows the same times every time you look at the same day, on the
// home page, in search results and on its own page. No data import here, so
// client components can use it without pulling in the whole catalogue.

export const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const DEFAULT_PARTY = 2;
export const DEFAULT_TIME = "19:30";
/** How far ahead you can book. */
export const BOOKING_DAYS = 14;

const range = (from: string, to: string, step = 15) => {
  const out: string[] = [];
  for (let m = toMinutes(from); m <= toMinutes(to); m += step) out.push(fromMinutes(m));
  return out;
};

export const LUNCH_TIMES = range("12:00", "14:15");
export const DINNER_TIMES = range("17:30", "21:45");
/** The times the search bar offers, on the half hour. */
export const SEARCH_TIMES = [...range("12:00", "14:00", 30), ...range("17:30", "21:30", 30)];

export function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** FNV-1a: small, fast and stable across server and browser. */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---- Dates (ISO "2026-10-23", always London's calendar day) ---- */

export const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Today's date in London. */
export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Minutes past midnight in London, to the minute. */
export function londonMinutes(now = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
  return h * 60 + m;
}

/** Today's sittings that start at least half an hour from now; any other day as it is. */
export function stillBookable(s: Sittings, date: string, today: string, now: number | null): Sittings {
  if (date !== today || now === null) return s;
  const later = (t: string) => toMinutes(t) >= now + 30;
  return { lunch: s.lunch.filter(later), dinner: s.dinner.filter(later) };
}

const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export function addDays(iso: string, n: number) {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The days you can book, starting today. */
export const bookableDays = (today: string) => Array.from({ length: BOOKING_DAYS }, (_, i) => addDays(today, i));

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(utc(iso));

/** "Friday 23 October" */
export const longDate = (iso: string) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
/** "Fri 23 Oct" */
export const shortDate = (iso: string) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
/** "Fri" */
export const weekday = (iso: string) => fmt(iso, { weekday: "short" });
/** "23" */
export const dayOfMonth = (iso: string) => String(utc(iso).getUTCDate());

/** "Today", "Tomorrow" or "Sun 18 Oct". */
export function dayLabel(iso: string, today: string) {
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  return shortDate(iso);
}

/* ---- Tables ---- */

export interface Bookable {
  slug: string;
  price: number;
  collections: readonly string[];
}

export interface Sittings {
  lunch: string[];
  dinner: string[];
}

/**
 * The times a restaurant has a table for this party on this day. Bigger parties
 * see a subset of what smaller ones see, quieter nights have more room, and
 * tasting-menu kitchens only do lunch at the weekend and seat on the half hour.
 */
export function sittings(r: Bookable, date: string, party: number): Sittings {
  const day = utc(date).getUTCDay(); // 0 Sunday … 6 Saturday
  const tasting = r.collections.includes("tasting-menus");
  const weekend = day === 0 || day === 5 || day === 6;

  let chance = 0.56 - (r.price - 2) * 0.07;
  if (day >= 1 && day <= 3) chance += 0.12;
  if (day === 5 || day === 6) chance -= 0.12;
  if (party >= 5) chance -= 0.22;
  else if (party >= 3) chance -= 0.08;
  chance = Math.min(0.8, Math.max(0.12, chance));

  const free = (times: string[], min: number) => {
    const pool = tasting ? times.filter((t) => t.endsWith(":00") || t.endsWith(":30")) : times;
    const score = (t: string) => (hash(`${r.slug}|${date}|${t}`) % 1000) / 1000;
    const open = pool.filter((t) => score(t) < chance);
    if (open.length >= min) return open;
    // Every restaurant keeps a couple of tables back, so a day is never empty.
    const kept = [...pool].sort((a, b) => score(a) - score(b)).slice(0, min);
    return pool.filter((t) => open.includes(t) || kept.includes(t));
  };

  return {
    lunch: tasting && !weekend ? [] : free(LUNCH_TIMES, party >= 5 ? 1 : 2),
    dinner: free(DINNER_TIMES, 2),
  };
}

/** Up to `n` free times closest to the time asked for, in order, leaving out any before `after` (minutes past midnight). */
export function nearestTimes(r: Bookable, date: string, party: number, around = DEFAULT_TIME, n = 3, after = -1) {
  const { lunch, dinner } = sittings(r, date, party);
  const target = toMinutes(around);
  return [...lunch, ...dinner]
    .filter((t) => toMinutes(t) >= after)
    .sort((a, b) => Math.abs(toMinutes(a) - target) - Math.abs(toMinutes(b) - target) || toMinutes(a) - toMinutes(b))
    .slice(0, n)
    .sort((a, b) => toMinutes(a) - toMinutes(b));
}

/**
 * The day to show free tables for when nobody asked: today, or tomorrow once
 * the last dinner sitting is less than half an hour away. `after` is the
 * earliest time still worth offering on that day.
 */
export function showingDay(today: string, now: number) {
  const tomorrow = now + 30 > toMinutes(DINNER_TIMES[DINNER_TIMES.length - 1]);
  return tomorrow ? { day: addDays(today, 1), after: -1, tonight: false } : { day: today, after: now + 30, tonight: true };
}

/** A booking reference that looks like one: "CV-7K3QF". */
export function bookingRef(slug: string, date: string, time: string, party: number) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let h = hash(`${slug}|${date}|${time}|${party}`);
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += alphabet[h % alphabet.length];
    h = Math.floor(h / alphabet.length) || hash(out);
  }
  return `CV-${out}`;
}

/* ---- Query strings ---- */

export interface BookingQuery {
  date?: string;
  party?: number;
  time?: string;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Date, party and time from a URL, each only when it's one we can book. */
export function parseBooking(sp: Params, today: string): BookingQuery {
  const date = first(sp.date);
  const party = Number(first(sp.party));
  const time = first(sp.time);
  const days = bookableDays(today);
  return {
    date: isIsoDate(date) && days.includes(date) ? date : undefined,
    party: PARTY_SIZES.includes(party as (typeof PARTY_SIZES)[number]) ? party : undefined,
    time: time && (LUNCH_TIMES.includes(time) || DINNER_TIMES.includes(time)) ? time : undefined,
  };
}

/** "?date=2026-10-23&party=2&time=19:30", leaving out what's empty. */
export function queryString(q: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
