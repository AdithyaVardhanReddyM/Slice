"use client";

import { useState } from "react";
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
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Partial<PageSettings>;
  brandSlug: string;
  /** The page does not exist yet: empty fields mean "decide from the prompt". */
  draft?: boolean;
  onSave: (values: Partial<PageSettings>) => Promise<void> | void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-md">
        {/* Remount per open so the fields start from the saved values. */}
        {open && <SettingsForm initial={initial} brandSlug={brandSlug} draft={draft} onSave={onSave} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function SettingsForm({
  initial,
  brandSlug,
  draft,
  onSave,
  onClose,
}: {
  initial: Partial<PageSettings>;
  brandSlug: string;
  draft?: boolean;
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
