"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, Check, Globe, RotateCcw, Sparkles } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import { Badge, Panel, PanelHeader } from "@/components/console/primitives";
import { Field, Input, Segmented, Select, Textarea } from "@/components/console/form";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { errorText, startAgentJob } from "@/lib/pages/client";
import { cn } from "@/lib/utils";
import { AgeSkew, BrandLogo, EntityChips, Swatch, TagCloud, TraceList } from "./atoms";

// Create a page in three steps: read the website into a brand kit (agent +
// Qloo), check the kit, then write the brief. Generation runs on the agent
// and the editor shows its progress.

type Brand = Doc<"brands">;
type Kit = NonNullable<Brand["kit"]>;
type Goal = "leads" | "sales" | "signup" | "booking";

const GOALS: { value: Goal; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "leads", label: "Leads" },
  { value: "signup", label: "Sign-ups" },
  { value: "booking", label: "Bookings" },
];
const CTA_DEFAULT: Record<Goal, string> = {
  sales: "Shop now",
  leads: "Get in touch",
  signup: "Sign up",
  booking: "Book now",
};

export function NewPageFlow() {
  const { isLoading } = useConvexAuth();
  const [brandId, setBrandId] = useState<Id<"brands"> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const brands = useQuery(api.brands.list, isLoading ? "skip" : {});
  const brand = useQuery(api.brands.get, brandId ? { id: brandId } : "skip");

  const step = !brandId || !brand ? 0 : brand.status !== "ready" || !confirmed ? 1 : 2;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <Steps step={step} />
      {step === 0 ? (
        <BrandStep brands={brands ?? []} pending={!!brandId && brand === undefined} onBrand={setBrandId} />
      ) : step === 1 && brand ? (
        <KitStep
          brand={brand}
          onBack={() => setBrandId(null)}
          onConfirm={() => setConfirmed(true)}
        />
      ) : brand?.kit ? (
        <BriefStep brand={brand} kit={brand.kit} onBack={() => setConfirmed(false)} />
      ) : null}
    </div>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ["Your website", "Brand & audience", "Brief"];
  return (
    <ol className="mb-8 flex items-center gap-3 text-sm">
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-xs font-medium",
              i < step ? "bg-foreground text-background" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {i < step ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={i === step ? "font-medium" : "text-muted-foreground"}>{label}</span>
          {i < labels.length - 1 ? <span className="h-px w-8 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
}

/* Step 1: the website ------------------------------------------------------ */

function BrandStep({
  brands,
  pending,
  onBrand,
}: {
  brands: Brand[];
  pending: boolean;
  onBrand: (id: Id<"brands">) => void;
}) {
  const create = useMutation(api.brands.create);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await create({ url });
      startAgentJob("/api/pages/brand", { brandId: id }, setError);
      onBrand(id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const ready = brands.filter((b) => b.status === "ready" && b.kit);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">What&apos;s your website?</h1>
        <p className="text-sm text-muted-foreground">
          Slice reads your logo, colours, fonts and voice from it, then asks Qloo what else your audience loves.
        </p>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourbrand.com"
            className="h-10 pl-8"
            inputMode="url"
            maxLength={2048}
          />
        </div>
        <Button type="submit" size="lg" disabled={busy || pending || !url.trim()}>
          {busy || pending ? <Spinner /> : <Sparkles />}
          Read my brand
        </Button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {ready.length ? (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Or use a brand you&apos;ve already read</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {ready.map((b) => (
              <button
                key={b._id}
                type="button"
                onClick={() => onBrand(b._id)}
                className="flex items-center gap-3 rounded-xl p-3 text-left ring-1 ring-foreground/10 transition hover:ring-foreground/30"
              >
                {b.kit ? <BrandLogo kit={b.kit} className="h-7 max-w-[90px]" /> : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{b.kit?.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{b.domain}</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* Step 2: the kit and audience --------------------------------------------- */

function KitStep({ brand, onBack, onConfirm }: { brand: Brand; onBack: () => void; onConfirm: () => void }) {
  const restart = useMutation(api.brands.restart);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setError(null);
    try {
      await restart({ id: brand._id });
      startAgentJob("/api/pages/brand", { brandId: brand._id }, setError);
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (brand.status !== "ready" || !brand.kit) {
    const failed = brand.status === "failed";
    return (
      <Panel>
        <PanelHeader
          title={failed ? `Couldn't read ${brand.domain}` : `Reading ${brand.domain}`}
          hint={failed ? brand.error : (brand.progress ?? "Starting") + "…"}
          actions={
            failed ? (
              <>
                <Button variant="outline" onClick={onBack}>
                  <ArrowLeft />
                  Different site
                </Button>
                <Button onClick={retry}>
                  <RotateCcw />
                  Try again
                </Button>
              </>
            ) : (
              <Spinner />
            )
          }
        />
        <div className="space-y-3 p-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <TraceList spans={brand.trace} />
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <KitEditor key={brand.updatedAt} brand={brand} kit={brand.kit} />
      <Panel>
        <PanelHeader
          title="Your audience, according to Qloo"
          hint={
            brand.taste?.qlooBrand
              ? `Matched ${brand.taste.qlooBrand.name} plus the culture your site points at`
              : "Read from the culture your site points at"
          }
        />
        <div className="grid gap-6 p-4 md:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Taste seeds</h3>
              <EntityChips entities={brand.taste?.entities ?? []} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What they&apos;re into</h3>
              <TagCloud tags={brand.taste?.tags ?? []} />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Age skew</h3>
            <AgeSkew demographics={brand.taste?.demographics} />
          </div>
        </div>
      </Panel>
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <Button onClick={onConfirm}>
          Looks right
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function KitEditor({ brand, kit }: { brand: Brand; kit: Kit }) {
  const updateKit = useMutation(api.brands.updateKit);
  const [draft, setDraft] = useState(kit);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(kit);

  async function save() {
    setError(null);
    try {
      await updateKit({ id: brand._id, kit: draft });
    } catch (err) {
      setError(errorText(err));
    }
  }

  const color = (key: "primary" | "accent" | "background" | "text") => (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="color"
        value={draft.colors[key]}
        onChange={(e) => setDraft({ ...draft, colors: { ...draft.colors, [key]: e.target.value } })}
        className="size-7 cursor-pointer rounded-md border-0 bg-transparent p-0"
      />
      <span className="capitalize text-muted-foreground">{key}</span>
    </label>
  );

  return (
    <Panel>
      <PanelHeader
        title="Brand kit"
        hint={`Read from ${brand.domain}`}
        actions={
          dirty ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDraft(kit)}>
                Reset
              </Button>
              <Button size="sm" onClick={save}>
                Save
              </Button>
            </>
          ) : (
            <Badge tone="ok">Saved</Badge>
          )
        }
      />
      <div className="grid gap-6 p-4 md:grid-cols-[220px_1fr]">
        <div
          className="flex flex-col items-start gap-3 rounded-lg p-4"
          style={{ background: draft.colors.background, color: draft.colors.text }}
        >
          <BrandLogo kit={draft} className="h-9" />
          <span className="text-lg leading-tight font-semibold">{draft.name}</span>
          <span className="text-xs opacity-80">{draft.tagline}</span>
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: draft.colors.primary, color: draft.colors.background }}
          >
            Get started
          </span>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Tagline">
              <Input
                value={draft.tagline}
                maxLength={160}
                onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4">
            {color("primary")}
            {color("accent")}
            {color("background")}
            {color("text")}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {draft.colors.palette.slice(0, 6).map((c) => (
              <Swatch key={c} color={c} />
            ))}
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <span>
              <span className="text-muted-foreground">Headings </span>
              {draft.fonts.heading ?? "System"}
            </span>
            <span>
              <span className="text-muted-foreground">Body </span>
              {draft.fonts.body ?? "System"}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {draft.voice.tone.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{draft.voice.summary}</p>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </Panel>
  );
}

/* Step 3: the brief -------------------------------------------------------- */

function BriefStep({ brand, kit, onBack }: { brand: Brand; kit: Kit; onBack: () => void }) {
  const router = useRouter();
  const create = useMutation(api.pages.create);
  const stores = useQuery(api.catalog.stores, {});
  const [goal, setGoal] = useState<Goal>("sales");
  const [form, setForm] = useState({
    name: `${kit.name} — ${kit.offer || "launch"}`.slice(0, 80),
    offer: kit.offer,
    audience: kit.audience,
    ctaLabel: CTA_DEFAULT.sales,
    ctaUrl: brand.url,
    notes: "",
    storeKey: "",
  });
  const [segments, setSegments] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await create({
        brandId: brand._id,
        name: form.name,
        goal,
        offer: form.offer,
        audience: form.audience || undefined,
        ctaLabel: form.ctaLabel,
        ctaUrl: form.ctaUrl,
        notes: form.notes || undefined,
        storeKey: form.storeKey || undefined,
        segmentCount: Number(segments),
      });
      startAgentJob("/api/pages/generate", { pageId: id }, () => {});
      router.push(`/dashboard/pages/${id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Panel>
        <PanelHeader title="The brief" hint="What the page is for. Slice writes every variant from this." />
        <div className="grid gap-5 p-4 sm:grid-cols-2">
          <Field label="Page name" className="sm:col-span-2">
            <Input required maxLength={80} value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Goal" className="sm:col-span-2">
            <Segmented
              value={goal}
              onChange={(g) => {
                setGoal(g);
                if (Object.values(CTA_DEFAULT).includes(form.ctaLabel)) setForm({ ...form, ctaLabel: CTA_DEFAULT[g] });
              }}
              options={GOALS}
            />
          </Field>
          <Field label="What are you promoting?" className="sm:col-span-2" hint="A product, a collection, an offer or a launch.">
            <Textarea required minLength={10} maxLength={600} rows={3} value={form.offer} onChange={set("offer")} />
          </Field>
          <Field label="Who it's for" optional className="sm:col-span-2" hint="Qloo finds the taste segments; this just steers them.">
            <Input maxLength={300} value={form.audience} onChange={set("audience")} />
          </Field>
          <Field label="Button label">
            <Input required maxLength={40} value={form.ctaLabel} onChange={set("ctaLabel")} />
          </Field>
          <Field label="Button link">
            <Input required type="url" maxLength={2048} value={form.ctaUrl} onChange={set("ctaUrl")} />
          </Field>
          <Field label="Taste segments" hint="One variant per segment, plus a default for everyone else.">
            <Segmented
              value={segments}
              onChange={setSegments}
              options={[
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "4", label: "4" },
              ]}
            />
          </Field>
          <Field label="Products" optional hint="Feature catalog products that match each segment.">
            <Select value={form.storeKey} onChange={set("storeKey")}>
              <option value="">None</option>
              {(stores ?? []).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Anything else?" optional className="sm:col-span-2" hint="Must-say facts, words to avoid, the season.">
            <Textarea maxLength={600} rows={2} value={form.notes} onChange={set("notes")} />
          </Field>
        </div>
      </Panel>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Spinner /> : <Sparkles />}
          Generate page
        </Button>
      </div>
    </form>
  );
}
