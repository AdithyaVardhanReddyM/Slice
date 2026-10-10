import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
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
