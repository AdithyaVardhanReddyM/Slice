"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { draftOf, senderDomain, type BrandDraft } from "@/lib/email/kit";
import { errorText } from "@/lib/email/labels";
import { templateIdFor } from "@/lib/email/render-context";
import { domainOf, type EmailBrand, type EmailItemRow } from "@/lib/email/types";
import { Tab, TabList, TabPanel, Tabs } from "@/components/console/form";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { AboutEditor, FooterEditor, IdentityEditor, SenderEditor, VoiceEditor } from "./editors";
import { ItemsCatalog } from "./items";
import { EmailPreviewRail } from "./preview-rail";

export type BrandTab = "identity" | "voice" | "about" | "footer" | "sender" | "items";

const TABS: { value: BrandTab; label: string }[] = [
  { value: "identity", label: "Identity" },
  { value: "voice", label: "Voice" },
  { value: "about", label: "About" },
  { value: "footer", label: "Footer" },
  { value: "sender", label: "Sender" },
  { value: "items", label: "Items" },
];

/**
 * The brand's kit, voice, about, footer and sender as one draft, saved
 * together, beside a live email preview. Setup's review and the Brand kit
 * screen both use it; only the kit screen has the Items tab (items save as
 * they change, not with the draft).
 */
export function BrandEditor({
  brand,
  withItems = false,
  defaultTab = "identity",
  saveLabel,
  idleLabel,
  onSaved,
  aside,
}: {
  brand: EmailBrand;
  withItems?: boolean;
  defaultTab?: BrandTab;
  saveLabel: string;
  /** Shown in the save bar when nothing changed but a save is still needed (setup). */
  idleLabel?: string;
  onSaved?: () => void;
  /** Extra content above the preview rail. */
  aside?: ReactNode;
}) {
  const update = useMutation(api.emailBrands.update);
  const markReady = useMutation(api.emailBrands.markReady);
  const items = useQuery(api.emailItems.list, { brandId: brand._id }) as EmailItemRow[] | undefined;
  const [draft, setDraft] = useState<BrandDraft>(() => draftOf(brand));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<BrandTab>(defaultTab);

  // Take the stored brand whenever it changes (the setup agent, another tab) unless the merchant has unsaved edits.
  const [seen, setSeen] = useState(brand);
  if (seen !== brand) {
    setSeen(brand);
    if (!dirty) setDraft(draftOf(brand));
  }

  const edit = (d: BrandDraft) => {
    setDraft(d);
    setDirty(true);
    setJustSaved(false);
  };

  function discard() {
    setDraft(draftOf(brand));
    setDirty(false);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await update({
        id: brand._id,
        name: draft.name.trim() || brand.name,
        kit: draft.kit,
        about: draft.about,
        footer: draft.footer,
        sender: { fromName: draft.sender.fromName.trim() || draft.name, fromLocal: draft.sender.fromLocal || "hello", ...(draft.sender.replyTo ? { replyTo: draft.sender.replyTo } : {}) },
      });
      if (brand.status !== "ready") await markReady({ id: brand._id });
      setDirty(false);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
      onSaved?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const tabs = withItems ? TABS : TABS.filter((t) => t.value !== "items");
  const needsSave = dirty || brand.status !== "ready";
  const domain = senderDomain({ ...brand, domain: domainOf(brand) });
  const previewTemplate = tab === "items" ? (templateIdFor("new arrivals") ?? templateIdFor("picked for you") ?? templateIdFor("welcome")) : templateIdFor("welcome");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as BrandTab)} className="gap-6">
      <TabList>
        {tabs.map((t) => (
          <Tab key={t.value} value={t.value}>
            {t.label}
            {t.value === "items" && items && <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>}
          </Tab>
        ))}
      </TabList>
      <div className="grid items-start gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-w-0 rounded-2xl bg-white px-6 py-2 shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_28px_-16px_rgba(20,20,20,0.10)] ring-1 ring-black/[0.05]">
          <TabPanel value="identity">
            <IdentityEditor draft={draft} onChange={edit} />
          </TabPanel>
          <TabPanel value="voice">
            <VoiceEditor draft={draft} onChange={edit} />
          </TabPanel>
          <TabPanel value="about">
            <AboutEditor draft={draft} onChange={edit} />
          </TabPanel>
          <TabPanel value="footer">
            <FooterEditor draft={draft} onChange={edit} />
          </TabPanel>
          <TabPanel value="sender">
            <SenderEditor draft={draft} onChange={edit} domain={domain} />
          </TabPanel>
          {withItems && (
            <TabPanel value="items" className="py-6">
              <ItemsCatalog brand={brand} items={items} />
            </TabPanel>
          )}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-20">
          {aside}
          <EmailPreviewRail draft={draft} items={items} templateId={previewTemplate} domain={domain} />
        </aside>
      </div>

      {(needsSave || justSaved) && (
        <div className="pointer-events-none sticky bottom-6 z-20 flex justify-center">
          <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-full bg-white py-1.5 pr-1.5 pl-4 shadow-lg ring-1 ring-black/[0.08]">
            {needsSave ? (
              <>
                <span className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}>{error ?? (dirty ? "Unsaved changes" : (idleLabel ?? "Check each tab, then save"))}</span>
                {dirty && (
                  <Button variant="ghost" className="rounded-full" onClick={discard} disabled={busy}>
                    Discard
                  </Button>
                )}
                <Button className="h-9 rounded-full px-4" onClick={save} disabled={busy}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {saveLabel}
                </Button>
              </>
            ) : (
              <span className="flex items-center gap-2 py-1.5 pr-3 text-sm">
                <Check className="size-4 text-emerald-600" />
                Changes saved
              </span>
            )}
          </div>
        </div>
      )}
    </Tabs>
  );
}
