// Words for the Email states, shared by every screen that shows them. Status
// is always text (with an icon where it helps), never a coloured dot.

import type { CampaignStatus, DomainStatus, SendingMode, SocialNetwork } from "@slice/backend/convex/emailTypes";

export type Tone = "ok" | "warn" | "bad" | "neutral" | "outline";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "outline" },
  scheduled: { label: "Scheduled", tone: "neutral" },
  sending: { label: "Sending", tone: "warn" },
  sent: { label: "Sent", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};

export const DOMAIN_STATUS: Record<DomainStatus, { label: string; tone: Tone; hint: string }> = {
  not_started: { label: "Not verified", tone: "outline", hint: "Add the records below at your DNS provider, then verify." },
  pending: { label: "Checking", tone: "warn", hint: "Resend is looking for the records. DNS changes can take a few minutes, sometimes hours." },
  verified: { label: "Verified", tone: "ok", hint: "Campaigns go out from this domain." },
  failed: { label: "Failed", tone: "bad", hint: "Resend could not find every record. Check the values, then verify again." },
  temporary_failure: { label: "Retrying", tone: "warn", hint: "Resend could not reach your DNS just now and will try again." },
};

/** A single DNS record's status, as Resend reports it ("verified", "pending", "not_started", "failed"). */
export function recordStatus(status: string): { label: string; tone: Tone } {
  const s = DOMAIN_STATUS[status as DomainStatus];
  return s ? { label: s.label, tone: s.tone } : { label: status || "Unknown", tone: "outline" };
}

export const SENDING_MODE: Record<SendingMode, { label: string; summary: string }> = {
  domain: { label: "Your domain", summary: "Campaigns go to real inboxes from your own verified domain." },
  shared: { label: "Slice's shared domain", summary: "Campaigns go to real inboxes from Slice's sending domain, under your brand's name." },
  demo: { label: "Simulated", summary: "A demo brand: nothing leaves Slice. Deliveries, opens and clicks are simulated so the reports move." },
  none: { label: "Test emails only", summary: "Until a domain is verified, only test emails to your own address go out." },
};

export const SOCIAL_LABEL: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  threads: "Threads",
  website: "Website",
};

export const ITEM_KINDS = [
  { value: "book", label: "Book" },
  { value: "product", label: "Product" },
  { value: "event", label: "Event" },
  { value: "offer", label: "Offer" },
  { value: "service", label: "Service" },
] as const;

/** Resend's missing key, as the backend words it, reads better as a setup note than as an error. */
export function isResendMissing(message: string | null | undefined) {
  return !!message && /resend.*(configured|api key|RESEND_API_KEY)|RESEND_API_KEY/i.test(message);
}

/** Convex wraps thrown errors ("[CONVEX A(...)] Uncaught Error: ..."); keep the readable part. */
export function errorText(err: unknown): string {
  const raw = String((err as Error)?.message ?? err);
  const m = raw.match(/Uncaught (?:Convex)?Error:\s*([\s\S]*?)(?:\n\s+at |\n\s*Called by|$)/);
  return (m?.[1] ?? raw).trim();
}

export function relativeTime(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86_400 * 14) return `${Math.round(s / 86_400)} d ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
