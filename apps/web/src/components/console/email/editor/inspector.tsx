"use client";

// The inspector: everything about the selection, floating on the right of the
// canvas. Sections (background, padding, column layout, why the section says
// what it says), columns (width, alignment, fill) and each block type's own
// fields, then spacing, visibility and whether the block is a taste slot.

import {
  AlignEndVertical,
  AlignStartVertical,
  AlignCenterVertical,
  ChevronRight,
  Columns2,
  UserStar,
  Plus,
  Trash2,
  Type,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { findBlock, findColumn, findSection } from "@slice/backend/convex/emailDoc";
import { columnWidths, DEFAULT_SECTION_PADDING } from "@slice/backend/convex/emailRender";
import type {
  Box,
  EmailBlock,
  EmailColumn,
  EmailColumnInput,
  EmailDoc,
  EmailSection,
  EmailTheme,
  ItemsBlock,
  SocialNetwork,
} from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { SOCIAL_LABEL } from "@/lib/email/labels";
import { IconChoice, PanelSection, PropRow, SelectField, SliderField } from "@/components/console/pages/builder/visual/controls";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEditorEnv } from "./context";
import { AlignField, BoxField, ColorRefField, NumberField, TextInput } from "./fields";
import { ImagePicker } from "./image-picker";
import { BLOCK_ICON, BLOCK_LABEL, INLINE_TYPES, PERSONAL_TYPES, sectionName, type Selection } from "./model";
import type { EmailEditor } from "./use-email-editor";

/** Outer spacing the renderer gives a block with no padding of its own (for placeholders). */
const BLOCK_PAD: Partial<Record<EmailBlock["type"], Box>> = {
  heading: [0, 0, 12, 0],
  text: [0, 0, 16, 0],
  image: [0, 0, 16, 0],
  button: [8, 0, 16, 0],
  divider: [12, 0, 12, 0],
  items: [0, 0, 16, 0],
  social: [0, 0, 16, 0],
  quote: [0, 0, 16, 0],
  coupon: [0, 0, 16, 0],
  video: [0, 0, 16, 0],
};

const NETWORKS: SocialNetwork[] = ["instagram", "facebook", "x", "tiktok", "youtube", "linkedin", "pinterest", "threads", "website"];

/** Column layouts a section can switch between. */
const LAYOUTS: { id: string; label: string; widths: number[] }[] = [
  { id: "1", label: "One column", widths: [1] },
  { id: "2", label: "Two, equal", widths: [0.5, 0.5] },
  { id: "2a", label: "Two, narrow first", widths: [1 / 3, 2 / 3] },
  { id: "2b", label: "Two, wide first", widths: [2 / 3, 1 / 3] },
  { id: "3", label: "Three", widths: [1 / 3, 1 / 3, 1 / 3] },
];

/** A section's columns as `widths`: blocks of dropped columns move into the last one kept. */
export function relayout(section: EmailSection, widths: number[]): EmailColumnInput[] {
  const old = section.columns;
  return widths.map((w, i) => {
    const keep = old[i];
    const extra = i === widths.length - 1 ? old.slice(widths.length).flatMap((c) => c.blocks) : [];
    if (keep) return { id: keep.id, width: w, blocks: [...keep.blocks, ...extra], verticalAlign: keep.verticalAlign, background: keep.background, padding: keep.padding };
    return { width: w, blocks: [] };
  });
}

const layoutOf = (s: EmailSection) => LAYOUTS.find((l) => l.widths.length === s.columns.length && l.widths.every((w, i) => Math.abs(w - s.columns[i].width) < 0.04))?.id;

function Header({ crumbs, onClose }: { crumbs: { label: string; icon?: ReactNode; sel?: Selection }[]; onClose: () => void }) {
  const { editor } = useEditorEnv();
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b pr-2 pl-3">
      <nav aria-label="Selection" className="flex min-w-0 flex-1 items-center gap-0.5 text-xs">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && <ChevronRight className="size-3 shrink-0 text-neutral-300" />}
              <button
                type="button"
                disabled={last || !c.sel}
                onClick={() => c.sel && editor.select(c.sel)}
                className={cn("flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5", last ? "text-sm font-semibold text-neutral-900" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900")}
              >
                {c.icon}
                <span className="truncate">{c.label}</span>
              </button>
            </span>
          );
        })}
      </nav>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="text-neutral-500">
        <X />
      </Button>
    </div>
  );
}

/* Blocks ---------------------------------------------------------------------------------- */

type SetFields = (fields: Record<string, unknown>, coalesce?: string) => void;

function EditTextHint({ id }: { id: string }) {
  const { editor } = useEditorEnv();
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-2.5 py-2">
      <p className="text-[11px] leading-4 text-muted-foreground">Double-click the text on the email to type.</p>
      <Button size="xs" variant="outline" onClick={() => editor.startEditing(id)}>
        <Type data-icon="inline-start" /> Edit text
      </Button>
    </div>
  );
}

function ItemsFields({ block, set }: { block: ItemsBlock; set: SetFields }) {
  const { items, audience } = useEditorEnv();
  const toggle = (id: string) => set({ itemIds: block.itemIds.includes(id) ? block.itemIds.filter((x) => x !== id) : [...block.itemIds, id] });
  const SHOW: { key: keyof ItemsBlock["show"]; label: string }[] = [
    { key: "image", label: "Picture" },
    { key: "subtitle", label: "Author or maker" },
    { key: "price", label: "Price" },
    { key: "description", label: "Description" },
    { key: "reason", label: "Why it fits" },
    { key: "button", label: "Button" },
  ];
  return (
    <>
      <PanelSection title="Items">
        <PropRow label="Choose">
          <div role="radiogroup" className="inline-flex h-7 w-full items-center rounded-md bg-muted p-0.5">
            {(["manual", "taste"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={block.pick === p}
                onClick={() => set({ pick: p })}
                className={cn("inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-[5px] text-xs text-muted-foreground", block.pick === p && "bg-background font-medium text-foreground shadow-xs")}
              >
                {p === "taste" && <UserStar className="size-3" />}
                {p === "manual" ? "By hand" : "By taste"}
              </button>
            ))}
          </div>
        </PropRow>
        {block.pick === "taste" ? (
          <>
            <PropRow label="How many">
              <SliderField value={block.count} fallback={3} min={1} max={6} onChange={(v) => v && set({ count: v }, "count")} />
            </PropRow>
            <p className="text-[11px] leading-4 text-muted-foreground">
              {audience?.kind === "versions"
                ? "Each taste group and each person gets their own picks from their taste. Mark the block as a taste slot below."
                : "Picked from the catalogue for this audience's taste. Ask the AI chat to choose again."}
            </p>
          </>
        ) : null}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{block.pick === "taste" ? "Showing now" : "Items to show"}</p>
          <div className="scrollbar-thin max-h-56 space-y-0.5 overflow-y-auto rounded-lg border p-1">
            {items.length === 0 && <p className="p-2 text-xs text-muted-foreground">No items yet. Add them in the brand kit.</p>}
            {items.map((it) => {
              const on = block.itemIds.includes(it.id);
              const n = block.itemIds.indexOf(it.id);
              return (
                <button key={it.id} type="button" onClick={() => toggle(it.id)} className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted", on && "bg-blue-600/5")}>
                  <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {it.image && <img src={it.image} alt="" className="size-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{it.name}</span>
                    {it.subtitle && <span className="block truncate text-[11px] text-muted-foreground">{it.subtitle}</span>}
                  </span>
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold", on ? "bg-blue-600 text-white" : "ring-1 ring-foreground/20")}>{on ? n + 1 : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      </PanelSection>
      <PanelSection title="Layout">
        <PropRow label="Columns">
          <IconChoice
            value={String(block.columns) as "1" | "2" | "3"}
            onChange={(v) => v && set({ columns: Number(v) })}
            options={[
              { value: "1", label: "One", icon: <span className="text-xs">1</span> },
              { value: "2", label: "Two", icon: <span className="text-xs">2</span> },
              { value: "3", label: "Three", icon: <span className="text-xs">3</span> },
            ]}
          />
        </PropRow>
        <PropRow label="Style">
          <SelectField
            value={block.layout}
            options={[
              { value: "grid", label: "Grid" },
              { value: "list", label: "List" },
            ]}
            onChange={(v) => v && set({ layout: v })}
          />
        </PropRow>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
          {SHOW.map((s) => (
            <label key={s.key} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              {s.label}
              <Switch size="sm" checked={block.show[s.key]} onCheckedChange={(on) => set({ show: { [s.key]: on } })} />
            </label>
          ))}
        </div>
        {block.show.button && (
          <PropRow label="Button">
            <TextInput value={block.buttonLabel} onChange={(v) => set({ buttonLabel: v })} ariaLabel="Item button label" />
          </PropRow>
        )}
      </PanelSection>
    </>
  );
}

function BlockFields({ block, theme, set }: { block: EmailBlock; theme: EmailTheme; set: SetFields }) {
  const { brand } = useEditorEnv();
  switch (block.type) {
    case "heading":
      return (
        <>
          <PanelSection title="Text">
            <EditTextHint id={block.id} />
            <PropRow label="Level">
              <SelectField
                value={String(block.level)}
                options={[
                  { value: "1", label: "Title (H1)" },
                  { value: "2", label: "Heading (H2)" },
                  { value: "3", label: "Subheading (H3)" },
                ]}
                onChange={(v) => v && set({ level: Number(v) })}
              />
            </PropRow>
            <PropRow label="Font">
              <SelectField
                value={block.font ?? "heading"}
                options={[
                  { value: "heading", label: `Heading (${theme.fonts.heading.family})` },
                  { value: "body", label: `Body (${theme.fonts.body.family})` },
                ]}
                onChange={(v) => v && set({ font: v })}
              />
            </PropRow>
            <PropRow label="Size">
              <NumberField value={block.size} placeholder={block.level === 1 ? 34 : block.level === 2 ? 26 : 20} min={12} max={96} unit="px" onChange={(v) => set({ size: v ?? null })} ariaLabel="Font size" />
            </PropRow>
            <PropRow label="Weight">
              <SelectField
                value={block.weight ? String(block.weight) : undefined}
                placeholder="Theme"
                options={[300, 400, 500, 600, 700, 800].map((w) => ({ value: String(w), label: String(w) }))}
                onChange={(v) => set({ weight: v ? Number(v) : null })}
              />
            </PropRow>
            <PropRow label="Spacing">
              <NumberField value={block.letterSpacing} placeholder={0} min={-5} max={20} step={0.5} unit="px" onChange={(v) => set({ letterSpacing: v ?? null })} ariaLabel="Letter spacing" />
            </PropRow>
            <PropRow label="Capitals">
              <Switch size="sm" checked={!!block.uppercase} onCheckedChange={(on) => set({ uppercase: on || null })} aria-label="All capitals" />
            </PropRow>
            <PropRow label="Colour">
              <ColorRefField value={block.color} onChange={(c) => set({ color: c ?? null })} theme={theme} />
            </PropRow>
            <PropRow label="Align">
              <AlignField value={block.align} onChange={(a) => set({ align: a })} />
            </PropRow>
          </PanelSection>
        </>
      );
    case "text":
      return (
        <PanelSection title="Text">
          <EditTextHint id={block.id} />
          <PropRow label="Size">
            <NumberField value={block.size} placeholder={16} min={10} max={40} unit="px" onChange={(v) => set({ size: v ?? null })} ariaLabel="Font size" />
          </PropRow>
          <PropRow label="Line height">
            <SliderField value={block.lineHeight} fallback={1.6} min={1} max={2.4} step={0.05} onChange={(v) => set({ lineHeight: v }, "lineHeight")} />
          </PropRow>
          <PropRow label="Colour">
            <ColorRefField value={block.color} onChange={(c) => set({ color: c ?? null })} theme={theme} />
          </PropRow>
          <PropRow label="Align">
            <AlignField value={block.align} onChange={(a) => set({ align: a })} />
          </PropRow>
        </PanelSection>
      );
    case "button":
      return (
        <PanelSection title="Button">
          <PropRow label="Label">
            <TextInput value={block.label} onChange={(v) => set({ label: v })} ariaLabel="Button label" />
          </PropRow>
          <PropRow label="Link">
            <TextInput value={block.href === "#" ? "" : block.href} placeholder="https://…" onChange={(v) => set({ href: v.trim() || "#" })} ariaLabel="Button link" />
          </PropRow>
          <PropRow label="Style">
            <SelectField
              value={block.variant ?? "solid"}
              options={[
                { value: "solid", label: "Filled" },
                { value: "outline", label: "Outline" },
              ]}
              onChange={(v) => v && set({ variant: v })}
            />
          </PropRow>
          <PropRow label="Colour">
            <ColorRefField value={block.color} onChange={(c) => set({ color: c ?? null })} theme={theme} auto={theme.colors.primary} autoLabel="Primary" />
          </PropRow>
          <PropRow label="Label colour">
            <ColorRefField value={block.textColor} onChange={(c) => set({ textColor: c ?? null })} theme={theme} />
          </PropRow>
          <PropRow label="Size">
            <SelectField
              value={block.size ?? "md"}
              options={[
                { value: "sm", label: "Small" },
                { value: "md", label: "Medium" },
                { value: "lg", label: "Large" },
              ]}
              onChange={(v) => v && set({ size: v })}
            />
          </PropRow>
          <PropRow label="Shape">
            <SelectField
              value={block.shape}
              placeholder={`Theme (${theme.button.shape})`}
              options={[
                { value: "square", label: "Square" },
                { value: "rounded", label: "Rounded" },
                { value: "pill", label: "Pill" },
              ]}
              onChange={(v) => set({ shape: v ?? null })}
            />
          </PropRow>
          <PropRow label="Full width">
            <Switch size="sm" checked={!!block.fullWidth} onCheckedChange={(on) => set({ fullWidth: on || null })} aria-label="Full width" />
          </PropRow>
          <PropRow label="Align">
            <AlignField value={block.align} onChange={(a) => set({ align: a })} />
          </PropRow>
        </PanelSection>
      );
    case "image":
      return (
        <PanelSection title="Image">
          {block.src && (
            <div className="overflow-hidden rounded-lg bg-muted ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={block.src} alt="" className="max-h-40 w-full object-cover" />
            </div>
          )}
          {block.credit && <p className="text-[11px] text-muted-foreground">Photo: {block.credit}</p>}
          <ImagePicker current={block.src} query={block.alt} onPick={(img) => set({ src: img.src, alt: img.alt || block.alt, source: img.source, credit: img.credit ?? null })} />
          <PropRow label="Alt text">
            <TextInput value={block.alt} placeholder="What the picture shows" onChange={(v) => set({ alt: v })} ariaLabel="Alt text" />
          </PropRow>
          <PropRow label="Link">
            <TextInput value={block.href ?? ""} placeholder="https://…" onChange={(v) => set({ href: v.trim() || null })} ariaLabel="Image link" />
          </PropRow>
          <PropRow label="Width">
            <SliderField value={block.width} fallback={100} min={10} max={100} suffix="%" onChange={(v) => v && set({ width: v }, "width")} />
          </PropRow>
          <PropRow label="Corners">
            <NumberField value={block.radius} placeholder={theme.radius} min={0} max={48} unit="px" onChange={(v) => set({ radius: v ?? null })} ariaLabel="Corner radius" />
          </PropRow>
          <PropRow label="Align">
            <AlignField value={block.align} onChange={(a) => set({ align: a })} />
          </PropRow>
        </PanelSection>
      );
    case "logo":
      return (
        <PanelSection title="Logo">
          <p className="text-[11px] leading-4 text-muted-foreground">
            The logo comes from the{" "}
            <Link href={`/dashboard/email/${brand.slug}/brand`} className="underline underline-offset-2 hover:text-foreground">
              brand kit
            </Link>
            .
          </p>
          <PropRow label="Width">
            <SliderField value={block.width} fallback={150} min={40} max={400} suffix="px" onChange={(v) => v && set({ width: v }, "width")} />
          </PropRow>
          <PropRow label="Link">
            <TextInput value={block.href ?? ""} placeholder="https://…" onChange={(v) => set({ href: v.trim() || null })} ariaLabel="Logo link" />
          </PropRow>
          <PropRow label="Align">
            <AlignField value={block.align} onChange={(a) => set({ align: a })} />
          </PropRow>
        </PanelSection>
      );
    case "divider":
      return (
        <PanelSection title="Divider">
          <PropRow label="Colour">
            <ColorRefField value={block.color} onChange={(c) => set({ color: c ?? null })} theme={theme} auto={theme.colors.border} />
          </PropRow>
          <PropRow label="Thickness">
            <SliderField value={block.thickness} fallback={1} min={1} max={8} suffix="px" onChange={(v) => v && set({ thickness: v }, "thickness")} />
          </PropRow>
          <PropRow label="Width">
            <SliderField value={block.width} fallback={100} min={5} max={100} suffix="%" onChange={(v) => v && set({ width: v }, "width")} />
          </PropRow>
          <PropRow label="Line">
            <SelectField
              value={block.style}
              options={[
                { value: "solid", label: "Solid" },
                { value: "dashed", label: "Dashed" },
                { value: "dotted", label: "Dotted" },
              ]}
              onChange={(v) => v && set({ style: v })}
            />
          </PropRow>
        </PanelSection>
      );
    case "spacer":
      return (
        <PanelSection title="Spacer">
          <PropRow label="Height">
            <SliderField value={block.height} fallback={24} min={4} max={160} suffix="px" onChange={(v) => v && set({ height: v }, "height")} />
          </PropRow>
        </PanelSection>
      );
    case "items":
      return <ItemsFields block={block} set={set} />;
    case "social":
      return (
        <PanelSection title="Social links">
          {block.links.length === 0 && <p className="text-[11px] leading-4 text-muted-foreground">Empty uses the brand&apos;s own social links.</p>}
          {block.links.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <SelectField className="w-28 shrink-0" value={l.network} options={NETWORKS.map((n) => ({ value: n, label: SOCIAL_LABEL[n] }))} onChange={(v) => v && set({ links: block.links.map((x, j) => (j === i ? { ...x, network: v } : x)) })} />
              <TextInput value={l.url} placeholder="https://…" onChange={(v) => set({ links: block.links.map((x, j) => (j === i ? { ...x, url: v } : x)) })} ariaLabel={`${SOCIAL_LABEL[l.network]} link`} />
              <button type="button" onClick={() => set({ links: block.links.filter((_, j) => j !== i) })} aria-label="Remove link" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <Button size="xs" variant="outline" onClick={() => set({ links: [...block.links, { network: NETWORKS.find((n) => !block.links.some((l) => l.network === n)) ?? "website", url: "https://" }] })}>
            <Plus data-icon="inline-start" /> Add a link
          </Button>
          <PropRow label="Icons">
            <SelectField
              value={block.style}
              options={[
                { value: "dark", label: "Text colour" },
                { value: "light", label: "White" },
                { value: "brand", label: "Brand colour" },
              ]}
              onChange={(v) => v && set({ style: v })}
            />
          </PropRow>
          <PropRow label="Size">
            <SliderField value={block.size} fallback={24} min={16} max={48} suffix="px" onChange={(v) => v && set({ size: v }, "size")} />
          </PropRow>
          <PropRow label="Align">
            <AlignField value={block.align} onChange={(a) => set({ align: a })} />
          </PropRow>
        </PanelSection>
      );
    case "quote":
      return (
        <PanelSection title="Quote">
          <EditTextHint id={block.id} />
          <PropRow label="Name">
            <TextInput value={block.author ?? ""} onChange={(v) => set({ author: v.trim() || null })} ariaLabel="Who said it" />
          </PropRow>
          <PropRow label="About them">
            <TextInput value={block.role ?? ""} placeholder="Reader in Brooklyn" onChange={(v) => set({ role: v.trim() || null })} ariaLabel="About them" />
          </PropRow>
          <PropRow label="Align">
            <AlignField value={block.align} onChange={(a) => set({ align: a })} />
          </PropRow>
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Photo</p>
              {block.avatar && (
                <button type="button" onClick={() => set({ avatar: null })} className="text-xs text-muted-foreground hover:text-foreground">
                  Remove
                </button>
              )}
            </div>
            <ImagePicker current={block.avatar} landscape={false} onPick={(img) => set({ avatar: img.src })} />
          </div>
        </PanelSection>
      );
    case "coupon":
      return (
        <PanelSection title="Coupon">
          <PropRow label="Code">
            <TextInput value={block.code} onChange={(v) => set({ code: v.trim().toUpperCase() })} ariaLabel="Coupon code" />
          </PropRow>
          <PropRow label="Offer">
            <TextInput value={block.label} onChange={(v) => set({ label: v })} ariaLabel="What the coupon gives" />
          </PropRow>
          <PropRow label="Small print">
            <TextInput value={block.note ?? ""} onChange={(v) => set({ note: v.trim() || null })} ariaLabel="Small print" />
          </PropRow>
          <PropRow label="Align">
            <AlignField value={block.align} onChange={(a) => set({ align: a })} />
          </PropRow>
        </PanelSection>
      );
    case "video":
      return (
        <PanelSection title="Video">
          <PropRow label="Video link">
            <TextInput value={block.href === "#" ? "" : block.href} placeholder="https://youtube.com/…" onChange={(v) => set({ href: v.trim() || "#" })} ariaLabel="Video link" />
          </PropRow>
          <PropRow label="Alt text">
            <TextInput value={block.alt} onChange={(v) => set({ alt: v })} ariaLabel="Alt text" />
          </PropRow>
          <PropRow label="Width">
            <SliderField value={block.width} fallback={100} min={30} max={100} suffix="%" onChange={(v) => v && set({ width: v }, "width")} />
          </PropRow>
          <PropRow label="Align">
            <AlignField value={block.align} onChange={(a) => set({ align: a })} />
          </PropRow>
          <p className="pt-1 text-xs text-muted-foreground">Poster image</p>
          <ImagePicker current={block.thumbnail} query={block.alt} onPick={(img) => set({ thumbnail: img.src })} />
        </PanelSection>
      );
    case "footer":
      return (
        <PanelSection title="Footer">
          <PropRow label="Text">
            <TextInput multiline value={block.text} onChange={(v) => set({ text: v })} ariaLabel="Footer text" />
          </PropRow>
          <PropRow label="Address">
            <TextInput value={block.address ?? ""} placeholder={brand.footer?.address ?? "Postal address"} onChange={(v) => set({ address: v.trim() || null })} ariaLabel="Postal address" />
          </PropRow>
          <PropRow label="Unsubscribe">
            <TextInput value={block.unsubscribeLabel} onChange={(v) => set({ unsubscribeLabel: v.trim() || "Unsubscribe" })} ariaLabel="Unsubscribe link text" />
          </PropRow>
          <PropRow label="View online">
            <Switch size="sm" checked={!!block.viewOnline} onCheckedChange={(on) => set({ viewOnline: on || null })} aria-label="Add a View in browser link" />
          </PropRow>
          <PropRow label="Align">
            <AlignField value={block.align} onChange={(a) => set({ align: a })} />
          </PropRow>
          <p className="text-[11px] leading-4 text-muted-foreground">Every email keeps a footer with an unsubscribe link and your address; the law asks for both.</p>
        </PanelSection>
      );
  }
}

function CommonFields({ block, set }: { block: EmailBlock; set: SetFields }) {
  const { audience } = useEditorEnv();
  const personalable = PERSONAL_TYPES.has(block.type);
  return (
    <>
      <PanelSection title="Spacing and visibility" defaultOpen={false}>
        <PropRow label="Padding">
          <BoxField value={block.padding} fallback={BLOCK_PAD[block.type] ?? [0, 0, 0, 0]} onChange={(b) => set({ padding: b ?? null }, "padding")} />
        </PropRow>
        <PropRow label="Show on">
          <SelectField
            value={block.hideOn ?? "all"}
            options={[
              { value: "all", label: "Desktop and phone" },
              { value: "desktop", label: "Phone only" },
              { value: "mobile", label: "Desktop only" },
            ]}
            onChange={(v) => set({ hideOn: v === "all" || !v ? null : v })}
          />
        </PropRow>
      </PanelSection>
      {personalable && (
        <PanelSection title="Taste slot">
          <label className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <UserStar className="size-3.5 text-blue-700" /> Write it for each version
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                {audience?.kind === "versions"
                  ? "When you personalise, each group's and each person's version rewrites this block from their own taste."
                  : "Each taste group and person ticked gets a version of this block, written from their own taste."}
              </span>
            </span>
            <Switch size="sm" checked={!!block.personal} onCheckedChange={(on) => set({ personal: on || null })} aria-label="Taste slot" />
          </label>
        </PanelSection>
      )}
    </>
  );
}

/* Sections and columns ------------------------------------------------------------------------ */

function SectionFields({ section, index, theme, editor }: { section: EmailSection; index: number; theme: EmailTheme; editor: EmailEditor }) {
  const set = (fields: Record<string, unknown>, coalesce?: string) =>
    editor.apply([{ op: "update_section", id: section.id, set: fields as Partial<EmailSection> }], { coalesce: coalesce ? `${section.id}:${coalesce}` : undefined });
  const layout = layoutOf(section);
  const widths = columnWidths(section, theme);
  return (
    <>
      {section.evidence && (
        <div className="border-b px-3 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
            <UserStar className="size-3.5 text-neutral-500" /> Why this section
          </p>
          <p className="text-xs leading-5 text-muted-foreground">{section.evidence}</p>
        </div>
      )}
      <PanelSection title="Section">
        <PropRow label="Name">
          <TextInput value={section.label ?? ""} placeholder={sectionName(section, index)} onChange={(v) => set({ label: v.trim() || null })} ariaLabel="Section name" />
        </PropRow>
        <PropRow label="Background">
          <ColorRefField value={section.background} onChange={(c) => set({ background: c ?? null })} theme={theme} auto={theme.colors.surface} autoLabel="Email surface" />
        </PropRow>
        <PropRow label="Padding">
          <BoxField value={section.padding} fallback={DEFAULT_SECTION_PADDING} onChange={(b) => set({ padding: b ?? null }, "padding")} />
        </PropRow>
      </PanelSection>
      <PanelSection title="Columns">
        <div className="grid grid-cols-5 gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              title={l.label}
              aria-label={l.label}
              aria-pressed={layout === l.id}
              onClick={() => layout !== l.id && editor.apply([{ op: "set_columns", sectionId: section.id, columns: relayout(section, l.widths) }])}
              className={cn("flex h-9 items-stretch gap-0.5 rounded-md p-1 ring-1 transition-colors", layout === l.id ? "bg-blue-600/5 ring-2 ring-blue-600" : "ring-black/10 hover:ring-black/25")}
            >
              {l.widths.map((w, i) => (
                <span key={i} className={cn("rounded-[3px]", layout === l.id ? "bg-blue-600/40" : "bg-neutral-300")} style={{ flex: w }} />
              ))}
            </button>
          ))}
        </div>
        {section.columns.length > 1 && (
          <>
            <PropRow label="Gap">
              <SliderField value={section.gap} fallback={24} min={0} max={64} suffix="px" onChange={(v) => set({ gap: v }, "gap")} />
            </PropRow>
            <PropRow label="Stack on phones">
              <Switch size="sm" checked={section.stackOnMobile !== false} onCheckedChange={(on) => set({ stackOnMobile: on ? null : false })} aria-label="Stack columns on phones" />
            </PropRow>
            <div className="space-y-1 pt-1">
              {section.columns.map((c, i) => (
                <button key={c.id} type="button" onClick={() => editor.select({ kind: "column", id: c.id })} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted">
                  <Columns2 className="size-3.5 text-muted-foreground" />
                  <span className="flex-1">Column {i + 1}</span>
                  <span className="text-muted-foreground tabular-nums">{widths[i]} px</span>
                  <ChevronRight className="size-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          </>
        )}
      </PanelSection>
      <PanelSection title="Background image" defaultOpen={!!section.backgroundImage}>
        {section.backgroundImage && (
          <div className="relative overflow-hidden rounded-lg ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={section.backgroundImage} alt="" className="h-24 w-full object-cover" />
            <button type="button" onClick={() => set({ backgroundImage: null })} className="absolute top-1.5 right-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium shadow-sm hover:bg-white">
              Remove
            </button>
          </div>
        )}
        <ImagePicker current={section.backgroundImage} onPick={(img) => set({ backgroundImage: img.src })} />
        <p className="text-[11px] leading-4 text-muted-foreground">Set a background colour too: some inboxes show it instead of the photo.</p>
      </PanelSection>
    </>
  );
}

function ColumnFields({ column, section, theme, editor }: { column: EmailColumn; section: EmailSection; theme: EmailTheme; editor: EmailEditor }) {
  const set = (fields: Record<string, unknown>, coalesce?: string) => editor.apply([{ op: "update_column", id: column.id, set: fields as Partial<EmailColumn> }], { coalesce: coalesce ? `${column.id}:${coalesce}` : undefined });
  return (
    <PanelSection title="Column">
      {section.columns.length > 1 && (
        <PropRow label="Width">
          <SliderField value={Math.round(column.width * 100)} fallback={50} min={10} max={90} suffix="%" onChange={(v) => v && set({ width: v / 100 }, "width")} />
        </PropRow>
      )}
      <PropRow label="Align">
        <IconChoice
          value={column.verticalAlign ?? "top"}
          onChange={(v) => v && set({ verticalAlign: v })}
          options={[
            { value: "top", label: "Top", icon: <AlignStartVertical /> },
            { value: "middle", label: "Middle", icon: <AlignCenterVertical /> },
            { value: "bottom", label: "Bottom", icon: <AlignEndVertical /> },
          ]}
        />
      </PropRow>
      <PropRow label="Background">
        <ColorRefField value={column.background} onChange={(c) => set({ background: c ?? null })} theme={theme} autoLabel="Section's" />
      </PropRow>
      <PropRow label="Padding">
        <BoxField value={column.padding} fallback={[0, 0, 0, 0]} onChange={(b) => set({ padding: b ?? null }, "padding")} />
      </PropRow>
    </PanelSection>
  );
}

/* The panel ------------------------------------------------------------------------------------ */

export function Inspector() {
  const { editor, previewAs } = useEditorEnv();
  const sel = editor.selection;
  const doc = editor.doc as EmailDoc;
  if (!sel || editor.locked || previewAs) return null;
  const theme = doc.theme;
  const close = () => editor.select(null);

  let crumbs: { label: string; icon?: ReactNode; sel?: Selection }[] = [];
  let body: ReactNode = null;
  if (sel.kind === "block") {
    const f = findBlock(doc, sel.id);
    if (!f) return null;
    const si = doc.sections.indexOf(f.section);
    const set: SetFields = (fields, coalesce) => editor.apply([{ op: "update_block", id: f.block.id, set: fields as Partial<EmailBlock> }], { coalesce: coalesce ? `${f.block.id}:${coalesce}` : undefined });
    const Icon = BLOCK_ICON[f.block.type];
    crumbs = [
      { label: sectionName(f.section, si), sel: { kind: "section", id: f.section.id } },
      ...(f.section.columns.length > 1 ? [{ label: `Column ${f.section.columns.indexOf(f.column) + 1}`, sel: { kind: "column" as const, id: f.column.id } }] : []),
      { label: BLOCK_LABEL[f.block.type], icon: <Icon className="size-3.5" /> },
    ];
    body = (
      <>
        <BlockFields key={f.block.id} block={f.block} theme={theme} set={set} />
        <CommonFields block={f.block} set={set} />
        {INLINE_TYPES.has(f.block.type) && <p className="px-3 py-3 text-[11px] leading-4 text-muted-foreground">Press Enter to type in the selected text, Esc to finish.</p>}
      </>
    );
  } else if (sel.kind === "section") {
    const f = findSection(doc, sel.id);
    if (!f) return null;
    crumbs = [{ label: sectionName(f.section, f.index) }];
    body = <SectionFields key={f.section.id} section={f.section} index={f.index} theme={theme} editor={editor} />;
  } else {
    const f = findColumn(doc, sel.id);
    if (!f) return null;
    const si = doc.sections.indexOf(f.section);
    crumbs = [{ label: sectionName(f.section, si), sel: { kind: "section", id: f.section.id } }, { label: `Column ${f.index + 1}` }];
    body = <ColumnFields column={f.column} section={f.section} theme={theme} editor={editor} />;
  }

  return (
    <aside
      aria-label="Inspector"
      onClick={(e) => e.stopPropagation()}
      className="absolute top-2 right-2 bottom-2 z-30 flex w-[18.5rem] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.08] animate-in fade-in-0 slide-in-from-right-3 duration-200"
    >
      <Header crumbs={crumbs} onClose={close} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
    </aside>
  );
}
