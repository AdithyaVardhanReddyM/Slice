// Console-side aliases for the Pages shapes. The documents come from Convex
// as `Doc<"pages*">` with `v.any()` fields; these helpers narrow them.

import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import type {
  AudienceBrief,
  AudienceProfile,
  BrandBrief,
  BrandKit,
  QuizConfig,
  RoutingRules,
  VariantDoc,
} from "@slice/backend/convex/pagesTypes";
export { isHtmlDoc } from "@slice/backend/convex/pagesTypes";

export type {
  AudienceBrief,
  AudienceProfile,
  BrandBrief,
  BrandKit,
  BrandItem,
  HtmlDoc,
  ImageRef,
  PageDoc,
  ProfileBrand,
  ProfileEntity,
  ProfileTag,
  QuizConfig,
  RoutingRules,
  Section,
  VariantDoc,
} from "@slice/backend/convex/pagesTypes";

/** A trace step as the backend stores it (`spanValidator`). */
export interface Span {
  kind: string;
  name: string;
  started?: number;
  path?: string;
  params?: Record<string, string>;
  cache?: string;
  ms: number;
  result: string;
}

export type Brand = Doc<"pagesBrands">;
export type Audience = Doc<"pagesAudiences">;
export type Upload = Doc<"pagesUploads">;
export type Member = Doc<"pagesMembers">;
export type Page = Doc<"pages">;
export type Variant = Doc<"pagesVariants">;
export type Build = Doc<"pagesBuilds">;
export type FormRow = Doc<"pagesForms">;
export type EventRow = Doc<"pagesEvents">;

export const kitOf = (b: Brand | null | undefined) => (b?.kit ?? null) as BrandKit | null;
export const briefOf = (b: Brand | null | undefined) => (b?.brief ?? null) as BrandBrief | null;
export const profileOf = (a: Audience | null | undefined) => (a?.profile ?? null) as AudienceProfile | null;
export const audienceBriefOf = (a: Audience | null | undefined) => (a?.brief ?? null) as AudienceBrief | null;
export const docOf = (v: Variant | null | undefined) => (v?.doc ?? null) as VariantDoc | null;
export const routingOf = (p: Page | null | undefined) => (p?.routing ?? null) as RoutingRules | null;
export const quizOf = (p: Page | null | undefined) => (p?.quiz ?? null) as QuizConfig | null;

export const AUDIENCE_KIND_LABEL: Record<string, string> = {
  default: "Everyone",
  location: "Location",
  demographic: "Demographic",
  interests: "Interests",
  csv: "Customer cluster",
  lead: "Personal",
};

export const GOALS: { value: string; label: string }[] = [
  { value: "launch", label: "Launch" },
  { value: "sale", label: "Sale or offer" },
  { value: "subscription", label: "Subscription" },
  { value: "waitlist", label: "Waitlist" },
  { value: "booking", label: "Booking" },
  { value: "other", label: "Other" },
];

export const IMAGE_MODES: { value: string; label: string; hint: string }[] = [
  { value: "pexels", label: "Pexels", hint: "Stock photography matched to the brief" },
  { value: "nano-banana-2", label: "Nano Banana 2", hint: "Generated hero image, fast" },
  { value: "nano-banana-pro", label: "Nano Banana Pro", hint: "Generated hero image, highest quality" },
];

export const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "Under 25",
  "25_to_29": "25 to 29",
  "30_to_34": "30 to 34",
  "35_to_44": "35 to 44",
  "45_to_54": "45 to 54",
  "55_and_older": "55 and older",
};

export const TAG_GROUPS: [string, string][] = [
  ["personal_style", "Personal style"],
  ["lifestyle", "Lifestyle"],
  ["emotional_tone", "Mood"],
  ["core_values", "Values"],
  ["style", "Cultural style"],
  ["aesthetic", "Aesthetic"],
  ["audience", "Audience"],
  ["customer_identity", "Customer identity"],
  ["keyword", "Themes"],
  ["genre", "Genre"],
];

/** "urn:tag:personal_style:qloo" → "personal_style". */
export const tagGroup = (type: string) => type.split(":")[2] ?? "tag";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "page";
