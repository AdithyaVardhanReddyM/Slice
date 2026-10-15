import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { editableBrand } from "./emailBrands";
import { allBlocks, applyOps as applyDocOps, applyPersonalization, blankDoc, blockLabel, findBlock, validateEmailDoc } from "./emailDoc";
import { toEmailItem } from "./emailItems";
import { fillMerge, renderEmail, renderPlainText, type RenderContext } from "./emailRender";
import { EMAIL_TEMPLATES } from "./emailTemplates";
import { applyTheme, themeFromKit } from "./emailThemes";
import { emptyStats, type EmailDoc, type EmailItem, type EmailKit, type EmailOp, type MergeKey, type Personalization } from "./emailTypes";
import { emailPersonalizationStateValidator } from "./schema";

// A campaign is one email doc for one audience. The editor saves whole docs
// (with the version it started from, so a newer agent write is never
// overwritten); the agent writes over HTTP (/email/doc, /email/ops). People
// campaigns get one `emailVersions` row per person, written by the agent's
// personalise job. Everything here renders through emailRender.ts.

/* Rendering ------------------------------------------------------------------------- */

export const itemsRecord = (items: Doc<"emailItems">[]): Record<string, EmailItem> =>
  Object.fromEntries(items.map((i) => [i._id, toEmailItem(i)]));

type MergeSource = { name: string; firstName?: string; lastName?: string; email: string; city?: string };

/** A recipient's merge-tag values. */
export function mergeFor(contact: MergeSource | null | undefined, brand: Doc<"emailBrands">): Partial<Record<MergeKey, string>> {
  if (!contact) return { brand: brand.name };
  const first = contact.firstName?.trim() || contact.name.trim().split(/\s+/)[0] || "";
  const last = contact.lastName?.trim() || (contact.name.trim().split(/\s+/).length > 1 ? contact.name.trim().split(/\s+/).slice(1).join(" ") : "");
  const out: Partial<Record<MergeKey, string>> = { brand: brand.name, email: contact.email, name: contact.name.trim() };
  if (first) out.first_name = first;
  if (last) out.last_name = last;
  if (contact.city?.trim()) out.city = contact.city.trim();
  return out;
}

/** The renderer's context for a brand: its name, logo and footer, its items, and per-recipient values. */
export function renderContextFor(
  brand: Doc<"emailBrands">,
  items: Record<string, EmailItem>,
  opts: { mode: RenderContext["mode"]; merge?: RenderContext["merge"]; links?: RenderContext["links"] },
): RenderContext {
  const kit = brand.kit as EmailKit | undefined;
  return {
    items,
    brand: {
      name: brand.name,
      ...(kit?.logo ? { logo: kit.logo } : {}),
      ...(kit?.wordmark ? { wordmark: kit.wordmark } : {}),
      ...(brand.footer ? { footer: brand.footer } : {}),
    },
    ...(opts.merge ? { merge: opts.merge } : {}),
    ...(opts.links ? { links: opts.links } : {}),
    mode: opts.mode,
  };
}

/** The doc one recipient gets: personalised when the campaign goes to a people audience and they have a version. */
export function docFor(campaign: Doc<"emailCampaigns">, version: Doc<"emailVersions"> | null | undefined, peopleAudience: boolean): EmailDoc {
  const doc = campaign.doc as EmailDoc;
  return peopleAudience && version?.status === "ready" ? applyPersonalization(doc, version.personalization as Personalization) : doc;
}

/** Subject, preheader, HTML and text for one recipient (or none). */
export function renderOne(doc: EmailDoc, ctx: RenderContext) {
  return {
    html: renderEmail(doc, ctx),
    text: renderPlainText(doc, ctx),
    subject: fillMerge(doc.subject, ctx.merge, ctx.mode === "edit" ? "preview" : ctx.mode).replace(/<[^>]+>/g, ""),
    preheader: fillMerge(doc.preheader, ctx.merge, ctx.mode === "edit" ? "preview" : ctx.mode).replace(/<[^>]+>/g, ""),
  };
}

/* Queries ---------------------------------------------------------------------------- */

/** The brand's campaigns, newest first, each with its audience's name and kind. */
export const list = query({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) => {
    const campaigns = await ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", brandId)).order("desc").collect();
    return Promise.all(
      campaigns.map(async (c) => {
        const audience = c.audienceId ? await ctx.db.get(c.audienceId) : null;
        return { ...c, audienceName: audience?.name, audienceKind: audience?.kind };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getInternal = internalQuery({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** The builder chat. */
export const messages = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => (await ctx.db.query("emailChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).unique())?.messages ?? [],
});

const contactCard = (c: Doc<"emailContacts">) => ({
  _id: c._id,
  name: c.name,
  firstName: c.firstName,
  email: c.email,
  city: c.city,
  entities: c.entities.slice(0, 8),
  profileStatus: c.profileStatus,
  unsubscribed: c.unsubscribed,
});

/** Each person's version of a people campaign, with whether it predates the current doc. */
export const versions = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => {
    const campaign = await ctx.db.get(id);
    if (!campaign) return [];
    const docVersion = (campaign.doc as EmailDoc).version;
    const rows = await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect();
    const out = [];
    for (const r of rows) {
      const contact = await ctx.db.get(r.contactId);
      if (!contact) continue;
      out.push({
        _id: r._id,
        contact: contactCard(contact),
        personalization: r.personalization as Personalization,
        docVersion: r.docVersion,
        status: r.status,
        ...(r.error ? { error: r.error } : {}),
        stale: r.docVersion < docVersion,
        updatedAt: r.updatedAt,
      });
    }
    return out;
  },
});

/** Everything the builder agent reads at the start of a turn. People audiences come with each person and their profile. */
export const getForAgent = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => {
    const campaign = await ctx.db.get(id);
    if (!campaign) return null;
    const brand = await ctx.db.get(campaign.brandId);
    const audience = campaign.audienceId ? await ctx.db.get(campaign.audienceId) : null;
    const items = (await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", campaign.brandId)).collect()).sort((a, b) => a.order - b.order);
    let contacts;
    if (audience?.kind === "people") {
      const members = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", audience._id)).collect();
      contacts = members
        .filter((m) => !m.unsubscribed)
        .map((m) => ({
          id: m._id,
          name: m.name,
          firstName: m.firstName,
          email: m.email,
          city: m.city,
          age: m.age,
          gender: m.gender,
          interests: m.interests,
          entities: m.entities,
          profileStatus: m.profileStatus,
          profile: m.profile as unknown,
        }));
    }
    return { campaign, brand, audience, items: items.map(toEmailItem), ...(contacts ? { contacts } : {}) };
  },
});

async function versionOf(ctx: QueryCtx, campaignId: Id<"emailCampaigns">, contactId: Id<"emailContacts">) {
  return ctx.db
    .query("emailVersions")
    .withIndex("by_campaign_contact", (q) => q.eq("campaignId", campaignId).eq("contactId", contactId))
    .unique();
}

/**
 * The email as one contact gets it (their version, their merge values), or
 * as anyone gets it without `contactId`. Previews and the agent's review; no
 * tracking.
 */
export const renderFor = query({
  args: {
    id: v.id("emailCampaigns"),
    contactId: v.optional(v.id("emailContacts")),
    mode: v.optional(v.union(v.literal("send"), v.literal("preview"), v.literal("edit"))),
  },
  returns: v.object({ html: v.string(), subject: v.string(), preheader: v.string(), text: v.string() }),
  handler: async (ctx, { id, contactId, mode = "preview" }) => {
    const campaign = await ctx.db.get(id);
    if (!campaign) throw new Error("Unknown campaign");
    const brand = await ctx.db.get(campaign.brandId);
    if (!brand) throw new Error("Unknown brand");
    const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", campaign.brandId)).collect();
    const contact = contactId ? await ctx.db.get(contactId) : null;
    const audience = campaign.audienceId ? await ctx.db.get(campaign.audienceId) : null;
    const version = contact ? await versionOf(ctx, id, contact._id) : null;
    const doc = docFor(campaign, version, audience?.kind === "people");
    return renderOne(doc, renderContextFor(brand, itemsRecord(items), { mode, merge: mergeFor(contact, brand) }));
  },
});

/** Opens and clicks per time bucket, most-clicked links, and for people campaigns each person's result. */
export const report = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => {
    const campaign = await ctx.db.get(id);
    if (!campaign) return null;
    const sends = await ctx.db.query("emailSends").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect();
    const audience = campaign.audienceId ? await ctx.db.get(campaign.audienceId) : null;
    const doc = campaign.doc as EmailDoc;

    // First opens and clicks only, in buckets sized to keep the chart under ~48 points.
    const start = campaign.sentAt ?? Math.min(...sends.map((s) => s.sentAt ?? s.queuedAt), Date.now());
    const events = sends.flatMap((s) => [s.openedAt, s.clickedAt].filter((x): x is number => !!x));
    const end = Math.max(start + 60_000, ...events, campaign.status === "sending" ? Date.now() : 0);
    const SIZES = [60_000, 5 * 60_000, 15 * 60_000, 3_600_000, 6 * 3_600_000, 86_400_000];
    const size = SIZES.find((s) => (end - start) / s <= 48) ?? SIZES[SIZES.length - 1];
    const buckets = Array.from({ length: Math.floor((end - start) / size) + 1 }, (_, i) => ({ at: start + i * size, opens: 0, clicks: 0 }));
    const slot = (at: number) => buckets[Math.min(buckets.length - 1, Math.max(0, Math.floor((at - start) / size)))];
    for (const s of sends) {
      if (s.openedAt) slot(s.openedAt).opens++;
      if (s.clickedAt) slot(s.clickedAt).clicks++;
    }

    const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", campaign.brandId)).collect();
    const byLink = new Map<string, { url: string; blockId?: string; label?: string; clicks: number; people: Set<string> }>();
    for (const s of sends) {
      for (const l of s.links) {
        const key = `${l.url}|${l.blockId ?? ""}`;
        const cur = byLink.get(key);
        if (cur) {
          cur.clicks++;
          cur.people.add(s._id);
          continue;
        }
        const block = l.blockId ? findBlock(doc, l.blockId)?.block : undefined;
        const item = items.find((i) => i.url === l.url);
        const label = item?.name ?? (block?.type === "button" ? block.label : block ? blockLabel(block) : undefined);
        byLink.set(key, { url: l.url, ...(l.blockId ? { blockId: l.blockId } : {}), ...(label ? { label } : {}), clicks: 1, people: new Set([s._id]) });
      }
    }
    const links = [...byLink.values()]
      .map(({ people, ...l }) => ({ ...l, unique: people.size }))
      .sort((a, b) => b.clicks - a.clicks);

    let people;
    if (audience?.kind === "people") {
      people = [];
      for (const s of sends) {
        const contact = await ctx.db.get(s.contactId);
        people.push({
          contactId: s.contactId,
          name: contact?.name ?? s.email,
          email: s.email,
          status: s.status,
          opened: !!s.openedAt,
          clicked: !!s.clickedAt,
          subject: s.subject,
        });
      }
    }
    return { stats: campaign.stats, timeline: buckets, links, ...(people ? { people } : {}) };
  },
});

/* Writes ----------------------------------------------------------------------------- */

async function editableCampaign(ctx: MutationCtx, id: Id<"emailCampaigns">) {
  const campaign = await ctx.db.get(id);
  if (!campaign) throw new Error("Unknown campaign");
  const brand = await editableBrand(ctx, campaign.brandId);
  return { campaign, brand };
}

const LOCKED = new Set(["sending", "sent"]);

/** Items blocks a template left empty show the brand's first items until the agent picks by taste. */
function fillItems(doc: EmailDoc, items: Doc<"emailItems">[]) {
  if (!items.length) return;
  for (const { block } of allBlocks(doc)) {
    if (block.type === "items" && !block.itemIds.length) block.itemIds = items.slice(0, Math.max(1, block.count || 3)).map((i) => i._id);
  }
}

/** A campaign from a template (themed with the brand's kit), a given doc, or a blank doc with the brand's header and footer. */
export const create = mutation({
  args: {
    brandId: v.id("emailBrands"),
    name: v.optional(v.string()),
    templateId: v.optional(v.string()),
    doc: v.optional(v.any()),
    prompt: v.optional(v.string()),
    audienceId: v.optional(v.id("emailAudiences")),
  },
  returns: v.id("emailCampaigns"),
  handler: async (ctx, { brandId, name, templateId, doc: given, prompt, audienceId }) => {
    const brand = await editableBrand(ctx, brandId);
    const theme = themeFromKit(brand.kit as EmailKit | undefined);
    const template = templateId && templateId !== "blank" ? EMAIL_TEMPLATES.find((t) => t.id === templateId) : undefined;
    if (templateId && templateId !== "blank" && !template) throw new Error(`Unknown template "${templateId}"`);
    let doc: EmailDoc;
    if (given !== undefined) doc = validateEmailDoc(given).doc;
    // A deep copy: templates are module constants shared by every call.
    else if (template) doc = validateEmailDoc(applyTheme(JSON.parse(JSON.stringify(template.doc)) as EmailDoc, theme)).doc;
    else doc = blankDoc(theme, brand.name);
    const items = (await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect()).sort((a, b) => a.order - b.order);
    fillItems(doc, items);
    doc.version = 1;
    if (audienceId) {
      const audience = await ctx.db.get(audienceId);
      if (!audience || audience.brandId !== brandId) throw new Error("Unknown audience");
    }
    const firstLine = prompt?.trim().split(/[.\n!?]/)[0]?.trim();
    const fromPrompt = !name?.trim() && !template && !!firstLine;
    const now = Date.now();
    return ctx.db.insert("emailCampaigns", {
      brandId,
      name: name?.trim() || template?.name || (firstLine ? (firstLine.length > 48 ? `${firstLine.slice(0, 46).trim()}…` : firstLine) : "Untitled campaign"),
      ...(fromPrompt ? { nameFromPrompt: true } : {}),
      status: "draft",
      ...(audienceId ? { audienceId } : {}),
      doc,
      ...(templateId ? { templateId } : {}),
      ...(prompt?.trim() ? { prompt: prompt.trim() } : {}),
      stats: emptyStats(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const rename = mutation({
  args: { id: v.id("emailCampaigns"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    await editableCampaign(ctx, id);
    if (name.trim()) await ctx.db.patch(id, { name: name.trim().slice(0, 120), nameFromPrompt: undefined, updatedAt: Date.now() });
    return null;
  },
});

/** A draft copy: same doc and audience, no results, no personal versions. */
export const duplicate = mutation({
  args: { id: v.id("emailCampaigns") },
  returns: v.id("emailCampaigns"),
  handler: async (ctx, { id }) => {
    const { campaign } = await editableCampaign(ctx, id);
    const now = Date.now();
    return ctx.db.insert("emailCampaigns", {
      brandId: campaign.brandId,
      name: `${campaign.name} (copy)`,
      status: "draft",
      ...(campaign.audienceId ? { audienceId: campaign.audienceId } : {}),
      doc: { ...(campaign.doc as EmailDoc), version: 1 },
      ...(campaign.templateId ? { templateId: campaign.templateId } : {}),
      stats: emptyStats(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Deletes a draft (or a failed send) with its chat and versions. Sent campaigns stay for their reports. */
export const remove = mutation({
  args: { id: v.id("emailCampaigns") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const campaign = await ctx.db.get(id);
    if (!campaign) return null;
    await editableBrand(ctx, campaign.brandId);
    if (campaign.status !== "draft" && campaign.status !== "failed") throw new Error(`A ${campaign.status} campaign can't be deleted`);
    await deleteCampaign(ctx, id);
    return null;
  },
});

/** Any campaign, sent ones included, with its chat, versions and sends (for scripts and test clean-up). */
export const purge = internalMutation({
  args: { id: v.id("emailCampaigns") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await deleteCampaign(ctx, id);
    return null;
  },
});

async function deleteCampaign(ctx: MutationCtx, id: Id<"emailCampaigns">) {
  for (const c of await ctx.db.query("emailChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) await ctx.db.delete(c._id);
  for (const r of await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) await ctx.db.delete(r._id);
  for (const s of await ctx.db.query("emailSends").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) await ctx.db.delete(s._id);
  await ctx.db.delete(id);
}

/** Validates and stores a doc as the next version. */
async function storeDoc(ctx: MutationCtx, campaign: Doc<"emailCampaigns">, input: unknown) {
  if (LOCKED.has(campaign.status)) throw new Error(`A ${campaign.status} campaign can't be edited`);
  const { doc, problems } = validateEmailDoc(input);
  doc.version = ((campaign.doc as EmailDoc).version ?? 0) + 1;
  await ctx.db.patch(campaign._id, { doc, updatedAt: Date.now() });
  return { version: doc.version, doc, problems };
}

/**
 * The editor's autosave. `baseVersion` is the version the edits started
 * from; when the stored doc has moved past it (the agent wrote meanwhile)
 * nothing is saved and the caller adopts the stored doc.
 */
export const saveDoc = mutation({
  args: { id: v.id("emailCampaigns"), doc: v.any(), baseVersion: v.number() },
  returns: v.object({ version: v.number(), conflict: v.optional(v.boolean()), problems: v.optional(v.array(v.string())) }),
  handler: async (ctx, { id, doc, baseVersion }) => {
    const { campaign } = await editableCampaign(ctx, id);
    const stored = (campaign.doc as EmailDoc).version ?? 0;
    if (baseVersion < stored) return { conflict: true, version: stored };
    const saved = await storeDoc(ctx, campaign, doc);
    return { version: saved.version, problems: saved.problems };
  },
});

/** Edit operations from the editor's quick actions. */
export const applyOps = mutation({
  args: { id: v.id("emailCampaigns"), ops: v.array(v.any()) },
  returns: v.object({ version: v.number(), problems: v.array(v.string()), changed: v.array(v.string()) }),
  handler: async (ctx, { id, ops }) => {
    const { campaign } = await editableCampaign(ctx, id);
    const result = applyDocOps(campaign.doc as EmailDoc, ops as EmailOp[]);
    const saved = await storeDoc(ctx, campaign, result.doc);
    return { version: saved.version, problems: [...result.problems, ...saved.problems], changed: result.changed };
  },
});

/** Points the campaign at an audience. A different audience makes the personal versions meaningless, so they go. */
export const setAudience = mutation({
  args: { id: v.id("emailCampaigns"), audienceId: v.optional(v.id("emailAudiences")) },
  returns: v.null(),
  handler: async (ctx, { id, audienceId }) => {
    const { campaign } = await editableCampaign(ctx, id);
    if (LOCKED.has(campaign.status) || campaign.status === "scheduled") throw new Error(`A ${campaign.status} campaign can't change its audience`);
    if (campaign.audienceId === audienceId) return null;
    if (audienceId) {
      const audience = await ctx.db.get(audienceId);
      if (!audience || audience.brandId !== campaign.brandId) throw new Error("Unknown audience");
    }
    for (const r of await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) await ctx.db.delete(r._id);
    await ctx.db.patch(id, { audienceId, personalization: undefined, updatedAt: Date.now() });
    return null;
  },
});

/* Agent writes (HTTP) -------------------------------------------------------------------- */

/** A name cut from the prompt gives way to the builder's first subject line, which reads like a campaign. */
async function nameFromSubject(ctx: MutationCtx, campaign: Doc<"emailCampaigns">, doc: EmailDoc) {
  const subject = doc.subject?.trim();
  if (!campaign.nameFromPrompt || !subject) return;
  await ctx.db.patch(campaign._id, { name: subject.slice(0, 120), nameFromPrompt: undefined });
}

/** A whole doc from the agent (POST /email/doc). */
export const writeDoc = internalMutation({
  args: { id: v.id("emailCampaigns"), doc: v.any() },
  returns: v.object({ version: v.number(), doc: v.any(), problems: v.array(v.string()) }),
  handler: async (ctx, { id, doc }) => {
    const campaign = await ctx.db.get(id);
    if (!campaign) throw new Error("Unknown campaign");
    const saved = await storeDoc(ctx, campaign, doc);
    await nameFromSubject(ctx, campaign, saved.doc as EmailDoc);
    return saved;
  },
});

/** Edit operations from the agent (POST /email/ops). */
export const writeOps = internalMutation({
  args: { id: v.id("emailCampaigns"), ops: v.array(v.any()) },
  returns: v.object({ version: v.number(), doc: v.any(), problems: v.array(v.string()) }),
  handler: async (ctx, { id, ops }) => {
    const campaign = await ctx.db.get(id);
    if (!campaign) throw new Error("Unknown campaign");
    const result = applyDocOps(campaign.doc as EmailDoc, ops as EmailOp[]);
    const saved = await storeDoc(ctx, campaign, result.doc);
    await nameFromSubject(ctx, campaign, saved.doc as EmailDoc);
    return { version: saved.version, doc: saved.doc, problems: [...result.problems, ...saved.problems] };
  },
});

const str = (x: unknown, max = 20000) => (typeof x === "string" ? x.slice(0, max) : "");

/** A span from the agent's JSON, in the stored shape. */
function cleanSpan(s: unknown) {
  const r = (s ?? {}) as Record<string, unknown>;
  const params =
    r.params && typeof r.params === "object"
      ? Object.fromEntries(Object.entries(r.params as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null).map(([k, x]) => [k, String(x).slice(0, 500)]))
      : undefined;
  return {
    kind: str(r.kind, 20) || "llm",
    name: str(r.name, 200),
    ms: typeof r.ms === "number" ? r.ms : 0,
    result: str(r.result, 2000),
    ...(typeof r.started === "number" ? { started: r.started } : {}),
    ...(typeof r.path === "string" ? { path: r.path } : {}),
    ...(params ? { params } : {}),
    ...(typeof r.cache === "string" ? { cache: r.cache } : {}),
  };
}

/** A chat message from the agent's JSON, or null when it isn't one. */
function cleanMessage(m: unknown, now: number) {
  const r = (m ?? {}) as Record<string, unknown>;
  if (r.role !== "merchant" && r.role !== "agent") return null;
  const list = <T>(x: unknown, f: (y: Record<string, unknown>) => T | null): T[] | undefined =>
    Array.isArray(x) ? x.map((y) => f((y ?? {}) as Record<string, unknown>)).filter((y): y is T => y !== null) : undefined;
  const trace = list(r.trace, cleanSpan);
  const attachments = list(r.attachments, (a) => (typeof a.url === "string" ? { url: a.url, name: str(a.name, 200), type: str(a.type, 100) } : null));
  const blocks = list(r.blocks, (b) => (typeof b.id === "string" ? { id: b.id, label: str(b.label, 200), type: str(b.type, 40) } : null));
  return {
    id: typeof r.id === "string" && r.id ? r.id : `m_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    role: r.role as "merchant" | "agent",
    at: typeof r.at === "number" ? r.at : now,
    text: str(r.text),
    ...(trace?.length ? { trace } : {}),
    ...(Array.isArray(r.steps) ? { steps: r.steps } : {}),
    ...(attachments?.length ? { attachments } : {}),
    ...(blocks?.length ? { blocks } : {}),
  };
}

/** Builder chat messages (POST /email/chat). A message whose id is already there replaces it. */
export const appendChat = internalMutation({
  args: { id: v.id("emailCampaigns"), messages: v.array(v.any()) },
  returns: v.null(),
  handler: async (ctx, { id, messages }) => {
    if (!(await ctx.db.get(id))) throw new Error("Unknown campaign");
    const now = Date.now();
    const incoming = messages.map((m) => cleanMessage(m, now)).filter((m): m is NonNullable<ReturnType<typeof cleanMessage>> => m !== null);
    const existing = await ctx.db.query("emailChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).unique();
    const merged = [...(existing?.messages ?? [])];
    for (const m of incoming) {
      const at = merged.findIndex((x) => x.id === m.id);
      if (at >= 0) merged[at] = m;
      else merged.push(m);
    }
    // A chat document stays well under Convex's 1 MiB.
    const kept = merged.slice(-150);
    if (existing) await ctx.db.patch(existing._id, { messages: kept, updatedAt: now });
    else await ctx.db.insert("emailChats", { campaignId: id, messages: kept, updatedAt: now });
    return null;
  },
});

/** One person's version (POST /email/version). */
export const saveVersion = internalMutation({
  args: {
    campaignId: v.id("emailCampaigns"),
    contactId: v.id("emailContacts"),
    docVersion: v.number(),
    personalization: v.any(),
    status: v.optional(v.union(v.literal("ready"), v.literal("failed"))),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, contactId, docVersion, personalization, status = "ready", error }) => {
    if (!(await ctx.db.get(campaignId))) throw new Error("Unknown campaign");
    if (!(await ctx.db.get(contactId))) throw new Error("Unknown contact");
    const p = (personalization ?? {}) as Record<string, unknown>;
    const clean: Personalization = {
      blocks: p.blocks && typeof p.blocks === "object" ? (p.blocks as Personalization["blocks"]) : {},
      ...(typeof p.subject === "string" && p.subject.trim() ? { subject: p.subject.trim() } : {}),
      ...(typeof p.preheader === "string" && p.preheader.trim() ? { preheader: p.preheader.trim() } : {}),
      ...(typeof p.why === "string" && p.why.trim() ? { why: p.why.trim() } : {}),
    };
    const now = Date.now();
    const existing = await versionOf(ctx, campaignId, contactId);
    const row = { docVersion, personalization: clean, status, error: status === "failed" ? (error ?? "Couldn't write their version") : undefined, updatedAt: now };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("emailVersions", { campaignId, contactId, ...row, createdAt: now });
    return null;
  },
});

/** The personalise job's progress (POST /email/personalization). */
export const setPersonalization = internalMutation({
  args: {
    campaignId: v.id("emailCampaigns"),
    status: v.union(v.literal("idle"), v.literal("running"), v.literal("ready"), v.literal("failed")),
    done: v.number(),
    total: v.number(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, status, done, total, error }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error("Unknown campaign");
    const prev = campaign.personalization;
    const startedAt = status === "running" && prev?.status !== "running" ? Date.now() : prev?.startedAt;
    const next: Infer<typeof emailPersonalizationStateValidator> = {
      status,
      done,
      total,
      // The doc version the job writes against: fixed when it starts.
      docVersion: status === "running" && prev?.status !== "running" ? (campaign.doc as EmailDoc).version : (prev?.docVersion ?? (campaign.doc as EmailDoc).version),
      ...(error ? { error } : {}),
      ...(startedAt ? { startedAt } : {}),
    };
    await ctx.db.patch(campaignId, { personalization: next, updatedAt: Date.now() });
    return null;
  },
});
