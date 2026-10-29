import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

// Guest workspaces ("Continue as guest", apps/web api/guest) are Clerk users
// flagged `publicMetadata.guest`. They stay until this purge runs:
//   npx convex run guests:purge '{"dryRun": true}'   lists them
//   npx convex run guests:purge                       removes them
// Needs CLERK_SECRET_KEY in the Convex env (the same key as apps/web).

const CLERK_API = "https://api.clerk.com/v1";
const PAGE = 100;

type ClerkUser = {
  id: string;
  created_at: number;
  public_metadata?: { guest?: unknown };
  email_addresses?: { email_address: string }[];
};

async function clerk(path: string, init?: RequestInit) {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("Set CLERK_SECRET_KEY first: npx convex env set CLERK_SECRET_KEY sk_…");
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Clerk ${init?.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function guestUsers(): Promise<ClerkUser[]> {
  const out: ClerkUser[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const users = (await clerk(`/users?limit=${PAGE}&offset=${offset}&order_by=created_at`)) as ClerkUser[];
    out.push(...users.filter((u) => u.public_metadata?.guest === true));
    if (users.length < PAGE) return out;
  }
}

/** Removes every guest: what each one owns in all four services, then the Clerk user. */
export const purge = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({ guests: v.number(), removed: v.number(), ids: v.array(v.string()) }),
  handler: async (ctx, { dryRun = false }) => {
    const demoOwner = process.env.PAGES_DEMO_OWNER_EMAIL?.trim().toLowerCase();
    const guests = (await guestUsers()).filter(
      // Never the account that owns the demo masters, whatever its metadata says.
      (u) => !u.email_addresses?.some((e) => e.email_address.toLowerCase() === demoOwner),
    );
    const ids = guests.map((u) => `${u.id} (made ${new Date(u.created_at).toISOString().slice(0, 10)})`);
    if (dryRun) return { guests: guests.length, removed: 0, ids };
    for (const u of guests) {
      await ctx.runMutation(internal.guests.purgeOwner, { owner: u.id });
      await clerk(`/users/${u.id}`, { method: "DELETE" });
    }
    return { guests: guests.length, removed: guests.length, ids };
  },
});

/**
 * Removes what one account owns. Concierge conversations and visits go here
 * (they hang off the widget keys); the rest is scheduled with each service's
 * own purge, which batches the big tables.
 */
export const purgeOwner = internalMutation({
  args: { owner: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner }) => {
    const widgets = await ctx.db
      .query("conciergeWidgets")
      .withIndex("by_owner_store", (q) => q.eq("owner", owner))
      .collect();
    for (const w of widgets) {
      for (const c of await ctx.db.query("conversations").withIndex("by_store", (q) => q.eq("storeKey", w.key)).collect())
        await ctx.db.delete(c._id);
      for (const d of await ctx.db.query("widgetVisits").withIndex("by_widget_day", (q) => q.eq("widgetKey", w.key)).collect())
        await ctx.db.delete(d._id);
    }
    await ctx.scheduler.runAfter(0, internal.conciergeWidgets.purgeOwner, { owner });

    await ctx.scheduler.runAfter(0, internal.mediaDemo.purgeOwner, { owner });

    for (const brand of await ctx.db.query("pagesBrands").withIndex("by_owner", (q) => q.eq("owner", owner)).collect()) {
      const pageIds = (await ctx.db.query("pages").withIndex("by_brand", (q) => q.eq("brandId", brand._id)).collect()).map((p) => p._id);
      await ctx.db.patch(brand._id, { status: "deleting", updatedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.pagesBrands.purgeChunk, { brandId: brand._id, pageIds, reschedule: true });
    }

    for (const brand of await ctx.db.query("emailBrands").withIndex("by_owner", (q) => q.eq("owner", owner)).collect())
      await ctx.scheduler.runAfter(0, internal.emailBrands.purgeChunk, { brandId: brand._id, reschedule: true });

    return null;
  },
});
