"use client";

import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { GOALS, IMAGE_MODES, slugify } from "@/lib/pages/types";
import { brandDomain } from "@/lib/pages/urls";
import { Field, Input, Select } from "@/components/console/form";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface PageSettings {
  title: string;
  slug: string;
  goal: string;
  offer: string;
  ctaLabel: string;
  ctaHref: string;
  imageMode: string;
}

const URL_RE = /^https?:\/\/\S+$/i;

/**
 * Title, slug, goal, offer, CTA and image source. On a new page every field is
 * optional: whatever is left empty is decided from the first prompt.
 */
export function PageSettingsSheet({
  open,
  onOpenChange,
  initial,
  brandSlug,
  draft,
  pageId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Partial<PageSettings>;
  brandSlug: string;
  /** The page does not exist yet: empty fields mean "decide from the prompt". */
  draft?: boolean;
  /** An existing page: also lists what the builder remembers about it. */
  pageId?: Id<"pages">;
  onSave: (values: Partial<PageSettings>) => Promise<void> | void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-md">
        {/* Remount per open so the fields start from the saved values. */}
        {open && <SettingsForm initial={initial} brandSlug={brandSlug} draft={draft} pageId={pageId} onSave={onSave} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

/** The merchant's standing instructions the builder keeps for this page, each removable. */
function Remembered({ pageId }: { pageId: Id<"pages"> }) {
  const rules = useQuery(api.pages.rules, { pageId });
  const forget = useMutation(api.pages.forgetRule);
  return (
    <section className="space-y-2.5 border-t pt-5">
      <div>
        <h3 className="text-sm font-medium">What the builder remembers</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Instructions it follows in every change to this page. Ask in the chat to add one.</p>
      </div>
      {rules === undefined ? null : rules.length ? (
        <ul className="divide-y rounded-lg border">
          {rules.map((r) => (
            <li key={r.id} className="flex items-start gap-2 py-2 pr-1.5 pl-3 text-sm">
              <span className="min-w-0 flex-1 leading-6">{r.text}</span>
              <Button variant="ghost" size="icon-xs" aria-label={`Forget "${r.text}"`} onClick={() => void forget({ pageId, id: r.id })}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">Nothing yet. Say something like “always keep the hero orange” and it will remember.</p>
      )}
    </section>
  );
}

function SettingsForm({
  initial,
  brandSlug,
  draft,
  pageId,
  onSave,
  onClose,
}: {
  initial: Partial<PageSettings>;
  brandSlug: string;
  draft?: boolean;
  pageId?: Id<"pages">;
  onSave: (values: Partial<PageSettings>) => Promise<void> | void;
  onClose: () => void;
}) {
  const [v, setV] = useState<Partial<PageSettings>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof PageSettings) => (value: string) => setV((cur) => ({ ...cur, [k]: value }));
  const slug = v.slug ? slugify(v.slug) : "";
  const hrefProblem = v.ctaHref && !URL_RE.test(v.ctaHref.trim()) ? "Needs to start with http:// or https://" : null;
  const decide = draft ? "Decided from your prompt" : undefined;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...v, slug: v.slug ? slug : v.slug });
      onClose();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetHeader className="border-b p-6 pb-4">
        <SheetTitle>Page settings</SheetTitle>
        <SheetDescription>
          {draft
            ? "Set anything you already know. Whatever you leave empty is decided from your first prompt."
            : "The builder reads these on its next turn. Ask in the chat to rebuild a version with them."}
        </SheetDescription>
      </SheetHeader>
      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Title">
          <Input value={v.title ?? ""} onChange={(e) => set("title")(e.target.value)} placeholder={decide ?? "Page title"} />
        </Field>
        <Field label="Slug" hint={<span className="num">{`${brandDomain(brandSlug)}/${slug || (draft ? "…" : "")}`}</span>}>
          <Input value={v.slug ?? ""} onChange={(e) => set("slug")(e.target.value)} placeholder={decide ?? "page-slug"} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Goal">
            <Select value={v.goal ?? ""} onChange={(e) => set("goal")(e.target.value)}>
              {draft && <option value="">From the prompt</option>}
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Images">
            <Select value={v.imageMode ?? "pexels"} onChange={(e) => set("imageMode")(e.target.value)}>
              {IMAGE_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Offer" optional={!draft}>
          <Input value={v.offer ?? ""} onChange={(e) => set("offer")(e.target.value)} placeholder={decide ?? "None"} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[2fr_3fr]">
          <Field label="Button label">
            <Input value={v.ctaLabel ?? ""} onChange={(e) => set("ctaLabel")(e.target.value)} placeholder={decide ? "From the prompt" : "Shop now"} />
          </Field>
          <Field label="Button link" hint={hrefProblem}>
            <Input value={v.ctaHref ?? ""} onChange={(e) => set("ctaHref")(e.target.value)} placeholder={decide ? "From the prompt" : "https://"} aria-invalid={!!hrefProblem} />
          </Field>
        </div>
        {pageId && <Remembered pageId={pageId} />}
      </div>
      <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
        {error && <p className="mr-auto self-center text-sm text-destructive">{error}</p>}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !!hrefProblem || (!draft && (!v.title?.trim() || !v.ctaLabel?.trim() || !v.ctaHref?.trim()))}>
          {busy && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </SheetFooter>
    </>
  );
}
