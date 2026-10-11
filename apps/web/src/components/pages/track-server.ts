// Server-side helpers for /api/pages/track and /api/pages/form: a small
// hand-written user-agent parser, geo from Vercel headers, and traffic-source
// classification. No dependencies.

import type { DeviceClass, TrackBatch, TrackEvent, TrackEventType } from "@slice/backend/convex/pagesTypes";

export interface UaInfo {
  device: DeviceClass;
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string | null | undefined): UaInfo {
  const s = ua ?? "";
  let device: DeviceClass = "desktop";
  if (/iPad|Tablet|PlayBook|Silk|Kindle|(Android(?!.*Mobile))/i.test(s)) device = "tablet";
  else if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(s)) device = "mobile";
  // iPadOS 13+ reports as a Mac; the touch hint is the only tell.
  if (device === "desktop" && /Macintosh/.test(s) && /Mobile\//.test(s)) device = "tablet";

  let browser = "Other";
  if (/Edg(e|A|iOS)?\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser\//.test(s)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS\//.test(s)) browser = "Firefox";
  else if (/Chrome\/|CriOS\//.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = "Safari";
  else if (/MSIE|Trident\//.test(s)) browser = "Internet Explorer";
  else if (/bot|crawl|spider|slurp|facebookexternalhit|preview/i.test(s)) browser = "Bot";

  let os = "Other";
  if (/Windows Phone/i.test(s)) os = "Windows Phone";
  else if (/Windows NT/i.test(s)) os = "Windows";
  else if (/Android/i.test(s)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(s)) os = "iOS";
  else if (/CrOS/i.test(s)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/i.test(s)) os = device === "tablet" ? "iPadOS" : "macOS";
  else if (/Linux/i.test(s)) os = "Linux";

  return { device, browser, os };
}

export interface GeoInfo {
  country?: string;
  region?: string;
  city?: string;
}

function decode(v: string | null): string | undefined {
  if (!v) return undefined;
  try {
    return decodeURIComponent(v).trim() || undefined;
  } catch {
    return v.trim() || undefined;
  }
}

/** Vercel edge geo headers, with the page's `?city=` / `?country=` overrides winning. */
export function geoFromHeaders(headers: Headers, overrides?: { city?: string; country?: string }): GeoInfo {
  const city = overrides?.city?.trim() || decode(headers.get("x-vercel-ip-city"));
  const country = overrides?.country?.trim().toUpperCase() || decode(headers.get("x-vercel-ip-country"))?.toUpperCase();
  const region = decode(headers.get("x-vercel-ip-country-region"));
  return { city, country, region };
}

const SOCIAL = /(^|\.)(facebook|fb|instagram|twitter|x|t|tiktok|linkedin|pinterest|reddit|youtube|threads|snapchat|whatsapp|wechat|weibo|vk|lnkd|bsky)\.(com|co|me|net|in|app|social)$/i;
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|ask|aol|startpage|qwant|naver|seznam)\./i;

export type Source = "direct" | "search" | "social" | "email" | "ads" | "referral" | "qr";

export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

/** Order: ads (gclid / paid medium) → email → qr → social → search → referral → direct. */
export function classifySource(utm: Record<string, string> | undefined, referrer: string | undefined, ownHost?: string): { source: Source; referrerHost?: string } {
  const u = Object.fromEntries(Object.entries(utm ?? {}).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  const medium = u.utm_medium ?? "";
  const source = u.utm_source ?? "";
  let referrerHost = hostOf(referrer);
  if (referrerHost && ownHost && referrerHost === ownHost.replace(/^www\./, "").toLowerCase()) referrerHost = undefined;

  if (u.gclid || u.msclkid || /^(cpc|ppc|paid|paidsocial|paid_social|display|cpm|retargeting|ads?)$/.test(medium)) return { source: "ads", referrerHost };
  if (u.fbclid && !medium) return { source: "social", referrerHost };
  if (medium === "email" || medium === "newsletter" || source === "email") return { source: "email", referrerHost };
  if (source === "qr" || medium === "qr" || medium === "ooh" || medium === "print") return { source: "qr", referrerHost };
  if (medium === "social" || (!medium && /^(instagram|facebook|tiktok|linkedin|twitter|x|threads|pinterest|youtube)$/.test(source))) return { source: "social", referrerHost };
  if (referrerHost && SOCIAL.test(referrerHost)) return { source: "social", referrerHost };
  if (referrerHost && SEARCH.test(referrerHost)) return { source: "search", referrerHost };
  if (medium === "organic") return { source: "search", referrerHost };
  if (referrerHost || medium === "referral" || source) return { source: "referral", referrerHost };
  return { source: "direct", referrerHost };
}

const EVENT_TYPES = new Set<TrackEventType>(["pageview", "heartbeat", "scroll", "section_seen", "click", "cta_click", "form_submit", "quiz_answer", "outbound"]);
const MAX_EVENTS = 200;

function str(v: unknown, max = 500): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function strMap(v: unknown, maxKeys = 40): Record<string, string> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, maxKeys)) {
    if (typeof val === "string") out[k.slice(0, 64)] = val.slice(0, 2000);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Validates and trims an incoming batch. Returns null when it is unusable. */
export function sanitizeBatch(input: unknown): TrackBatch | null {
  if (!input || typeof input !== "object") return null;
  const b = input as Record<string, unknown>;
  const pageId = str(b.pageId, 64);
  const variantId = str(b.variantId, 64);
  const visitorId = str(b.visitorId, 64);
  const sessionId = str(b.sessionId, 64);
  if (!pageId || !variantId || !visitorId || !sessionId || !Array.isArray(b.events)) return null;
  const events: TrackEvent[] = [];
  for (const raw of (b.events as unknown[]).slice(0, MAX_EVENTS)) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const type = e.type as TrackEventType;
    if (!EVENT_TYPES.has(type)) continue;
    events.push({
      type,
      at: num(e.at) ?? Date.now(),
      sectionId: str(e.sectionId, 64),
      label: str(e.label, 120),
      href: str(e.href, 2000),
      x: num(e.x),
      y: num(e.y),
      value: num(e.value),
      data: strMap(e.data),
    });
  }
  if (events.length === 0) return null;
  const screen = b.screen && typeof b.screen === "object" ? { w: num((b.screen as Record<string, unknown>).w) ?? 0, h: num((b.screen as Record<string, unknown>).h) ?? 0 } : undefined;
  return {
    pageId,
    variantId,
    visitorId,
    sessionId,
    resolvedBy: str(b.resolvedBy, 32) ?? "default",
    path: str(b.path, 500) ?? "/",
    referrer: str(b.referrer, 2000),
    utm: strMap(b.utm, 12),
    screen,
    events,
  };
}

/** Everything `api.pagesEvents.ingest` takes, derived from the batch and the request. */
export function ingestArgs(batch: TrackBatch, headers: Headers, overrides?: { city?: string; country?: string }) {
  const ua = parseUserAgent(headers.get("user-agent"));
  const geo = geoFromHeaders(headers, overrides);
  const { source, referrerHost } = classifySource(batch.utm, batch.referrer, headers.get("host") ?? undefined);
  return {
    batch,
    device: ua.device,
    browser: ua.browser,
    os: ua.os,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    source,
    referrerHost,
  };
}

/** Parses a JSON body that may arrive as text/plain (sendBeacon) or application/json. */
export async function readJson(req: Request): Promise<unknown | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
