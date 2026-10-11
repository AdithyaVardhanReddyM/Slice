"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { postStream } from "@/lib/pages/stream";
import { briefOf, kitOf, type Brand, type BrandBrief, type BrandKit, type Span } from "@/lib/pages/types";
import { Field, Input } from "@/components/console/form";
import { AdornedInput, Spinner } from "@/components/console/setup/atoms";
import { PageHeader } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BriefEditor, EMPTY_BRIEF } from "./brief-editor";
import { EMPTY_KIT, KitEditor } from "./kit-editor";
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

function BrandForm({ onCreated }: { onCreated: (id: Id<"pagesBrands">, url: string) => void }) {
  const create = useMutation(api.pagesBrands.create);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const full = normalizeUrl(url);
    if (!full || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await create({ name: name.trim(), url: full });
      onCreated(id, full);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Brand website</CardTitle>
          <CardDescription>Slice reads the public site: colours, type, logo, voice, products and locations. Local demo sites work too.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Website" hint="The homepage. Up to seven more pages (about, products, locations) are read from it.">
            <AdornedInput
              prefix="https://"
              value={url.replace(/^https?:\/\//i, "")}
              onChange={(e) => {
                setUrl(e.target.value);
                if (!touched) setName(guessName(e.target.value));
              }}
              placeholder="ridgeline.coffee"
              autoFocus
              required
            />
          </Field>
          <Field label="Brand name">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setTouched(true);
              }}
              placeholder="Ridgeline Coffee"
              required
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={busy || !url.trim() || !name.trim()}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Read the site
            <ArrowRight data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    </form>
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

export function BrandReview({ brand, onSaved, saveLabel = "Save and open the brand" }: { brand: Brand; onSaved?: () => void; saveLabel?: string }) {
  const updateKit = useMutation(api.pagesBrands.updateKit);
  const updateBrief = useMutation(api.pagesBrands.updateBrief);
  const markReady = useMutation(api.pagesBrands.markReady);
  const [kit, setKit] = useState<BrandKit>(() => kitOf(brand) ?? EMPTY_KIT);
  const [brief, setBrief] = useState<BrandBrief>(() => briefOf(brand) ?? EMPTY_BRIEF);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
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

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateKit({ id: brand._id, kit });
      await updateBrief({ id: brand._id, brief });
      await markReady({ id: brand._id });
      setDirty(false);
      onSaved?.();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <KitEditor
          kit={kit}
          brandName={brand.name}
          onChange={(k) => {
            setKit(k);
            setDirty(true);
          }}
        />
        <BriefEditor
          brief={brief}
          onChange={(b) => {
            setBrief(b);
            setDirty(true);
          }}
        />
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {error ? <span className="text-destructive">{error}</span> : dirty ? "Unsaved changes." : "Saved."}
          </p>
          <Button onClick={save} disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {saveLabel}
          </Button>
        </div>
      </div>
      <div className="space-y-4 xl:sticky xl:top-20">
        {brand.screenshot && (
          <Card className="overflow-hidden py-0">
            <Thumb src={brand.screenshot} className="aspect-[4/3] w-full" rounded="rounded-none [&_img]:object-top" />
          </Card>
        )}
        <QlooCard brand={brand} compact />
      </div>
    </div>
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
          title="New brand"
          description="One brand is one client of Pages. Start from its website; the kit, brief and Qloo read are yours to correct before anything is built."
        />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <BrandForm
            onCreated={(id, url) => {
              router.replace(`/dashboard/pages/new?brand=${id}`);
              void runIntake(id, url);
            }}
          />
          <Card>
            <CardHeader>
              <CardTitle>What happens next</CardTitle>
              <CardDescription>About a minute, while you watch.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {[
                  ["Read the site", "Homepage plus the about, product and location pages."],
                  ["Extract the kit", "Logo, palette, fonts, radius and button style, from the CSS."],
                  ["Write the brief", "What the brand sells, its proof, locations and items."],
                  ["Ask Qloo", "Taste tags, similar brands and demographics for the brand."],
                  ["Review", "Correct anything, then save. Audiences and pages come next."],
                ].map(([t, b], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-sm font-medium">{t}</span>
                      <p className="text-sm text-muted-foreground">{b}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
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
