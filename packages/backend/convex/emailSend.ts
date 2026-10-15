import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { unsubscribedEmails } from "./emailAudiences";
import { editableBrand, formatFrom, hostOf, RESEND_MISSING, sendingInfoFor } from "./emailBrands";
import { docFor, itemsRecord, mergeFor, renderContextFor, renderOne } from "./emailCampaigns";
import { unsubscribeEmail } from "./emailContacts";
import { allBlocks, personalBlocks } from "./emailDoc";
import { resend, ResendError } from "./emailDomains";
import { fillMerge, type RenderContext } from "./emailRender";
import { emptyStats, type CampaignStats, type EmailDoc, type EmailFooterInfo, type EmailKit, type SendStatus } from "./emailTypes";
import { sendingModeValidator } from "./schema";

// Sending. `start` freezes who gets the campaign (one `emailSends` row each)
// and how it goes out, then schedules `run` (Resend, in batches) or, for
// demo brands, `simulate` (nothing leaves; believable delivery, opens and
// clicks arrive over the next two minutes). Opens, clicks and unsubscribes
// come back through Slice's own routes in http.ts, deliveries and bounces
// through Resend's webhook; all of them land in `recordEvent`.

const BATCH = 50;
/** Batches per `run` invocation; the next invocation is scheduled, so big lists never hit the action time limit. */
const BATCHES_PER_RUN = 8;
/** Resend's default limit is about 2 requests a second. */
const PACE_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* Links ------------------------------------------------------------------------------------ */

const site = () => (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");

export const trackingLinks = (sendId: string) => ({
  openPixel: `${site()}/email/o?s=${sendId}`,
  unsubscribe: `${site()}/email/u?s=${sendId}`,
  viewOnline: `${site()}/email/v?s=${sendId}`,
  click: (href: string, blockId: string) => `${site()}/email/c?s=${sendId}&u=${encodeURIComponent(href)}&b=${encodeURIComponent(blockId)}`,
});

function linksForSend(sendId: string): NonNullable<RenderContext["links"]> {
  const t = trackingLinks(sendId);
  return {
    unsubscribe: t.unsubscribe,
    viewOnline: t.viewOnline,
    openPixel: t.openPixel,
    // Slice's own pages (unsubscribe, view online) are never wrapped.
    track: (href, blockId) => (href.startsWith(site()) ? href : t.click(href, blockId)),
  };
}

/** Every link a reader can click in a doc, weighted by how likely a click is (buttons most). */
export function clickableLinks(doc: EmailDoc, items: RenderContext["items"]): { url: string; blockId: string; weight: number }[] {
  const out: { url: string; blockId: string; weight: number }[] = [];
  const add = (url: string | undefined, blockId: string, weight: number) => {
    if (url && /^https?:\/\//i.test(url)) out.push({ url, blockId, weight });
  };
  const anchors = (html: string, blockId: string) => {
    for (const m of html.matchAll(/href\s*=\s*"([^"]+)"/gi)) add(m[1].replace(/&amp;/g, "&"), blockId, 1);
  };
  for (const { block: b } of allBlocks(doc)) {
    if (b.type === "button") add(b.href, b.id, 5);
    else if (b.type === "image" || b.type === "video") add(b.href, b.id, 2);
    else if (b.type === "logo") add(b.href, b.id, 0.5);
    else if (b.type === "items") for (const id of b.itemIds) add(items[id]?.url, b.id, 3);
    else if (b.type === "social") for (const l of b.links) add(l.url, b.id, 0.3);
    else if (b.type === "text") anchors(b.html, b.id);
    else if (b.type === "heading") anchors(b.text, b.id);
    else if (b.type === "footer") anchors(b.text, b.id);
  }
  return out;
}

/* Test sends ----------------------------------------------------------------------------------- */

type SendContext = {
  campaign: Doc<"emailCampaigns">;
  brand: Doc<"emailBrands">;
  items: Doc<"emailItems">[];
  people: boolean;
  contact: Doc<"emailContacts"> | null;
  version: Doc<"emailVersions"> | null;
} | null;

type BatchRow = { send: Doc<"emailSends">; contact: Doc<"emailContacts"> | null; version: Doc<"emailVersions"> | null };

/** What a test send or a run needs to render. */
export const sendContext = internalQuery({
  args: { campaignId: v.id("emailCampaigns"), contactId: v.optional(v.id("emailContacts")) },
  handler: async (ctx, { campaignId, contactId }): Promise<SendContext> => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) return null;
    const brand = await ctx.db.get(campaign.brandId);
    if (!brand) return null;
    const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", campaign.brandId)).collect();
    const audience = campaign.audienceId ? await ctx.db.get(campaign.audienceId) : null;
    const contact = contactId ? await ctx.db.get(contactId) : null;
    const version = contact
      ? await ctx.db
          .query("emailVersions")
          .withIndex("by_campaign_contact", (q) => q.eq("campaignId", campaignId).eq("contactId", contact._id))
          .unique()
      : null;
    return { campaign, brand, items, people: audience?.kind === "people", contact, version };
  },
});

export const recordTest = internalMutation({
  args: { campaignId: v.id("emailCampaigns"), to: v.string() },
  returns: v.null(),
  handler: async (ctx, { campaignId, to }) => {
    await ctx.db.patch(campaignId, { test: { to, at: Date.now() }, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Sends one copy to `to` through Resend, as `contactId` would get it. Without
 * a verified domain it goes from Resend's sandbox address, which Resend only
 * delivers to the address that owns the Resend account; its refusal is shown
 * as is.
 */
export const sendTest = action({
  args: { campaignId: v.id("emailCampaigns"), to: v.string(), contactId: v.optional(v.id("emailContacts")) },
  returns: v.object({ id: v.string(), from: v.string() }),
  handler: async (ctx, { campaignId, to, contactId }): Promise<{ id: string; from: string }> => {
    const data: SendContext = await ctx.runQuery(internal.emailSend.sendContext, { campaignId, contactId });
    if (!data) throw new Error("Unknown campaign");
    const { campaign, brand, items, people, contact, version } = data;
    if (brand.owner && (await ctx.auth.getUserIdentity())?.subject !== brand.owner) throw new Error("Unknown campaign");
    const address = to.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) throw new Error(`"${to}" isn't an email address`);
    if (!process.env.RESEND_API_KEY) throw new Error(RESEND_MISSING);
    const info = sendingInfoFor(brand);
    const from = info.mode === "domain" || info.mode === "shared" ? info.from : formatFrom(brand.sender?.fromName?.trim() || brand.name, "onboarding@resend.dev");
    const doc = docFor(campaign, version, people);
    const rendered = renderOne(
      doc,
      renderContextFor(brand, itemsRecord(items), {
        mode: "send",
        merge: contact ? mergeFor(contact, brand) : { brand: brand.name, email: address },
        // Nothing to unsubscribe from in a test; the page says so.
        links: { unsubscribe: `${site()}/email/u?test=1` },
      }),
    );
    const sent = await resend<{ id: string }>("/emails", {
      method: "POST",
      body: {
        from,
        to: [address],
        subject: `[Test] ${rendered.subject || campaign.name}`,
        html: rendered.html,
        text: rendered.text,
        ...(brand.sender?.replyTo ? { reply_to: brand.sender.replyTo } : {}),
        tags: [
          { name: "campaign", value: campaignId },
          { name: "test", value: "true" },
        ],
      },
    });
    await ctx.runMutation(internal.emailSend.recordTest, { campaignId, to: address });
    return { id: sent.id, from };
  },
});

/* Start and cancel ------------------------------------------------------------------------------ */

/** Why a campaign can't go out yet, or null when it can. The Review step's checklist can call `readiness` for the same answer. */
async function blocker(ctx: { db: QueryCtx["db"] }, campaign: Doc<"emailCampaigns">, brand: Doc<"emailBrands">): Promise<string | null> {
  if (campaign.status !== "draft" && campaign.status !== "failed") return `This campaign is already ${campaign.status}`;
  const doc = campaign.doc as EmailDoc;
  if (!doc.subject?.trim()) return "Add a subject line";
  if (!allBlocks(doc).some((x) => x.block.type === "footer")) return "Add a footer with an unsubscribe link";
  if (!campaign.audienceId) return "Choose who it goes to";
  const audience = await ctx.db.get(campaign.audienceId);
  if (!audience) return "Choose who it goes to";
  if (audience.status !== "ready") return audience.status === "failed" ? `${audience.name} couldn't be read: ${audience.error ?? "try again"}` : `${audience.name} is still being read`;
  if (audience.kind === "people" && personalBlocks(doc).length) {
    if (campaign.personalization?.status === "running") return "The personal versions are still being written";
    const versions = await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id)).collect();
    if (!versions.some((r) => r.status === "ready")) return "Personalise it for each person first";
  }
  const info = sendingInfoFor(brand);
  if (info.mode === "none") return info.reason ?? "Connect a domain to send";
  return null;
}

/** Whether the campaign can be sent now, how, and to how many people (the Review step). */
export const readiness = query({
  args: { campaignId: v.id("emailCampaigns") },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()), mode: sendingModeValidator, from: v.string(), recipients: v.number(), excluded: v.number() }),
  handler: async (ctx, { campaignId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error("Unknown campaign");
    const brand = await ctx.db.get(campaign.brandId);
    if (!brand) throw new Error("Unknown brand");
    const reason = await blocker(ctx, campaign, brand);
    const { mode, from } = sendingInfoFor(brand);
    const members = campaign.audienceId ? await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", campaign.audienceId)).collect() : [];
    const out = await unsubscribedEmails(ctx, campaign.brandId);
    const emails = new Set(members.map((m) => m.email));
    const recipients = [...emails].filter((e) => !out.has(e)).length;
    return { ok: !reason, ...(reason ? { reason } : {}), mode, from, recipients, excluded: emails.size - recipients };
  },
});

/**
 * One queued send per recipient: the audience's members, opted-out people
 * left out, one email per address. A failed campaign sent again starts from
 * a clean slate.
 */
async function queueRecipients(ctx: MutationCtx, campaign: Doc<"emailCampaigns">, audience: Doc<"emailAudiences">, simulated: boolean) {
  for (const s of await ctx.db.query("emailSends").withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id)).collect()) await ctx.db.delete(s._id);
  const out = await unsubscribedEmails(ctx, campaign.brandId);
  const members = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", audience._id)).collect();
  const seen = new Set<string>();
  const recipients = members.filter((m) => {
    if (m.unsubscribed || out.has(m.email) || seen.has(m.email)) return false;
    seen.add(m.email);
    return true;
  });
  if (!recipients.length) throw new Error(`No one to send to: everyone in ${audience.name} opted out`);
  const now = Date.now();
  const subject = (campaign.doc as EmailDoc).subject;
  for (const m of recipients) {
    await ctx.db.insert("emailSends", {
      campaignId: campaign._id,
      brandId: campaign.brandId,
      contactId: m._id,
      email: m.email,
      status: "queued",
      subject,
      queuedAt: now,
      opens: 0,
      clicks: 0,
      links: [],
      ...(simulated ? { simulated: true } : {}),
    });
  }
  return recipients;
}

/**
 * Sends now, or at `at`. Checks the campaign can go (subject, footer,
 * audience ready, personal versions for a people list, a way to send),
 * freezes the recipients (opted-out people left out, one email per address)
 * and the sending mode, and schedules the send.
 */
export const start = mutation({
  args: { campaignId: v.id("emailCampaigns"), at: v.optional(v.number()) },
  returns: v.object({ recipients: v.number(), mode: sendingModeValidator, scheduledAt: v.optional(v.number()), withoutVersion: v.number() }),
  handler: async (ctx, { campaignId, at }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error("Unknown campaign");
    const brand = await editableBrand(ctx, campaign.brandId);
    const reason = await blocker(ctx, campaign, brand);
    if (reason) throw new Error(reason);
    const audience = (await ctx.db.get(campaign.audienceId!))!;
    const { mode } = sendingInfoFor(brand);

    const recipients = await queueRecipients(ctx, campaign, audience, mode === "demo");
    const versions = audience.kind === "people" ? await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect() : [];
    const ready = new Set(versions.filter((r) => r.status === "ready").map((r) => r.contactId));
    const now = Date.now();
    const scheduledAt = at && at > now + 30_000 ? at : undefined;
    const job =
      mode === "demo"
        ? await ctx.scheduler.runAt(scheduledAt ?? now, internal.emailSend.simulate, { campaignId })
        : await ctx.scheduler.runAt(scheduledAt ?? now, internal.emailSend.run, { campaignId });
    await ctx.db.patch(campaignId, {
      status: scheduledAt ? "scheduled" : "sending",
      scheduledAt,
      sentAt: undefined,
      sendingMode: mode,
      sendJob: job,
      stats: { ...emptyStats(), recipients: recipients.length },
      updatedAt: now,
    });
    return {
      recipients: recipients.length,
      mode,
      ...(scheduledAt ? { scheduledAt } : {}),
      withoutVersion: audience.kind === "people" && personalBlocks(campaign.doc as EmailDoc).length ? recipients.filter((m) => !ready.has(m._id)).length : 0,
    };
  },
});

/** Calls off a scheduled send; the campaign is a draft again. */
export const cancel = mutation({
  args: { campaignId: v.id("emailCampaigns") },
  returns: v.null(),
  handler: async (ctx, { campaignId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error("Unknown campaign");
    await editableBrand(ctx, campaign.brandId);
    if (campaign.status !== "scheduled") throw new Error(campaign.status === "sending" ? "It's already going out" : "Only a scheduled campaign can be called off");
    if (campaign.sendJob) {
      const job = await ctx.db.system.get(campaign.sendJob);
      if (job?.state.kind === "pending") await ctx.scheduler.cancel(campaign.sendJob);
    }
    for (const s of await ctx.db.query("emailSends").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect()) await ctx.db.delete(s._id);
    await ctx.db.patch(campaignId, {
      status: "draft",
      scheduledAt: undefined,
      sendingMode: undefined,
      sendJob: undefined,
      stats: emptyStats(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/* Real sends ------------------------------------------------------------------------------------- */

export const nextBatch = internalQuery({
  args: { campaignId: v.id("emailCampaigns"), take: v.number() },
  handler: async (ctx, { campaignId, take }): Promise<BatchRow[]> => {
    const sends = await ctx.db
      .query("emailSends")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .filter((q) => q.eq(q.field("status"), "queued"))
      .take(take);
    return Promise.all(
      sends.map(async (send) => {
        const contact = await ctx.db.get(send.contactId);
        const version = await ctx.db
          .query("emailVersions")
          .withIndex("by_campaign_contact", (q) => q.eq("campaignId", campaignId).eq("contactId", send.contactId))
          .unique();
        return { send, contact, version };
      }),
    );
  },
});

export const markSending = internalMutation({
  args: { campaignId: v.id("emailCampaigns") },
  returns: v.null(),
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db.get(campaignId);
    if (c?.status === "scheduled") await ctx.db.patch(campaignId, { status: "sending", updatedAt: Date.now() });
    return null;
  },
});

export const recordResults = internalMutation({
  args: {
    campaignId: v.id("emailCampaigns"),
    results: v.array(v.object({ sendId: v.id("emailSends"), resendId: v.optional(v.string()), error: v.optional(v.string()), subject: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, results }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) return null;
    const now = Date.now();
    let sent = 0;
    let failed = 0;
    for (const r of results) {
      const send = await ctx.db.get(r.sendId);
      if (!send || send.status !== "queued") continue;
      if (r.resendId) {
        await ctx.db.patch(r.sendId, { status: "sent", resendId: r.resendId, sentAt: now, subject: r.subject });
        sent++;
      } else {
        await ctx.db.patch(r.sendId, { status: "failed", error: (r.error ?? "Resend refused it").slice(0, 500), subject: r.subject });
        failed++;
      }
    }
    await ctx.db.patch(campaignId, {
      stats: { ...campaign.stats, sent: campaign.stats.sent + sent, failed: campaign.stats.failed + failed },
      ...(sent && !campaign.sentAt ? { sentAt: now } : {}),
      updatedAt: now,
    });
    return null;
  },
});

/** Ends a run: sent when anything went out, failed (with the reason on the sends) when nothing did. */
export const finish = internalMutation({
  args: { campaignId: v.id("emailCampaigns"), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { campaignId, error }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) return null;
    const now = Date.now();
    if (error) {
      // A refusal for the whole send (bad key, unverified sender): what's still queued fails with it.
      const queued = await ctx.db
        .query("emailSends")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .filter((q) => q.eq(q.field("status"), "queued"))
        .collect();
      for (const s of queued) await ctx.db.patch(s._id, { status: "failed", error: error.slice(0, 500) });
      await ctx.db.patch(campaignId, { stats: { ...campaign.stats, failed: campaign.stats.failed + queued.length } });
    }
    const fresh = (await ctx.db.get(campaignId))!;
    await ctx.db.patch(campaignId, {
      status: fresh.stats.sent > 0 ? "sent" : "failed",
      sentAt: fresh.sentAt ?? now,
      sendJob: undefined,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Renders each queued recipient's email (their version, their merge values,
 * their tracking links) and hands batches of 50 to Resend, pacing between
 * batches and rescheduling itself after a few so a long list never runs into
 * the action time limit.
 */
export const run = internalAction({
  args: { campaignId: v.id("emailCampaigns") },
  returns: v.null(),
  handler: async (ctx, { campaignId }): Promise<null> => {
    const data: SendContext = await ctx.runQuery(internal.emailSend.sendContext, { campaignId });
    if (!data) return null;
    const { campaign, brand, items, people } = data;
    if (campaign.status !== "scheduled" && campaign.status !== "sending") return null;
    await ctx.runMutation(internal.emailSend.markSending, { campaignId });
    const info = sendingInfoFor(brand);
    if (info.mode === "none" || info.mode === "demo") {
      await ctx.runMutation(internal.emailSend.finish, { campaignId, error: info.reason ?? "This brand can't send right now" });
      return null;
    }
    const itemMap = itemsRecord(items);
    const replyTo = brand.sender?.replyTo;
    for (let n = 0; n < BATCHES_PER_RUN; n++) {
      const batch: BatchRow[] = await ctx.runQuery(internal.emailSend.nextBatch, { campaignId, take: BATCH });
      if (!batch.length) {
        await ctx.runMutation(internal.emailSend.finish, { campaignId });
        return null;
      }
      const emails = batch.map(({ send, contact, version }) => {
        const doc = docFor(campaign, version, people);
        const rendered = renderOne(
          doc,
          renderContextFor(brand, itemMap, { mode: "send", merge: mergeFor(contact ?? { name: send.email, email: send.email }, brand), links: linksForSend(send._id) }),
        );
        return {
          sendId: send._id,
          subject: rendered.subject,
          payload: {
            from: info.from,
            to: [send.email],
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            ...(replyTo ? { reply_to: replyTo } : {}),
            headers: {
              "List-Unsubscribe": `<${trackingLinks(send._id).unsubscribe}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            tags: [{ name: "campaign", value: campaignId }],
          },
        };
      });
      try {
        const res = await resend<{ data?: { id: string }[] }>("/emails/batch", { method: "POST", body: emails.map((e) => e.payload) });
        const ids = res.data ?? [];
        await ctx.runMutation(internal.emailSend.recordResults, {
          campaignId,
          results: emails.map((e, i) => ({ sendId: e.sendId, subject: e.subject, ...(ids[i]?.id ? { resendId: ids[i].id } : { error: "Resend returned no id" }) })),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A bad key or an unverified sender fails every batch the same way: stop here.
        if (err instanceof ResendError && (err.status === 401 || err.status === 403)) {
          await ctx.runMutation(internal.emailSend.finish, { campaignId, error: message });
          return null;
        }
        await ctx.runMutation(internal.emailSend.recordResults, {
          campaignId,
          results: emails.map((e) => ({ sendId: e.sendId, subject: e.subject, error: message })),
        });
      }
      await sleep(PACE_MS);
    }
    await ctx.scheduler.runAfter(0, internal.emailSend.run, { campaignId });
    return null;
  },
});

/* Events ------------------------------------------------------------------------------------------ */

type Kind = "open" | "click" | "unsubscribe" | "delivered" | "bounced" | "complained";

const STAGE: Partial<Record<SendStatus, number>> = { queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4 };

/** The furthest stage reached; bounces, complaints and failures stay what they are. */
const advance = (current: SendStatus, next: SendStatus): SendStatus =>
  STAGE[current] === undefined ? current : (STAGE[next] ?? 0) > (STAGE[current] ?? 0) ? next : current;

type Delta = Partial<Record<keyof CampaignStats, number>>;

/**
 * One event on one send, keeping the campaign's unique counts consistent: an
 * open implies delivery, a click implies an open (pixels get blocked), and
 * each send counts once per stage however often it fires.
 */
async function applyEvent(
  ctx: MutationCtx,
  send: Doc<"emailSends">,
  kind: Kind,
  at: number,
  extra: { url?: string; blockId?: string } = {},
): Promise<Delta> {
  const d: Delta = {};
  const bump = (k: keyof CampaignStats, n = 1) => (d[k] = (d[k] ?? 0) + n);
  const patch: Partial<Doc<"emailSends">> = {};
  let status = send.status;
  if (kind === "open" || kind === "click") {
    if (send.status === "bounced" || send.status === "failed" || send.status === "queued" || send.status === "skipped") return d;
    if (!send.deliveredAt) {
      patch.deliveredAt = at;
      bump("delivered");
    }
    if (!send.openedAt) {
      patch.openedAt = at;
      bump("opened");
      status = advance(status, "opened");
    }
    if (kind === "open") patch.opens = send.opens + 1;
    if (kind === "click") {
      patch.clicks = send.clicks + 1;
      if (extra.url) patch.links = [...send.links, { url: extra.url, ...(extra.blockId ? { blockId: extra.blockId } : {}), at }].slice(-50);
      if (!send.clickedAt) {
        patch.clickedAt = at;
        bump("clicked");
        status = advance(status, "clicked");
      }
    }
  } else if (kind === "delivered") {
    if (!send.deliveredAt && send.status !== "bounced") {
      patch.deliveredAt = at;
      bump("delivered");
      status = advance(status, "delivered");
    }
  } else if (kind === "bounced") {
    if (send.status !== "bounced") {
      patch.bouncedAt = at;
      bump("bounced");
      // Counted as delivered before the bounce came in: it wasn't.
      if (send.deliveredAt && !send.openedAt) {
        patch.deliveredAt = undefined;
        bump("delivered", -1);
      }
      status = "bounced";
    }
  } else if (kind === "complained") {
    if (send.status !== "complained") {
      bump("complained");
      status = "complained";
    }
  }
  if (kind === "unsubscribe" || kind === "complained") {
    if (!send.unsubscribedAt) {
      patch.unsubscribedAt = at;
      bump("unsubscribed");
    }
    const campaign = await ctx.db.get(send.campaignId);
    if (campaign) await unsubscribeEmail(ctx, campaign.brandId, send.email, at);
  }
  if (status !== send.status) patch.status = status;
  if (Object.keys(patch).length) await ctx.db.patch(send._id, patch);
  return d;
}

async function addStats(ctx: MutationCtx, campaignId: Id<"emailCampaigns">, deltas: Delta[]) {
  const total: Delta = {};
  for (const d of deltas) for (const [k, n] of Object.entries(d)) total[k as keyof CampaignStats] = (total[k as keyof CampaignStats] ?? 0) + (n ?? 0);
  if (!Object.keys(total).length) return;
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) return;
  const stats = { ...campaign.stats };
  for (const [k, n] of Object.entries(total)) stats[k as keyof CampaignStats] = Math.max(0, stats[k as keyof CampaignStats] + (n ?? 0));
  await ctx.db.patch(campaignId, { stats, updatedAt: Date.now() });
}

/** Hosts a campaign's clicks may redirect to: its own links, the brand's items, site and socials. */
async function allowedHosts(ctx: MutationCtx, campaign: Doc<"emailCampaigns">, send: Doc<"emailSends">): Promise<Set<string>> {
  const brand = await ctx.db.get(campaign.brandId);
  const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", campaign.brandId)).collect();
  const version = await ctx.db
    .query("emailVersions")
    .withIndex("by_campaign_contact", (q) => q.eq("campaignId", campaign._id).eq("contactId", send.contactId))
    .unique();
  const urls = [
    ...clickableLinks(campaign.doc as EmailDoc, itemsRecord(items)).map((l) => l.url),
    ...(version ? clickableLinks(docFor(campaign, version, true), itemsRecord(items)).map((l) => l.url) : []),
    ...items.map((i) => i.url),
    brand?.url,
    (brand?.footer as EmailFooterInfo | undefined)?.website,
    ...((brand?.footer as EmailFooterInfo | undefined)?.socials ?? []).map((s) => s.url),
  ];
  return new Set(urls.map((u) => hostOf(u)).filter((h): h is string => !!h));
}

/**
 * An open, click or unsubscribe from Slice's own routes. Unknown send ids
 * are ignored. A click reports whether its URL belongs to the campaign; the
 * route redirects only then (and asks first otherwise), so the click route
 * can't be used to bounce readers to arbitrary sites.
 */
export const recordEvent = internalMutation({
  args: {
    sendId: v.string(),
    kind: v.union(v.literal("open"), v.literal("click"), v.literal("unsubscribe")),
    url: v.optional(v.string()),
    blockId: v.optional(v.string()),
  },
  returns: v.object({ found: v.boolean(), allowed: v.boolean() }),
  handler: async (ctx, { sendId, kind, url, blockId }) => {
    const id = ctx.db.normalizeId("emailSends", sendId);
    const send = id ? await ctx.db.get(id) : null;
    if (!send) return { found: false, allowed: false };
    const campaign = await ctx.db.get(send.campaignId);
    if (!campaign) return { found: false, allowed: false };
    let allowed = true;
    if (kind === "click") {
      const host = hostOf(url);
      const hosts = await allowedHosts(ctx, campaign, send);
      allowed = !!host && [...hosts].some((h) => host === h || host.endsWith(`.${h}`) || h.endsWith(`.${host}`));
      if (!allowed) return { found: true, allowed };
    }
    const d = await applyEvent(ctx, send, kind, Date.now(), { url, blockId });
    await addStats(ctx, send.campaignId, [d]);
    return { found: true, allowed };
  },
});

/** Delivery news from Resend's webhook. */
export const recordDelivery = internalMutation({
  args: { resendId: v.string(), kind: v.union(v.literal("delivered"), v.literal("bounced"), v.literal("complained")), at: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, { resendId, kind, at }) => {
    const send = await ctx.db
      .query("emailSends")
      .withIndex("by_resend", (q) => q.eq("resendId", resendId))
      .first();
    if (!send) return false;
    const d = await applyEvent(ctx, send, kind, at ?? Date.now());
    await addStats(ctx, send.campaignId, [d]);
    return true;
  },
});

/* Unsubscribe and view-online pages ------------------------------------------------------------------- */

/** What the unsubscribe and view pages need about a send's brand. */
export const pageInfo = internalQuery({
  args: { sendId: v.string() },
  handler: async (ctx, { sendId }) => {
    const id = ctx.db.normalizeId("emailSends", sendId);
    const send = id ? await ctx.db.get(id) : null;
    if (!send) return null;
    const brand = await ctx.db.get(send.brandId);
    if (!brand) return null;
    const kit = brand.kit as EmailKit | undefined;
    return {
      email: send.email,
      unsubscribed: !!send.unsubscribedAt,
      brand: { name: brand.name, url: brand.url, logo: kit?.logo, colors: kit?.colors, fonts: kit?.fonts },
    };
  },
});

/** One recipient's email as they got it, for "View in browser". No tracking. */
export const viewHtml = internalQuery({
  args: { sendId: v.string() },
  handler: async (ctx, { sendId }) => {
    const id = ctx.db.normalizeId("emailSends", sendId);
    const send = id ? await ctx.db.get(id) : null;
    if (!send) return null;
    const campaign = await ctx.db.get(send.campaignId);
    const brand = campaign && (await ctx.db.get(campaign.brandId));
    if (!campaign || !brand) return null;
    const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", campaign.brandId)).collect();
    const contact = await ctx.db.get(send.contactId);
    const audience = campaign.audienceId ? await ctx.db.get(campaign.audienceId) : null;
    const version = await ctx.db
      .query("emailVersions")
      .withIndex("by_campaign_contact", (q) => q.eq("campaignId", campaign._id).eq("contactId", send.contactId))
      .unique();
    const doc = docFor(campaign, version, audience?.kind === "people");
    return renderOne(
      doc,
      renderContextFor(brand, itemsRecord(items), {
        mode: "preview",
        merge: mergeFor(contact ?? { name: send.email, email: send.email }, brand),
        links: { unsubscribe: trackingLinks(send._id).unsubscribe },
      }),
    ).html;
  },
});

/* Demo mode: simulated delivery, opens and clicks ------------------------------------------------------------ */

type SimEvent = { sendId: Id<"emailSends">; kind: "open" | "click"; url?: string; blockId?: string; at?: number };

const pickWeighted = <T extends { weight: number }>(list: T[]): T | undefined => {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of list) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return list[list.length - 1];
};

/**
 * A demo send. Everyone is delivered at once (about one in eighty bounces
 * on bigger lists); about 45% open and about 12% click, opens front-loaded
 * in the first minute with a tail, clicks a little after their open, on the
 * links in the email they actually got. Live sends play out over the next
 * two minutes (scheduled in five-second buckets) so the report moves; with
 * `sentAt` in the past (seeds) the whole history is written at once,
 * spread over the two days after it.
 */
export const simulate = internalMutation({
  args: { campaignId: v.id("emailCampaigns"), sentAt: v.optional(v.number()) },
  returns: v.object({ delivered: v.number(), opens: v.number(), clicks: v.number() }),
  handler: async (ctx, { campaignId, sentAt }) => simulateSend(ctx, campaignId, sentAt),
});

/**
 * Seeds: a campaign "sent" to its audience at `sentAt` (in the past), with
 * the whole simulated history written at once. Skips `start`'s checks and
 * owner; the campaign needs an audience.
 */
export const seedSent = internalMutation({
  args: { campaignId: v.id("emailCampaigns"), sentAt: v.number() },
  returns: v.object({ delivered: v.number(), opens: v.number(), clicks: v.number() }),
  handler: async (ctx, { campaignId, sentAt }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign?.audienceId) throw new Error("The campaign needs an audience");
    const audience = await ctx.db.get(campaign.audienceId);
    if (!audience) throw new Error("Unknown audience");
    const recipients = await queueRecipients(ctx, campaign, audience, true);
    await ctx.db.patch(campaignId, { status: "sending", sendingMode: "demo", stats: { ...emptyStats(), recipients: recipients.length } });
    return simulateSend(ctx, campaignId, sentAt);
  },
});

async function simulateSend(ctx: MutationCtx, campaignId: Id<"emailCampaigns">, sentAt: number | undefined) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) throw new Error("Unknown campaign");
  const now = Date.now();
  const past = sentAt !== undefined && sentAt < now - 5 * 60_000;
  const base = past ? sentAt! : now;
  const audience = campaign.audienceId ? await ctx.db.get(campaign.audienceId) : null;
  const people = audience?.kind === "people";
  const items = itemsRecord(await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", campaign.brandId)).collect());
  const brand = await ctx.db.get(campaign.brandId);
  const sends = (await ctx.db.query("emailSends").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect()).filter((s) => s.status === "queued");
  const events: SimEvent[] = [];
  let bounced = 0;
  for (const [i, send] of sends.entries()) {
    const sentTime = base + i * 40;
    // The email this person got: their version's subject and links, their name in the merge tags.
    const version = people
      ? await ctx.db
          .query("emailVersions")
          .withIndex("by_campaign_contact", (q) => q.eq("campaignId", campaignId).eq("contactId", send.contactId))
          .unique()
      : null;
    const doc = docFor(campaign, version, people);
    const contact = await ctx.db.get(send.contactId);
    const subject = brand ? fillMerge(doc.subject, mergeFor(contact ?? { name: send.email, email: send.email }, brand), "send").replace(/<[^>]+>/g, "") : send.subject;
    if (sends.length >= 20 && Math.random() < 0.012) {
      await ctx.db.patch(send._id, { status: "bounced", subject, sentAt: sentTime, bouncedAt: sentTime + 2000, simulated: true });
      bounced++;
      continue;
    }
    await ctx.db.patch(send._id, { status: "delivered", subject, sentAt: sentTime, deliveredAt: sentTime + 800 + Math.floor(Math.random() * 3000), simulated: true });
    if (Math.random() >= 0.45) continue;
    // u² front-loads: half the opens land in the first quarter of the window.
    const u = Math.random();
    const openDelay = past ? 60_000 + 48 * 3_600_000 * u ** 3 : 3_000 + 105_000 * u ** 2;
    events.push({ sendId: send._id, kind: "open", at: sentTime + openDelay });
    if (Math.random() >= 0.27) continue;
    // Links with merge tags differ per person; the simulation sticks to fixed ones.
    const link = pickWeighted(clickableLinks(doc, items).filter((l) => !l.url.includes("{{")));
    if (!link) continue;
    const clickDelay = past ? 20_000 + Math.random() * 600_000 : 4_000 + Math.random() * 14_000;
    events.push({ sendId: send._id, kind: "click", url: link.url, blockId: link.blockId, at: sentTime + openDelay + clickDelay });
  }
  const delivered = sends.length - bounced;
  await ctx.db.patch(campaignId, {
    status: "sent",
    sentAt: base,
    sendJob: undefined,
    sendingMode: "demo",
    stats: { ...campaign.stats, recipients: Math.max(campaign.stats.recipients, sends.length), sent: sends.length, delivered, bounced },
    updatedAt: now,
  });
  events.sort((a, b) => a.at! - b.at!);
  if (past) {
    await applySimEvents(ctx, campaignId, events);
  } else {
    // Five-second buckets: one scheduled mutation each, whatever the list size.
    const buckets = new Map<number, SimEvent[]>();
    for (const e of events) {
      const key = Math.ceil((e.at! - now) / 5000) * 5000;
      buckets.set(key, [...(buckets.get(key) ?? []), e]);
    }
    for (const [delay, batch] of buckets) await ctx.scheduler.runAfter(Math.max(0, delay), internal.emailSend.simulateEvents, { campaignId, events: batch });
  }
  return { delivered, opens: events.filter((e) => e.kind === "open").length, clicks: events.filter((e) => e.kind === "click").length };
}

async function applySimEvents(ctx: MutationCtx, campaignId: Id<"emailCampaigns">, events: SimEvent[]) {
  const deltas: Delta[] = [];
  for (const e of events) {
    const send = await ctx.db.get(e.sendId);
    if (!send) continue;
    deltas.push(await applyEvent(ctx, send, e.kind, e.at ?? Date.now(), { url: e.url, blockId: e.blockId }));
  }
  await addStats(ctx, campaignId, deltas);
}

export const simulateEvents = internalMutation({
  args: {
    campaignId: v.id("emailCampaigns"),
    events: v.array(
      v.object({ sendId: v.id("emailSends"), kind: v.union(v.literal("open"), v.literal("click")), url: v.optional(v.string()), blockId: v.optional(v.string()), at: v.optional(v.number()) }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, events }) => {
    // Live events carry the moment they were planned for; stamp them now so the report's timeline follows the clock.
    await applySimEvents(ctx, campaignId, events.map((e) => ({ ...e, at: Date.now() })));
    return null;
  },
});
