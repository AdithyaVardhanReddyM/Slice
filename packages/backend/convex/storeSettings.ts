import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";

// What a merchant can change from Settings: whether the concierge is on, and
// the store profile it introduces itself with and reads before every turn.

async function signedIn(ctx: QueryCtx) {
  if (!(await ctx.auth.getUserIdentity()))
    throw new ConvexError("Sign in to change settings");
}

async function storeByKey(ctx: QueryCtx, key: string) {
  return ctx.db
    .query("stores")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    const store = await storeByKey(ctx, key);
    if (!store) return null;
    return {
      name: store.name,
      tagline: store.tagline,
      description: store.description,
      paused: store.paused ?? false,
    };
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
    await signedIn(ctx);
    const store = await storeByKey(ctx, key);
    if (!store) throw new ConvexError("Unknown store");
    const name = profile.name.trim();
    if (!name) throw new ConvexError("Give the store a name");
    await ctx.db.patch(store._id, {
      name: name.slice(0, 60),
      tagline: profile.tagline.trim().slice(0, 120),
      description: profile.description.trim().slice(0, 1200),
    });
  },
});

export const setPaused = mutation({
  args: { key: v.string(), paused: v.boolean() },
  handler: async (ctx, { key, paused }) => {
    await signedIn(ctx);
    const store = await storeByKey(ctx, key);
    if (!store) throw new ConvexError("Unknown store");
    await ctx.db.patch(store._id, { paused });
  },
});
