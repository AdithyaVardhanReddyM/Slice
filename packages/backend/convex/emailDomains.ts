import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, type ActionCtx } from "./_generated/server";
import { RESEND_MISSING } from "./emailBrands";
import type { DnsRecord, DomainStatus, EmailDomain } from "./emailTypes";
import { emailDomainValidator } from "./schema";

// A brand sends from its own domain once Resend has verified it. Connecting
// asks Resend for the domain's DNS records (SPF, DKIM, MX for bounces), which
// the merchant adds at their DNS host; `verify` asks Resend to check them.
// Open and click tracking stay off in Resend: Slice's own routes do that.

const RESEND_API = "https://api.resend.com";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ResendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A Resend API call. 429s are retried with backoff (the default limit is
 * about 2 requests a second); any other refusal throws with Resend's own
 * message, which the console shows as is.
 */
export async function resend<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error(RESEND_MISSING);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${RESEND_API}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (res.status === 429 && attempt < 4) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 700 * 2 ** attempt);
      continue;
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      const message = (body as { message?: unknown } | null)?.message;
      throw new ResendError(res.status, typeof message === "string" && message ? message : text || `Resend answered ${res.status}`);
    }
    return body as T;
  }
}

type ResendDomain = {
  id: string;
  name: string;
  status?: string;
  records?: { record?: string; name?: string; type?: string; ttl?: string | number; status?: string; value?: string; priority?: number }[];
};

const STATUSES: DomainStatus[] = ["not_started", "pending", "verified", "failed", "temporary_failure"];

function toDomain(d: ResendDomain): EmailDomain {
  const status = (STATUSES as string[]).includes(d.status ?? "") ? (d.status as DomainStatus) : "pending";
  const records: DnsRecord[] = (d.records ?? []).map((r) => ({
    record: String(r.record ?? ""),
    name: String(r.name ?? ""),
    type: String(r.type ?? ""),
    value: String(r.value ?? ""),
    ...(r.ttl !== undefined && r.ttl !== null ? { ttl: String(r.ttl) } : {}),
    ...(typeof r.priority === "number" ? { priority: r.priority } : {}),
    status: String(r.status ?? "not_started"),
  }));
  return { name: d.name, resendId: d.id, status, records, checkedAt: Date.now() };
}

export const setDomain = internalMutation({
  args: { brandId: v.id("emailBrands"), domain: v.optional(emailDomainValidator) },
  returns: v.null(),
  handler: async (ctx, { brandId, domain }) => {
    if (!(await ctx.db.get(brandId))) throw new Error("Unknown brand");
    await ctx.db.patch(brandId, { domain, updatedAt: Date.now() });
    return null;
  },
});

/** The brand, for its owner (actions can't use editableBrand's db read). */
async function ownBrand(ctx: ActionCtx, brandId: Id<"emailBrands">): Promise<Doc<"emailBrands">> {
  const brand: Doc<"emailBrands"> | null = await ctx.runQuery(internal.emailBrands.getInternal, { id: brandId });
  if (!brand) throw new Error("Unknown brand");
  if (brand.owner && (await ctx.auth.getUserIdentity())?.subject !== brand.owner) throw new Error("Unknown brand");
  return brand;
}

/** "https://www.Shop.com/about" → "shop.com"; null when it isn't a domain name. */
function cleanDomain(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^www\./, "");
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : null;
}

async function save(ctx: ActionCtx, brandId: Id<"emailBrands">, domain: EmailDomain | undefined): Promise<EmailDomain | null> {
  await ctx.runMutation(internal.emailDomains.setDomain, { brandId, domain });
  return domain ?? null;
}

const domainResult = v.union(emailDomainValidator, v.null());

/** Adds the domain in Resend and stores the DNS records to show. A domain Resend already has is picked up as is. */
export const connect = action({
  args: { brandId: v.id("emailBrands"), name: v.string() },
  returns: domainResult,
  handler: async (ctx, { brandId, name }): Promise<EmailDomain | null> => {
    const brand = await ownBrand(ctx, brandId);
    const host = cleanDomain(name);
    if (!host) throw new Error(`"${name}" isn't a domain name. Use the part after the @ in your email address, like yourshop.com.`);
    if (brand.domain?.resendId && brand.domain.name === host) {
      return save(ctx, brandId, toDomain(await resend<ResendDomain>(`/domains/${brand.domain.resendId}`)));
    }
    // Moving to another domain: the old one goes from Resend too.
    if (brand.domain?.resendId) {
      await resend(`/domains/${brand.domain.resendId}`, { method: "DELETE" }).catch(() => null);
    }
    let created: ResendDomain;
    try {
      created = await resend<ResendDomain>("/domains", { method: "POST", body: { name: host } });
    } catch (err) {
      if (!(err instanceof ResendError) || !/already|exists|registered/i.test(err.message)) throw err;
      const all = await resend<{ data?: ResendDomain[] }>("/domains");
      const found = all.data?.find((d) => d.name === host);
      if (!found) throw err;
      created = found;
    }
    // The create reply has the records; a fresh read has the statuses too.
    const full = await resend<ResendDomain>(`/domains/${created.id}`).catch(() => created);
    return save(ctx, brandId, toDomain({ ...created, ...full, records: full.records ?? created.records }));
  },
});

/** Asks Resend to check the DNS records now, then reads the result (verification can take a few minutes). */
export const verify = action({
  args: { brandId: v.id("emailBrands") },
  returns: domainResult,
  handler: async (ctx, { brandId }): Promise<EmailDomain | null> => {
    const brand = await ownBrand(ctx, brandId);
    if (!brand.domain?.resendId) throw new Error("Connect a domain first");
    await resend(`/domains/${brand.domain.resendId}/verify`, { method: "POST" });
    return save(ctx, brandId, toDomain(await resend<ResendDomain>(`/domains/${brand.domain.resendId}`)));
  },
});

/** Reads the domain's current status and records from Resend. */
export const refresh = action({
  args: { brandId: v.id("emailBrands") },
  returns: domainResult,
  handler: async (ctx, { brandId }): Promise<EmailDomain | null> => {
    const brand = await ownBrand(ctx, brandId);
    if (!brand.domain?.resendId) return brand.domain ?? null;
    try {
      return save(ctx, brandId, toDomain(await resend<ResendDomain>(`/domains/${brand.domain.resendId}`)));
    } catch (err) {
      // Removed in Resend's dashboard: say so on the brand rather than failing the page.
      if (err instanceof ResendError && err.status === 404) {
        return save(ctx, brandId, { ...brand.domain, status: "failed", error: "Resend no longer has this domain. Connect it again.", checkedAt: Date.now() });
      }
      throw err;
    }
  },
});

/** Removes the domain from Resend and from the brand. */
export const disconnect = action({
  args: { brandId: v.id("emailBrands") },
  returns: v.null(),
  handler: async (ctx, { brandId }): Promise<null> => {
    const brand = await ownBrand(ctx, brandId);
    if (brand.domain?.resendId && process.env.RESEND_API_KEY) {
      await resend(`/domains/${brand.domain.resendId}`, { method: "DELETE" }).catch((err) => {
        if (!(err instanceof ResendError && err.status === 404)) throw err;
      });
    }
    await save(ctx, brandId, undefined);
    return null;
  },
});
