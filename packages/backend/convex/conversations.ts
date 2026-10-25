import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { resolveKey } from "./conciergeWidgets";
import { spanValidator } from "./schema";

// Shopper conversations, written by the agent server as turns complete, so
// the merchant console can replay them with their traces.

const messageValidator = v.object({
  id: v.string(),
  role: v.string(),
  at: v.number(),
  text: v.string(),
  page: v.optional(v.string()),
  picks: v.optional(v.any()),
  trace: v.optional(v.array(spanValidator)),
});

export const append = internalMutation({
  args: {
    sessionId: v.string(),
    storeKey: v.string(),
    profileId: v.optional(v.id("tasteProfiles")),
    messages: v.array(messageValidator),
  },
  returns: v.null(),
  handler: async (ctx, { sessionId, storeKey, profileId, messages }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        messages: [...existing.messages, ...messages],
        profileId: profileId ?? existing.profileId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("conversations", {
        sessionId,
        storeKey,
        profileId,
        messages,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

/** The products a conversation's picks showed, by id and slug, mapped to the id. */
function shownIds(messages: { picks?: unknown }[]) {
  const ids = new Map<string, string>();
  for (const m of messages)
    for (const pick of (m.picks as { product?: { id?: string; slug?: string } }[] | undefined) ?? []) {
      const id = pick.product?.id;
      if (!id) continue;
      ids.set(id, id);
      if (pick.product?.slug) ids.set(pick.product.slug, id);
    }
  return ids;
}

/**
 * Something the shopper did around the chat, from slice.js through the web
 * app's /api/widget/event: opened the concierge, opened a pick, or put a pick
 * in the cart. Clicks and cart adds only count for products the concierge
 * showed in that session, once each. An open can come before the first turn
 * is saved, so it starts the conversation.
 */
export const track = mutation({
  args: {
    key: v.string(),
    sessionId: v.string(),
    type: v.union(v.literal("open"), v.literal("click"), v.literal("cart")),
    productId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { key, sessionId, type, productId }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (!existing) {
      if (type !== "open" || !(await resolveKey(ctx, key)).store) return null;
      await ctx.db.insert("conversations", {
        sessionId,
        storeKey: key,
        messages: [],
        events: [{ type, at: now }],
        createdAt: now,
        updatedAt: now,
      });
      return null;
    }
    if (existing.storeKey !== key) return null;
    const events = existing.events ?? [];
    let id: string | undefined;
    if (type !== "open") {
      id = productId ? shownIds(existing.messages).get(productId) : undefined;
      if (!id) return null;
    }
    if (events.some((e) => e.type === type && e.productId === id)) return null;
    await ctx.db.patch(existing._id, {
      events: [...events, { type, ...(id ? { productId: id } : {}), at: now }].slice(-200),
      updatedAt: now,
    });
    return null;
  },
});

export const get = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) =>
    ctx.db
      .query("conversations")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique(),
});

export const list = query({
  args: { storeKey: v.string(), take: v.optional(v.number()) },
  handler: async (ctx, { storeKey, take = 50 }) =>
    ctx.db
      .query("conversations")
      .withIndex("by_store", (q) => q.eq("storeKey", storeKey))
      .order("desc")
      .take(take),
});
