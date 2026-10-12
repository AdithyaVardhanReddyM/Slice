import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// Shared checks for brands.ts and pages.ts. Everything that ends up in a public
// page's markup or styles passes through here first: the copy is written by an
// LLM from a scraped site, so URLs, colours and font names are untrusted.

export async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to manage pages.");
  return identity.subject;
}

export async function currentOwner(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/** "acme.com" → "https://acme.com/". Throws on anything that isn't a public-looking http(s) URL. */
export function normalizeSiteUrl(input: string): URL {
  const raw = input.trim();
  if (!raw || raw.length > 2048) throw new ConvexError("Enter your website's address.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new ConvexError("That doesn't look like a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConvexError("Only http(s) addresses can be read.");
  }
  if (url.username || url.password) throw new ConvexError("Remove the credentials from the address.");
  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    throw new ConvexError("That doesn't look like a web address.");
  }
  url.hash = "";
  return url;
}

/** http(s) links only; anything else (javascript:, data:) is dropped. */
export function safeHref(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const raw = input.trim();
  if (raw.startsWith("#")) return raw.slice(0, 200);
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Image sources: http(s), or an SVG data URI (rendered via <img>, so scripts in it never run). */
export function safeImage(input: string | undefined): string | undefined {
  if (!input) return undefined;
  if (input.startsWith("data:image/svg+xml;base64,") && input.length < 60_000) return input;
  return safeHref(input);
}

export function safeColor(input: string | undefined, fallback: string): string {
  const raw = (input ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) return "#" + [...raw.slice(1)].map((c) => c + c).join("");
  return fallback;
}

export function safeFont(input: string | undefined): string | undefined {
  const raw = (input ?? "").trim().replace(/^["']|["']$/g, "");
  return /^[A-Za-z0-9][A-Za-z0-9 ]{0,40}$/.test(raw) ? raw : undefined;
}

export const clip = (s: string | undefined, max: number): string =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "page"
  );
}

export const PAGE_GOALS = ["leads", "sales", "signup", "booking"] as const;
export const SECTION_KINDS = ["hero", "benefits", "story", "products", "fit", "faq", "cta"] as const;
export const EVENT_TYPES = ["view", "cta", "quiz"] as const;
