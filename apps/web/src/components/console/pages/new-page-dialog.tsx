"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { AUDIENCE_KIND_LABEL, GOALS, IMAGE_MODES, slugify, type Audience, type BrandItem } from "@/lib/pages/types";
import { Field, Input, Select, Textarea } from "@/components/console/form";
import { FieldGroup, Spinner, TokenInput } from "@/components/console/setup/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBrand } from "./brand-context";
import { Hint, StatusDot, Thumb } from "./shared";

const URL_RE = /^https?:\/\/\S+$/i;

export function NewPageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const brand = useBrand();
  const router = useRouter();
  const create = useMutation(api.pages.create);
  const audiences = (useQuery(api.pagesAudiences.list, open ? { brandId: brand._id } : "skip") ?? []) as Audience[];
  const items = (brand.brief?.items ?? []) as BrandItem[];

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [goal, setGoal] = useState("launch");
  const [prompt, setPrompt] = useState("");
  const [offer, setOffer] = useState("");
  const [ctaLabel, setCtaLabel] = useState(brand.brief?.ctas?.[0] ?? "Shop now");
  const [ctaHref, setCtaHref] = useState(brand.url);
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [facts, setFacts] = useState<string[]>([]);
  const [references, setReferences] = useState<string[]>([]);
  const [inspiration, setInspiration] = useState<string[]>([]);
  const [imageMode, setImageMode] = useState("pexels");
  const [audienceIds, setAudienceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = useMemo(() => (slugTouched ? slugify(slug) : slugify(title)), [slug, slugTouched, title]);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const validUrl = (v: string) => (URL_RE.test(v) ? null : "Needs to start with http:// or https://");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await create({
        brandId: brand._id,
        title: title.trim(),
        slug: effectiveSlug,
        brief: {
          goal,
          prompt: prompt.trim(),
          offer: offer.trim() || undefined,
          cta: { label: ctaLabel.trim(), href: ctaHref.trim() },
          itemIds,
          facts,
          references,
          inspiration,
          imageMode,
        },
        audienceIds: audienceIds as Id<"pagesAudiences">[],
      });
      onOpenChange(false);
      router.push(`/dashboard/pages/${brand.slug}/${effectiveSlug}?generate=1&id=${id}`);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>The brief every version is built from. One version per audience plus a default for everyone else.</DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring single origins" autoFocus />
            </Field>
            <Field label="Slug" hint={`${brand.slug}.…/${effectiveSlug || "slug"}`}>
              <Input
                value={slugTouched ? slug : effectiveSlug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
              />
            </Field>
            <Field label="Goal">
              <Select value={goal} onChange={(e) => setGoal(e.target.value)}>
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Images" hint={IMAGE_MODES.find((m) => m.value === imageMode)?.hint}>
              <Select value={imageMode} onChange={(e) => setImageMode(e.target.value)}>
                {IMAGE_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="What the page is about" hint="In your words. The builder turns this into a hero, proof, items and a call to action for each audience.">
            <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Three new single origins from Huila, Yirgacheffe and Nyeri. We want people to try the trio bundle before the season ends." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Offer" optional>
              <Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="15% off the trio" />
            </Field>
            <Field label="CTA label">
              <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
            </Field>
            <Field label="CTA link">
              <Input value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} />
            </Field>
          </div>

          <FieldGroup label="Items to feature" aside={`${itemIds.length} of ${items.length}`} hint="Leave empty and the builder picks by taste fit.">
            {items.length === 0 ? (
              <Hint>No items in the brief. Add some in the Brand kit.</Hint>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((it) => {
                  const on = itemIds.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(itemIds, setItemIds, it.id)}
                      className={cn("flex items-center gap-3 rounded-lg border p-2 text-left transition-colors", on ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50")}
                    >
                      <Thumb src={it.image} className="size-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{it.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {it.kind}
                          {it.price ? ` · ${it.price}` : ""}
                        </span>
                      </span>
                      {on && <Check className="size-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </FieldGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Facts to include" hint="Numbers, dates, guarantees.">
              <TokenInput values={facts} onChange={setFacts} placeholder="Roasted within 48 hours of order" />
            </FieldGroup>
            <FieldGroup label="Reference sites" hint="Pages whose structure you like.">
              <TokenInput values={references} onChange={setReferences} placeholder="https://…" validate={validUrl} />
            </FieldGroup>
            <FieldGroup label="Inspiration images" hint="URLs the art direction should look at." className="sm:col-span-2">
              <TokenInput values={inspiration} onChange={setInspiration} placeholder="https://…" validate={validUrl} />
            </FieldGroup>
          </div>

          <FieldGroup label="Audiences" aside={`${audienceIds.length} selected`} hint="A default version is always built for visitors nothing else resolves.">
            {audiences.length === 0 ? (
              <Hint>No audiences yet. You can add them later; the default version is built regardless.</Hint>
            ) : (
              <ul className="divide-y rounded-lg border">
                {audiences.map((a) => {
                  const on = audienceIds.includes(a._id);
                  return (
                    <li key={a._id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                        <Checkbox checked={on} onCheckedChange={() => toggle(audienceIds, setAudienceIds, a._id)} />
                        <StatusDot status={a.status} />
                        <span className="flex-1 truncate">{a.name}</span>
                        <Badge variant="outline">{AUDIENCE_KIND_LABEL[a.kind] ?? a.kind}</Badge>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </FieldGroup>
        </div>
        <DialogFooter className="border-t p-4">
          {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !title.trim() || !prompt.trim() || !ctaLabel.trim() || !ctaHref.trim()}>
            {busy && <Spinner data-icon="inline-start" />}
            Create and build
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
