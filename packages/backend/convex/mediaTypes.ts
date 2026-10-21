// Shared shapes for the Media service: the campaign kit and brief, the
// MediaDoc a poster or video renders from, format presets and cost tiers.
// Plain TypeScript (no Convex imports): apps/web, the HTTP routes and the
// backend read one definition. The agent (apps/agent/slice_media) mirrors it.

import type { EmailKit } from "./emailTypes";
import type { BrandColors, BrandFont, BrandKit } from "./pagesTypes";

/* Formats ------------------------------------------------------------------ */

export type FormatPreset = "story" | "portrait" | "square" | "landscape" | "banner" | "print";

export interface FormatSpec {
  label: string;
  hint: string;
  w: number;
  h: number;
  /** Aspect asked of image models. */
  imageAspect: "9:16" | "4:5" | "1:1" | "16:9" | "3:4";
  /** Video models make 9:16 or 16:9; other formats crop from it around the clip's focal point. */
  videoAspect: "9:16" | "16:9";
  /** Print has no video. */
  video: boolean;
}

export const FORMATS: Record<FormatPreset, FormatSpec> = {
  story: { label: "Story", hint: "Reels, TikTok, Shorts, Stories", w: 1080, h: 1920, imageAspect: "9:16", videoAspect: "9:16", video: true },
  portrait: { label: "Feed 4:5", hint: "Instagram and Facebook feed", w: 1080, h: 1350, imageAspect: "4:5", videoAspect: "9:16", video: true },
  square: { label: "Square", hint: "Feeds, marketplaces, carousels", w: 1080, h: 1080, imageAspect: "1:1", videoAspect: "9:16", video: true },
  landscape: { label: "Landscape", hint: "YouTube, web hero, TV", w: 1920, h: 1080, imageAspect: "16:9", videoAspect: "16:9", video: true },
  banner: { label: "Banner", hint: "Link previews and display ads", w: 1200, h: 628, imageAspect: "16:9", videoAspect: "16:9", video: true },
  print: { label: "Print A-size", hint: "In-store and street posters", w: 1240, h: 1754, imageAspect: "3:4", videoAspect: "9:16", video: false },
};

export const FORMAT_KEYS = Object.keys(FORMATS) as FormatPreset[];

export const isFormat = (x: unknown): x is FormatPreset => typeof x === "string" && x in FORMATS;

/** A creative's name as shown: the format shows beside it, so an older name's " · Story" suffix goes, and no dots separate words. */
export function creativeName(name: string) {
  const at = name.lastIndexOf(" · ");
  const tail = name.slice(at + 3).trim().toLowerCase().replace(/ (video|poster)$/, "");
  const base = at > 0 && Object.values(FORMATS).some((f) => f.label.toLowerCase() === tail) ? name.slice(0, at) : name;
  return base.replace(/\s*·\s*/g, ", ").trim();
}

/* Cost tiers ---------------------------------------------------------------
   Estimates in USD, list prices. The agent (slice_media/models.py) charges
   these per job; the console only shows them. */

export type Tier = "draft" | "smart" | "premium";

export interface TierSpec {
  label: string;
  blurb: string;
  image: { model: string; label: string; price: number };
  /** Price per second by shot role. "still" shots are an image animated for free. */
  video: { hero: { model: string; label: string; perSecond: number }; broll: { model: string; label: string; perSecond: number } };
  resolution: "720p" | "1080p";
}

export const TIERS: Record<Tier, TierSpec> = {
  draft: {
    label: "Draft",
    blurb: "Cheapest: Veo Lite and stills, for exploring ideas",
    image: { model: "gemini-nano-banana-2.1", label: "Nano Banana 2.1", price: 0.034 },
    video: {
      hero: { model: "veo-3.1-lite-generate-001", label: "Veo 3.1 Lite", perSecond: 0.05 },
      broll: { model: "veo-3.1-lite-generate-001", label: "Veo 3.1 Lite", perSecond: 0.05 },
    },
    resolution: "720p",
  },
  smart: {
    label: "Smart",
    blurb: "Mixed: Veo Fast for hero shots, Lite for b-roll, stills where motion adds nothing",
    image: { model: "gemini-nano-banana-2.1", label: "Nano Banana 2.1", price: 0.034 },
    video: {
      hero: { model: "veo-3.1-fast-generate-001", label: "Veo 3.1 Fast", perSecond: 0.08 },
      broll: { model: "veo-3.1-lite-generate-001", label: "Veo 3.1 Lite", perSecond: 0.05 },
    },
    resolution: "720p",
  },
  premium: {
    label: "Premium",
    blurb: "Best quality: Veo 3.1 at 1080p and Nano Banana Pro",
    image: { model: "gemini-3-pro-image", label: "Nano Banana Pro", price: 0.134 },
    video: {
      hero: { model: "veo-3.1-generate-001", label: "Veo 3.1", perSecond: 0.4 },
      broll: { model: "veo-3.1-fast-generate-001", label: "Veo 3.1 Fast", perSecond: 0.08 },
    },
    resolution: "1080p",
  },
};

export const isTier = (x: unknown): x is Tier => x === "draft" || x === "smart" || x === "premium";

/** Edits and extensions (Gemini Omni Flash), music (Lyria 3) and voice (Gemini TTS). */
export const EXTRAS = {
  edit: { label: "Omni Flash edit", perSecond: 0.1 },
  music: { label: "Lyria 3 Clip", price: 0.04 },
  voice: { label: "Gemini TTS", price: 0.01 },
};

/* Models -------------------------------------------------------------------
   What the prompt bar offers, newest and best first. The agent
   (slice_media/models.py) runs the same ids at the same list prices. */

export interface ImageModel {
  id: string;
  label: string;
  blurb: string;
  /** USD per image. */
  price: number;
}

export const IMAGE_MODELS: ImageModel[] = [
  { id: "gemini-3-pro-image", label: "Nano Banana Pro", blurb: "Sharpest detail, best text and product fidelity", price: 0.134 },
  { id: "gemini-nano-banana-2.1", label: "Nano Banana 2.1", blurb: "Newest. Fast and close to Pro", price: 0.034 },
];

export interface VideoModel {
  id: string;
  label: string;
  blurb: string;
  /** USD per second, silent and with generated sound. */
  perSecond: number;
  withSound: number;
  /** 1080p (always 8 s clips) or 720p. */
  hd: boolean;
}

export const VIDEO_MODELS: VideoModel[] = [
  { id: "veo-3.1-generate-001", label: "Veo 3.1", blurb: "Best motion and realism, 1080p", perSecond: 0.2, withSound: 0.4, hd: true },
  { id: "veo-3.1-fast-generate-001", label: "Veo 3.1 Fast", blurb: "Nearly as good, far cheaper", perSecond: 0.08, withSound: 0.1, hd: false },
  { id: "veo-3.1-lite-generate-001", label: "Veo 3.1 Lite", blurb: "Cheapest, for drafts and b-roll", perSecond: 0.03, withSound: 0.05, hd: false },
];

export interface MusicModel {
  id: string;
  label: string;
  blurb: string;
  price: number;
  /** Seconds it makes. */
  seconds: number;
}

export const MUSIC_MODELS: MusicModel[] = [
  { id: "lyria-3-pro-preview", label: "Lyria 3 Pro", blurb: "A full track, up to a few minutes", price: 0.08, seconds: 120 },
  { id: "lyria-3-clip-preview", label: "Lyria 3 Clip", blurb: "A 30-second cue for ads", price: 0.04, seconds: 30 },
];

export const DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1";
export const DEFAULT_VIDEO_MODEL = "veo-3.1-fast-generate-001";
export const DEFAULT_MUSIC_MODEL = "lyria-3-clip-preview";

export const imageModel = (id: string | undefined) => IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[1];
export const videoModel = (id: string | undefined) => VIDEO_MODELS.find((m) => m.id === id) ?? VIDEO_MODELS[1];
export const musicModel = (id: string | undefined) => MUSIC_MODELS.find((m) => m.id === id) ?? MUSIC_MODELS[1];

/** Veo makes 4, 6 or 8 second clips; 1080p always makes 8. */
export const veoSeconds = (s: number, hd: boolean) => (hd ? 8 : s <= 4.5 ? 4 : s <= 6.5 ? 6 : 8);

/** Every model id the console shows, with a short name (jobs, assets, the spend panel). */
export function modelLabel(id: string | undefined): string {
  if (!id) return "";
  const known = [...IMAGE_MODELS, ...VIDEO_MODELS, ...MUSIC_MODELS].find((m) => m.id === id);
  if (known) return known.label;
  if (id === "gemini-3.1-flash-image") return "Nano Banana 2";
  if (id === "gemini-3.1-flash-lite-image") return "Nano Banana Lite";
  if (/omni/i.test(id)) return "Omni Flash";
  if (/tts/i.test(id)) return "Gemini TTS";
  return id;
}

/* What the prompt bar makes ------------------------------------------------- */

/** "auto": the agent decides from the words. */
/** What the canvas prompt bar makes. Moving pictures, music and voice all come as a video ad. */
export type MediaOutput = "auto" | "image" | "poster" | "video";

export const OUTPUTS: Record<MediaOutput, { label: string; hint: string }> = {
  auto: { label: "Auto", hint: "Slice picks from what you ask" },
  image: { label: "Image", hint: "A photograph or illustration" },
  poster: { label: "Poster", hint: "A designed ad with your logo, copy and button" },
  video: { label: "Video ad", hint: "Any video, from one shot to an edited ad, with music and voice" },
};

export type Aspect = "9:16" | "4:5" | "1:1" | "16:9";

/** Video models make 9:16 and 16:9 only; the other aspects are for images and posters. */
export const ASPECTS: { value: Aspect; label: string; format: FormatPreset; video: boolean }[] = [
  { value: "9:16", label: "Story", format: "story", video: true },
  { value: "4:5", label: "Feed", format: "portrait", video: false },
  { value: "1:1", label: "Square", format: "square", video: false },
  { value: "16:9", label: "Wide", format: "landscape", video: true },
];

/* The board ----------------------------------------------------------------
   Every creative, generated image, clip and track sits on the campaign's
   infinite canvas at a position in board units (1 unit = 1 px at 100%). */

export interface BoardPos {
  x: number;
  y: number;
  /** Width on the board; the height follows the content's shape. */
  w: number;
}

/** A node's width on the board for content of this shape: tall things narrower, so rows read evenly. */
export function boardWidth(w: number, h: number): number {
  const r = w / Math.max(1, h);
  return r < 0.7 ? 300 : r < 0.9 ? 340 : r < 1.2 ? 380 : 520;
}

export const AUDIO_NODE = { w: 360, h: 128 };

/** A spot held on the canvas while the agent works on a poster ("design"), a video ad ("design-video") or, in a toolbar maker's spot, an image ("design-image"); what it makes takes the spot. */
export const isDesignJob = (kind: string) => kind === "design" || kind === "design-video" || kind === "design-image";
export const BOARD_GAP = 72;

export const aspectSize = (aspect: string | undefined): { w: number; h: number } => {
  const [a, b] = String(aspect ?? "1:1").split(":").map(Number);
  return a > 0 && b > 0 ? { w: a, h: b } : { w: 1, h: 1 };
};

/* Brands -------------------------------------------------------------------- */

export interface MediaAbout {
  /** What the business is and sells, one paragraph. */
  summary: string;
  /** Who it sells to. */
  audience?: string;
  categories?: string[];
  location?: string;
}

/* Campaign ----------------------------------------------------------------- */

export interface MediaKit {
  name: string;
  logo?: { src: string; alt: string; onDark?: boolean };
  wordmark?: string;
  colors: BrandColors;
  fonts: { heading: BrandFont; body: BrandFont };
  voice?: { summary: string; do: string[]; avoid: string[] };
  /** How the brand's pictures look, and what they never show. */
  imagery?: { style: string; treatment: string; avoid?: string[] };
  url?: string;
  uppercaseLabels?: boolean;
  buttonStyle?: "pill" | "rounded" | "square";
}

export interface MediaBrief {
  /** What the campaign is for: "launch the linen collection". */
  goal: string;
  offer?: string;
  cta?: string;
  /** Where the QR codes and links go. */
  link?: string;
  notes?: string;
  /** Target video length in seconds. */
  duration?: number;
  music?: boolean;
  voiceover?: boolean;
  /** People on camera: "auto" (the agent decides), "none", "using" (people using the product), "talking" (a presenter speaks to camera). */
  people?: PeopleMode;
}

export type PeopleMode = "auto" | "none" | "using" | "talking";

export interface MediaProduct {
  id: string;
  name: string;
  image?: string;
  price?: string;
  url?: string;
  description?: string;
}

export interface MediaAudience {
  /** Stable within the campaign; creatives point here. */
  id: string;
  name: string;
  kind: "everyone" | "pages" | "email" | "seed";
  pagesAudienceId?: string;
  /** An Email taste group of the brand's linked Email brand, read live like a Pages audience. */
  emailAudienceId?: string;
  /** Taste seeds the agent resolves through Qloo when there is no Pages audience. */
  seed?: { city?: string; interests: string[]; age?: string };
  summary?: string;
}

export interface MediaConcept {
  audienceKey: string;
  title: string;
  hook: string;
  visual: string;
  /** Cultural reasons, each citing Qloo evidence. */
  why: { text: string; evidence: string }[];
}

export const DEFAULT_COLORS: BrandColors = {
  background: "#f6f4ef",
  foreground: "#1b1a17",
  primary: "#1b1a17",
  primaryForeground: "#ffffff",
  accent: "#c8553d",
  muted: "#6d6a63",
  surface: "#ffffff",
};

export const DEFAULT_KIT = (name: string): MediaKit => ({
  name,
  colors: DEFAULT_COLORS,
  fonts: {
    heading: { family: "Fraunces", source: "google", weights: [500, 700], fallback: "Georgia, serif" },
    body: { family: "Inter", source: "google", weights: [400, 600], fallback: "system-ui, sans-serif" },
  },
});

/* Document ----------------------------------------------------------------- */

export type Anim = "none" | "fade" | "rise" | "pop" | "slide" | "wipe";
export type KenBurns = "none" | "in" | "out" | "left" | "right";

interface LayerBase {
  id: string;
  name?: string;
  /** Pixels in the format's frame. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
  /** Video only: seconds on the timeline. Unset: the whole video. */
  start?: number;
  end?: number;
  anim?: Anim;
}

export interface ImageLayer extends LayerBase {
  type: "image";
  src: string;
  assetId?: string;
  fit?: "cover" | "contain";
  /** 0..1 point kept in view when cropping. */
  focal?: { x: number; y: number };
  radius?: number;
  kenburns?: KenBurns;
  shadow?: boolean;
  role?: "background" | "product" | "photo";
}

export interface TextLayer extends LayerBase {
  type: "text";
  text: string;
  role?: "headline" | "subhead" | "body" | "cta" | "caption" | "price" | "label";
  font?: "heading" | "body";
  size: number;
  weight?: number;
  color: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  tracking?: number;
  uppercase?: boolean;
  italic?: boolean;
  /** A pill or box behind the text (CTAs, captions). */
  bg?: string;
  padX?: number;
  padY?: number;
  radius?: number;
  shadow?: boolean;
}

export interface LogoLayer extends LayerBase {
  type: "logo";
  src?: string;
  /** Wordmark when there is no logo image. */
  text?: string;
  color?: string;
}

export interface ShapeLayer extends LayerBase {
  type: "shape";
  /** A colour or a CSS linear/radial gradient. */
  fill: string;
  radius?: number;
}

export interface QrLayer extends LayerBase {
  type: "qr";
  url: string;
  color?: string;
  bg?: string;
}

export type Layer = ImageLayer | TextLayer | LogoLayer | ShapeLayer | QrLayer;
export type LayerType = Layer["type"];

/** "talent": a person on camera (using the product, or speaking a line with lip-synced sound). */
export type ShotRole = "hero" | "product" | "broll" | "still" | "talent";

/** A shot on the video track. Its timeline start is the sum of the shots before it. */
export interface Clip {
  id: string;
  /** "motion": a generated or uploaded video. "still": an image with a Ken Burns move. */
  kind: "motion" | "still";
  src?: string;
  assetId?: string;
  /** Still frame: the image of a still shot, or a motion shot's first frame. */
  poster?: string;
  /** Trim in the source, seconds. A still uses in 0, out = its length. */
  in: number;
  out: number;
  transition?: "cut" | "fade";
  prompt?: string;
  role?: ShotRole;
  /** What the person on camera says (Veo speaks it with the shot's own sound). */
  says?: string;
  model?: string;
  status: "pending" | "ready" | "failed";
  jobId?: string;
  error?: string;
  focal?: { x: number; y: number };
  kenburns?: KenBurns;
  muted?: boolean;
  volume?: number;
}

export interface AudioClip {
  id: string;
  kind: "music" | "voice";
  src?: string;
  assetId?: string;
  /** Timeline start, seconds. */
  start: number;
  /** Length used, seconds. */
  duration: number;
  volume: number;
  prompt?: string;
  /** Voiceover script. */
  text?: string;
  status: "pending" | "ready" | "failed";
  jobId?: string;
  error?: string;
}

export interface MediaDoc {
  kind: "poster" | "video";
  format: FormatPreset;
  w: number;
  h: number;
  background: string;
  layers: Layer[];
  video?: Clip[];
  audio?: AudioClip[];
}

/* Helpers ------------------------------------------------------------------ */

export const clipLength = (c: Pick<Clip, "in" | "out">) => Math.max(0, c.out - c.in);

/** Each clip with its start on the timeline. */
export function timeline(doc: Pick<MediaDoc, "video">): { clip: Clip; start: number; end: number }[] {
  let t = 0;
  return (doc.video ?? []).map((clip) => {
    const start = t;
    t += clipLength(clip);
    return { clip, start, end: t };
  });
}

export function docDuration(doc: Pick<MediaDoc, "kind" | "video">): number {
  if (doc.kind !== "video") return 0;
  return (doc.video ?? []).reduce((s, c) => s + clipLength(c), 0);
}

export const layerVisibleAt = (l: Layer, t: number, duration: number) => !l.hidden && t >= (l.start ?? 0) && t < (l.end ?? duration + 0.001);

export const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/* Validation ----------------------------------------------------------------
   Docs come from the agent and the console; both pass through here before
   they are stored, so the renderer can trust colours and URLs. */

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|hsla?\(\s*[\d.\s,%deg]+\)|transparent|white|black)$/i;
const GRADIENT = /^(linear|radial)-gradient\((?:[^;{}()]|\([\d.\s,%deg]+\))*\)$/i;

export const safeColor = (x: unknown, fallback: string) => (typeof x === "string" && COLOR.test(x.trim()) ? x.trim() : fallback);
export const safeFill = (x: unknown, fallback: string) =>
  typeof x === "string" && (COLOR.test(x.trim()) || (GRADIENT.test(x.trim()) && !/url\s*\(/i.test(x))) ? x.trim() : fallback;
export const safeUrl = (x: unknown): string | undefined => (typeof x === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(x) && x.length < 4000 ? x : undefined);

const num = (x: unknown, fallback: number, min = -1e5, max = 1e5) => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (x: unknown, max = 2000) => (typeof x === "string" ? x.slice(0, max) : "");
const opt = <T>(x: T | undefined | null | "") => (x === undefined || x === null || x === "" ? undefined : x);
const oneOf = <T extends string>(x: unknown, values: readonly T[]): T | undefined => (values.includes(x as T) ? (x as T) : undefined);
const point = (x: unknown) => {
  const p = (x ?? {}) as { x?: unknown; y?: unknown };
  return p && typeof p === "object" && p.x !== undefined ? { x: num(p.x, 0.5, 0, 1), y: num(p.y, 0.5, 0, 1) } : undefined;
};
const strip = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

const ANIMS = ["none", "fade", "rise", "pop", "slide", "wipe"] as const;
const BURNS = ["none", "in", "out", "left", "right"] as const;

function cleanLayer(raw: unknown, i: number): Layer | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const base = strip({
    id: str(r.id, 60) || `l_${i}`,
    name: opt(str(r.name, 80)),
    x: num(r.x, 0),
    y: num(r.y, 0),
    w: num(r.w, 100, 1),
    h: num(r.h, 100, 1),
    rotation: r.rotation === undefined ? undefined : num(r.rotation, 0, -360, 360),
    opacity: r.opacity === undefined ? undefined : num(r.opacity, 1, 0, 1),
    locked: r.locked === true ? true : undefined,
    hidden: r.hidden === true ? true : undefined,
    start: r.start === undefined || r.start === null ? undefined : num(r.start, 0, 0, 600),
    end: r.end === undefined || r.end === null ? undefined : num(r.end, 0, 0, 600),
    anim: oneOf(r.anim, ANIMS),
  });
  switch (r.type) {
    case "image": {
      const src = safeUrl(r.src);
      if (!src) return null;
      return strip({
        ...base,
        type: "image" as const,
        src,
        assetId: opt(str(r.assetId, 60)),
        fit: oneOf(r.fit, ["cover", "contain"] as const),
        focal: point(r.focal),
        radius: r.radius === undefined ? undefined : num(r.radius, 0, 0, 2000),
        kenburns: oneOf(r.kenburns, BURNS),
        shadow: r.shadow === true ? true : undefined,
        role: oneOf(r.role, ["background", "product", "photo"] as const),
      });
    }
    case "text":
      return strip({
        ...base,
        type: "text" as const,
        text: str(r.text, 600),
        role: oneOf(r.role, ["headline", "subhead", "body", "cta", "caption", "price", "label"] as const),
        font: oneOf(r.font, ["heading", "body"] as const),
        size: num(r.size, 48, 6, 600),
        weight: r.weight === undefined ? undefined : num(r.weight, 400, 100, 900),
        color: safeColor(r.color, "#111111"),
        align: oneOf(r.align, ["left", "center", "right"] as const),
        valign: oneOf(r.valign, ["top", "middle", "bottom"] as const),
        lineHeight: r.lineHeight === undefined ? undefined : num(r.lineHeight, 1.1, 0.6, 3),
        tracking: r.tracking === undefined ? undefined : num(r.tracking, 0, -0.2, 1),
        uppercase: r.uppercase === true ? true : undefined,
        italic: r.italic === true ? true : undefined,
        bg: r.bg === undefined ? undefined : safeFill(r.bg, "transparent"),
        padX: r.padX === undefined ? undefined : num(r.padX, 0, 0, 400),
        padY: r.padY === undefined ? undefined : num(r.padY, 0, 0, 400),
        radius: r.radius === undefined ? undefined : num(r.radius, 0, 0, 2000),
        shadow: r.shadow === true ? true : undefined,
      });
    case "logo":
      return strip({ ...base, type: "logo" as const, src: safeUrl(r.src), text: opt(str(r.text, 80)), color: r.color === undefined ? undefined : safeColor(r.color, "#111111") });
    case "shape":
      return strip({ ...base, type: "shape" as const, fill: safeFill(r.fill, "#000000"), radius: r.radius === undefined ? undefined : num(r.radius, 0, 0, 2000) });
    case "qr": {
      const url = safeUrl(r.url);
      if (!url) return null;
      return strip({ ...base, type: "qr" as const, url, color: r.color === undefined ? undefined : safeColor(r.color, "#000000"), bg: r.bg === undefined ? undefined : safeColor(r.bg, "#ffffff") });
    }
    default:
      return null;
  }
}

function cleanClip(raw: unknown, i: number): Clip | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = oneOf(r.kind, ["motion", "still"] as const) ?? "motion";
  const inn = num(r.in, 0, 0, 600);
  return strip({
    id: str(r.id, 60) || `c_${i}`,
    kind,
    src: safeUrl(r.src),
    assetId: opt(str(r.assetId, 60)),
    poster: safeUrl(r.poster),
    in: inn,
    out: Math.max(inn + 0.2, num(r.out, inn + 4, 0, 600)),
    transition: oneOf(r.transition, ["cut", "fade"] as const),
    prompt: opt(str(r.prompt, 2000)),
    role: oneOf(r.role, ["hero", "product", "broll", "still", "talent"] as const),
    says: opt(str(r.says, 400)),
    model: opt(str(r.model, 80)),
    status: oneOf(r.status, ["pending", "ready", "failed"] as const) ?? (safeUrl(r.src) || safeUrl(r.poster) ? "ready" : "pending"),
    jobId: opt(str(r.jobId, 60)),
    error: opt(str(r.error, 500)),
    focal: point(r.focal),
    kenburns: oneOf(r.kenburns, BURNS),
    muted: r.muted === true ? true : undefined,
    volume: r.volume === undefined ? undefined : num(r.volume, 1, 0, 2),
  });
}

function cleanAudio(raw: unknown, i: number): AudioClip | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = oneOf(r.kind, ["music", "voice"] as const);
  if (!kind) return null;
  return strip({
    id: str(r.id, 60) || `a_${i}`,
    kind,
    src: safeUrl(r.src),
    assetId: opt(str(r.assetId, 60)),
    start: num(r.start, 0, 0, 600),
    duration: num(r.duration, 10, 0.2, 600),
    volume: num(r.volume, kind === "music" ? 0.5 : 1, 0, 2),
    prompt: opt(str(r.prompt, 2000)),
    text: opt(str(r.text, 4000)),
    status: oneOf(r.status, ["pending", "ready", "failed"] as const) ?? (safeUrl(r.src) ? "ready" : "pending"),
    jobId: opt(str(r.jobId, 60)),
    error: opt(str(r.error, 500)),
  });
}

/** A doc safe to store and render; throws "Invalid doc" when it can't be read at all. */
export function cleanDoc(raw: unknown): MediaDoc {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!r || typeof r !== "object" || !Array.isArray(r.layers)) throw new Error("Invalid doc: expected { kind, format, layers }");
  const format: FormatPreset = isFormat(r.format) ? r.format : "story";
  const spec = FORMATS[format];
  const kind = r.kind === "video" && spec.video ? "video" : "poster";
  const ids = new Set<string>();
  const unique = <T extends { id: string }>(x: T | null): x is T => {
    if (!x || ids.has(x.id)) return false;
    ids.add(x.id);
    return true;
  };
  const doc: MediaDoc = {
    kind,
    format,
    w: spec.w,
    h: spec.h,
    background: safeFill(r.background, "#111111"),
    layers: r.layers.slice(0, 60).map(cleanLayer).filter(unique),
  };
  if (kind === "video") {
    doc.video = (Array.isArray(r.video) ? r.video : []).slice(0, 40).map(cleanClip).filter(unique);
    doc.audio = (Array.isArray(r.audio) ? r.audio : []).slice(0, 8).map(cleanAudio).filter(unique);
  }
  if (JSON.stringify(doc).length > 400_000) throw new Error("Invalid doc: too large");
  return doc;
}

/* Resize ------------------------------------------------------------------- */

/** The same creative in another format: full-bleed layers stay full-bleed, the rest keep their place relative to the frame. */
export function resizeDoc(doc: MediaDoc, to: FormatPreset): MediaDoc {
  const spec = FORMATS[to];
  const sx = spec.w / doc.w;
  const sy = spec.h / doc.h;
  const s = Math.min(sx, sy);
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(4, b * 0.02);
  const layers = doc.layers.map((l): Layer => {
    const fullBleed = near(l.x, 0) && near(l.y, 0) && near(l.w, doc.w) && near(l.h, doc.h);
    if (fullBleed) return { ...l, x: 0, y: 0, w: spec.w, h: spec.h };
    const cx = (l.x + l.w / 2) * sx;
    const cy = (l.y + l.h / 2) * sy;
    // Text and bars may use the extra width; pictures keep their shape.
    const stretch = l.type === "text" || l.type === "shape";
    const w = Math.min(spec.w, stretch ? Math.max(l.w * s, Math.min(l.w * sx, spec.w * 0.92)) : l.w * s);
    const h = stretch && l.type === "shape" ? l.h * sy : l.h * s;
    const x = Math.min(Math.max(0, cx - w / 2), spec.w - w);
    const y = Math.min(Math.max(0, cy - h / 2), spec.h - h);
    const next = { ...l, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    if (l.type === "text") return { ...next, size: Math.round(l.size * s), ...(l.padX ? { padX: Math.round(l.padX * s) } : {}), ...(l.padY ? { padY: Math.round(l.padY * s) } : {}) } as TextLayer;
    return next as Layer;
  });
  const kind = doc.kind === "video" && spec.video ? "video" : "poster";
  return {
    ...doc,
    kind,
    format: to,
    w: spec.w,
    h: spec.h,
    layers,
    ...(kind === "video" ? {} : { video: undefined, audio: undefined }),
  };
}

/** Google Fonts stylesheets for the kit's families: one plain (always resolves) and one with the kit's weights. */
export function fontsHrefs(kit: Pick<MediaKit, "fonts"> | undefined): string[] {
  if (!kit?.fonts) return [];
  const fams = [kit.fonts.heading, kit.fonts.body].filter((f) => f?.source === "google" && f.family);
  const uniq = [...new Map(fams.map((f) => [f.family, f])).values()];
  return uniq.flatMap((f) => {
    const fam = encodeURIComponent(f.family).replace(/%20/g, "+");
    const weights = [...new Set(f.weights ?? [])].filter((w) => w >= 100 && w <= 900).sort((a, b) => a - b);
    const base = `https://fonts.googleapis.com/css2?family=${fam}&display=block`;
    return weights.length ? [base, `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(";")}&display=block`] : [base];
  });
}

export const fontStack = (f: BrandFont | undefined, fallback = "system-ui, sans-serif") => (f?.family ? `"${f.family.replace(/["\\]/g, "")}", ${f.fallback || fallback}` : fallback);

/* Kits from the other services ------------------------------------------------
   A Media brand can start from a Pages or an Email brand: its kit is copied
   once and edited here, never written back. */

export function kitFromPages(name: string, url: string | undefined, kit: BrandKit | undefined): MediaKit {
  if (!kit) return { ...DEFAULT_KIT(name), ...(url ? { url } : {}) };
  return strip({
    name,
    url,
    logo: kit.logo,
    wordmark: kit.wordmark,
    colors: kit.colors,
    fonts: kit.fonts,
    voice: kit.voice,
    imagery: kit.imagery,
    uppercaseLabels: kit.uppercaseLabels,
    buttonStyle: kit.buttonStyle,
  });
}

export function kitFromEmail(name: string, url: string | undefined, kit: EmailKit | undefined): MediaKit {
  if (!kit) return { ...DEFAULT_KIT(name), ...(url ? { url } : {}) };
  const font = (f: EmailKit["fonts"]["heading"]): BrandFont => ({ family: f.family, source: f.google ? "google" : "system", ...(f.weights ? { weights: f.weights } : {}), fallback: f.fallback });
  return strip({
    name,
    url,
    logo: kit.logo ? strip({ src: kit.logo.src, alt: kit.logo.alt, onDark: kit.logo.onDark }) : undefined,
    wordmark: kit.wordmark,
    colors: kit.colors,
    fonts: { heading: font(kit.fonts.heading), body: font(kit.fonts.body) },
    voice: kit.voice,
    uppercaseLabels: kit.uppercaseLabels,
    buttonStyle: kit.buttonStyle,
  });
}

