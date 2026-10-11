import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { proxy } from "./qloo";
import { validateDoc } from "./pagesTypes";

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

/* Pages service -------------------------------------------------------------
   The intake/builder agent writes here; the console reads via Convex
   subscriptions. All routes share QLOO_PROXY_SECRET. */

const asId = <T extends TableNames>(value: unknown) => (typeof value === "string" ? (value as Id<T>) : null);

const withErrors = (handler: (ctx: Parameters<Parameters<typeof httpAction>[0]>[0], req: Request) => Promise<Response>) =>
  httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    try {
      return await handler(ctx, req);
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err);
      // Validation failures (invalid doc, unknown id) are the caller's problem.
      const status = /Invalid doc|Unknown|expected|ArgumentValidationError/i.test(message) ? 400 : 500;
      return json({ error: message.slice(0, 2000) }, status);
    }
  });

/** Intake progress, kit, brief, screenshot, crawled URLs, spans. */
http.route({
  path: "/pages/brand",
  method: "POST",
  handler: withErrors(async (ctx, req) => {
    const { brandId, patch } = await req.json();
    const id = asId<"pagesBrands">(brandId);
    if (!id || !patch) return json({ error: "expected { brandId, patch }" }, 400);
    await ctx.runMutation(internal.pagesBrands.patch, { id, patch });
    return json({ ok: true });
  }),
});

/** Audience brief / name / status from the agent. */
http.route({
  path: "/pages/audience",
  method: "POST",
  handler: withErrors(async (ctx, req) => {
    const { audienceId, patch } = await req.json();
    const id = asId<"pagesAudiences">(audienceId);
    if (!id || !patch) return json({ error: "expected { audienceId, patch }" }, 400);
    await ctx.runMutation(internal.pagesAudiences.patch, { id, patch });
    return json({ ok: true });
  }),
});

/** Cluster names and status for a CSV upload. */
http.route({
  path: "/pages/upload",
  method: "POST",
  handler: withErrors(async (ctx, req) => {
    const { uploadId, patch } = await req.json();
    const id = asId<"pagesUploads">(uploadId);
    if (!id || !patch) return json({ error: "expected { uploadId, patch }" }, 400);
    await ctx.runMutation(internal.pagesUploads.patch, { id, patch });
    return json({ ok: true });
  }),
});

/** A variant's doc (validated; version bumps), status, error, spans, name. */
http.route({
  path: "/pages/variant",
  method: "POST",
  handler: withErrors(async (ctx, req) => {
    const { variantId, patch } = await req.json();
    const id = asId<"pagesVariants">(variantId);
    if (!id || !patch) return json({ error: "expected { variantId, patch }" }, 400);
    if (patch.doc !== undefined) {
      const problems = validateDoc(patch.doc);
      if (problems.length) return json({ ok: false, error: "invalid doc", problems }, 400);
    }
    const result = await ctx.runMutation(internal.pages.patchVariant, { id, patch });
    return json({ ok: true, ...result });
  }),
});

/** Builder chat messages. */
http.route({
  path: "/pages/build",
  method: "POST",
  handler: withErrors(async (ctx, req) => {
    const { pageId, messages } = await req.json();
    const id = asId<"pages">(pageId);
    if (!id || !Array.isArray(messages)) return json({ error: "expected { pageId, messages }" }, 400);
    await ctx.runMutation(internal.pages.appendBuild, { pageId: id, messages });
    return json({ ok: true });
  }),
});

/** Raw image upload (generated hero images) → a public storage URL. */
http.route({
  path: "/pages/file",
  method: "POST",
  handler: withErrors(async (ctx, req) => {
    const type = req.headers.get("Content-Type") ?? "";
    if (!/^image\//.test(type)) return json({ error: "Content-Type must be image/*" }, 400);
    const brandId = new URL(req.url).searchParams.get("brandId");
    if (!brandId) return json({ error: "brandId query param required" }, 400);
    const blob = await req.blob();
    if (blob.size === 0) return json({ error: "empty body" }, 400);
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    return json({ ok: true, url, storageId, size: blob.size, brandId });
  }),
});

export default http;
