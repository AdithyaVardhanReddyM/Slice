"use client";

import { useMemo, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { fillMerge } from "@slice/backend/convex/emailRender";
import { EMAIL_TEMPLATES } from "@slice/backend/convex/emailTemplates";
import { googleFontsHrefs } from "@slice/backend/convex/emailThemes";
import type { EmailItem } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import type { BrandDraft } from "@/lib/email/kit";
import { brandTheme, renderDocFor, themedTemplate } from "@/lib/email/render-context";
import { itemOf, type EmailItemRow } from "@/lib/email/types";
import { Select } from "@/components/console/form";
import { EmailBrandGlyph } from "../brand-shell";
import { EmailFrame } from "../email-frame";

/**
 * The rail beside the brand editor: a real email (a template drawn in the
 * draft kit, with the brand's own items) under an inbox header showing the
 * sender, redrawn on every edit.
 */
export function EmailPreviewRail({
  draft,
  items,
  templateId,
  domain,
  className,
}: {
  draft: BrandDraft;
  items?: (EmailItem | EmailItemRow)[];
  /** The template shown first; the merchant can switch. */
  templateId: string | undefined;
  domain: string;
  className?: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const id = picked ?? templateId ?? EMAIL_TEMPLATES[0]?.id;
  const list = useMemo(() => (items ?? []).map((it) => ("_id" in it ? itemOf(it) : it)), [items]);
  const brand = useMemo(() => ({ name: draft.name || "Your brand", kit: draft.kit, footer: draft.footer }), [draft.name, draft.kit, draft.footer]);
  const doc = useMemo(() => (id ? themedTemplate(id, draft.kit, list) : null), [id, draft.kit, list]);
  const html = useMemo(() => renderDocFor(brand, doc, list), [brand, doc, list]);
  // The console loads the brand fonts too, so the inbox header and glyph match the email.
  const fonts = useMemo(() => googleFontsHrefs(brandTheme(draft.kit)), [draft.kit]);
  const merge = { brand: brand.name };
  const subject = doc ? fillMerge(doc.subject, merge, "preview") : "";
  const preheader = doc ? fillMerge(doc.preheader, merge, "preview") : "";
  const from = `${draft.sender.fromLocal || "hello"}@${domain}`;

  return (
    <section className={cn("overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_28px_-16px_rgba(20,20,20,0.10)] ring-1 ring-black/[0.05]", className)}>
      {fonts.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Preview</h2>
          <p className="truncate text-xs text-muted-foreground">A real email in your kit, redrawn as you edit</p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-neutral-100 p-0.5" role="radiogroup" aria-label="Device">
          {(
            [
              ["desktop", Monitor, "Desktop"],
              ["phone", Smartphone, "Phone"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={device === value}
              aria-label={label}
              onClick={() => setDevice(value)}
              className={cn("flex size-7 items-center justify-center rounded-full text-neutral-500 transition-colors hover:text-neutral-900", device === value && "bg-white text-neutral-900 shadow-sm")}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* The inbox line: who it is from, the subject and the preview text after it. */}
      <div className="mx-4 flex items-start gap-3 rounded-xl bg-neutral-50 p-3 ring-1 ring-black/[0.04]">
        <EmailBrandGlyph brand={{ name: brand.name, kit: draft.kit }} />
        <div className="min-w-0 flex-1 text-xs leading-relaxed">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-neutral-950">{draft.sender.fromName || brand.name}</span>
            <span className="shrink-0 text-muted-foreground">9:41</span>
          </div>
          <div className="truncate text-muted-foreground">{from}</div>
          <div className="mt-1 truncate font-medium text-neutral-900">{subject || "Subject line"}</div>
          {preheader && <div className="truncate text-muted-foreground">{preheader}</div>}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 px-4">
        <Select value={id ?? ""} onChange={(e) => setPicked(e.target.value)} aria-label="Template to preview" className="h-8 text-[13px]">
          {EMAIL_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-3 max-h-[calc(100svh-22rem)] min-h-80 overflow-y-auto border-t" style={{ background: doc?.theme.colors.backdrop }}>
        {html ? (
          device === "desktop" ? (
            <EmailFrame html={html} width={600} lazy={false} title="Email preview" />
          ) : (
            <div className="mx-auto w-[82%] py-4">
              <div className="overflow-hidden rounded-[22px] bg-white shadow-lg ring-6 ring-neutral-900">
                <EmailFrame html={html} width={375} lazy={false} title="Email preview on a phone" />
              </div>
            </div>
          )
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">The templates are loading.</p>
        )}
      </div>
      <div className="flex h-2" aria-hidden>
        {Object.values(draft.kit.colors).map((hex, i) => (
          <span key={i} className="flex-1" style={{ background: hex }} />
        ))}
      </div>
    </section>
  );
}
