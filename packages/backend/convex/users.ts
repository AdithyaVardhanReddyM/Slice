import { v } from "convex/values";
import { query } from "./_generated/server";

/** The signed-in merchant as Convex sees them via the Clerk JWT; null when signed out. */
export const viewer = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      subject: v.string(),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return {
      subject: identity.subject,
      name: identity.name ?? null,
      email: identity.email ?? null,
    };
  },
});
