// Console-side aliases for the Email shapes. The documents come from Convex
// as `Doc<"email*">` with `v.any()` fields; these helpers narrow them to the
// contract in emailTypes.ts.

import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import type {
  AudienceProfile,
  CampaignStats,
  EmailAbout,
  EmailDoc,
  EmailDomain,
  EmailFooterInfo,
  EmailItem,
  EmailKit,
  EmailSender,
} from "@slice/backend/convex/emailTypes";

export type EmailBrand = Doc<"emailBrands">;
export type EmailItemRow = Doc<"emailItems">;
export type EmailCampaign = Doc<"emailCampaigns">;
export type EmailAudience = Doc<"emailAudiences">;
export type EmailBrandId = Id<"emailBrands">;

/** A row from emailCampaigns.list: the campaign with its audience's name and kind. */
export type CampaignRow = EmailCampaign & { audienceName?: string; audienceKind?: "group" | "people" };

export const audienceNameOf = (c: CampaignRow) => c.audienceName;

/** When the campaign last mattered: sent, scheduled, else last edited. */
export const campaignAt = (c: EmailCampaign) => c.sentAt ?? c.scheduledAt ?? c.updatedAt;

/** A row from emailAudiences.list: the audience with its list's name and how many members opted out. */
export type AudienceRow = EmailAudience & { listName?: string; unsubscribed?: number };

/** Anything with a name and the brand's look: a stored brand, or the setup draft being edited. */
export interface BrandLike {
  name: string;
  kit?: EmailKit | null;
  footer?: EmailFooterInfo | null;
}

export const kitOf = (b: EmailBrand | null | undefined) => (b?.kit ?? null) as EmailKit | null;
export const aboutOf = (b: EmailBrand | null | undefined) => (b?.about ?? null) as EmailAbout | null;
export const footerOf = (b: EmailBrand | null | undefined) => (b?.footer ?? null) as EmailFooterInfo | null;
export const senderOf = (b: EmailBrand | null | undefined) => (b?.sender ?? null) as EmailSender | null;
export const domainOf = (b: EmailBrand | null | undefined) => (b?.domain ?? null) as EmailDomain | null;
export const docOf = (c: EmailCampaign | null | undefined) => (c?.doc ?? null) as EmailDoc | null;
export const statsOf = (c: { stats?: unknown } | null | undefined) => (c?.stats ?? null) as CampaignStats | null;
export const profileOf = (a: { profile?: unknown } | null | undefined) => (a?.profile ?? null) as AudienceProfile | null;

/** An emailItems row as the renderer reads it. */
export function itemOf(row: EmailItemRow): EmailItem {
  return {
    id: row._id,
    name: row.name,
    subtitle: row.subtitle,
    kind: row.kind,
    description: row.description,
    price: row.price,
    image: row.image,
    url: row.url,
    tags: row.tags,
    qloo: row.qloo,
  };
}

/** Opened and clicked against what arrived (sent when delivery is not reported yet). */
export function rates(stats: CampaignStats | null | undefined) {
  const base = stats ? stats.delivered || stats.sent : 0;
  return {
    base,
    open: base ? (stats!.opened / base) : null,
    click: base ? (stats!.clicked / base) : null,
  };
}

/** Totals across campaigns, for headline stats. */
export function sumStats(list: (CampaignStats | null | undefined)[]): CampaignStats {
  const out: CampaignStats = { recipients: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0, failed: 0 };
  for (const s of list) {
    if (!s) continue;
    for (const k of Object.keys(out) as (keyof CampaignStats)[]) out[k] += s[k] ?? 0;
  }
  return out;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "brand";
