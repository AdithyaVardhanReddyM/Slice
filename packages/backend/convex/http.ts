import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { proxy } from "./qloo";

const http = httpRouter();

// The agent calls Qloo through here so it shares the cache and never holds the key.
http.route({ path: "/qloo", method: "POST", handler: proxy });

// Writes the agent makes as it works. Reads go through the public query API
// (POST /api/query on the .convex.cloud URL). All share QLOO_PROXY_SECRET.

function authorized(req: Request): boolean {
  const secret = process.env.QLOO_PROXY_SECRET;
  return !!secret && req.headers.get("Authorization") === `Bearer ${secret}`;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** The agent's reading of a taste profile in the store's vocabulary. */
http.route({
  path: "/agent/brief",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const { profileId, brief, span } = await req.json();
    await ctx.runMutation(internal.taste.saveBrief, {
      id: profileId as Id<"tasteProfiles">,
      brief,
      span,
    });
    return json({ ok: true });
  }),
});

/** Products described in Qloo's tag vocabulary, from the agent's tagging job. */
http.route({
  path: "/agent/product-tags",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const { storeKey, items } = await req.json();
    const saved = await ctx.runMutation(internal.catalogTaste.saveTags, { storeKey, items });
    return json({ ok: true, saved });
  }),
});

/** A taste signal the shopper mentioned in chat. */
http.route({
  path: "/agent/signal",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const { profileId, query, kind } = await req.json();
    const result = await ctx.runAction(api.taste.addSignal, {
      id: profileId as Id<"tasteProfiles">,
      query,
      kind,
    });
    return json(result);
  }),
});

/** Completed turns, for the merchant console. */
http.route({
  path: "/agent/messages",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const { sessionId, storeKey, profileId, messages } = await req.json();
    await ctx.runMutation(internal.conversations.append, {
      sessionId,
      storeKey,
      profileId: profileId ? (profileId as Id<"tasteProfiles">) : undefined,
      messages,
    });
    return json({ ok: true });
  }),
});

// --- Pages: the agent reads a brand's site and writes page variants ---------

/** A brand (to extract) or a page with its brand (to generate). */
http.route({
  path: "/agent/pages/load",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const { brandId, pageId } = await req.json();
    if (typeof pageId === "string") {
      return json(await ctx.runQuery(internal.pages.agentLoad, { id: pageId as Id<"pages"> }));
    }
    if (typeof brandId === "string") {
      return json(await ctx.runQuery(internal.brands.agentLoad, { id: brandId as Id<"brands"> }));
    }
    return json({ error: "brandId or pageId required" }, 400);
  }),
});

/** Extraction progress and the finished brand kit. */
http.route({
  path: "/agent/pages/brand",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const { brandId, patch } = await req.json();
    await ctx.runMutation(internal.brands.agentPatch, { id: brandId as Id<"brands">, ...patch });
    return json({ ok: true });
  }),
});

/** Generation progress and the finished variants. */
http.route({
  path: "/agent/pages/page",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const { pageId, patch } = await req.json();
    await ctx.runMutation(internal.pages.agentPatch, { id: pageId as Id<"pages">, ...patch });
    return json({ ok: true });
  }),
});

export default http;
