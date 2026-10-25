import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { productInput, replaceCatalog, storeInput } from "./catalog";
import { DEMO_STORES, servedStoreKey, storeByKey, widgetByKey } from "./conciergeWidgets";

// A widget's catalog synced from the merchant's store platform: Shopify
// through Composio, WooCommerce through its REST API (the agent does both;
// see apps/agent/slice_catalog). The console reads the connection's state;
// only the agent, through the HTTP routes in http.ts, sees the stored keys
// and writes synced catalogs.

export type ConnectionDoc = Doc<"catalogConnections">;

const platform = v.union(v.literal("shopify"), v.literal("woocommerce"));
const status = v.union(
  v.literal("pending"),
  v.literal("connected"),
  v.literal("syncing"),
  v.literal("error"),
);

async function byWidget(ctx: QueryCtx, widgetKey: string) {
  return ctx.db
    .query("catalogConnections")
    .withIndex("by_widget", (q) => q.eq("widgetKey", widgetKey))
    .unique();
}

/** What the console may see: never the keys or the callback state. */
function publicView(c: ConnectionDoc) {
  return {
    platform: c.platform,
    status: c.status,
    shop: c.shop,
    products: c.products ?? null,
    skipped: c.skipped ?? null,
    lastSyncAt: c.lastSyncAt ?? null,
    error: c.error ?? null,
    updatedAt: c.updatedAt,
  };
}

export type PublicConnection = ReturnType<typeof publicView>;

/**
 * The signed-in account's widget and its store connection, or null when the
 * widget isn't theirs. The console subscribes to it; the web API routes use
 * it to check ownership before calling the agent.
 */
export const forWidget = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const widget = await widgetByKey(ctx, key);
    if (!widget || widget.owner !== identity.subject) return null;
    const row = await byWidget(ctx, key);
    return { widgetKey: key, connection: row ? publicView(row) : null };
  },
});

/* Agent side (http.ts, behind the agent secret) --------------------------------- */

/** The connection with its keys, plus the widget and store the sync writes into. */
export const get = internalQuery({
  args: { widgetKey: v.optional(v.string()), state: v.optional(v.string()) },
  handler: async (ctx, { widgetKey, state }) => {
    const row = state
      ? await ctx.db
          .query("catalogConnections")
          .withIndex("by_state", (q) => q.eq("state", state))
          .unique()
      : widgetKey
        ? await byWidget(ctx, widgetKey)
        : null;
    const key = row?.widgetKey ?? widgetKey;
    const widget = key ? await widgetByKey(ctx, key) : null;
    if (!widget) return null;
    const store = await storeByKey(ctx, servedStoreKey(widget));
    return {
      connection: row,
      widget: {
        key: widget.key,
        storeKey: servedStoreKey(widget),
        name: widget.name ?? store?.name ?? null,
        tagline: widget.tagline ?? store?.tagline ?? "",
        description: widget.description ?? store?.description ?? "",
      },
      store: store
        ? {
            key: store.key,
            name: store.name,
            currency: store.currency,
            vertical: store.vertical,
            siteUrl: store.siteUrl,
            logo: store.logo ?? null,
          }
        : null,
    };
  },
});

/** Starts or updates a widget's connection. A different platform replaces the old one. */
export const save = internalMutation({
  args: {
    widgetKey: v.string(),
    platform,
    shop: v.optional(v.string()),
    status: v.optional(status),
    accountId: v.optional(v.string()),
    secret: v.optional(v.string()),
    state: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { widgetKey, platform, state, error, ...patch }) => {
    if (!(await widgetByKey(ctx, widgetKey))) throw new Error(`Unknown widget ${widgetKey}`);
    const now = Date.now();
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Partial<ConnectionDoc>;
    const nulls = {
      ...(state !== undefined ? { state: state ?? undefined } : {}),
      ...(error !== undefined ? { error: error ?? undefined } : {}),
    };
    let row = await byWidget(ctx, widgetKey);
    if (row && row.platform !== platform) {
      await ctx.db.delete(row._id);
      row = null;
    }
    if (row) {
      await ctx.db.patch(row._id, { ...clean, ...nulls, updatedAt: now });
      return row._id;
    }
    return ctx.db.insert("catalogConnections", {
      widgetKey,
      platform,
      status: clean.status ?? "pending",
      shop: clean.shop ?? "",
      accountId: clean.accountId,
      secret: clean.secret,
      state: nulls.state,
      error: nulls.error,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * A synced catalog's store: the widget's own, keyed by the widget, so a sync
 * never overwrites a shared demo catalog or another account's.
 */
function ownStoreKey(widgetKey: string) {
  return DEMO_STORES.includes(widgetKey) ? `${widgetKey}-own` : widgetKey;
}

/** Writes a synced catalog and has the widget serve it. */
export const applySync = internalMutation({
  args: {
    widgetKey: v.string(),
    store: storeInput,
    products: v.array(productInput),
    skipped: v.number(),
  },
  returns: v.object({ storeKey: v.string(), products: v.number() }),
  handler: async (ctx, { widgetKey, store, products, skipped }) => {
    const widget = await widgetByKey(ctx, widgetKey);
    const row = await byWidget(ctx, widgetKey);
    if (!widget || !row) throw new Error(`Unknown widget ${widgetKey}`);
    const storeKey = ownStoreKey(widgetKey);
    await replaceCatalog(ctx, { ...store, key: storeKey }, products);
    if (widget.catalogKey !== storeKey) await ctx.db.patch(widget._id, { catalogKey: storeKey });
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "connected",
      storeKey,
      products: products.length,
      skipped,
      lastSyncAt: now,
      error: undefined,
      updatedAt: now,
    });
    return { storeKey, products: products.length };
  },
});

/**
 * Disconnects a widget. Its synced catalog stays (reconnecting picks it up
 * again), except a demo widget goes back to serving the demo catalog.
 */
export const remove = internalMutation({
  args: { widgetKey: v.string() },
  handler: async (ctx, { widgetKey }) => {
    const row = await byWidget(ctx, widgetKey);
    if (!row) return null;
    const widget = await widgetByKey(ctx, widgetKey);
    if (widget?.catalogKey && DEMO_STORES.includes(widget.storeKey))
      await ctx.db.patch(widget._id, { catalogKey: undefined });
    await ctx.db.delete(row._id);
    return { platform: row.platform, accountId: row.accountId ?? null };
  },
});
