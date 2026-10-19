"use client";

// Creating and editing a Media brand: the guidelines every generation follows.
// A brand starts from its website (the agent reads logo, colours, fonts,
// voice, photography, products and photos in about half a minute), from a
// Pages or Email brand, or from scratch. Every field stays editable, with a
// live poster in the kit beside the form.

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Globe, ImagePlus, LayoutTemplate, Loader2, PenLine, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import type { EmailKit } from "@slice/backend/convex/emailTypes";
import { DEFAULT_COLORS, FORMATS, type MediaAbout, type MediaDoc, type MediaKit, type MediaProduct } from "@slice/backend/convex/mediaTypes";
import type { BrandColors } from "@slice/backend/convex/pagesTypes";
import { postJson } from "@/lib/pages/stream";
import { useMediaUpload } from "@/lib/media/upload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/console/form";
import { TokenInput } from "@/components/console/setup/atoms";
import { KitFonts, ScaledStage } from "../stage";

const FONTS = ["Inter", "DM Sans", "Manrope", "Poppins", "Space Grotesk", "Work Sans", "Syne", "Archivo Black", "Bebas Neue", "Fraunces", "Playfair Display", "Cormorant Garamond", "Libre Baskerville", "DM Serif Display"];
const SERIF = new Set(["Fraunces", "Playfair Display", "Cormorant Garamond", "Libre Baskerville", "DM Serif Display"]);

interface Draft {
  name: string;
  url: string;
  summary: string;
  audience: string;
  logo?: { src: string; alt: string; onDark?: boolean };
  colors: BrandColors;
  heading: string;
  body: string;
  voiceSummary: string;
  voiceDo: string[];
  voiceAvoid: string[];
  imageryStyle: string;
  imageryTreatment: string;
  imageryAvoid: string[];
  products: MediaProduct[];
  images: string[];
}

const blank = (): Draft => ({
  name: "",
  url: "",
  summary: "",
  audience: "",
  colors: { ...DEFAULT_COLORS },
  heading: "Fraunces",
  body: "Inter",
  voiceSummary: "",
  voiceDo: [],
  voiceAvoid: [],
  imageryStyle: "",
  imageryTreatment: "",
  imageryAvoid: [],
  products: [],
  images: [],
});

function fromBrand(b: Doc<"mediaBrands">): Draft {
  const kit = b.kit as MediaKit;
  const about = (b.about ?? {}) as Partial<MediaAbout>;
  return {
    name: b.name,
    url: b.url ?? "",
    summary: about.summary ?? "",
    audience: about.audience ?? "",
    logo: kit.logo,
    colors: { ...DEFAULT_COLORS, ...kit.colors },
    heading: kit.fonts?.heading?.family ?? "Fraunces",
    body: kit.fonts?.body?.family ?? "Inter",
    voiceSummary: kit.voice?.summary ?? "",
    voiceDo: kit.voice?.do ?? [],
    voiceAvoid: kit.voice?.avoid ?? [],
    imageryStyle: kit.imagery?.style ?? "",
    imageryTreatment: kit.imagery?.treatment ?? "",
    imageryAvoid: kit.imagery?.avoid ?? [],
    products: b.products as MediaProduct[],
    images: b.images,
  };
}

const font = (family: string, prev?: MediaKit["fonts"]["heading"]) =>
  prev && prev.family === family ? prev : { family, source: "google" as const, weights: [400, 600, 700], fallback: SERIF.has(family) ? "Georgia, serif" : "system-ui, sans-serif" };

/** Without undefined fields (Convex stores plain JSON). */
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function kitOf(d: Draft, base?: MediaKit): MediaKit {
  return plain({
    ...(base ?? {}),
    name: d.name.trim() || "Your brand",
    ...(d.url ? { url: d.url } : {}),
    ...(d.logo ? { logo: d.logo } : { logo: undefined }),
    wordmark: base?.wordmark && base.wordmark !== base.name ? base.wordmark : d.name.trim() || undefined,
    colors: d.colors,
    fonts: { heading: font(d.heading, base?.fonts?.heading), body: font(d.body, base?.fonts?.body) },
    voice: d.voiceSummary || d.voiceDo.length || d.voiceAvoid.length ? { summary: d.voiceSummary, do: d.voiceDo, avoid: d.voiceAvoid } : undefined,
    imagery: d.imageryStyle || d.imageryTreatment || d.imageryAvoid.length ? { style: d.imageryStyle, treatment: d.imageryTreatment, avoid: d.imageryAvoid } : undefined,
  });
}

/** A typed address as a URL: https unless it is this machine (the demo stores). */
const normalizeUrl = (raw: string) => {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `${/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(t) ? "http" : "https"}://${t}`;
};
const hostOf = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

/** A sample poster in the kit: the merchant sees their brand before anything is generated. */
export function samplePoster(kit: MediaKit, headline: string, cta: string, image?: string): MediaDoc {
  const { w, h } = FORMATS.portrait;
  const c = kit.colors;
  return {
    kind: "poster",
    format: "portrait",
    w,
    h,
    background: c.background,
    layers: [
      ...(image ? [{ id: "img", type: "image" as const, src: image, x: 0, y: 0, w, h: 820, fit: "cover" as const }] : [{ id: "img", type: "shape" as const, fill: `linear-gradient(160deg, ${c.accent}, ${c.primary})`, x: 0, y: 0, w, h: 820 }]),
      kit.logo?.src ? { id: "logo", type: "logo" as const, src: kit.logo.src, x: 72, y: 870, w: 240, h: 70 } : { id: "logo", type: "logo" as const, text: kit.wordmark ?? kit.name, color: c.foreground, x: 72, y: 870, w: 360, h: 60 },
      { id: "h", type: "text" as const, text: headline, font: "heading" as const, size: 92, weight: 700, color: c.foreground, x: 72, y: 960, w: w - 144, h: 230, lineHeight: 1.02 },
      { id: "cta", type: "text" as const, text: cta, font: "body" as const, size: 38, weight: 600, color: c.primaryForeground, bg: c.primary, align: "center" as const, valign: "middle" as const, radius: kit.buttonStyle === "square" ? 0 : kit.buttonStyle === "rounded" ? 16 : 48, x: 72, y: 1210, w: 420, h: 96, padX: 24 },
    ],
  };
}

type Stage = "choose" | "website" | "import" | "form";

export function BrandDialog({ open, onOpenChange, brandId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; brandId?: Id<"mediaBrands"> | null; onDone?: (id: Id<"mediaBrands">) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="h-[min(88vh,780px)] gap-0 overflow-hidden p-0 sm:max-w-[1040px]">
        {open && <BrandFlow key={brandId ?? "new"} initial={brandId ?? null} onClose={() => onOpenChange(false)} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function BrandFlow({ initial, onClose, onDone }: { initial: Id<"mediaBrands"> | null; onClose: () => void; onDone?: (id: Id<"mediaBrands">) => void }) {
  const [stage, setStage] = useState<Stage>(initial ? "form" : "choose");
  const [id, setId] = useState<Id<"mediaBrands"> | null>(initial);
  const brand = useQuery(api.mediaBrands.get, id ? { id } : "skip");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // A brand read from its website, copied, or opened for editing fills the form once it is ready.
  if (brand && brand.status === "ready" && loadedFor !== brand._id) {
    setLoadedFor(brand._id);
    setDraft(fromBrand(brand));
    if (stage === "website" || stage === "import") setStage("form");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {stage === "choose" && <Choose onPick={(s) => (s === "form" ? (setDraft(blank()), setStage("form")) : setStage(s))} onClose={onClose} />}
      {stage === "website" && <Website brand={brand ?? null} onStarted={setId} onBack={() => setStage("choose")} onClose={onClose} onManual={() => (setDraft({ ...blank(), url: brand?.url ?? "", name: brand?.name ?? "" }), setStage("form"))} />}
      {stage === "import" && (
        <Import
          onBack={() => setStage("choose")}
          onClose={onClose}
          onImported={(newId) => {
            setId(newId);
          }}
        />
      )}
      {stage === "form" && draft && (
        <Form
          draft={draft}
          setDraft={setDraft}
          brand={brand ?? null}
          onBack={!initial && !id ? () => setStage("choose") : undefined}
          onClose={onClose}
          onSaved={(saved) => {
            onDone?.(saved);
            onClose();
          }}
        />
      )}
      {stage === "form" && !draft && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function Header({ title, sub, onBack, onClose }: { title: string; sub?: string; onBack?: () => void; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-start gap-3 border-b px-6 py-4">
      {onBack && (
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back" className="-ml-2">
          <ArrowLeft />
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="-mr-2">
        <X />
      </Button>
    </div>
  );
}

function Choose({ onPick, onClose }: { onPick: (s: Stage) => void; onClose: () => void }) {
  const options: { stage: Stage; icon: ReactNode; title: string; body: string; time: string }[] = [
    { stage: "website", icon: <Globe />, title: "From its website", body: "Slice reads the logo, colours, fonts, voice, photography and products.", time: "Under a minute" },
    { stage: "import", icon: <LayoutTemplate />, title: "From Pages or Email", body: "Copy a brand you already set up in another Slice service.", time: "Instant" },
    { stage: "form", icon: <PenLine />, title: "Start from scratch", body: "Name, logo, colours, fonts and voice, filled in by hand.", time: "A few minutes" },
  ];
  return (
    <>
      <Header title="Add a brand" sub="Everything Slice makes for it follows these guidelines: logo, colours, type, voice and how its pictures look." onClose={onClose} />
      <div className="flex flex-1 items-center justify-center bg-neutral-50/60 p-8">
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          {options.map((o) => (
            <button
              key={o.stage}
              type="button"
              onClick={() => onPick(o.stage)}
              className="group flex flex-col gap-3 rounded-2xl bg-white p-5 text-left ring-1 ring-black/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-lg hover:ring-black/10"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700 [&_svg]:size-5">{o.icon}</span>
              <span className="text-[15px] font-semibold tracking-tight">{o.title}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{o.body}</span>
              <span className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                {o.time}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

const STEPS = [
  { at: 0.05, label: "Reading the homepage" },
  { at: 0.3, label: "Measuring colours, fonts and the logo" },
  { at: 0.5, label: "Reading the voice, products and photography" },
  { at: 1, label: "Done" },
];

function Website({ brand, onStarted, onBack, onClose, onManual }: { brand: Doc<"mediaBrands"> | null; onStarted: (id: Id<"mediaBrands">) => void; onBack: () => void; onClose: () => void; onManual: () => void }) {
  const start = useMutation(api.mediaBrands.startFromUrl);
  const remove = useMutation(api.mediaBrands.remove);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reading = busy || brand?.status === "reading";
  const failed = brand?.status === "failed" ? brand.error : error;
  const value = brand?.progress?.value ?? (busy ? 0.02 : 0);

  const go = async () => {
    const full = normalizeUrl(url);
    if (!full) return;
    setBusy(true);
    setError(null);
    try {
      // A read that failed leaves its brand behind; a new try replaces it.
      if (brand?.status === "failed") await remove({ id: brand._id });
      const id = await start({ url: full });
      onStarted(id);
      const r = await postJson<{ ok: boolean; error?: string }>("/api/media/brand", { brandId: id, url: full });
      if (!r.ok) setError(r.error ?? "Could not read the site");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title="From its website" sub="One page is read: the homepage. Nothing is published or changed on the site." onBack={reading ? undefined : onBack} onClose={onClose} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-neutral-50/60 p-8">
        <div className="w-full max-w-lg space-y-3">
          <label className="text-sm font-medium" htmlFor="brand-url">
            Website
          </label>
          <div className="flex gap-2">
            <div className="flex h-10 flex-1 items-center gap-2 rounded-lg bg-white px-3 ring-1 ring-black/10 focus-within:ring-2 focus-within:ring-ring/40">
              <Globe className="size-4 text-muted-foreground" />
              <input
                id="brand-url"
                autoFocus
                value={url}
                disabled={reading}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void go()}
                placeholder="covers.london"
                inputMode="url"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <Button className="h-10 px-4" disabled={!url.trim() || reading} onClick={() => void go()}>
              {reading ? <Loader2 className="animate-spin" /> : <ArrowRight />} Read site
            </Button>
          </div>
        </div>
        {(reading || brand) && !failed && (
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 ring-1 ring-black/[0.06]">
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-orange-500 transition-[width] duration-700" style={{ width: `${Math.max(4, value * 100)}%` }} />
            </div>
            <ol className="space-y-2.5">
              {STEPS.map((s, i) => {
                const done = value >= (STEPS[i + 1]?.at ?? 1.01) || (s.at === 1 && value >= 1);
                const now = !done && value >= s.at;
                return (
                  <li key={s.label} className={cn("flex items-center gap-2.5 text-sm", done ? "text-foreground" : now ? "font-medium text-foreground" : "text-muted-foreground")}>
                    <span className="flex size-5 items-center justify-center">
                      {done ? <Check className="size-4 text-emerald-600" /> : now ? <Loader2 className="size-4 animate-spin" /> : <span className="size-1.5 rounded-full bg-neutral-300" />}
                    </span>
                    {s.label}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        {failed && (
          <div className="flex w-full max-w-lg items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-2">
              <p>{failed}</p>
              <button type="button" onClick={onManual} className="font-medium underline underline-offset-2">
                Set it up by hand instead
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SourceRow({ name, sub, logo, colors, busy, onClick }: { name: string; sub?: string; logo?: string; colors?: string[]; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="flex items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-black/[0.06] transition-colors hover:bg-neutral-50 disabled:opacity-60">
      <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-50 ring-1 ring-black/[0.04]">
        {logo ? (
          // Brand logos live on the brands' own hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="max-h-7 max-w-14 object-contain" />
        ) : (
          <span className="text-sm font-semibold">{name.slice(0, 1)}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
      {colors && (
        <span className="flex shrink-0 -space-x-1">
          {colors.map((c, i) => (
            <span key={i} className="size-4 rounded-full ring-2 ring-white" style={{ background: c }} />
          ))}
        </span>
      )}
      {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4 text-muted-foreground" />}
    </button>
  );
}

function Import({ onBack, onClose, onImported }: { onBack: () => void; onClose: () => void; onImported: (id: Id<"mediaBrands">) => void }) {
  const pages = useQuery(api.pagesBrands.list, {});
  const email = useQuery(api.emailBrands.list, {});
  const importBrand = useMutation(api.mediaBrands.importBrand);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, args: { pagesBrandId?: Id<"pagesBrands">; emailBrandId?: Id<"emailBrands"> }) => {
    setBusy(key);
    setError(null);
    try {
      onImported(await importBrand(args));
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };
  const readyPages = (pages ?? []).filter((b) => b.kit);
  const readyEmail = (email ?? []).filter((b) => b.kit);
  return (
    <>
      <Header title="From Pages or Email" sub="The kit, what the business does, its products and photos are copied. Edits here stay in Media." onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto bg-neutral-50/60 p-6">
        <div className="mx-auto grid max-w-3xl gap-8 sm:grid-cols-2">
          {(
            [
              ["Pages brands", readyPages.map((b) => ({ key: b._id, name: b.name, sub: hostOf(b.url), logo: (b.kit as { logo?: { src: string } } | undefined)?.logo?.src, colors: b.kit ? [(b.kit as MediaKit).colors.primary, (b.kit as MediaKit).colors.accent, (b.kit as MediaKit).colors.background] : undefined, args: { pagesBrandId: b._id } })), pages === undefined],
              ["Email brands", readyEmail.map((b) => ({ key: b._id, name: b.name, sub: hostOf(b.url), logo: (b.kit as EmailKit | undefined)?.logo?.src, colors: b.kit ? [(b.kit as EmailKit).colors.primary, (b.kit as EmailKit).colors.accent, (b.kit as EmailKit).colors.background] : undefined, args: { emailBrandId: b._id } })), email === undefined],
            ] as const
          ).map(([title, rows, loading]) => (
            <div key={title} className="space-y-2.5">
              <h3 className="text-sm font-medium">{title}</h3>
              {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : rows.map((r) => <SourceRow key={r.key} name={r.name} sub={r.sub} logo={r.logo} colors={r.colors} busy={busy === r.key} onClick={() => void run(r.key, r.args)} />)}
            </div>
          ))}
        </div>
        {error && <p className="mx-auto mt-6 max-w-3xl text-sm text-destructive">{error}</p>}
      </div>
    </>
  );
}

/* The form ------------------------------------------------------------------------ */

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b px-6 py-5 last:border-b-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-xs font-medium text-neutral-600">{children}</span>;
}

const COLOR_FIELDS: { key: keyof BrandColors; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "foreground", label: "Text" },
  { key: "primaryForeground", label: "On primary" },
  { key: "surface", label: "Surface" },
];

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2 rounded-lg p-1.5 ring-1 ring-black/[0.07]">
      <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-black/10" style={{ background: value }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <input
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft && /^#[0-9a-f]{3,8}$/i.test(draft.trim())) onChange(draft.trim());
            setDraft(null);
          }}
          className="w-20 bg-transparent text-xs text-muted-foreground uppercase tabular-nums outline-none"
        />
      </span>
    </div>
  );
}

function Form({ draft, setDraft, brand, onBack, onClose, onSaved }: { draft: Draft; setDraft: (d: Draft) => void; brand: Doc<"mediaBrands"> | null; onBack?: () => void; onClose: () => void; onSaved: (id: Id<"mediaBrands">) => void }) {
  const create = useMutation(api.mediaBrands.create);
  const update = useMutation(api.mediaBrands.update);
  const remove = useMutation(api.mediaBrands.remove);
  const fileUrl = useMutation(api.mediaBrands.fileUrl);
  const upload = useMediaUpload();
  const [busy, setBusy] = useState<"save" | "delete" | "logo" | "photos" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Draft>) => {
    setDraft({ ...draft, ...p });
    if (p.name !== undefined) setError(null);
  };
  const kit = kitOf(draft, brand?.kit as MediaKit | undefined);
  const photo = draft.products.find((p) => p.image)?.image ?? draft.images[0];
  const preview = samplePoster(kit, draft.summary ? "Made for the people who love it" : "Your headline, in your type", "Shop now", photo);

  const uploadFiles = async (files: FileList | null, kind: "logo" | "photos") => {
    if (!files?.length) return;
    setBusy(kind);
    setError(null);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, kind === "logo" ? 1 : 12)) {
        const up = await upload(f, { accept: ["image"] });
        const url = await fileUrl({ storageId: up.storageId });
        if (url) urls.push(url);
      }
      if (kind === "logo" && urls[0]) set({ logo: { src: urls[0], alt: `${draft.name || "Brand"} logo` } });
      if (kind === "photos") set({ images: [...urls, ...draft.images].slice(0, 24) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setError("Name the brand");
      return;
    }
    setBusy("save");
    setError(null);
    const about = draft.summary.trim() ? { summary: draft.summary.trim(), ...(draft.audience.trim() ? { audience: draft.audience.trim() } : {}) } : undefined;
    try {
      const payload = plain({ name: draft.name.trim(), url: normalizeUrl(draft.url) || undefined, about, kit, products: draft.products, images: draft.images });
      if (brand) {
        await update({ id: brand._id, ...payload });
        onSaved(brand._id);
      } else onSaved(await create(payload));
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <>
      <KitFonts kit={kit} />
      <Header title={brand ? draft.name || brand.name : "New brand"} sub={brand ? "Brand guidelines. Every image, poster, clip and track follows these." : "Fill in what you know; you can change any of it later."} onBack={onBack} onClose={onClose} />
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-0 overflow-y-auto">
          <Section title="Identity">
            <div className="flex gap-4">
              <div className="flex w-36 shrink-0 flex-col gap-2">
                <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-xl p-3 ring-1 ring-black/[0.07]" style={{ background: draft.logo?.onDark ? draft.colors.foreground : draft.colors.background }}>
                  {draft.logo ? (
                    // Logos live on brand hosts and Convex storage.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.logo.src} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="truncate text-lg font-semibold" style={{ color: draft.colors.foreground, fontFamily: draft.heading }}>
                      {draft.name || "Logo"}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="flex-1" disabled={busy === "logo"} onClick={() => logoInput.current?.click()}>
                    {busy === "logo" ? <Loader2 className="animate-spin" /> : <Upload />} {draft.logo ? "Replace" : "Upload"}
                  </Button>
                  {draft.logo && (
                    <Button variant="ghost" size="icon-sm" aria-label="Remove logo" onClick={() => set({ logo: undefined })}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => void uploadFiles(e.target.files, "logo").then(() => (e.target.value = ""))} />
              </div>
              <div className="grid min-w-0 flex-1 gap-3">
                <label>
                  <Label>Name</Label>
                  <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Covers" />
                </label>
                <label>
                  <Label>Website</Label>
                  <Input value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="covers.london" inputMode="url" />
                </label>
                {draft.logo && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={!!draft.logo.onDark} onChange={(e) => set({ logo: { ...draft.logo!, onDark: e.target.checked || undefined } })} />
                    The logo is light (shown on dark backgrounds)
                  </label>
                )}
              </div>
            </div>
          </Section>
          <Section title="What it does" hint="The agent writes and picks imagery from this.">
            <label className="block">
              <Label>About</Label>
              <Textarea value={draft.summary} onChange={(e) => set({ summary: e.target.value })} rows={3} placeholder="A London app for booking tables at independent restaurants, from neighbourhood bistros to tasting menus." />
            </label>
            <label className="block">
              <Label>Who it sells to</Label>
              <Input value={draft.audience} onChange={(e) => set({ audience: e.target.value })} placeholder="Londoners in their late 20s to 40s who eat out every week" />
            </label>
          </Section>
          <Section title="Colours">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COLOR_FIELDS.map((c) => (
                <Swatch key={c.key} label={c.label} value={draft.colors[c.key]} onChange={(v) => set({ colors: { ...draft.colors, [c.key]: v } })} />
              ))}
            </div>
          </Section>
          <Section title="Type">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["heading", "body"] as const).map((role) => (
                <label key={role} className="block">
                  <Label>{role === "heading" ? "Headings" : "Body"}</Label>
                  <Select value={draft[role]} onChange={(e) => set({ [role]: e.target.value })}>
                    {[...new Set([draft[role], ...FONTS])].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </Select>
                  <span className="mt-2 block truncate text-2xl" style={{ fontFamily: `"${draft[role]}"`, fontWeight: role === "heading" ? 700 : 400 }}>
                    {role === "heading" ? "Tables worth booking" : "Tonight, somewhere good."}
                  </span>
                </label>
              ))}
            </div>
          </Section>
          <Section title="Voice" hint="How it writes: headlines, captions, voiceovers.">
            <Textarea value={draft.voiceSummary} onChange={(e) => set({ voiceSummary: e.target.value })} rows={2} placeholder="Warm and knowing, short sentences, a little dry wit. Talks like a friend who knows every good table." />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Always</Label>
                <TokenInput values={draft.voiceDo} onChange={(voiceDo) => set({ voiceDo })} placeholder="Name the dish, plain verbs…" />
              </div>
              <div>
                <Label>Never</Label>
                <TokenInput values={draft.voiceAvoid} onChange={(voiceAvoid) => set({ voiceAvoid })} placeholder="Exclamation marks, foodie clichés…" />
              </div>
            </div>
          </Section>
          <Section title="Imagery" hint="Every generated picture is checked against this before you see it.">
            <label className="block">
              <Label>Style</Label>
              <Textarea value={draft.imageryStyle} onChange={(e) => set({ imageryStyle: e.target.value })} rows={2} placeholder="Candid, people mid-meal, warm practical light, close framing, shallow depth of field" />
            </label>
            <label className="block">
              <Label>Finish</Label>
              <Input value={draft.imageryTreatment} onChange={(e) => set({ imageryTreatment: e.target.value })} placeholder="Warm tones, soft contrast, a little film grain" />
            </label>
            <div>
              <Label>Never show</Label>
              <TokenInput values={draft.imageryAvoid} onChange={(imageryAvoid) => set({ imageryAvoid })} placeholder="Studio white backgrounds, stock smiles…" />
            </div>
          </Section>
          <Section title="Products and photos" hint="The agent puts these in posters and videos, and keeps products true in generated scenes.">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              <button type="button" onClick={() => photoInput.current?.click()} disabled={busy === "photos"} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:border-neutral-400 hover:text-foreground">
                {busy === "photos" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                Add
              </button>
              <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => void uploadFiles(e.target.files, "photos").then(() => (e.target.value = ""))} />
              {[...draft.products.filter((p) => p.image).map((p) => ({ key: `p:${p.id}`, src: p.image!, name: p.name, product: true })), ...draft.images.map((src) => ({ key: `i:${src}`, src, name: "Photo", product: false }))].slice(0, 30).map((it) => (
                <div key={it.key} className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-black/[0.05]" title={it.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.src} alt="" className="size-full object-cover" />
                  {it.product && <span className="absolute inset-x-1 bottom-1 truncate rounded bg-white/90 px-1 text-[10px] font-medium">{it.name}</span>}
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => (it.product ? set({ products: draft.products.filter((p) => `p:${p.id}` !== it.key) }) : set({ images: draft.images.filter((s) => s !== it.src) }))}
                    className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        </div>
        <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l bg-neutral-50 p-5 md:flex">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <ScaledStage doc={preview} kit={kit} mode="width" className="overflow-hidden rounded-xl shadow-md ring-1 ring-black/[0.06]" />
          <div className="flex gap-1.5">
            {COLOR_FIELDS.slice(0, 4).map((c) => (
              <span key={c.key} className="h-8 flex-1 rounded-md ring-1 ring-black/[0.08]" style={{ background: draft.colors[c.key] }} title={c.label} />
            ))}
          </div>
          {draft.voiceSummary && <p className="text-xs leading-relaxed text-muted-foreground">{draft.voiceSummary}</p>}
        </aside>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t px-6 py-3">
        {brand &&
          (confirmDelete ? (
            <span className="flex items-center gap-2 text-sm">
              Delete this brand? Campaigns keep their copy.
              <Button
                variant="destructive"
                size="sm"
                disabled={busy === "delete"}
                onClick={async () => {
                  setBusy("delete");
                  await remove({ id: brand._id });
                  onClose();
                }}
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete brand
            </Button>
          ))}
        {error && <span className="text-sm text-destructive">{error}</span>}
        <span className="ml-auto" />
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy === "save"} onClick={() => void save()}>
          {busy === "save" && <Loader2 className="animate-spin" />} {brand ? "Save guidelines" : "Create brand"}
        </Button>
      </div>
    </>
  );
}

export { hostOf as brandHost };
