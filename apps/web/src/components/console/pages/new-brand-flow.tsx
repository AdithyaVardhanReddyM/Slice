"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Check, FileText, Palette, RotateCcw, UserStar } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { postJson, postStream } from "@/lib/pages/stream";
import { brandDomain, hostOf } from "@/lib/pages/urls";
import { briefOf, kitOf, slugify, type Brand, type BrandBrief, type BrandKit, type Span } from "@/lib/pages/types";
import { Field, Tab, TabList, TabPanel, Tabs } from "@/components/console/form";
import { AdornedInput, Spinner } from "@/components/console/setup/atoms";
import { PageHeader } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BriefFieldsEditor, BriefItemsEditor, EMPTY_BRIEF } from "./brief-editor";
import { BrowserFrame } from "./browser-frame";
import { EMPTY_KIT, KitIdentityEditor, KitVoiceEditor } from "./kit-editor";
import { KitPreview } from "./kit-preview";
import { QlooCard } from "./qloo-card";
import { ProgressLine, StatusBadge, Thumb, TraceList } from "./shared";

const STEPS = [
  { match: /homepage|fetch|reading the site/i, label: "Reading the homepage" },
  { match: /following|links|pages/i, label: "Following links" },
  { match: /colou?rs|type|fonts|extract/i, label: "Reading colours and type" },
  { match: /brief|writing/i, label: "Writing the brand brief" },
  { match: /qloo/i, label: "Asking Qloo about the brand" },
];

function normalizeUrl(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function guessName(url: string) {
  try {
    const host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
    if (/localhost|127\.0\.0\.1/.test(host)) {
      const seg = new URL(normalizeUrl(url)).pathname.split("/").filter(Boolean)[0];
      return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : "";
    }
    const label = host.split(".")[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return "";
  }
}

/* Step 1: URL + name --------------------------------------------------------- */

const OUTPUTS = [
  { icon: Palette, title: "Brand kit", body: "Logo, colours, fonts, corner radius and button style, read from the CSS." },
  { icon: FileText, title: "Brief", body: "What the brand sells, its proof points, locations and the items pages can feature." },
  { icon: UserStar, title: "Taste read", body: "Qloo's taste tags, similar brands and audience demographics for the brand." },
];

const TIMELINE = [
  { title: "Read the site", body: "The homepage, then up to seven linked pages.", time: "~15 s" },
  { title: "Extract the kit", body: "Palette, type and shape from the live CSS.", time: "~10 s" },
  { title: "Write the brief", body: "Offer, proof, locations and items.", time: "~20 s" },
  { title: "Ask Qloo", body: "Runs in the background while you review.", time: "~15 s" },
  { title: "You review", body: "Correct anything, then save the brand.", time: null },
];

function PublishPreview({ url }: { url: string }) {
  const name = guessName(url);
  const slug = name ? slugify(name) : "";
  return (
    <Card className="overflow-hidden pt-0">
      <BrowserFrame
        className="border-b"
        priority
        sizes="384px"
        domain={brandDomain(slug || "your-brand")}
        hero={
          <span className={cn("truncate px-[4%] text-[3.6cqw] font-semibold tracking-tight", !slug && "text-neutral-400")}>
            {name.trim() || "Your brand"}
          </span>
        }
      />
      <CardHeader>
        <CardTitle>Where it publishes</CardTitle>
        <CardDescription>Every page and audience version for this brand lives on its own subdomain. The name is read from the site.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Subdomain</p>
          <p className={cn("mt-0.5 text-sm break-all", slug ? "font-medium" : "text-muted-foreground")}>
            {slug ? brandDomain(slug) : "Set from the website"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Timeline() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What happens next</CardTitle>
        <CardDescription>About a minute. You watch each step as it runs.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol>
          {TIMELINE.map((step, i) => (
            <li key={step.title} className="relative flex gap-3 pb-4 last:pb-0">
              {i < TIMELINE.length - 1 && <span className="absolute top-7 bottom-1 left-3 w-px bg-border" aria-hidden />}
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{step.title}</span>
                  {step.time && <span className="text-xs text-muted-foreground">{step.time}</span>}
                </div>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Outputs() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What you will review</CardTitle>
        <CardDescription>Three drafts, all editable. The builder follows them on every page.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {OUTPUTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function BrandStart({ onCreated }: { onCreated: (id: Id<"pagesBrands">, url: string) => void }) {
  const create = useMutation(api.pagesBrands.create);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const full = normalizeUrl(url);
    if (!full) return;
    setBusy(true);
    setError(null);
    try {
      // A placeholder from the URL (it also sets the subdomain); the intake
      // swaps in the name it reads from the site.
      const { id } = await create({ name: guessName(full) || hostOf(full), url: full, nameFromSite: true });
      onCreated(id, full);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <form onSubmit={submit}>
          <Card>
            <CardHeader>
              <CardTitle>Brand website</CardTitle>
              <CardDescription>The public homepage. Slice reads the brand name from it and follows its links to the about, product and location pages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Field label="Website">
                <AdornedInput
                  className="h-10"
                  prefix={/^http:\/\//i.test(url) ? "http://" : "https://"}
                  value={url.replace(/^https?:\/\//i, "")}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="ridgeline.coffee"
                  inputMode="url"
                  spellCheck={false}
                  autoFocus
                  required
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
            <CardFooter className="justify-between gap-4">
              <p className="text-xs text-muted-foreground">Nothing is built until you have reviewed what Slice read.</p>
              <Button type="submit" size="lg" disabled={busy || !url.trim()}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Read the site
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        </form>
        <Timeline />
      </div>
      <div className="space-y-6 lg:sticky lg:top-20">
        <PublishPreview url={url} />
        <Outputs />
      </div>
    </div>
  );
}

/* Step 2: progress ------------------------------------------------------------- */

function IntakeProgress({
  brand,
  liveSpans,
  status,
  streamError,
  onRetry,
  onReview,
}: {
  brand: Brand;
  liveSpans: Span[];
  status: string | null;
  streamError: string | null;
  onRetry: () => void;
  onReview: () => void;
}) {
  const label = brand.progress?.label ?? status ?? "Starting";
  const value = brand.progress?.value ?? 0;
  const current = STEPS.findIndex((s) => s.match.test(label));
  const spans = brand.trace.length >= liveSpans.length ? brand.trace : liveSpans;
  const failed = brand.status === "failed" || !!streamError;
  const done = brand.status === "review" || brand.status === "ready";
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Reading {brand.name}</CardTitle>
            <StatusBadge status={brand.status} />
          </div>
          <CardDescription>{brand.url}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProgressLine progress={{ value: done ? 1 : value, label }} status={done ? "ready" : brand.status} error={streamError ?? brand.error} />
          <ol className="space-y-3">
            {STEPS.map((s, i) => {
              const state = done || i < current ? "done" : i === current && !failed ? "active" : "todo";
              return (
                <li key={s.label} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                      state === "done" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                      state === "active" && "border-primary/40 bg-primary/10 text-foreground",
                      state === "todo" && "text-muted-foreground",
                    )}
                  >
                    {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Spinner className="size-3.5" /> : i + 1}
                  </span>
                  <span className={cn(state === "todo" && "text-muted-foreground")}>{s.label}</span>
                </li>
              );
            })}
          </ol>
          {brand.crawled.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Pages read</p>
              <ul className="space-y-1 text-sm">
                {brand.crawled.map((u) => (
                  <li key={u} className="truncate text-muted-foreground">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <p className="text-xs text-muted-foreground">
            {failed ? "Something went wrong. Retry re-runs the intake on the same brand." : "You can review the kit as soon as it is written; Qloo keeps working in the background."}
          </p>
          <div className="flex gap-2">
            {failed && (
              <Button variant="outline" onClick={onRetry}>
                <RotateCcw data-icon="inline-start" /> Retry
              </Button>
            )}
            <Button onClick={onReview} disabled={!brand.kit}>
              Review the kit <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </CardFooter>
      </Card>
      <div className="space-y-4">
        {brand.screenshot && (
          <Card className="overflow-hidden py-0">
            <Thumb src={brand.screenshot} className="aspect-[4/3] w-full" rounded="rounded-none [&_img]:object-top" />
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Steps so far</CardTitle>
            <CardDescription>Each call the intake made, as it happens.</CardDescription>
          </CardHeader>
          <CardContent>
            <TraceList spans={spans} compact />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* Step 3: review ----------------------------------------------------------------- */

const REVIEW_TABS = [
  { value: "identity", label: "Identity" },
  { value: "voice", label: "Voice" },
  { value: "brief", label: "Brief" },
  { value: "items", label: "Items" },
  { value: "taste", label: "Taste" },
] as const;

export function BrandReview({ brand, onSaved, saveLabel = "Save and open the brand" }: { brand: Brand; onSaved?: () => void; saveLabel?: string }) {
  const updateKit = useMutation(api.pagesBrands.updateKit);
  const updateBrief = useMutation(api.pagesBrands.updateBrief);
  const markReady = useMutation(api.pagesBrands.markReady);
  const [kit, setKit] = useState<BrandKit>(() => kitOf(brand) ?? EMPTY_KIT);
  const [brief, setBrief] = useState<BrandBrief>(() => briefOf(brand) ?? EMPTY_BRIEF);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef({ kit: !!brand.kit, brief: !!brand.brief });

  // The intake may still be writing when the merchant opens the review; take
  // the first server kit/brief that arrives unless they already edited.
  useEffect(() => {
    if (!seeded.current.kit && brand.kit && !dirty) {
      setKit(kitOf(brand)!);
      seeded.current.kit = true;
    }
    if (!seeded.current.brief && brand.brief && !dirty) {
      setBrief(briefOf(brand)!);
      seeded.current.brief = true;
    }
  }, [brand, dirty]);

  const editKit = (k: BrandKit) => {
    setKit(k);
    setDirty(true);
    setJustSaved(false);
  };
  const editBrief = (b: BrandBrief) => {
    setBrief(b);
    setDirty(true);
    setJustSaved(false);
  };

  function discard() {
    setKit(kitOf(brand) ?? EMPTY_KIT);
    setBrief(briefOf(brand) ?? EMPTY_BRIEF);
    setDirty(false);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateKit({ id: brand._id, kit });
      await updateBrief({ id: brand._id, brief });
      await markReady({ id: brand._id });
      setDirty(false);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
      onSaved?.();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  // A brand still in review needs one save to become ready, edited or not.
  const needsSave = dirty || brand.status !== "ready";

  return (
    <Tabs defaultValue="identity" className="gap-6">
      <TabList>
        {REVIEW_TABS.map((t) => (
          <Tab key={t.value} value={t.value}>
            {t.label}
            {t.value === "items" && <span className="text-xs text-muted-foreground tabular-nums">{brief.items.length}</span>}
          </Tab>
        ))}
      </TabList>
      <div className="grid min-h-[calc(100svh-18rem)] items-start gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          <TabPanel value="identity">
            <KitIdentityEditor kit={kit} brandName={brand.name} onChange={editKit} />
          </TabPanel>
          <TabPanel value="voice">
            <KitVoiceEditor kit={kit} onChange={editKit} />
          </TabPanel>
          <TabPanel value="brief">
            <BriefFieldsEditor brief={brief} onChange={editBrief} />
          </TabPanel>
          <TabPanel value="items">
            <BriefItemsEditor brief={brief} onChange={editBrief} />
          </TabPanel>
          <TabPanel value="taste" className="pt-2">
            <QlooCard brand={brand} />
          </TabPanel>
        </div>
        <aside className="xl:sticky xl:top-20">
          <KitPreview
            kit={kit}
            brief={brief}
            brandName={brand.name}
            screenshot={brand.site?.screenshot ?? brand.screenshot}
            anatomy={brand.site?.anatomy}
            onRecapture={() => postJson("/api/pages/capture", { brand_id: brand._id }).then(() => undefined)}
          />
        </aside>
      </div>

      {(needsSave || justSaved) && (
        <div className="pointer-events-none sticky bottom-6 z-20 flex justify-center">
          <Card role="status" size="sm" className="pointer-events-auto flex-row items-center gap-3 px-3 shadow-lg">
            {needsSave ? (
              <>
                <span className={cn("pl-1 text-sm", error && "text-destructive")}>
                  {error ?? (dirty ? "Unsaved changes" : "Check each tab, then save")}
                </span>
                {dirty && (
                  <Button variant="ghost" onClick={discard} disabled={busy}>
                    Discard
                  </Button>
                )}
                <Button onClick={save} disabled={busy}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {saveLabel}
                </Button>
              </>
            ) : (
              <span className="flex items-center gap-2 px-1 text-sm">
                <Check className="size-4 text-emerald-600" />
                Changes saved
              </span>
            )}
          </Card>
        </div>
      )}
    </Tabs>
  );
}

/* Flow ------------------------------------------------------------------------- */

export function NewBrandFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const brandId = params.get("brand") as Id<"pagesBrands"> | null;
  const brand = useQuery(api.pagesBrands.get, brandId ? { id: brandId } : "skip");
  const [stage, setStage] = useState<"progress" | "review">("progress");
  const [liveSpans, setLiveSpans] = useState<Span[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const running = useRef<string | null>(null);

  async function runIntake(id: Id<"pagesBrands">, url: string) {
    if (running.current === id) return;
    running.current = id;
    setLiveSpans([]);
    setStreamError(null);
    setStatus("Starting");
    for await (const ev of postStream("/api/pages/intake", { brand_id: id, url })) {
      if (ev.type === "status") setStatus(ev.text);
      else if (ev.type === "span") setLiveSpans((s) => [...s, ev.span]);
      else if (ev.type === "error") setStreamError(ev.message);
      else if (ev.type === "done") setStatus("Done");
    }
    running.current = null;
  }

  // A brand opened from the list (status extracting/review) resumes here
  // without re-running the intake unless it had failed.
  useEffect(() => {
    if (brand && (brand.status === "review" || brand.status === "ready") && stage === "progress" && !running.current) {
      setStage("review");
    }
  }, [brand, stage]);

  if (!brandId) {
    return (
      <>
        <PageHeader
          title="Add a brand"
          description="Paste the brand's website. Slice reads its name and drafts its kit, brief and taste read in about a minute; nothing is used until you have reviewed it."
        />
        <BrandStart
          onCreated={(id, url) => {
            router.replace(`/dashboard/pages/new?brand=${id}`);
            void runIntake(id, url);
          }}
        />
      </>
    );
  }

  if (brand === undefined) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner /> Loading…
      </div>
    );
  }
  if (brand === null) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        This brand no longer exists.{" "}
        <Button variant="link" onClick={() => router.replace("/dashboard/pages/new")}>
          Start again
        </Button>
      </div>
    );
  }

  if (stage === "review") {
    return (
      <>
        <PageHeader
          title={`Review ${brand.name}`}
          description="Everything below was read from the site. Fix what is wrong; the builder trusts this on every page."
          actions={<StatusBadge status={brand.status} />}
        />
        <BrandReview brand={brand} onSaved={() => router.push(`/dashboard/pages/${brand.slug}`)} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="New brand" description="Reading the site. This usually takes under a minute." />
      <IntakeProgress
        brand={brand}
        liveSpans={liveSpans}
        status={status}
        streamError={streamError}
        onRetry={() => void runIntake(brand._id, brand.url)}
        onReview={() => setStage("review")}
      />
    </>
  );
}
