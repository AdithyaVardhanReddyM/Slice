import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { hostAllowed, normalizeHost } from "./widgetHosts";

// Where slice.js runs for each store: the merchant's allowed domains, and a
// ping from the script at the start of each shopper session so the console
// can show where it's live. Pings arrive through the web app's
// /api/widget/ping, which takes the host from the browser's Origin header.

/** A host's row is rewritten at most this often; busy stores ping constantly. */
const REFRESH_MS = 60_000;

async function domainsOf(ctx: QueryCtx, key: string) {
  return ctx.db
    .query("widgetDomains")
    .withIndex("by_store", (q) => q.eq("storeKey", key))
    .collect();
}

/**
 * A store's allowed hosts; empty means it may run anywhere. Public: the
 * concierge's frame-ancestors header lists them anyway.
 */
export const domains = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) =>
    (await domainsOf(ctx, key)).map((d) => d.host),
});

/** slice.js loaded on `host`. Records it and says whether the concierge may open there. */
export const ping = mutation({
  args: {
    key: v.string(),
    host: v.string(),
    page: v.string(),
    version: v.string(),
  },
  handler: async (ctx, args) => {
    const key = args.key.slice(0, 64);
    const host = args.host.toLowerCase().slice(0, 253);
    const page = args.page.slice(0, 300);
    const version = args.version.slice(0, 32);
    const store = await ctx.db
      .query("stores")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!store) return { allowed: false };

    const allowed = hostAllowed(
      host,
      (await domainsOf(ctx, key)).map((d) => d.host),
    );
    const now = Date.now();
    const seen = await ctx.db
      .query("widgetPings")
      .withIndex("by_store_host", (q) => q.eq("storeKey", key).eq("host", host))
      .unique();
    if (!seen)
      await ctx.db.insert("widgetPings", {
        storeKey: key,
        host,
        allowed,
        page,
        version,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    else if (now - seen.lastSeenAt > REFRESH_MS || seen.allowed !== allowed)
      await ctx.db.patch(seen._id, { allowed, page, version, lastSeenAt: now });
    // A paused concierge stays hidden everywhere; the ping still counts as an install.
    return { allowed: allowed && !store.paused };
  },
});

/** The Install page: allowed domains, and every host slice.js has loaded on, latest first. */
export const status = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    const domains = (await domainsOf(ctx, key)).sort(
      (a, b) => a.addedAt - b.addedAt,
    );
    const hosts = domains.map((d) => d.host);
    const pings = await ctx.db
      .query("widgetPings")
      .withIndex("by_store", (q) => q.eq("storeKey", key))
      .collect();
    return {
      domains: hosts,
      pings: pings
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        .map((p) => ({
          host: p.host,
          // Judged against today's list, so a newly allowed host shows as allowed.
          allowed: hostAllowed(p.host, hosts),
          page: p.page,
          version: p.version,
          firstSeenAt: p.firstSeenAt,
          lastSeenAt: p.lastSeenAt,
        })),
    };
  },
});

async function signedIn(ctx: QueryCtx) {
  if (!(await ctx.auth.getUserIdentity()))
    throw new ConvexError("Sign in to change domains");
}

export const addDomain = mutation({
  args: { key: v.string(), host: v.string() },
  handler: async (ctx, { key, host }) => {
    await signedIn(ctx);
    const clean = normalizeHost(host);
    if (!clean)
      throw new ConvexError(
        "Use a hostname like shop.example.com or *.example.com",
      );
    const exists = await ctx.db
      .query("widgetDomains")
      .withIndex("by_store_host", (q) => q.eq("storeKey", key).eq("host", clean))
      .unique();
    if (!exists)
      await ctx.db.insert("widgetDomains", {
        storeKey: key,
        host: clean,
        addedAt: Date.now(),
      });
    return clean;
  },
});

export const removeDomain = mutation({
  args: { key: v.string(), host: v.string() },
  handler: async (ctx, { key, host }) => {
    await signedIn(ctx);
    const row = await ctx.db
      .query("widgetDomains")
      .withIndex("by_store_host", (q) => q.eq("storeKey", key).eq("host", host))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
