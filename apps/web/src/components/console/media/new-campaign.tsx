"use client";

// New Media campaign: brand (from Pages, Email, a website or by hand), brief,
// products and the merchant's own files, audiences, formats, then the cost
// tier and budget. Creating it opens the studio, which starts generating.

import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, Check, Film, Globe, ImageIcon, LayoutTemplate, Mail, Music, Palette, Plus, Upload, Users, X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import type { EmailKit } from "@slice/backend/convex/emailTypes";
import { DEFAULT_KIT, FORMATS, FORMAT_KEYS, TIERS, newId, type FormatPreset, type MediaAudience, type MediaDoc, type MediaKit, type MediaProduct, type PeopleMode, type Tier } from "@slice/backend/convex/mediaTypes";
import { audienceId, estimate, EVERYONE, kitFromEmail, kitFromPages, productFrom, usd } from "@/lib/media/kit";
import { kindOf, useMediaUpload, type Uploaded } from "@/lib/media/upload";
import { postStream } from "@/lib/pages/stream";
import { briefOf, kitOf } from "@/lib/pages/types";
import { hostOf } from "@/lib/pages/urls";
import { cn } from "@/lib/utils";
import { Chip, Field, Input, Segmented, Select, Switch, Textarea } from "@/components/console/form";
import { PageHeader } from "@/components/console/primitives";
import { AdornedInput, FieldGroup, Notice, Spinner, TokenInput } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KitFonts, ScaledStage } from "./stage";

type SourceKind = "pages" | "email" | "url" | "manual";
type Kind = "poster" | "video" | "both";
type Role = "product" | "photo" | "logo" | "clip" | "music";

interface PendingUpload {
  key: string;
  file: File;
  preview: string;
  role: Role;
  status: "uploading" | "done" | "failed";
  error?: string;
  result?: Uploaded;
}

const FONTS = ["Inter", "DM Sans", "Manrope", "Poppins", "Space Grotesk", "Syne", "Archivo Black", "Bebas Neue", "Fraunces", "Playfair Display", "Cormorant Garamond", "Libre Baskerville"];
const SERIF = new Set(["Fraunces", "Playfair Display", "Cormorant Garamond", "Libre Baskerville"]);
const AGES = ["", "18-24", "25-34", "35-44", "45-54", "55+"];
const DURATIONS = [6, 10, 15, 30] as const;

const normalizeUrl = (raw: string) => {
  const t = raw.trim();
  return !t ? "" : /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

function Step({ n, title, description, children, aside }: { n: number; title: string; description?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card id={`step-${n}`} className="scroll-mt-24">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{n}</span>
            <div>
              <CardTitle>{title}</CardTitle>
              {description && <CardDescription className="mt-1">{description}</CardDescription>}
            </div>
          </div>
          {aside}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function SourceTile({ active, icon, title, body, onClick }: { active: boolean; icon: ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50", active && "border-primary bg-primary/5 ring-1 ring-primary/30")}
    >
      <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</span>
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </button>
  );
}

function BrandPick({ name, sub, logo, colors, active, onClick }: { name: string; sub?: string; logo?: string; colors?: string[]; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50", active && "border-primary bg-primary/5 ring-1 ring-primary/30")}>
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
        {logo ? (
          // Brand logos live on the brands' own hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="max-h-8 max-w-8 object-contain" />
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
            <span key={i} className="size-4 rounded-full ring-2 ring-card" style={{ background: c }} />
          ))}
        </span>
      )}
      {active && <Check className="size-4 shrink-0 text-primary" />}
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border p-1.5 pr-2.5">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block font-mono text-[11px] text-muted-foreground uppercase">{value}</span>
      </span>
    </label>
  );
}

/** A sample poster in the kit, so the merchant sees their brand before anything is generated. */
function samplePoster(kit: MediaKit, headline: string, cta: string, image?: string): MediaDoc {
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
      kit.logo?.src ? { id: "logo", type: "logo" as const, src: kit.logo.src, x: 72, y: 870, w: 220, h: 70 } : { id: "logo", type: "logo" as const, text: kit.wordmark ?? kit.name, color: c.foreground, x: 72, y: 870, w: 360, h: 60 },
      { id: "h", type: "text" as const, text: headline, font: "heading" as const, size: 92, weight: 700, color: c.foreground, x: 72, y: 960, w: w - 144, h: 230, lineHeight: 1.02 },
      { id: "cta", type: "text" as const, text: cta, font: "body" as const, size: 38, weight: 600, color: c.primaryForeground, bg: c.primary, align: "center" as const, valign: "middle" as const, radius: kit.buttonStyle === "square" ? 0 : kit.buttonStyle === "rounded" ? 16 : 48, x: 72, y: 1210, w: 420, h: 96, padX: 24 },
    ],
  };
}

export function NewMediaCampaign() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const create = useMutation(api.media.create);
  const createPagesBrand = useMutation(api.pagesBrands.create);
  const upload = useMediaUpload();

  // 1. Brand
  const [source, setSource] = useState<SourceKind>("pages");
  const [pagesBrandId, setPagesBrandId] = useState<Id<"pagesBrands"> | null>(null);
  const [emailBrandId, setEmailBrandId] = useState<Id<"emailBrands"> | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [imported, setImported] = useState<{ id: Id<"pagesBrands">; url: string; status: string; error?: string; running: boolean } | null>(null);
  const [manual, setManual] = useState({ name: "", url: "", primary: "#1b1a17", accent: "#c8553d", background: "#f6f4ef", foreground: "#1b1a17", heading: "Fraunces", body: "Inter" });

  const pagesBrands = useQuery(api.pagesBrands.list, isAuthenticated ? {} : "skip");
  const emailBrands = useQuery(api.emailBrands.list, isAuthenticated ? {} : "skip");
  const pagesId = source === "pages" ? pagesBrandId : source === "url" ? (imported?.id ?? null) : null;
  const pagesBrand = useQuery(api.pagesBrands.get, pagesId ? { id: pagesId } : "skip");
  const pagesAudiences = useQuery(api.pagesAudiences.list, pagesId ? { brandId: pagesId } : "skip");
  const emailId = source === "email" ? emailBrandId : null;
  const emailBrand = useQuery(api.emailBrands.get, emailId ? { id: emailId } : "skip");
  const emailItems = useQuery(api.emailItems.list, emailId ? { brandId: emailId } : "skip");

  const brandName = source === "manual" ? manual.name.trim() : source === "email" ? (emailBrand?.name ?? "") : (pagesBrand?.name ?? "");
  const kit: MediaKit | null = useMemo(() => {
    if (source === "manual") {
      if (!manual.name.trim()) return null;
      const base = DEFAULT_KIT(manual.name.trim());
      const font = (family: string) => ({ family, source: "google" as const, weights: [400, 600, 700], fallback: SERIF.has(family) ? "Georgia, serif" : "system-ui, sans-serif" });
      return {
        ...base,
        url: normalizeUrl(manual.url) || undefined,
        colors: { ...base.colors, primary: manual.primary, accent: manual.accent, background: manual.background, foreground: manual.foreground, primaryForeground: "#ffffff" },
        fonts: { heading: font(manual.heading), body: font(manual.body) },
      };
    }
    if (source === "email") return emailBrand ? kitFromEmail(emailBrand.name, emailBrand.url, emailBrand.kit as EmailKit | undefined) : null;
    if (!pagesBrand) return null;
    const k = kitOf(pagesBrand);
    return k ? kitFromPages(pagesBrand.name, pagesBrand.url, k) : null;
  }, [source, manual, emailBrand, pagesBrand]);

  const items: MediaProduct[] = useMemo(() => {
    if (source === "email") return (emailItems ?? []).map((i) => productFrom({ id: i._id, name: i.name, description: i.description, price: i.price, image: i.image, url: i.url }));
    if (source === "pages" || source === "url") return (briefOf(pagesBrand)?.items ?? []).map(productFrom);
    return [];
  }, [source, emailItems, pagesBrand]);

  async function importSite() {
    const full = normalizeUrl(siteUrl);
    if (!full) return;
    try {
      const host = hostOf(full).replace(/^www\./, "");
      const { id } = await createPagesBrand({ name: host.split(".")[0].replace(/^./, (c) => c.toUpperCase()) || host, url: full, nameFromSite: true });
      setImported({ id, url: full, status: "Starting", running: true });
      for await (const ev of postStream("/api/pages/intake", { brand_id: id, url: full })) {
        if (ev.type === "status") setImported((s) => (s ? { ...s, status: ev.text } : s));
        else if (ev.type === "error") setImported((s) => (s ? { ...s, error: ev.message } : s));
      }
      setImported((s) => (s ? { ...s, running: false, status: "Done" } : s));
    } catch (err) {
      setImported((s) => (s ? { ...s, running: false, error: (err as Error).message } : { id: "" as Id<"pagesBrands">, url: full, status: "", error: (err as Error).message, running: false }));
    }
  }

  // 2. Brief
  const [name, setName] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("both");
  const [brief, setBrief] = useState<{ goal: string; offer: string; cta: string; link: string; notes: string; duration: number; music: boolean; voiceover: boolean; people: PeopleMode }>({ goal: "", offer: "", cta: "Shop now", link: "", notes: "", duration: 15, music: true, voiceover: false, people: "auto" });
  const campaignName = name ?? (brandName ? `${brandName} campaign` : "");

  // 3. Products and files
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const products = picked ? items.filter((i) => picked.has(i.id)) : items.filter((i) => i.image).slice(0, 6);
  const productIds = new Set(products.map((p) => p.id));
  const toggleProduct = (id: string) => {
    const next = new Set(productIds);
    if (next.has(id)) next.delete(id);
    else if (next.size < 24) next.add(id);
    setPicked(next);
  };
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files).slice(0, 20)) {
      const k = kindOf(file.type);
      if (!k) continue;
      const key = newId("u");
      const role: Role = k === "video" ? "clip" : k === "audio" ? "music" : /logo/i.test(file.name) ? "logo" : "product";
      setUploads((u) => [...u, { key, file, preview: URL.createObjectURL(file), role, status: "uploading" }]);
      upload(file, { source: role })
        .then((result) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: "done", result } : x))))
        .catch((err: Error) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: "failed", error: err.message } : x))));
    }
  }
  const setRole = (key: string, role: Role) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, role } : x)));
  const removeUpload = (key: string) =>
    setUploads((u) => {
      const gone = u.find((x) => x.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return u.filter((x) => x.key !== key);
    });

  // 4. Audiences
  const [audiences, setAudiences] = useState<MediaAudience[]>([EVERYONE]);
  const readyPages = (pagesAudiences ?? []).filter((a) => a.status === "ready");
  const validPages = new Set(readyPages.map((a) => a._id as string));
  const chosen = audiences.filter((a) => a.kind !== "pages" || (a.pagesAudienceId && validPages.has(a.pagesAudienceId)));
  const taken = () => new Set(chosen.map((a) => a.id));
  const togglePagesAudience = (a: (typeof readyPages)[number]) => {
    const has = chosen.find((x) => x.pagesAudienceId === a._id);
    if (has) setAudiences(chosen.filter((x) => x !== has));
    else if (chosen.length < 6) setAudiences([...chosen, { id: audienceId(a.name, taken()), name: a.name, kind: "pages", pagesAudienceId: a._id, ...(a.brief?.summary ? { summary: String(a.brief.summary).slice(0, 400) } : {}) }]);
  };
  const [seed, setSeed] = useState({ name: "", city: "", age: "", interests: [] as string[] });
  const addSeed = () => {
    if (!seed.interests.length || chosen.length >= 6) return;
    const label = seed.name.trim() || [seed.city.trim(), seed.interests.slice(0, 2).join(" & ")].filter(Boolean).join(" · ");
    setAudiences([...chosen, { id: audienceId(label, taken()), name: label, kind: "seed", seed: { interests: seed.interests, ...(seed.city.trim() ? { city: seed.city.trim() } : {}), ...(seed.age ? { age: seed.age } : {}) } }]);
    setSeed({ name: "", city: "", age: "", interests: [] });
  };

  // 5. Formats
  const [formats, setFormats] = useState<FormatPreset[]>(["story", "portrait"]);
  const toggleFormat = (f: FormatPreset) => setFormats((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]));

  // 6. Tier and budget
  const [tier, setTier] = useState<Tier>("smart");
  const est = estimate({ tier, audiences: chosen.length, formats, kind, duration: brief.duration, music: brief.music, voiceover: brief.voiceover, people: brief.people });
  const suggested = Math.max(2, Math.ceil(est.high * 1.6));
  const [budgetText, setBudgetText] = useState<string | null>(null);
  const budget = budgetText === null ? suggested : Number(budgetText);

  // Create
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems: { text: string; step: number }[] = [];
  if (!kit) problems.push({ text: source === "manual" ? "Name the brand" : source === "url" ? "Import the website (or pick another source)" : "Pick a brand", step: 1 });
  if (!brief.goal.trim()) problems.push({ text: "Say what the campaign is for", step: 2 });
  if (!formats.length) problems.push({ text: "Pick at least one format", step: 5 });
  if (kind === "video" && formats.every((f) => !FORMATS[f].video)) problems.push({ text: "Print has no video: add a screen format", step: 5 });
  if (!chosen.length) problems.push({ text: "Pick at least one audience", step: 4 });
  if (uploads.some((u) => u.status === "uploading")) problems.push({ text: "Wait for uploads to finish", step: 3 });
  if (!Number.isFinite(budget) || budget < 0.5) problems.push({ text: "Set a budget of at least $0.50", step: 6 });
  const jump = (step: number) => {
    document.getElementById(`step-${step}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (step === 2) document.getElementById("media-goal")?.focus({ preventScroll: true });
  };
  const lowBudget = Number.isFinite(budget) && budget < est.low;

  async function submit() {
    if (problems.length || !kit) return;
    setBusy(true);
    setError(null);
    try {
      const done = uploads.filter((u) => u.status === "done" && u.result);
      const id = await create({
        name: campaignName || "Untitled campaign",
        kind,
        source: {
          kind: source,
          ...(pagesId ? { pagesBrandId: pagesId } : {}),
          ...(emailId ? { emailBrandId: emailId } : {}),
          ...(source === "url" && imported ? { url: imported.url } : {}),
        },
        kit,
        brief: {
          goal: brief.goal.trim(),
          ...(brief.offer.trim() ? { offer: brief.offer.trim() } : {}),
          ...(brief.cta.trim() ? { cta: brief.cta.trim() } : {}),
          ...(normalizeUrl(brief.link) ? { link: normalizeUrl(brief.link) } : kit.url ? { link: kit.url } : {}),
          ...(brief.notes.trim() ? { notes: brief.notes.trim() } : {}),
          ...(kind !== "poster" ? { duration: brief.duration, music: brief.music, voiceover: brief.voiceover, people: brief.people } : {}),
        },
        products,
        audiences: chosen,
        formats,
        tier,
        budget: Math.round(budget * 100) / 100,
        assets: done.map((u) => {
          const r = u.result!;
          return { storageId: r.storageId, kind: r.kind, source: u.role, mime: r.mime, name: r.name, ...(r.w ? { w: r.w, h: r.h } : {}), ...(r.duration ? { duration: r.duration } : {}) };
        }),
      });
      router.push(`/dashboard/media/${id}?generate=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const previewImage = uploads.find((u) => u.status === "done" && u.result?.kind === "image" && u.role !== "logo")?.preview ?? products.find((p) => p.image)?.image;
  const preview = kit ? samplePoster(kit, brief.offer.trim() || brief.goal.trim() || "Your headline, written for each audience", brief.cta.trim() || "Shop now", previewImage) : null;

  return (
    <>
      <PageHeader
        title="New media campaign"
        description="Slice designs a poster and a short video for each audience and format from your brand, your products and what Qloo knows about the audience's taste. Nothing is generated until you create the campaign."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Step n={1} title="Brand" description="Colours, type, logo and products come from here. Everything stays editable in the studio.">
            <div className="grid gap-3 sm:grid-cols-4">
              <SourceTile active={source === "pages"} icon={<LayoutTemplate className="size-4" />} title="Pages brand" body="Kit, items and audiences" onClick={() => setSource("pages")} />
              <SourceTile active={source === "email"} icon={<Mail className="size-4" />} title="Email brand" body="Kit and items" onClick={() => setSource("email")} />
              <SourceTile active={source === "url"} icon={<Globe className="size-4" />} title="From a website" body="Read it in about a minute" onClick={() => setSource("url")} />
              <SourceTile active={source === "manual"} icon={<Palette className="size-4" />} title="By hand" body="Name, colours, fonts" onClick={() => setSource("manual")} />
            </div>

            {source === "pages" &&
              (pagesBrands === undefined ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Loading brands
                </div>
              ) : pagesBrands.length === 0 ? (
                <Notice>No Pages brands yet. Import one from its website instead.</Notice>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {pagesBrands.map((b) => {
                    const k = kitOf(b);
                    return <BrandPick key={b._id} name={b.name} sub={hostOf(b.url)} logo={k?.logo?.src ?? k?.icon} colors={k ? [k.colors.primary, k.colors.accent, k.colors.background] : undefined} active={pagesBrandId === b._id} onClick={() => setPagesBrandId(b._id)} />;
                  })}
                </div>
              ))}

            {source === "email" &&
              (emailBrands === undefined ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Loading brands
                </div>
              ) : emailBrands.length === 0 ? (
                <Notice>No Email brands yet.</Notice>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {emailBrands.map((b) => {
                    const k = b.kit as EmailKit | undefined;
                    return <BrandPick key={b._id} name={b.name} sub={b.url ? hostOf(b.url) : undefined} logo={k?.logo?.src} colors={k ? [k.colors.primary, k.colors.accent, k.colors.background] : undefined} active={emailBrandId === b._id} onClick={() => setEmailBrandId(b._id)} />;
                  })}
                </div>
              ))}

            {source === "url" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <AdornedInput
                    className="h-9 flex-1"
                    prefix="https://"
                    value={siteUrl.replace(/^https?:\/\//i, "")}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="ridgeline.coffee"
                    inputMode="url"
                    spellCheck={false}
                    disabled={imported?.running}
                  />
                  <Button type="button" onClick={() => void importSite()} disabled={!siteUrl.trim() || imported?.running}>
                    {imported?.running ? <Spinner /> : <ArrowRight data-icon="inline-start" />} Import
                  </Button>
                </div>
                {imported && (
                  <Notice tone={imported.error ? "bad" : kit ? "ok" : "neutral"} icon={imported.running ? <Spinner /> : imported.error ? <AlertTriangle /> : <Check />}>
                    {imported.error ?? (kit ? `Read ${pagesBrand?.name ?? "the brand"}: kit and ${items.length} items. It is also saved as a Pages brand.` : imported.status)}
                  </Notice>
                )}
              </div>
            )}

            {source === "manual" && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Brand name">
                    <Input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Marlow & Co" />
                  </Field>
                  <Field label="Website" optional>
                    <Input value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} placeholder="marlow.co" inputMode="url" />
                  </Field>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <ColorField label="Primary" value={manual.primary} onChange={(v) => setManual({ ...manual, primary: v })} />
                  <ColorField label="Accent" value={manual.accent} onChange={(v) => setManual({ ...manual, accent: v })} />
                  <ColorField label="Background" value={manual.background} onChange={(v) => setManual({ ...manual, background: v })} />
                  <ColorField label="Text" value={manual.foreground} onChange={(v) => setManual({ ...manual, foreground: v })} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Heading font">
                    <Select value={manual.heading} onChange={(e) => setManual({ ...manual, heading: e.target.value })}>
                      {FONTS.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Body font">
                    <Select value={manual.body} onChange={(e) => setManual({ ...manual, body: e.target.value })}>
                      {FONTS.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">Add your logo in step 3 (mark it as Logo).</p>
              </div>
            )}

            {(source === "pages" || source === "url") && pagesBrand && !kitOf(pagesBrand) && !imported?.running && (
              <Notice tone="warn" icon={<AlertTriangle />}>
                This brand has no kit yet. Finish its intake in Pages first.
              </Notice>
            )}
          </Step>

          <Step n={2} title="Brief" description="One brief for the whole campaign; the agent adapts the angle per audience.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign name">
                <Input value={campaignName} onChange={(e) => setName(e.target.value)} placeholder="Summer linen launch" />
              </Field>
              <FieldGroup label="Make">
                <Segmented<Kind>
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "poster", label: "Posters" },
                    { value: "video", label: "Videos" },
                    { value: "both", label: "Both" },
                  ]}
                />
              </FieldGroup>
            </div>
            <Field label="What is it for?" hint="The product, launch or moment, and what you want people to do.">
              <Textarea id="media-goal" value={brief.goal} onChange={(e) => setBrief({ ...brief, goal: e.target.value })} rows={2} placeholder="Launch the linen summer collection to new customers in time for the long weekend" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Offer" optional>
                <Input value={brief.offer} onChange={(e) => setBrief({ ...brief, offer: e.target.value })} placeholder="20% off this week" />
              </Field>
              <Field label="Call to action">
                <Input value={brief.cta} onChange={(e) => setBrief({ ...brief, cta: e.target.value })} placeholder="Shop now" />
              </Field>
              <Field label="Link" optional hint="QR codes point here">
                <Input value={brief.link} onChange={(e) => setBrief({ ...brief, link: e.target.value })} placeholder={kit?.url ? hostOf(kit.url) : "shop.example.com/summer"} inputMode="url" />
              </Field>
            </div>
            {kind !== "poster" && (
              <div className="grid gap-4 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
                <FieldGroup label="Video length">
                  <Segmented<string> value={String(brief.duration)} onChange={(v) => setBrief({ ...brief, duration: Number(v) })} options={DURATIONS.map((d) => ({ value: String(d), label: `${d}s` }))} />
                </FieldGroup>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="block font-medium">Music</span>
                    <span className="text-xs text-muted-foreground">Lyria, made for the cut</span>
                  </span>
                  <Switch checked={brief.music} onCheckedChange={(v) => setBrief({ ...brief, music: v })} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="block font-medium">Voiceover</span>
                    <span className="text-xs text-muted-foreground">Gemini TTS in the brand voice</span>
                  </span>
                  <Switch checked={brief.voiceover} onCheckedChange={(v) => setBrief({ ...brief, voiceover: v })} />
                </label>
                <div className="space-y-1.5 sm:col-span-3">
                  <FieldGroup label="People on camera">
                    <Segmented<PeopleMode>
                      value={brief.people}
                      onChange={(people) => setBrief({ ...brief, people })}
                      options={[
                        { value: "auto", label: "Agent decides" },
                        { value: "none", label: "No people" },
                        { value: "using", label: "Using the product" },
                        { value: "talking", label: "Talking to camera" },
                      ]}
                    />
                  </FieldGroup>
                  <p className="text-xs text-muted-foreground">
                    {brief.people === "talking"
                      ? "A presenter cast for each audience says a line on camera, lip-synced by Veo, with captions. The same face is kept across shots."
                      : brief.people === "using"
                        ? "People cast for each audience sit on it, wear it or use it. No talking."
                        : brief.people === "none"
                          ? "Products and places only."
                          : "People appear where they help the audience picture themselves."}{" "}
                    {brief.people !== "none" && "They are AI-generated: label the ads where the platform asks."}
                  </p>
                </div>
              </div>
            )}
            <Field label="Anything else" optional hint="Must-haves, words to avoid, the mood, legal lines.">
              <Textarea value={brief.notes} onChange={(e) => setBrief({ ...brief, notes: e.target.value })} rows={2} placeholder="Keep it calm and sunlit; always show the price; no models' faces" />
            </Field>
          </Step>

          <Step n={3} title="Products and your media" description="Your own photos and clips are free to use and always look most like you. The agent generates only what is missing.">
            {items.length > 0 && (
              <FieldGroup label="Feature" aside={`${products.length} of ${items.length} selected`}>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {items.slice(0, 36).map((p) => {
                    const on = productIds.has(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => toggleProduct(p.id)} aria-pressed={on} className={cn("group relative overflow-hidden rounded-lg border text-left transition", on ? "border-primary ring-1 ring-primary/40" : "opacity-70 hover:opacity-100")}>
                        <span className="block aspect-square bg-muted">
                          {p.image && (
                            // Product images live on the brand's hosts.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image} alt="" className="size-full object-cover" />
                          )}
                        </span>
                        <span className="block truncate px-1.5 py-1 text-[11px]">{p.name}</span>
                        {on && (
                          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </FieldGroup>
            )}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors", dragging && "border-primary bg-primary/5")}
            >
              <Upload className="size-5 text-muted-foreground" />
              <p className="text-sm">
                Drop product shots, photos, a logo, video clips or music
                <span className="block text-xs text-muted-foreground">Images up to 15 MB, video 200 MB, audio 30 MB</span>
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <Plus data-icon="inline-start" /> Choose files
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {uploads.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {uploads.map((u) => {
                  const k = kindOf(u.file.type);
                  return (
                    <div key={u.key} className="flex items-center gap-3 rounded-lg border p-2">
                      <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                        {k === "image" ? (
                          // A local object URL preview.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.preview} alt="" className="size-full object-cover" />
                        ) : k === "video" ? (
                          <video src={u.preview} muted className="size-full object-cover" />
                        ) : (
                          <Music className="size-4 text-muted-foreground" />
                        )}
                        {u.status === "uploading" && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                            <Spinner />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{u.file.name}</span>
                        {u.status === "failed" ? (
                          <span className="block truncate text-xs text-destructive">{u.error}</span>
                        ) : k === "image" ? (
                          <select value={u.role} onChange={(e) => setRole(u.key, e.target.value as Role)} className="mt-0.5 rounded border bg-transparent px-1 text-xs">
                            <option value="product">Product shot</option>
                            <option value="photo">Photo / mood</option>
                            <option value="logo">Logo</option>
                          </select>
                        ) : (
                          <span className="text-xs text-muted-foreground">{k === "video" ? "Video clip" : "Music"}</span>
                        )}
                      </span>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => removeUpload(u.key)}>
                        <X />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Step>

          <Step n={4} title="Audiences" description="One set of creatives per audience, each angled to what Qloo says they are into. Up to 6." aside={<span className="text-xs text-muted-foreground">{chosen.length} / 6</span>}>
            <div className="flex flex-wrap gap-2">
              <Chip selected={chosen.some((a) => a.kind === "everyone")} onClick={() => (chosen.some((a) => a.kind === "everyone") ? setAudiences(chosen.filter((a) => a.kind !== "everyone")) : chosen.length < 6 && setAudiences([EVERYONE, ...chosen]))}>
                <Users className="size-3.5" /> Everyone
              </Chip>
              {readyPages.map((a) => (
                <Chip key={a._id} selected={chosen.some((x) => x.pagesAudienceId === a._id)} onClick={() => togglePagesAudience(a)}>
                  {a.name}
                </Chip>
              ))}
              {chosen
                .filter((a) => a.kind === "seed")
                .map((a) => (
                  <Chip key={a.id} selected onClick={() => setAudiences(chosen.filter((x) => x.id !== a.id))}>
                    {a.name} <X className="size-3" />
                  </Chip>
                ))}
            </div>
            {pagesId && readyPages.length === 0 && pagesAudiences !== undefined && <p className="text-xs text-muted-foreground">This brand has no ready audiences in Pages. Describe one below.</p>}
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="text-sm font-medium">Describe an audience</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input value={seed.name} onChange={(e) => setSeed({ ...seed, name: e.target.value })} placeholder="Name (optional)" />
                <Input value={seed.city} onChange={(e) => setSeed({ ...seed, city: e.target.value })} placeholder="City (optional)" />
                <Select value={seed.age} onChange={(e) => setSeed({ ...seed, age: e.target.value })}>
                  {AGES.map((a) => (
                    <option key={a} value={a}>
                      {a ? `Age ${a}` : "Any age"}
                    </option>
                  ))}
                </Select>
              </div>
              <TokenInput values={seed.interests} onChange={(interests) => setSeed({ ...seed, interests })} placeholder="Interests: trail running, natural wine, Wes Anderson…" />
              <Button type="button" variant="outline" size="sm" disabled={!seed.interests.length || chosen.length >= 6} onClick={addSeed}>
                <Plus data-icon="inline-start" /> Add audience
              </Button>
            </div>
          </Step>

          <Step n={5} title="Formats" description="Each creative is designed for its frame, not cropped. You can resize any creative later for free.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {FORMAT_KEYS.map((f) => {
                const spec = FORMATS[f];
                const on = formats.includes(f);
                const ratio = spec.w / spec.h;
                return (
                  <button key={f} type="button" onClick={() => toggleFormat(f)} aria-pressed={on} className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50", on && "border-primary bg-primary/5 ring-1 ring-primary/30")}>
                    <span className="flex size-12 shrink-0 items-center justify-center">
                      <span className={cn("rounded-sm border-2", on ? "border-primary bg-primary/10" : "border-muted-foreground/40")} style={ratio >= 1 ? { width: 44, height: 44 / ratio } : { height: 44, width: 44 * ratio }} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {spec.label}
                        {!spec.video && <ImageIcon className="size-3 text-muted-foreground" />}
                      </span>
                      <span className="block text-xs text-muted-foreground">{spec.hint}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {spec.w}×{spec.h}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {kind !== "poster" && formats.includes("print") && <p className="text-xs text-muted-foreground">Print gets a poster only.</p>}
          </Step>

          <Step n={6} title="Quality and budget" description="Mixed models keep cost down: premium video only where it shows (the hero shot), cheaper models for b-roll, and animated stills where motion adds nothing.">
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(TIERS) as Tier[]).map((t) => {
                const spec = TIERS[t];
                const e = estimate({ tier: t, audiences: chosen.length, formats, kind, duration: brief.duration, music: brief.music, voiceover: brief.voiceover, people: brief.people });
                return (
                  <button key={t} type="button" onClick={() => setTier(t)} aria-pressed={tier === t} className={cn("flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50", tier === t && "border-primary bg-primary/5 ring-1 ring-primary/30")}>
                    <span className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{spec.label}</span>
                      {t === "smart" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Recommended</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{spec.blurb}</span>
                    <span className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ImageIcon className="size-3" /> {spec.image.label}
                      </span>
                      {kind !== "poster" && (
                        <span className="flex items-center gap-1">
                          <Film className="size-3" /> {spec.video.hero.label === spec.video.broll.label ? spec.video.hero.label : `${spec.video.hero.label} + ${spec.video.broll.label}`} · {spec.resolution}
                        </span>
                      )}
                    </span>
                    <span className="num mt-auto pt-1 text-sm font-semibold">
                      {usd(e.low)}–{usd(e.high)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <Field label="Budget" hint="A hard cap. Jobs that would pass it are refused, never charged.">
                <AdornedInput prefix="$" value={budgetText ?? String(suggested)} onChange={(e) => setBudgetText(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" />
              </Field>
              <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-xs">
                {est.lines.map((l) => (
                  <div key={l.label} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span className="num shrink-0">{usd(l.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t pt-1.5 font-medium">
                  <span>First pass, estimated</span>
                  <span className="num">
                    {usd(est.low)}–{usd(est.high)}
                  </span>
                </div>
              </div>
            </div>
            {lowBudget && (
              <Notice tone="warn" icon={<AlertTriangle />}>
                The budget is under the estimate. The agent will use stills and cheaper models, and may not finish every video.
              </Notice>
            )}
          </Step>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Your kit on a sample poster. The real ones are designed per audience.</CardDescription>
            </CardHeader>
            <CardContent>
              {kit && preview ? (
                <>
                  <KitFonts kit={kit} />
                  <ScaledStage doc={preview} kit={kit} mode="width" className="overflow-hidden rounded-lg ring-1 ring-foreground/10" />
                </>
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Pick a brand</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Creatives</span>
                <span className="num font-medium">{chosen.length * ((kind !== "video" ? formats.length : 0) + (kind !== "poster" ? formats.filter((f) => FORMATS[f].video).length : 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimate</span>
                <span className="num font-medium">
                  {usd(est.low)}–{usd(est.high)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Budget</span>
                <span className="num font-medium">{Number.isFinite(budget) ? usd(budget) : "—"}</span>
              </div>
              {problems.length > 0 && (
                <div className="space-y-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
                  <p className="font-medium">Before you can generate:</p>
                  <ul className="space-y-1">
                    {problems.map((p) => (
                      <li key={p.text}>
                        <button type="button" onClick={() => jump(p.step)} className="text-left underline decoration-amber-900/30 underline-offset-2 hover:decoration-amber-900">
                          {p.step}. {p.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {error && <Notice tone="bad">{error}</Notice>}
              <Button type="button" className="w-full" size="lg" disabled={busy || problems.length > 0} onClick={() => void submit()}>
                {busy ? <Spinner /> : <ArrowRight data-icon="inline-start" />} Create and generate
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
