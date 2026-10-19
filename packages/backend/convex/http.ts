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

/** The builder's memory of a page: standing instructions, last review, Qloo names seen. */
http.route({
  path: "/pages/memory",
  method: "POST",
  handler: withErrors(async (ctx, req) => {
    const { pageId, patch } = await req.json();
    const id = asId<"pages">(pageId);
    if (!id || !patch) return json({ error: "expected { pageId, patch }" }, 400);
    await ctx.runMutation(internal.pages.patchMemory, { pageId: id, patch });
    return json({ ok: true });
  }),
});

/** Raw file upload (generated images, site captures, screenshots, markup) → a public storage URL. */
http.route({
  path: "/pages/file",
  method: "POST",
  handler: withErrors(async (ctx, req) => {
    const type = req.headers.get("Content-Type") ?? "";
    if (!/^(image\/|text\/(html|plain))/.test(type)) return json({ error: "Content-Type must be image/*, text/html or text/plain" }, 400);
    const brandId = new URL(req.url).searchParams.get("brandId");
    if (!brandId) return json({ error: "brandId query param required" }, 400);
    const blob = await req.blob();
    if (blob.size === 0) return json({ error: "empty body" }, 400);
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    return json({ ok: true, url, storageId, size: blob.size, brandId });
  }),
});

/* Email service --------------------------------------------------------------
   The setup/builder/personalise agent writes here (QLOO_PROXY_SECRET), and
   recipients' mail clients hit the tracking, unsubscribe and view routes
   (no auth; a send id is the only key). See docs/email-plan.md. */

/** Python's None arrives as null; Convex rejects null in optional fields, so drop it everywhere. */
function dropNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((x) => x !== null).map(dropNulls) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)])) as T;
  }
  return value;
}

const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** An agent write route: secret checked, nulls dropped, refusals ("Unknown campaign", "A sent campaign can't be edited") answered 400. */
const emailRoute = (path: string, handler: (ctx: Parameters<Parameters<typeof httpAction>[0]>[0], body: Record<string, unknown>) => Promise<Response>) =>
  http.route({
    path,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      if (!authorized(req)) return json({ error: "unauthorized" }, 401);
      try {
        return await handler(ctx, dropNulls((await req.json()) ?? {}) as Record<string, unknown>);
      } catch (err) {
        const raw = String(err instanceof Error ? err.message : err);
        const status = /Unknown|expected|can't|isn't|ArgumentValidationError|JSON/i.test(raw) ? 400 : 500;
        // The agent shows the reason, not the server's stack.
        const message = raw.replace(/^Uncaught Error: /, "").split("\n    at ")[0].trim();
        return json({ error: message.slice(0, 2000) }, status);
      }
    }),
  });

/** Setup progress, kit, about, footer, sender, name, url. */
emailRoute("/email/brand", async (ctx, { brandId, patch }) => {
  const id = asId<"emailBrands">(brandId);
  if (!id || !patch || typeof patch !== "object") return json({ error: "expected { brandId, patch }" }, 400);
  await ctx.runMutation(internal.emailBrands.patch, { id, patch: pick(patch as Record<string, unknown>, ["name", "url", "kit", "about", "footer", "sender", "setup"]) });
  return json({ ok: true });
});

/** Items read from the site; names the brand already has are skipped. `ids` line up with the input (null: no name). */
emailRoute("/email/items", async (ctx, { brandId, items }) => {
  const id = asId<"emailBrands">(brandId);
  if (!id || !Array.isArray(items)) return json({ error: "expected { brandId, items }" }, 400);
  const ids = await ctx.runMutation(internal.emailItems.append, { brandId: id, items });
  return json({ ids });
});

/** A whole doc: validated, version bumped, saved. */
emailRoute("/email/doc", async (ctx, { campaignId, doc }) => {
  const id = asId<"emailCampaigns">(campaignId);
  if (!id || !doc) return json({ error: "expected { campaignId, doc }" }, 400);
  return json(await ctx.runMutation(internal.emailCampaigns.writeDoc, { id, doc }));
});

/** Edit operations on the current doc. */
emailRoute("/email/ops", async (ctx, { campaignId, ops }) => {
  const id = asId<"emailCampaigns">(campaignId);
  if (!id || !Array.isArray(ops)) return json({ error: "expected { campaignId, ops }" }, 400);
  return json(await ctx.runMutation(internal.emailCampaigns.writeOps, { id, ops }));
});

/** Builder chat messages (a message id already there is replaced). */
emailRoute("/email/chat", async (ctx, { campaignId, messages }) => {
  const id = asId<"emailCampaigns">(campaignId);
  if (!id || !Array.isArray(messages)) return json({ error: "expected { campaignId, messages }" }, 400);
  await ctx.runMutation(internal.emailCampaigns.appendChat, { id, messages });
  return json({ ok: true });
});

/** One group's or one person's version of a campaign. */
emailRoute("/email/version", async (ctx, body) => {
  const campaignId = asId<"emailCampaigns">(body.campaignId);
  const contactId = asId<"emailContacts">(body.contactId);
  const audienceId = asId<"emailAudiences">(body.audienceId);
  if (!campaignId || !contactId === !audienceId || typeof body.docVersion !== "number") {
    return json({ error: "expected { campaignId, contactId or audienceId, docVersion, personalization }" }, 400);
  }
  await ctx.runMutation(internal.emailCampaigns.saveVersion, {
    campaignId,
    ...(contactId ? { contactId } : {}),
    ...(audienceId ? { audienceId } : {}),
    docVersion: body.docVersion,
    personalization: body.personalization ?? { blocks: {} },
    ...(body.status === "ready" || body.status === "failed" ? { status: body.status } : {}),
    ...(typeof body.error === "string" ? { error: body.error.slice(0, 500) } : {}),
  });
  return json({ ok: true });
});

/** The personalise job's progress. */
emailRoute("/email/personalization", async (ctx, body) => {
  const campaignId = asId<"emailCampaigns">(body.campaignId);
  const status = body.status;
  if (!campaignId || !["idle", "running", "ready", "failed"].includes(String(status))) return json({ error: "expected { campaignId, status, done, total }" }, 400);
  await ctx.runMutation(internal.emailCampaigns.setPersonalization, {
    campaignId,
    status: status as "idle" | "running" | "ready" | "failed",
    done: Number(body.done ?? 0),
    total: Number(body.total ?? 0),
    ...(typeof body.error === "string" ? { error: body.error.slice(0, 500) } : {}),
  });
  return json({ ok: true });
});

/** The agent's read of an audience (and optionally a better name for a group). */
emailRoute("/email/audience-brief", async (ctx, body) => {
  const id = asId<"emailAudiences">(body.audienceId);
  if (!id || !body.brief) return json({ error: "expected { audienceId, brief }" }, 400);
  await ctx.runMutation(internal.emailAudiences.setBrief, {
    id,
    brief: body.brief,
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    ...(Array.isArray(body.spans) ? { spans: body.spans } : {}),
  });
  return json({ ok: true });
});

/* Media service: the agent's reads and writes (QLOO_PROXY_SECRET). */

/** Campaign, brand, live audiences, creatives, assets and jobs. */
emailRoute("/media/read", async (ctx, { campaignId }) => {
  const id = asId<"mediaCampaigns">(campaignId);
  if (!id) return json({ error: "expected { campaignId }" }, 400);
  const data = await ctx.runQuery(internal.media.readForAgent, { id });
  return data ? json(data) : json({ error: "Unknown campaign" }, 404);
});

emailRoute("/media/campaign", async (ctx, { campaignId, patch }) => {
  const id = asId<"mediaCampaigns">(campaignId);
  if (!id || !patch) return json({ error: "expected { campaignId, patch }" }, 400);
  await ctx.runMutation(internal.media.patchCampaign, { id, patch });
  return json({ ok: true });
});

/** A new creative (no creativeId) or a new version of one. */
emailRoute("/media/creative", async (ctx, body) => {
  const campaignId = asId<"mediaCampaigns">(body.campaignId);
  if (!campaignId || !body.doc) return json({ error: "expected { campaignId, doc }" }, 400);
  return json(
    await ctx.runMutation(internal.media.writeCreative, {
      campaignId,
      ...(body.creativeId ? { creativeId: asId<"mediaCreatives">(body.creativeId)! } : {}),
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(typeof body.audienceKey === "string" ? { audienceKey: body.audienceKey } : {}),
      ...(Array.isArray(body.why) ? { why: (body.why as { text?: unknown; evidence?: unknown }[]).map((w) => ({ text: String(w.text ?? ""), evidence: String(w.evidence ?? "") })) } : {}),
      ...(typeof body.note === "string" ? { note: body.note } : {}),
      ...(typeof body.nearId === "string" ? { nearId: body.nearId } : {}),
      doc: body.doc,
    }),
  );
});

emailRoute("/media/creative-status", async (ctx, { creativeId, status }) => {
  const id = asId<"mediaCreatives">(creativeId);
  if (!id || typeof status !== "string") return json({ error: "expected { creativeId, status }" }, 400);
  await ctx.runMutation(internal.media.setCreativeStatus, { creativeId: id, status });
  return json({ ok: true });
});

/** A shot, audio clip or layer patched in place (a finished job). */
emailRoute("/media/clip", async (ctx, { creativeId, clipId, patch }) => {
  const id = asId<"mediaCreatives">(creativeId);
  if (!id || typeof clipId !== "string" || !patch) return json({ error: "expected { creativeId, clipId, patch }" }, 400);
  return json(await ctx.runMutation(internal.media.setClip, { creativeId: id, clipId, patch }));
});

/** A file in the library: { storageId } from /media/upload-url, or an https url. */
emailRoute("/media/asset", async (ctx, { campaignId, asset, place, nearId }) => {
  const id = asId<"mediaCampaigns">(campaignId);
  if (!id || !asset || typeof asset !== "object") return json({ error: "expected { campaignId, asset }" }, 400);
  const a = asset as Record<string, unknown>;
  return json(
    await ctx.runMutation(internal.media.addAssetInternal, {
      campaignId: id,
      asset: {
        ...pick(a, ["url", "mime", "name", "w", "h", "duration", "prompt", "model", "cost", "credit", "review"]),
        ...(a.storageId ? { storageId: (a.storageId as Id<"_storage">)! } : {}),
        ...(a.parentId ? { parentId: asId<"mediaAssets">(a.parentId)! } : {}),
        kind: String(a.kind ?? "image"),
        source: String(a.source ?? "generated"),
      } as never,
      ...(place === true ? { place: true } : {}),
      ...(typeof nearId === "string" ? { nearId } : {}),
    }),
  );
});

emailRoute("/media/job", async (ctx, body) => {
  const campaignId = asId<"mediaCampaigns">(body.campaignId);
  if (!campaignId) return json({ error: "expected { campaignId }" }, 400);
  return json(
    await ctx.runMutation(internal.media.upsertJob, {
      campaignId,
      ...pick(body, ["kind", "model", "prompt", "status", "estimate", "cost", "error", "targetId", "place", "aspect", "nearId"]),
      ...(body.jobId ? { jobId: asId<"mediaJobs">(body.jobId)! } : {}),
      ...(body.creativeId ? { creativeId: asId<"mediaCreatives">(body.creativeId)! } : {}),
      ...(body.assetId ? { assetId: asId<"mediaAssets">(body.assetId)! } : {}),
    } as never),
  );
});

emailRoute("/media/jobs-interrupted", async (ctx) => json(await ctx.runMutation(internal.media.interruptJobs, {})));

emailRoute("/media/export", async (ctx, body) => {
  const creativeId = asId<"mediaCreatives">(body.creativeId);
  if (!creativeId || typeof body.url !== "string" || typeof body.mime !== "string") return json({ error: "expected { creativeId, url, mime, version }" }, 400);
  await ctx.runMutation(internal.media.setExport, {
    creativeId,
    url: body.url,
    mime: body.mime,
    version: Number(body.version ?? 0),
    ...(body.storageId ? { storageId: (body.storageId as Id<"_storage">)! } : {}),
  });
  return json({ ok: true });
});

emailRoute("/media/chat", async (ctx, { campaignId, messages }) => {
  const id = asId<"mediaCampaigns">(campaignId);
  if (!id || !Array.isArray(messages)) return json({ error: "expected { campaignId, messages }" }, 400);
  await ctx.runMutation(internal.media.appendChat, { id, messages });
  return json({ ok: true });
});

/** Brand setup from a website: progress, then the kit, what it does, products and photos. */
emailRoute("/media/brand", async (ctx, { brandId, patch }) => {
  const id = asId<"mediaBrands">(brandId);
  if (!id || !patch) return json({ error: "expected { brandId, patch }" }, 400);
  await ctx.runMutation(internal.mediaBrands.patchFromAgent, { id, patch });
  return json({ ok: true });
});

/** A one-time storage upload URL: the agent POSTs a video, image or audio file there (no 20 MB action limit), then names the storageId. */
emailRoute("/media/upload-url", async (ctx) => json({ url: await ctx.storage.generateUploadUrl() }));

emailRoute("/media/storage-url", async (ctx, { storageId }) => {
  const id = (storageId as Id<"_storage">);
  if (!id) return json({ error: "expected { storageId }" }, 400);
  return json({ url: await ctx.runQuery(internal.media.storageUrl, { storageId: id }) });
});

/* Recipients' routes */

const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type PageBrand = { name: string; url?: string; logo?: { src: string; alt: string; onDark?: boolean }; colors?: Record<string, string> };

/** A small page in the brand's colours: unsubscribe, link checks, missing emails. */
function brandPage(brand: PageBrand | null, title: string, body: string, status = 200): Response {
  const c = brand?.colors ?? {};
  const hex = (x: unknown, fallback: string) => (typeof x === "string" && /^#[0-9a-f]{3,8}$/i.test(x) ? x : fallback);
  const bg = hex(c.background, "#f6f5f2");
  const fg = hex(c.foreground, "#1c1b19");
  const primary = hex(c.primary, "#1c1b19");
  const onPrimary = hex(c.primaryForeground, "#ffffff");
  const surface = hex(c.surface, "#ffffff");
  const muted = hex(c.muted, "#6b6862");
  const logo = brand?.logo?.src
    ? `<img src="${escape(brand.logo.src)}" alt="${escape(brand.logo.alt || brand.name)}" style="max-height:44px;max-width:180px;${brand.logo.onDark ? `background:${fg};padding:8px 12px;border-radius:8px;` : ""}">`
    : brand
      ? `<div style="font-weight:600;font-size:18px">${escape(brand.name)}</div>`
      : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escape(title)}</title>
<style>
body{margin:0;background:${bg};color:${fg};font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
main{background:${surface};max-width:440px;width:100%;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.05);text-align:center}
h1{font-size:22px;line-height:1.3;margin:20px 0 8px;font-weight:600}
p{margin:0 0 12px;color:${muted}}
button,.btn{display:inline-block;margin-top:12px;background:${primary};color:${onPrimary};border:0;border-radius:999px;padding:12px 24px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
a{color:${primary}}
.small{font-size:13px;margin-top:20px}
</style></head><body><main>${logo}<h1>${escape(title)}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Open pixel: the first open counts once, every open adds to the send's tally. Always answers the GIF. */
http.route({
  path: "/email/o",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const s = new URL(req.url).searchParams.get("s");
    if (s) await ctx.runMutation(internal.emailSend.recordEvent, { sendId: s, kind: "open" }).catch(() => null);
    return new Response(PIXEL, {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, private", Pragma: "no-cache" },
    });
  }),
});

/** Click: recorded, then a redirect, only to http(s) links that belong to the campaign (any other gets a "you're leaving" page). */
http.route({
  path: "/email/c",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const params = new URL(req.url).searchParams;
    const s = params.get("s");
    let target: URL | null = null;
    try {
      target = new URL(params.get("u") ?? "");
    } catch {
      target = null;
    }
    if (!target || (target.protocol !== "https:" && target.protocol !== "http:")) {
      return brandPage(null, "This link doesn't work", "<p>The address in it is incomplete. Try the email again, or reply to it.</p>", 400);
    }
    const result = s
      ? await ctx.runMutation(internal.emailSend.recordEvent, { sendId: s, kind: "click", url: target.href, ...(params.get("b") ? { blockId: params.get("b")! } : {}) }).catch(() => null)
      : null;
    if (result?.allowed) return new Response(null, { status: 302, headers: { Location: target.href, "Cache-Control": "no-store" } });
    return brandPage(
      null,
      "You're leaving this email",
      `<p>This link goes to <strong>${escape(target.hostname)}</strong>.</p><a class="btn" href="${escape(target.href)}" rel="noopener noreferrer">Continue</a>`,
    );
  }),
});

const UNSUB_TEST = brandPage(null, "This was a test email", "<p>Test emails don't belong to a list, so there's nothing to unsubscribe from.</p>");

/** Unsubscribe page: asks first, the button posts back here. */
http.route({
  path: "/email/u",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const params = new URL(req.url).searchParams;
    if (params.get("test")) return UNSUB_TEST;
    const s = params.get("s") ?? "";
    const info = s ? await ctx.runQuery(internal.emailSend.pageInfo, { sendId: s }) : null;
    if (!info) return brandPage(null, "This link doesn't work anymore", "<p>The email it came from may have been deleted.</p>", 404);
    if (info.unsubscribed) {
      return brandPage(info.brand, "You're unsubscribed", `<p>${escape(info.email)} won't get marketing emails from ${escape(info.brand.name)} anymore.</p>`);
    }
    return brandPage(
      info.brand,
      `Unsubscribe from ${info.brand.name}?`,
      `<p>${escape(info.email)} will stop getting marketing emails from ${escape(info.brand.name)}.</p>
<form method="post" action="?s=${encodeURIComponent(s)}"><button type="submit">Unsubscribe</button></form>`,
    );
  }),
});

/** One-click unsubscribe (List-Unsubscribe-Post from mail clients) and the page's button. */
http.route({
  path: "/email/u",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const params = new URL(req.url).searchParams;
    if (params.get("test")) return UNSUB_TEST;
    const s = params.get("s") ?? "";
    const result = s ? await ctx.runMutation(internal.emailSend.recordEvent, { sendId: s, kind: "unsubscribe" }).catch(() => null) : null;
    const info = result?.found ? await ctx.runQuery(internal.emailSend.pageInfo, { sendId: s }) : null;
    if (!info) return brandPage(null, "This link doesn't work anymore", "<p>The email it came from may have been deleted.</p>", 404);
    return brandPage(
      info.brand,
      "You're unsubscribed",
      `<p>${escape(info.email)} won't get marketing emails from ${escape(info.brand.name)} anymore.</p>${info.brand.url ? `<p class="small"><a href="${escape(info.brand.url)}">Back to ${escape(info.brand.name)}</a></p>` : ""}`,
    );
  }),
});

/** View in browser: that recipient's version, untracked. */
http.route({
  path: "/email/v",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const s = new URL(req.url).searchParams.get("s") ?? "";
    const html = s ? await ctx.runQuery(internal.emailSend.viewHtml, { sendId: s }) : null;
    if (!html) return brandPage(null, "This email isn't available", "<p>It may have been deleted.</p>", 404);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }),
});

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Svix signature check: HMAC-SHA256 of `${id}.${timestamp}.${body}` with the secret, any of the listed v1 signatures, within 5 minutes. */
async function svixValid(req: Request, body: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signatures = req.headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", fromBase64(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = toBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`))));
  return signatures.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value || value.length !== mac.length) return false;
    // Constant time over the whole string.
    let diff = 0;
    for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ value.charCodeAt(i);
    return diff === 0;
  });
}

const RESEND_EVENTS: Record<string, "delivered" | "bounced" | "complained"> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

/** Resend webhook: deliveries, bounces, complaints. Checked against RESEND_WEBHOOK_SECRET when it is set. */
http.route({
  path: "/email/resend",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (secret && !(await svixValid(req, body, secret))) return json({ error: "invalid signature" }, 401);
    let event: { type?: string; created_at?: string; data?: { email_id?: string; created_at?: string } };
    try {
      event = JSON.parse(body);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const kind = RESEND_EVENTS[event.type ?? ""];
    const resendId = event.data?.email_id;
    if (!kind || !resendId) return json({ ok: true, ignored: event.type ?? "unknown" });
    const at = Date.parse(event.created_at ?? event.data?.created_at ?? "");
    const found = await ctx.runMutation(internal.emailSend.recordDelivery, { resendId, kind, ...(Number.isFinite(at) ? { at } : {}) });
    return json({ ok: true, found });
  }),
});

export default http;
