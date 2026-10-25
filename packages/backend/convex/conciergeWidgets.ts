import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";

// Each account's own concierge widgets. A widget points at a store's catalog
// and carries what the merchant can change: whether it's on, and the profile
// the concierge introduces the store with. The demo stores (Marlow, Fold) are
// per account like the Pages and Email demos: the account whose email is
// PAGES_DEMO_OWNER_EMAIL (the owner of every service's demo masters) owns the
// masters, whose keys are the store keys the demo storefronts use; every other
// account gets its own copy with its own key.

/** Stores every account gets a widget for. */
export const DEMO_STORES = ["marlow", "fold"];

export type WidgetDoc = Doc<"conciergeWidgets">;

export async function widgetByKey(ctx: QueryCtx, key: string) {
  return ctx.db
    .query("conciergeWidgets")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

export async function storeByKey(ctx: QueryCtx, key: string) {
  return ctx.db
    .query("stores")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

/** The store whose catalog a widget serves: its synced catalog once it has one. */
export const servedStoreKey = (widget: WidgetDoc) => widget.catalogKey ?? widget.storeKey;

/**
 * What a key a page loads with resolves to: a widget (when an account has
 * one under that key) and the store whose catalog it serves. A bare store
 * key with no widget (a store nobody has claimed) is the store alone.
 */
export async function resolveKey(ctx: QueryCtx, key: string) {
  const widget = await widgetByKey(ctx, key);
  const store = await storeByKey(ctx, widget ? servedStoreKey(widget) : key);
  return { widget, store };
}

/** The signed-in account's widget behind `key`, or an error that reads the same for missing and not yours. */
export async function ownWidget(ctx: QueryCtx, key: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to change settings");
  const widget = await widgetByKey(ctx, key);
  if (!widget || widget.owner !== identity.subject)
    throw new ConvexError("Unknown widget");
  return widget;
}

/**
 * The signed-in account's widget for a store: null when there's no such
 * store or nobody is signed in, "provision" when the account hasn't got its
 * copy yet (the console then calls `provision`).
 */
export const mine = query({
  args: { storeKey: v.string() },
  handler: async (ctx, { storeKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    let store = await storeByKey(ctx, storeKey);
    if (!store) return null;
    const widget = await ctx.db
      .query("conciergeWidgets")
      .withIndex("by_owner_store", (q) =>
        q.eq("owner", identity.subject).eq("storeKey", storeKey),
      )
      .unique();
    if (!widget) return "provision" as const;
    const served = widget.catalogKey ? await storeByKey(ctx, widget.catalogKey) : null;
    if (served) store = served;
    return {
      key: widget.key,
      name: widget.name ?? store.name,
      tagline: widget.tagline ?? store.tagline,
      description: widget.description ?? store.description,
      paused: widget.paused ?? false,
    };
  },
});

/** Gives the signed-in account its widget for every demo store it lacks. Returns how many it added. */
export const provision = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const masterEmail = process.env.PAGES_DEMO_OWNER_EMAIL?.trim().toLowerCase();
    const isMasterOwner =
      !!masterEmail && identity.email?.toLowerCase() === masterEmail;
    let added = 0;
    for (const storeKey of DEMO_STORES) {
      if (!(await storeByKey(ctx, storeKey))) continue;
      const have = await ctx.db
        .query("conciergeWidgets")
        .withIndex("by_owner_store", (q) =>
          q.eq("owner", identity.subject).eq("storeKey", storeKey),
        )
        .unique();
      if (have) continue;
      // The demo owner claims the master, keyed like the store itself.
      let key = storeKey;
      if (!isMasterOwner || (await widgetByKey(ctx, storeKey))) {
        do key = `${storeKey}-${Math.random().toString(36).slice(2, 6)}`;
        while (await widgetByKey(ctx, key));
      }
      await ctx.db.insert("conciergeWidgets", {
        owner: identity.subject,
        storeKey,
        key,
        paused: false,
        createdAt: Date.now(),
      });
      added++;
    }
    return added;
  },
});

export const updateProfile = mutation({
  args: {
    key: v.string(),
    name: v.string(),
    tagline: v.string(),
    description: v.string(),
  },
  handler: async (ctx, { key, ...profile }) => {
    const widget = await ownWidget(ctx, key);
    const name = profile.name.trim();
    if (!name) throw new ConvexError("Give the store a name");
    await ctx.db.patch(widget._id, {
      name: name.slice(0, 60),
      tagline: profile.tagline.trim().slice(0, 120),
      description: profile.description.trim().slice(0, 1200),
    });
  },
});

export const setPaused = mutation({
  args: { key: v.string(), paused: v.boolean() },
  handler: async (ctx, { key, paused }) => {
    const widget = await ownWidget(ctx, key);
    await ctx.db.patch(widget._id, { paused });
  },
});

/** Removes an account's widgets with their domains, pings and store connections. `npx convex run conciergeWidgets:purgeOwner '{"owner":"…"}'`. */
export const purgeOwner = internalMutation({
  args: { owner: v.string() },
  returns: v.number(),
  handler: async (ctx, { owner }) => {
    const widgets = await ctx.db
      .query("conciergeWidgets")
      .withIndex("by_owner_store", (q) => q.eq("owner", owner))
      .collect();
    for (const w of widgets) {
      for (const table of ["widgetDomains", "widgetPings", "catalogConnections"] as const)
        for (const row of await ctx.db
          .query(table)
          .withIndex("by_widget", (q) => q.eq("widgetKey", w.key))
          .collect())
          await ctx.db.delete(row._id);
      await ctx.db.delete(w._id);
    }
    return widgets.length;
  },
});
