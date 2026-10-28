import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { editableBrand, owned, ownedBrand } from "./emailBrands";
import { allBlocks, applyOps as applyDocOps, applyPersonalization, blankDoc, blockLabel, findBlock, validateEmailDoc } from "./emailDoc";
import { toEmailItem } from "./emailItems";
import { fillMerge, renderEmail, renderPlainText, type RenderContext } from "./emailRender";
import { EMAIL_TEMPLATES } from "./emailTemplates";
import { applyTheme, themeFromKit } from "./emailThemes";
import { emptyStats, type EmailDoc, type EmailItem, type EmailKit, type EmailOp, type MergeKey, type Personalization } from "./emailTypes";
import { emailPersonalizationStateValidator } from "./schema";

// A campaign is one email doc sent to the taste groups and individual contacts
// ticked for it. The editor saves whole docs (with the version it started
// from, so a newer agent write is never overwritten); the agent writes over
// HTTP (/email/doc, /email/ops). When the doc has personal blocks, every group
// and every person gets an `emailVersions` row written by the agent's
// personalise job; a recipient reads their group's version, or their own.
// Everything here renders through emailRender.ts. Console reads answer only
// the brand's signed-in owner; the agent reads `getForAgent` and
// `renderForInternal` over /agent/read (http.ts).

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

/** The doc one recipient gets: with their version's personal blocks when it is ready. */
export function docFor(campaign: Doc<"emailCampaigns">, version: Doc<"emailVersions"> | null | undefined): EmailDoc {
  const doc = campaign.doc as EmailDoc;
  return version?.status === "ready" ? applyPersonalization(doc, version.personalization as Personalization) : doc;
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

/* Who it goes to ---------------------------------------------------------------------- */

type DbCtx = { db: QueryCtx["db"] };

/** Who a campaign goes to: the taste groups ticked and the individual contacts ticked. */
export type Targets = { groups: Doc<"emailAudiences">[]; people: Doc<"emailContacts">[] };

export async function targetsOf(ctx: DbCtx, campaign: Pick<Doc<"emailCampaigns">, "brandId" | "groupIds" | "contactIds">): Promise<Targets> {
  const groups: Doc<"emailAudiences">[] = [];
  for (const id of new Set(campaign.groupIds ?? [])) {
    const a = await ctx.db.get(id);
    if (a && a.brandId === campaign.brandId && a.kind === "group") groups.push(a);
  }
  // Someone ticked who has since joined a taste group is no longer an individual contact.
  const kinds = new Map<string, string | undefined>();
  const people: Doc<"emailContacts">[] = [];
  for (const id of new Set(campaign.contactIds ?? [])) {
    const c = await ctx.db.get(id);
    if (!c || c.brandId !== campaign.brandId || !c.audienceId) continue;
    if (!kinds.has(c.audienceId)) kinds.set(c.audienceId, (await ctx.db.get(c.audienceId))?.kind);
    if (kinds.get(c.audienceId) === "people") people.push(c);
  }
  return { groups, people };
}

/** Everyone it goes to: each group's members, then the people ticked, once per contact. */
export async function recipientsOf(ctx: DbCtx, targets: Targets): Promise<Doc<"emailContacts">[]> {
  const out = new Map<string, Doc<"emailContacts">>();
  for (const g of targets.groups) {
    for (const c of await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", g._id)).collect()) out.set(c._id, c);
  }
  for (const c of targets.people) out.set(c._id, c);
  return [...out.values()];
}

/** The version a recipient reads: their group's when the campaign goes to that group, else their own. */
export async function versionFor(ctx: DbCtx, campaign: Pick<Doc<"emailCampaigns">, "_id" | "groupIds">, contact: Pick<Doc<"emailContacts">, "_id" | "audienceId"> | null) {
  if (!contact) return null;
  const group = contact.audienceId && campaign.groupIds?.includes(contact.audienceId) ? contact.audienceId : null;
  if (group) return ctx.db.query("emailVersions").withIndex("by_campaign_audience", (q) => q.eq("campaignId", campaign._id).eq("audienceId", group)).unique();
  return ctx.db.query("emailVersions").withIndex("by_campaign_contact", (q) => q.eq("campaignId", campaign._id).eq("contactId", contact._id)).unique();
}

/** "3 individual contacts" for the people ticked one by one. */
export const pickedName = (n: number) => (n === 1 ? "1 individual contact" : `${n} individual contacts`);

/** "Crime & suspense, Sci-fi & fantasy and 3 individual contacts". */
export function targetsName(groups: { name: string }[], people: number): string | undefined {
  const parts = [...groups.map((g) => g.name), ...(people ? [pickedName(people)] : [])];
  if (parts.length < 2) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/* Queries ---------------------------------------------------------------------------- */

/** The brand's campaigns, newest first, each with who it goes to. */
export const list = query({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) => {
    if (!(await ownedBrand(ctx, brandId))) return [];
    const campaigns = await ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", brandId)).order("desc").collect();
    return Promise.all(
      campaigns.map(async (c) => {
        const { groups, people } = await targetsOf(ctx, c);
        return { ...c, audienceName: targetsName(groups, people.length), groupCount: groups.length, peopleCount: people.length };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => owned(ctx, await ctx.db.get(id)),
});

export const getInternal = internalQuery({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** The builder chat. */
export const messages = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => {
    if (!(await owned(ctx, await ctx.db.get(id)))) return [];
    return (await ctx.db.query("emailChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).unique())?.messages ?? [];
  },
});

const contactCard = (c: Doc<"emailContacts">) => ({
  _id: c._id,
  name: c.name,
  firstName: c.firstName,
  email: c.email,
  city: c.city,
  neighborhood: c.neighborhood,
  entities: c.entities.slice(0, 8),
  profileStatus: c.profileStatus,
  unsubscribed: c.unsubscribed,
});

const groupCard = (a: Doc<"emailAudiences">) => ({ _id: a._id, name: a.name, size: a.size, topEntities: a.topEntities.slice(0, 8) });

/** Each group's and each person's version, with whether it predates the current doc. Groups first. */
export const versions = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => {
    const campaign = await owned(ctx, await ctx.db.get(id));
    if (!campaign) return [];
    const docVersion = (campaign.doc as EmailDoc).version;
    const rows = await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect();
    const out = [];
    for (const r of rows) {
      const contact = r.contactId ? await ctx.db.get(r.contactId) : null;
      const group = r.audienceId ? await ctx.db.get(r.audienceId) : null;
      if (!contact && !group) continue;
      out.push({
        _id: r._id,
        ...(group ? { group: groupCard(group) } : {}),
        ...(contact ? { contact: contactCard(contact) } : {}),
        personalization: r.personalization as Personalization,
        docVersion: r.docVersion,
        status: r.status,
        ...(r.error ? { error: r.error } : {}),
        stale: r.docVersion < docVersion,
        updatedAt: r.updatedAt,
      });
    }
    return out.sort((a, b) => Number(!!a.contact) - Number(!!b.contact));
  },
});

/** Everyone it goes to, for "preview as" and test sends: each with the taste group whose version they read (none: their own). */
export const recipients = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => {
    const campaign = await owned(ctx, await ctx.db.get(id));
    if (!campaign) return [];
    const targets = await targetsOf(ctx, campaign);
    const names = new Map<string, string>(targets.groups.map((g) => [g._id, g.name]));
    return (await recipientsOf(ctx, targets)).map((c) => ({
      _id: c._id,
      name: c.name,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      city: c.city,
      neighborhood: c.neighborhood,
      /** A face for avatars: the first picture from what they like. */
      image: c.entities.find((e) => e.image)?.image,
      ...(c.unsubscribed ? { unsubscribed: true } : {}),
      ...(c.audienceId && names.has(c.audienceId) ? { group: names.get(c.audienceId) } : {}),
    }));
  },
});

const agentContact = (m: Doc<"emailContacts">) => ({
  id: m._id,
  name: m.name,
  firstName: m.firstName,
  email: m.email,
  city: m.city,
  neighborhood: m.neighborhood,
  age: m.age,
  gender: m.gender,
  purchases: m.purchases,
  interests: m.interests,
  entities: m.entities,
  placement: m.placement,
  profileStatus: m.profileStatus,
  profile: m.profile as unknown,
});

/**
 * Everything the builder agent reads at the start of a turn: the campaign,
 * brand and items, each taste group ticked (profile, brief and its members),
 * and each individual contact ticked with their profile.
 */
export const getForAgent = internalQuery({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => {
    const campaign = await ctx.db.get(id);
    if (!campaign) return null;
    const brand = await ctx.db.get(campaign.brandId);
    const items = (await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", campaign.brandId)).collect()).sort((a, b) => a.order - b.order);
    const { groups, people } = await targetsOf(ctx, campaign);
    const withMembers = [];
    for (const g of groups) {
      const members = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", g._id)).collect();
      withMembers.push({ ...g, members: members.filter((m) => !m.unsubscribed).map(agentContact) });
    }
    return { campaign, brand, groups: withMembers, items: items.map(toEmailItem), contacts: people.filter((m) => !m.unsubscribed).map(agentContact) };
  },
});

/**
 * The email as one contact gets it (their group's or their own version, their
 * merge values), as a group gets it (`audienceId`), or as anyone gets it
 * without either. Previews and the agent's review; no tracking.
 */
const renderForArgs = {
  id: v.id("emailCampaigns"),
  contactId: v.optional(v.id("emailContacts")),
  audienceId: v.optional(v.id("emailAudiences")),
  mode: v.optional(v.union(v.literal("send"), v.literal("preview"), v.literal("edit"))),
};
const renderedValidator = v.object({ html: v.string(), subject: v.string(), preheader: v.string(), text: v.string() });

async function renderAs(
  ctx: QueryCtx,
  campaign: Doc<"emailCampaigns"> | null,
  { contactId, audienceId, mode = "preview" }: { contactId?: Id<"emailContacts">; audienceId?: Id<"emailAudiences">; mode?: "send" | "preview" | "edit" },
) {
  if (!campaign) throw new Error("Unknown campaign");
  const brand = await ctx.db.get(campaign.brandId);
  if (!brand) throw new Error("Unknown brand");
  const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", campaign.brandId)).collect();
  // Only the brand's own contacts: another brand's would lend the email their name.
  const found = contactId ? await ctx.db.get(contactId) : null;
  const contact = found?.brandId === campaign.brandId ? found : null;
  const version = contact
    ? await versionFor(ctx, campaign, contact)
    : audienceId
      ? await ctx.db.query("emailVersions").withIndex("by_campaign_audience", (q) => q.eq("campaignId", campaign._id).eq("audienceId", audienceId)).unique()
      : null;
  return renderOne(docFor(campaign, version), renderContextFor(brand, itemsRecord(items), { mode, merge: mergeFor(contact, brand) }));
}

export const renderFor = query({
  args: renderForArgs,
  returns: renderedValidator,
  handler: async (ctx, { id, ...as }) => renderAs(ctx, await owned(ctx, await ctx.db.get(id)), as),
});

/** `renderFor` for the agent's review (over /agent/read). */
export const renderForInternal = internalQuery({
  args: renderForArgs,
  returns: renderedValidator,
  handler: async (ctx, { id, ...as }) => renderAs(ctx, await ctx.db.get(id), as),
});

/**
 * Opens and clicks per time bucket, most-clicked links, and with personal
 * versions each person's result and how each version (a group's, or the
 * individual contacts' own) did.
 */
export const report = query({
  args: { id: v.id("emailCampaigns") },
  handler: async (ctx, { id }) => {
    const campaign = await owned(ctx, await ctx.db.get(id));
    if (!campaign) return null;
    const sends = await ctx.db.query("emailSends").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect();
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

    // Who got which version: a group's (by the group they were in) or their own.
    const hasVersions = !!(await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", id)).first());
    let people;
    let versions;
    if (hasVersions) {
      const groupNames = new Map<string, string>();
      for (const gid of campaign.groupIds ?? []) groupNames.set(gid, (await ctx.db.get(gid))?.name ?? "A taste group");
      const tally = new Map<string, { key: string; label: string; kind: "group" | "person"; sent: number; opened: number; clicked: number }>();
      people = [];
      for (const s of sends) {
        const contact = await ctx.db.get(s.contactId);
        const group = contact?.audienceId ? groupNames.get(contact.audienceId) : undefined;
        const key = group ? contact!.audienceId! : "people";
        const t = tally.get(key) ?? { key, label: group ?? "Individual contacts", kind: group ? ("group" as const) : ("person" as const), sent: 0, opened: 0, clicked: 0 };
        t.sent++;
        if (s.openedAt) t.opened++;
        if (s.clickedAt) t.clicked++;
        tally.set(key, t);
        people.push({
          contactId: s.contactId,
          name: contact?.name ?? s.email,
          email: s.email,
          status: s.status,
          opened: !!s.openedAt,
          clicked: !!s.clickedAt,
          subject: s.subject,
          version: group ?? "Their own",
        });
      }
      versions = [...tally.values()].sort((a, b) => Number(a.kind === "person") - Number(b.kind === "person") || b.sent - a.sent);
    }
    const { groups, people: picked } = await targetsOf(ctx, campaign);
    const to = targetsName(groups, picked.length);
    return { stats: campaign.stats, timeline: buckets, links, ...(to ? { to } : {}), ...(people ? { people } : {}), ...(versions ? { versions } : {}) };
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
    /** Taste groups ticked. */
    groupIds: v.optional(v.array(v.id("emailAudiences"))),
    /** Individual contacts ticked. */
    contactIds: v.optional(v.array(v.id("emailContacts"))),
  },
  returns: v.id("emailCampaigns"),
  handler: async (ctx, { brandId, name, templateId, doc: given, prompt, groupIds, contactIds }) => {
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
    const targets = await targetsOf(ctx, { brandId, groupIds, contactIds });
    const firstLine = prompt?.trim().split(/[.\n!?]/)[0]?.trim();
    const fromPrompt = !name?.trim() && !template && !!firstLine;
    const now = Date.now();
    return ctx.db.insert("emailCampaigns", {
      brandId,
      name: name?.trim() || template?.name || (firstLine ? (firstLine.length > 48 ? `${firstLine.slice(0, 46).trim()}…` : firstLine) : "Untitled campaign"),
      ...(fromPrompt ? { nameFromPrompt: true } : {}),
      status: "draft",
      ...(targets.groups.length ? { groupIds: targets.groups.map((g) => g._id) } : {}),
      ...(targets.people.length ? { contactIds: targets.people.map((c) => c._id) } : {}),
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

/** A draft copy: same doc and recipients, no results, no personal versions. */
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
      ...(campaign.groupIds ? { groupIds: campaign.groupIds } : {}),
      ...(campaign.contactIds ? { contactIds: campaign.contactIds } : {}),
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

/**
 * Ticks who it goes to: the taste groups (`groupIds`) and the individual
 * contacts (`contactIds`), either or both. Versions of anyone unticked stay,
 * in case they come back; the send only reads the ticked ones.
 */
export const setTargets = mutation({
  args: { id: v.id("emailCampaigns"), groupIds: v.optional(v.array(v.id("emailAudiences"))), contactIds: v.optional(v.array(v.id("emailContacts"))) },
  returns: v.null(),
  handler: async (ctx, { id, groupIds, contactIds }) => {
    const { campaign } = await editableCampaign(ctx, id);
    if (LOCKED.has(campaign.status) || campaign.status === "scheduled") throw new Error(`A ${campaign.status} campaign can't change who it goes to`);
    const next = await targetsOf(ctx, { brandId: campaign.brandId, groupIds: groupIds ?? campaign.groupIds, contactIds: contactIds ?? campaign.contactIds });
    await ctx.db.patch(id, {
      groupIds: next.groups.length ? next.groups.map((g) => g._id) : undefined,
      contactIds: next.people.length ? next.people.map((c) => c._id) : undefined,
      updatedAt: Date.now(),
    });
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
export function cleanMessage(m: unknown, now: number) {
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

/**
 * Replaces a campaign's whole builder chat, and with `prompt` the brief it
 * started from (scripts and demo seeding; the agent appends through appendChat).
 */
export const setChat = internalMutation({
  args: { id: v.id("emailCampaigns"), messages: v.array(v.any()), prompt: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, messages, prompt }) => {
    if (!(await ctx.db.get(id))) throw new Error("Unknown campaign");
    if (prompt?.trim()) await ctx.db.patch(id, { prompt: prompt.trim() });
    const now = Date.now();
    const kept = messages.map((m) => cleanMessage(m, now)).filter((m): m is NonNullable<ReturnType<typeof cleanMessage>> => m !== null);
    const existing = await ctx.db.query("emailChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).unique();
    if (existing) await ctx.db.patch(existing._id, { messages: kept, updatedAt: now });
    else await ctx.db.insert("emailChats", { campaignId: id, messages: kept, updatedAt: now });
    return null;
  },
});

/** One group's (`audienceId`) or one person's (`contactId`) version (POST /email/version). */
export const saveVersion = internalMutation({
  args: {
    campaignId: v.id("emailCampaigns"),
    contactId: v.optional(v.id("emailContacts")),
    audienceId: v.optional(v.id("emailAudiences")),
    docVersion: v.number(),
    personalization: v.any(),
    status: v.optional(v.union(v.literal("ready"), v.literal("failed"))),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, contactId, audienceId, docVersion, personalization, status = "ready", error }) => {
    if (!(await ctx.db.get(campaignId))) throw new Error("Unknown campaign");
    if (!contactId === !audienceId) throw new Error("A version is for one group or one person");
    if (contactId && !(await ctx.db.get(contactId))) throw new Error("Unknown contact");
    if (audienceId && !(await ctx.db.get(audienceId))) throw new Error("Unknown audience");
    const p = (personalization ?? {}) as Record<string, unknown>;
    const clean: Personalization = {
      blocks: p.blocks && typeof p.blocks === "object" ? (p.blocks as Personalization["blocks"]) : {},
      ...(typeof p.subject === "string" && p.subject.trim() ? { subject: p.subject.trim() } : {}),
      ...(typeof p.preheader === "string" && p.preheader.trim() ? { preheader: p.preheader.trim() } : {}),
      ...(typeof p.why === "string" && p.why.trim() ? { why: p.why.trim() } : {}),
    };
    const now = Date.now();
    const existing = audienceId
      ? await ctx.db.query("emailVersions").withIndex("by_campaign_audience", (q) => q.eq("campaignId", campaignId).eq("audienceId", audienceId)).unique()
      : await ctx.db.query("emailVersions").withIndex("by_campaign_contact", (q) => q.eq("campaignId", campaignId).eq("contactId", contactId)).unique();
    const row = { docVersion, personalization: clean, status, error: status === "failed" ? (error ?? "Couldn't write this version") : undefined, updatedAt: now };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("emailVersions", { campaignId, ...(contactId ? { contactId } : { audienceId }), ...row, createdAt: now });
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
