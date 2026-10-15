"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, Check, Library, MessageSquareQuote, Palette, PenLine, RotateCcw, Signature, Type } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/pages/stream";
import { nameFromUrl } from "@/lib/pages/urls";
import { errorText } from "@/lib/email/labels";
import { renderTemplateFor, templateIdFor } from "@/lib/email/render-context";
import { aboutOf, kitOf, type EmailBrand, type EmailItemRow } from "@/lib/email/types";
import { Field, Input } from "@/components/console/form";
import { AdornedInput, Notice, Spinner } from "@/components/console/setup/atoms";
import { PageHeader, Skeleton } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmailBrandGlyph, hostOf } from "../brand-shell";
import { ComposeFrame } from "../compose-frame";
import { EmailFrame } from "../email-frame";
import { BrandEditor } from "../kit/brand-editor";

function normalizeUrl(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** What one homepage read gives the brand, in the order the agent writes it. */
const READS = [
  { icon: Signature, title: "Logo and name", body: "The mark from the header, and the name the site uses." },
  { icon: Palette, title: "Colours", body: "Background, text, buttons and accents, from the live page." },
  { icon: Type, title: "Fonts and buttons", body: "Heading and body type, button shape and corners." },
  { icon: MessageSquareQuote, title: "What you do and how you say it", body: "A summary, who it's for, and the voice of the copy." },
  { icon: PenLine, title: "Footer and sender", body: "Address, socials and a from name for your emails." },
  { icon: Library, title: "A few items", body: "Books, products or events the homepage features." },
];

/* Step 1: website (or by hand) ----------------------------------------------- */

function Start({ onStarted }: { onStarted: (id: Id<"emailBrands">, url?: string) => void }) {
  const create = useMutation(api.emailBrands.create);
  const [byHand, setByHand] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guess = byHand ? name.trim() : nameFromUrl(url);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const full = normalizeUrl(url);
    if (byHand ? !name.trim() : !full) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await create(byHand ? { name: name.trim() } : { url: full });
      onStarted(id, byHand ? undefined : full);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_30rem]">
      <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_28px_-16px_rgba(20,20,20,0.10)] ring-1 ring-black/[0.05] sm:p-8">
        {byHand ? (
          <>
            <h2 className="text-xl font-medium tracking-[-0.02em]">Set the brand up by hand</h2>
            <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">Start from a neutral kit and fill in the logo, colours, voice and footer yourself. You can add a website later.</p>
            <Field label="Brand name" className="mt-6">
              <Input className="h-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Stackhouse Books" autoFocus required />
            </Field>
          </>
        ) : (
          <>
            <h2 className="text-xl font-medium tracking-[-0.02em]">Start from your website</h2>
            <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">
              Slice reads your homepage once, about half a minute, and drafts the kit every email is built from. You review all of it before anything is used.
            </p>
            <Field label="Website" className="mt-6">
              <AdornedInput
                className="h-10"
                prefix={/^http:\/\//i.test(url) ? "http://" : "https://"}
                value={url.replace(/^https?:\/\//i, "")}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="stackhousebooks.com"
                inputMode="url"
                spellCheck={false}
                autoFocus
                required
              />
            </Field>
          </>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setByHand((v) => !v)}>
            {byHand ? "Read my website instead" : "No website? Set it up by hand"}
          </button>
          <Button type="submit" className="h-10 rounded-full px-5" disabled={busy || (byHand ? !name.trim() : !url.trim())}>
            {busy && <Spinner data-icon="inline-start" />}
            {byHand ? "Create the brand" : "Read the site"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </form>

      <aside className="space-y-5">
        <ComposeFrame
          className="rounded-3xl ring-1 ring-black/[0.05]"
          priority
          sizes="480px"
          subject={guess ? `Welcome to ${guess}` : undefined}
          bodyBackground="#ffffff"
          body={
            <span className={cn("truncate px-[4%] text-[3.6cqw] font-semibold tracking-tight", !guess && "text-neutral-400")}>{guess || "Your brand"}</span>
          }
        />
        <div className="rounded-3xl bg-white p-6 ring-1 ring-black/[0.05]">
          <h3 className="text-sm font-semibold">What Slice reads</h3>
          <ul className="mt-4 space-y-3.5">
            {READS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/* Step 2: reading ------------------------------------------------------------------ */

/** Which of the reads are done, from what has already landed on the brand (the agent writes as it goes). */
function readsDone(brand: EmailBrand, items: EmailItemRow[] | undefined, value: number) {
  const kit = kitOf(brand);
  const about = aboutOf(brand);
  return [
    !!kit?.logo || !brand.nameFromSite || value >= 0.25,
    !!kit?.colors,
    !!kit?.fonts,
    !!about?.summary || !!kit?.voice?.summary,
    !!brand.footer || !!brand.sender,
    (items?.length ?? 0) > 0 || value >= 1,
  ];
}

function Reading({
  brand,
  failed,
  error,
  stale,
  onRetry,
  onSkip,
}: {
  brand: EmailBrand;
  failed: boolean;
  error: string | null;
  stale: boolean;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const items = useQuery(api.emailItems.list, { brandId: brand._id }) as EmailItemRow[] | undefined;
  const kit = kitOf(brand);
  const progress = brand.setup?.progress;
  const value = progress?.value ?? 0;
  const done = readsDone(brand, items, value);
  const current = done.findIndex((d) => !d);
  // The welcome email fills in as the kit lands: colours, fonts, logo, footer.
  const html = renderTemplateFor(brand, templateIdFor("welcome"), items ?? []);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_28rem]">
      <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_28px_-16px_rgba(20,20,20,0.10)] ring-1 ring-black/[0.05] sm:p-8">
        <div className="flex items-center gap-3">
          <EmailBrandGlyph brand={brand} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-medium tracking-[-0.02em]">{failed ? `Couldn't finish reading ${hostOf(brand.url)}` : `Reading ${hostOf(brand.url)}`}</h2>
            <p className="truncate text-sm text-muted-foreground">{brand.name}</p>
          </div>
        </div>

        {failed ? (
          <Notice tone="bad" className="mt-6">
            {error || brand.setup?.error || "The read stopped before it finished."} Retry, or carry on with what was read and fill in the rest by hand.
          </Notice>
        ) : (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-muted-foreground">{progress?.label ?? "Opening the homepage"}</span>
              <span className="num shrink-0 text-xs text-muted-foreground">{Math.round(value * 100)}%</span>
            </div>
            <Progress value={Math.round(value * 100)} />
            {stale && <p className="text-xs text-muted-foreground">This is taking longer than usual. You can keep waiting, retry, or review what has been read so far.</p>}
          </div>
        )}

        <ol className="mt-7 space-y-3">
          {READS.map((r, i) => {
            const state = done[i] ? "done" : i === current && !failed ? "active" : "todo";
            return (
              <li key={r.title} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs",
                    state === "done" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    state === "active" && "border-neutral-300 bg-white",
                    state === "todo" && "text-muted-foreground",
                  )}
                >
                  {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Spinner className="size-3.5" /> : i + 1}
                </span>
                <span className={cn("min-w-0 flex-1", state === "todo" && "text-muted-foreground")}>{r.title}</span>
                {i === 1 && kit?.colors && (
                  <span className="flex -space-x-1">
                    {Object.values(kit.colors)
                      .slice(0, 5)
                      .map((c, j) => (
                        <span key={j} className="size-4 rounded-full ring-2 ring-white" style={{ background: c, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)" }} />
                      ))}
                  </span>
                )}
                {i === 2 && kit?.fonts && <span className="truncate text-xs text-muted-foreground">{kit.fonts.heading.family}</span>}
                {i === 5 && !!items?.length && <span className="text-xs text-muted-foreground">{items.length} found</span>}
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.05] pt-5">
          <p className="text-xs text-muted-foreground">{failed ? "Nothing is used until you review it." : "The review opens by itself when the read is done."}</p>
          <div className="flex gap-2">
            {(failed || stale) && (
              <Button variant="outline" className="rounded-full" onClick={onRetry}>
                <RotateCcw data-icon="inline-start" /> Retry
              </Button>
            )}
            <Button variant={failed ? "default" : "ghost"} className="rounded-full" onClick={onSkip}>
              {failed ? "Fill in the rest by hand" : "Review now"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </section>

      <aside
        className="relative h-[34rem] overflow-hidden rounded-3xl ring-1 ring-black/[0.05]"
        style={{ background: kit ? `radial-gradient(80% 70% at 100% 0%, color-mix(in oklab, ${kit.colors.primary} 25%, transparent), transparent 70%), ${kit.colors.accent}` : "#f1f0ec" }}
      >
        <div className="absolute inset-x-8 top-8 bottom-0 overflow-hidden rounded-t-xl bg-white shadow-2xl ring-1 shadow-black/15 ring-black/10">
          {html ? <EmailFrame html={html} width={600} thumbnail lazy={false} title="" /> : <Skeleton className="size-full rounded-none" />}
        </div>
        <span className="absolute top-4 left-4 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm">Your welcome email, as the kit comes in</span>
      </aside>
    </div>
  );
}

/* Flow ------------------------------------------------------------------------------ */

const STALE_MS = 90_000;

export function NewEmailBrandFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const brandId = params.get("brand") as Id<"emailBrands"> | null;
  const brand = useQuery(api.emailBrands.get, brandId ? { id: brandId } : "skip");
  const [skipped, setSkipped] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const started = useRef<string | null>(null);

  function read(id: Id<"emailBrands">, url: string) {
    if (started.current === id) return;
    started.current = id;
    setRequestError(null);
    // The agent writes progress, the kit and items to the brand as it goes; this only reports a failed request.
    postJson<{ ok: boolean; error?: string }>("/api/email/setup", { brandId: id, url })
      .then((r) => !r.ok && setRequestError(r.error ?? "The read stopped before it finished."))
      .catch((err) => setRequestError(errorText(err)))
      .finally(() => setRetrying(false));
  }

  const reading = brand?.setup?.status === "reading";
  useEffect(() => {
    if (!reading) return;
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, [reading]);

  if (!brandId) {
    return (
      <>
        <PageHeader title="New brand" description="One brand per business you send for: its own kit, contacts and campaigns." />
        <Start
          onStarted={(id, url) => {
            router.replace(`/dashboard/email/new?brand=${id}`);
            if (url) read(id, url);
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
        <Button variant="link" onClick={() => router.replace("/dashboard/email/new")}>
          Start again
        </Button>
      </div>
    );
  }

  const failed = !retrying && (brand.setup?.status === "failed" || (!!requestError && brand.setup?.status !== "done"));
  const stale = reading && !retrying && now - (brand.setup?.at ?? now) > STALE_MS;

  if ((reading || failed || retrying) && !skipped && brand.status !== "ready") {
    return (
      <>
        <PageHeader title="New brand" description="Reading the homepage. You review everything before it is used." />
        <Reading
          brand={brand}
          failed={failed}
          error={requestError}
          stale={stale}
          onRetry={() => {
            if (!brand.url) return;
            setRetrying(true);
            started.current = null;
            read(brand._id, brand.url);
          }}
          onSkip={() => setSkipped(true)}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Review ${brand.name}`}
        description={
          brand.url
            ? "Everything below was read from the homepage. Fix what is wrong; every email is built from it."
            : "Fill in what you can; every email is built from it. You can change any of it later in Brand kit."
        }
        actions={
          <Button variant="ghost" nativeButton={false} className="rounded-full" render={<Link href="/dashboard/email" />}>
            <ArrowLeft data-icon="inline-start" /> Finish later
          </Button>
        }
      />
      <BrandEditor
        key={brand._id}
        brand={brand}
        saveLabel="Done"
        idleLabel="Check each tab, then finish"
        onSaved={() => router.push(`/dashboard/email/${brand.slug}`)}
      />
    </>
  );
}
