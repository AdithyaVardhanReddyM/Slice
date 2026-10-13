"use client";
"use no memo";
// Values are read from the live canvas DOM (computed styles, attributes) on every render, so the compiler must not cache them.

// The visual editor's right panel: everything about the selected element.
// Content first (text, link, picture), then layout, spacing, size, position,
// type, fill, border, effects and motion. Each value is what the merchant set
// by hand for the current scope (every screen, phones, or hover), with the
// page's own value greyed out behind it.

import {
  AlignCenter,
  AlignCenterVertical,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Baseline,
  CaseLower,
  CaseSensitive,
  CaseUpper,
  ChevronDown,
  ChevronUp,
  Copy,
  CornerLeftUp,
  Italic,
  Monitor,
  Play,
  RotateCcw,
  Smartphone,
  Strikethrough,
  StretchVertical,
  Trash2,
  Type,
  Underline,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BrandKit } from "@slice/backend/convex/pagesTypes";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ColorField, IconChoice, LengthField, PanelSection, PropRow, SelectField, SliderField, TextField, toHex, useScrub, type Swatch } from "./controls";
import { BoxModel } from "./controls";
import { KindIcon } from "./layers";
import { PG_ID, isPlainText, isTextual, kindOf } from "./model";
import type { VisualEditor } from "./use-visual-editor";

/* Shared reads ------------------------------------------------------------------- */

type Get = (prop: string) => { value: string | undefined; computed: string };

function readsOf(ed: VisualEditor, el: Element) {
  const cs = ed.win!.getComputedStyle(el);
  const rec = ed.recordOf(el);
  const get: Get = (prop) => ({ value: rec?.[ed.scope]?.[prop], computed: cs.getPropertyValue(prop).trim() });
  const isSet = (...props: string[]) => props.some((p) => rec?.[ed.scope]?.[p] !== undefined);
  const one = (prop: string) => (v: string | null) => ed.setStyle({ [prop]: v });
  return { cs, rec, get, isSet, one };
}

/** A length row: field, label scrub, reset. */
function LengthRow({ label, prop, get, set, unit = "px", step = 1, min, max }: { label: string; prop: string; get: Get; set: (p: Record<string, string | null>) => void; unit?: string; step?: number; min?: number; max?: number }) {
  const { value, computed } = get(prop);
  const onChange = (v: string | null) => set({ [prop]: v });
  const scrub = useScrub(value, computed, onChange, { unit, step, min, max });
  return (
    <PropRow label={label} set={value !== undefined} onReset={() => onChange(null)} onScrub={scrub}>
      <LengthField value={value} placeholder={computed} onChange={onChange} unit={unit} step={step} min={min} max={max} ariaLabel={label} />
    </PropRow>
  );
}

function Pair({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-2 gap-y-2 [&>*]:grid-cols-[3.4rem_minmax(0,1fr)]">{children}</div>;
}

/* Kit and page colours ---------------------------------------------------------------- */

const TOKENS: [string, string][] = [
  ["Primary", "--pg-brand-primary"],
  ["On primary", "--pg-brand-primary-fg"],
  ["Accent", "--pg-brand-accent"],
  ["Background", "--pg-brand-bg"],
  ["Text", "--pg-brand-fg"],
  ["Muted", "--pg-brand-muted"],
  ["Surface", "--pg-brand-surface"],
];

function usePalette(ed: VisualEditor): { brand: Swatch[]; page: Swatch[] } {
  const { win, root, ready } = ed;
  return useMemo(() => {
    if (!win || !root || !ready) return { brand: [], page: [] };
    const rs = win.getComputedStyle(root);
    const brand = TOKENS.map(([label, v]) => ({ label, value: `var(${v})`, color: rs.getPropertyValue(v).trim() })).filter((s) => s.color);
    const seen = new Set(brand.map((s) => toHex(s.color) ?? s.color));
    const counts = new Map<string, number>();
    for (const el of [...root.querySelectorAll(".pg-page-body *")].slice(0, 1500)) {
      const cs = win.getComputedStyle(el);
      for (const c of [cs.color, cs.backgroundColor]) {
        const hex = toHex(c);
        if (!hex || hex.length === 9 || seen.has(hex)) continue;
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
    }
    const page = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([hex]) => ({ label: hex, value: hex, color: hex }));
    return { brand, page };
    // Read once the canvas is up; the page's colours do not move while editing.
  }, [win, root, ready]);
}

/* Sections ---------------------------------------------------------------------------- */

function ContentSection({ ed, el, photos }: { ed: VisualEditor; el: Element; photos: { src: string; alt: string }[] }) {
  const tag = el.tagName.toUpperCase();
  const textual = isTextual(el);
  const plain = isPlainText(el);
  const isLink = tag === "A";
  const isImage = tag === "IMG";
  const rec = ed.recordOf(el);
  if (!textual && !isLink && !isImage) return null;
  const { get, one } = readsOf(ed, el);
  return (
    <PanelSection title="Content" set={rec?.text !== undefined || rec?.src !== undefined || rec?.href !== undefined}>
      {plain ? (
        <div className="space-y-1">
          <TextField key={`${ed.rev}-${el.getAttribute(PG_ID)}`} multiline value={el.textContent ?? ""} onCommit={(v) => ed.setText(v ?? "")} ariaLabel="Text" />
          <p className="text-[11px] text-muted-foreground">Or double-click the text on the page to type in place.</p>
        </div>
      ) : textual ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Double-click the text on the page to type in place.</p>
          <Button size="xs" variant="outline" onClick={ed.editText}>
            <Type data-icon="inline-start" /> Edit text
          </Button>
        </div>
      ) : null}
      {isLink && (
        <>
          <PropRow label="Link" set={rec?.href !== undefined}>
            <TextField value={el.getAttribute("href") ?? ""} placeholder="https://…" onCommit={(v) => ed.setAttr("href", v ?? "")} ariaLabel="Link" />
          </PropRow>
          <PropRow label="New tab">
            <Switch size="sm" checked={el.getAttribute("target") === "_blank"} onCheckedChange={(on) => ed.setAttr("target", on ? "_blank" : null)} aria-label="Open in a new tab" />
          </PropRow>
        </>
      )}
      {isImage && (
        <>
          <div className="overflow-hidden rounded-md border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={el.getAttribute("src") ?? ""} alt="" className="aspect-video w-full object-cover" />
          </div>
          <PropRow label="Image URL" set={rec?.src !== undefined}>
            <TextField value={el.getAttribute("src") ?? ""} placeholder="https://…" onCommit={(v) => v && ed.setAttr("src", v)} ariaLabel="Image URL" />
          </PropRow>
          {photos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{"From the brand's site"}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {photos.slice(0, 12).map((p) => (
                  <button
                    key={p.src}
                    type="button"
                    title={p.alt || "Use this photo"}
                    onClick={() => {
                      ed.setAttr("src", p.src);
                      if (p.alt && !el.getAttribute("alt")) ed.setAttr("alt", p.alt);
                    }}
                    className={cn("aspect-square overflow-hidden rounded-md bg-muted ring-offset-1", el.getAttribute("src") === p.src ? "ring-2 ring-blue-600" : "hover:ring-1 hover:ring-foreground/30")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt="" loading="lazy" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <PropRow label="Alt text">
            <TextField value={el.getAttribute("alt") ?? ""} placeholder="What the picture shows" onCommit={(v) => ed.setAttr("alt", v ?? "")} ariaLabel="Alt text" />
          </PropRow>
          <PropRow label="Fit" set={get("object-fit").value !== undefined} onReset={() => one("object-fit")(null)}>
            <SelectField
              value={get("object-fit").value}
              placeholder={get("object-fit").computed}
              onChange={one("object-fit")}
              options={[
                { value: "cover", label: "Fill the frame" },
                { value: "contain", label: "Show it all" },
                { value: "fill", label: "Stretch" },
                { value: "none", label: "Original size" },
              ]}
            />
          </PropRow>
          <PropRow label="Focus" set={get("object-position").value !== undefined} onReset={() => one("object-position")(null)}>
            <SelectField
              value={get("object-position").value}
              placeholder={get("object-position").computed}
              onChange={one("object-position")}
              options={[
                { value: "center", label: "Centre" },
                { value: "top", label: "Top" },
                { value: "bottom", label: "Bottom" },
                { value: "left", label: "Left" },
                { value: "right", label: "Right" },
              ]}
            />
          </PropRow>
        </>
      )}
    </PanelSection>
  );
}

const DISPLAY = [
  { value: "block", label: "Block" },
  { value: "flex", label: "Flex (row or stack)" },
  { value: "grid", label: "Grid" },
  { value: "inline-block", label: "Inline block" },
  { value: "inline", label: "Inline" },
  { value: "inline-flex", label: "Inline flex" },
  { value: "none", label: "Hidden" },
];

function LayoutSection({ ed, el }: { ed: VisualEditor; el: Element }) {
  const { cs, get, isSet, one } = readsOf(ed, el);
  const set = ed.setStyle;
  const display = get("display").value ?? cs.display;
  const flex = display.includes("flex");
  const grid = display.includes("grid");
  const parent = el.parentElement ? ed.win!.getComputedStyle(el.parentElement) : null;
  const inFlex = !!parent && parent.display.includes("flex");
  const inGrid = !!parent && parent.display.includes("grid");
  const hidden = display === "none";
  const cols = (get("grid-template-columns").value ?? cs.gridTemplateColumns).match(/repeat\((\d+)/)?.[1] ?? String(cs.gridTemplateColumns.split(" ").filter(Boolean).length || "");
  const hideLabel = "Hide";
  return (
    <PanelSection title="Layout" set={isSet("display", "flex-direction", "flex-wrap", "justify-content", "align-items", "gap", "grid-template-columns", "align-self", "flex", "order", "grid-column")}>
      <PropRow label={hideLabel} set={get("display").value === "none"}>
        <Switch
          size="sm"
          checked={hidden}
          onCheckedChange={(on) => {
            if (on) return one("display")("none");
            // Hidden by their own setting here: drop it. Hidden by the page or by the every-screen
            // setting: show it the way the page lays it out.
            if (get("display").value === "none") return one("display")(null);
            const natural = ed.pageValue(el, "display");
            one("display")(natural && natural !== "none" ? natural : "block");
          }}
          aria-label={hideLabel}
        />
      </PropRow>
      {!hidden && (
        <PropRow label="Display" set={get("display").value !== undefined} onReset={() => one("display")(null)}>
          <SelectField value={get("display").value} placeholder={cs.display} options={DISPLAY} onChange={one("display")} ariaLabel="Display" />
        </PropRow>
      )}
      {flex && !hidden && (
        <>
          <PropRow label="Direction" set={isSet("flex-direction")} onReset={() => one("flex-direction")(null)}>
            <IconChoice
              value={get("flex-direction").value as "row" | "column" | undefined}
              fallback={cs.flexDirection}
              onChange={one("flex-direction")}
              options={[
                { value: "row", label: "In a row", icon: <ArrowRight /> },
                { value: "column", label: "Stacked", icon: <ArrowDown /> },
                { value: "row-reverse", label: "Row, reversed", icon: <ArrowRight className="rotate-180" /> },
                { value: "column-reverse", label: "Stack, reversed", icon: <ArrowUp /> },
              ]}
            />
          </PropRow>
          <PropRow label="Distribute" set={isSet("justify-content")} onReset={() => one("justify-content")(null)}>
            <SelectField
              value={get("justify-content").value}
              placeholder={cs.justifyContent}
              onChange={one("justify-content")}
              options={[
                { value: "flex-start", label: "Start" },
                { value: "center", label: "Centre" },
                { value: "flex-end", label: "End" },
                { value: "space-between", label: "Space between" },
                { value: "space-around", label: "Space around" },
                { value: "space-evenly", label: "Space evenly" },
              ]}
            />
          </PropRow>
          <PropRow label="Align" set={isSet("align-items")} onReset={() => one("align-items")(null)}>
            <IconChoice
              value={get("align-items").value as string | undefined}
              fallback={cs.alignItems === "normal" ? "stretch" : cs.alignItems}
              onChange={one("align-items")}
              options={[
                { value: "flex-start", label: "Start", icon: <AlignStartVertical /> },
                { value: "center", label: "Centre", icon: <AlignCenterVertical /> },
                { value: "flex-end", label: "End", icon: <AlignEndVertical /> },
                { value: "stretch", label: "Stretch", icon: <StretchVertical /> },
                { value: "baseline", label: "Text baseline", icon: <Baseline /> },
              ]}
            />
          </PropRow>
          <PropRow label="Wrap" set={isSet("flex-wrap")} onReset={() => one("flex-wrap")(null)}>
            <Switch size="sm" checked={(get("flex-wrap").value ?? cs.flexWrap) === "wrap"} onCheckedChange={(on) => one("flex-wrap")(on ? "wrap" : "nowrap")} aria-label="Wrap onto new lines" />
          </PropRow>
          <LengthRow label="Gap" prop="gap" get={get} set={set} min={0} />
        </>
      )}
      {grid && !hidden && (
        <>
          <PropRow label="Columns" set={isSet("grid-template-columns")} onReset={() => one("grid-template-columns")(null)}>
            <LengthField
              value={get("grid-template-columns").value ? cols : undefined}
              placeholder={cols}
              unit=""
              min={1}
              max={12}
              onChange={(v) => {
                const n = parseInt(v ?? "", 10);
                one("grid-template-columns")(Number.isFinite(n) && n > 0 ? `repeat(${Math.min(12, n)}, minmax(0, 1fr))` : null);
              }}
              ariaLabel="Columns"
            />
          </PropRow>
          <LengthRow label="Gap" prop="gap" get={get} set={set} min={0} />
          <PropRow label="Align" set={isSet("align-items")} onReset={() => one("align-items")(null)}>
            <IconChoice
              value={get("align-items").value as string | undefined}
              fallback={cs.alignItems === "normal" ? "stretch" : cs.alignItems}
              onChange={one("align-items")}
              options={[
                { value: "start", label: "Top", icon: <AlignStartVertical /> },
                { value: "center", label: "Centre", icon: <AlignCenterVertical /> },
                { value: "end", label: "Bottom", icon: <AlignEndVertical /> },
                { value: "stretch", label: "Stretch", icon: <StretchVertical /> },
              ]}
            />
          </PropRow>
        </>
      )}
      {(inFlex || inGrid) && !hidden && (
        <>
          <p className="pt-1 text-[11px] text-muted-foreground">Inside its {inGrid ? "grid" : "row"}</p>
          {inFlex && (
            <PropRow label="Size" set={isSet("flex")} onReset={() => one("flex")(null)}>
              <SelectField
                value={get("flex").value}
                placeholder={cs.flexGrow !== "0" ? "Fill space" : "Fit content"}
                onChange={one("flex")}
                options={[
                  { value: "0 0 auto", label: "Fit content" },
                  { value: "1 1 0%", label: "Fill space" },
                ]}
              />
            </PropRow>
          )}
          {inGrid && (
            <PropRow label="Span" set={isSet("grid-column")} onReset={() => one("grid-column")(null)}>
              <SelectField
                value={get("grid-column").value}
                placeholder={cs.gridColumnEnd.startsWith("span") ? cs.gridColumnEnd : "1 column"}
                onChange={one("grid-column")}
                options={[
                  { value: "span 1", label: "1 column" },
                  { value: "span 2", label: "2 columns" },
                  { value: "span 3", label: "3 columns" },
                  { value: "1 / -1", label: "Full width" },
                ]}
              />
            </PropRow>
          )}
          <PropRow label="Align self" set={isSet("align-self")} onReset={() => one("align-self")(null)}>
            <SelectField
              value={get("align-self").value}
              placeholder={cs.alignSelf}
              onChange={one("align-self")}
              options={[
                { value: "auto", label: "Auto" },
                { value: "flex-start", label: "Start" },
                { value: "center", label: "Centre" },
                { value: "flex-end", label: "End" },
                { value: "stretch", label: "Stretch" },
              ]}
            />
          </PropRow>
          <LengthRow label="Order" prop="order" get={get} set={set} unit="" />
        </>
      )}
    </PanelSection>
  );
}

function SpacingSection({ ed, el }: { ed: VisualEditor; el: Element }) {
  const { get, isSet } = readsOf(ed, el);
  const sides = ["top", "right", "bottom", "left"];
  return (
    <PanelSection title="Spacing" set={isSet(...sides.flatMap((s) => [`margin-${s}`, `padding-${s}`]))}>
      <BoxModel get={get} set={ed.setStyle} onHover={ed.setSpacingGuides} />
    </PanelSection>
  );
}

function SizeSection({ ed, el }: { ed: VisualEditor; el: Element }) {
  const { cs, get, isSet, one } = readsOf(ed, el);
  const set = ed.setStyle;
  return (
    <PanelSection title="Size" set={isSet("width", "height", "min-width", "max-width", "min-height", "max-height", "overflow", "aspect-ratio")} defaultOpen={false}>
      <Pair>
        <LengthRow label="Width" prop="width" get={get} set={set} min={0} />
        <LengthRow label="Height" prop="height" get={get} set={set} min={0} />
        <LengthRow label="Min W" prop="min-width" get={get} set={set} min={0} />
        <LengthRow label="Max W" prop="max-width" get={get} set={set} min={0} />
        <LengthRow label="Min H" prop="min-height" get={get} set={set} min={0} />
        <LengthRow label="Max H" prop="max-height" get={get} set={set} min={0} />
      </Pair>
      <PropRow label="Aspect" set={isSet("aspect-ratio")} onReset={() => one("aspect-ratio")(null)}>
        <SelectField
          value={get("aspect-ratio").value}
          placeholder={cs.aspectRatio === "auto" ? "Free" : cs.aspectRatio}
          onChange={one("aspect-ratio")}
          options={[
            { value: "auto", label: "Free" },
            { value: "1 / 1", label: "Square" },
            { value: "4 / 3", label: "4:3" },
            { value: "3 / 2", label: "3:2" },
            { value: "16 / 9", label: "16:9" },
            { value: "21 / 9", label: "21:9" },
            { value: "3 / 4", label: "3:4 portrait" },
            { value: "2 / 3", label: "2:3 portrait" },
          ]}
        />
      </PropRow>
      <PropRow label="Overflow" set={isSet("overflow")} onReset={() => one("overflow")(null)}>
        <SelectField
          value={get("overflow").value}
          placeholder={cs.overflow}
          onChange={one("overflow")}
          options={[
            { value: "visible", label: "Visible" },
            { value: "hidden", label: "Hidden" },
            { value: "auto", label: "Scroll when needed" },
          ]}
        />
      </PropRow>
    </PanelSection>
  );
}

function PositionSection({ ed, el }: { ed: VisualEditor; el: Element }) {
  const { cs, get, isSet, one } = readsOf(ed, el);
  const set = ed.setStyle;
  const position = get("position").value ?? cs.position;
  return (
    <PanelSection title="Position" set={isSet("position", "top", "right", "bottom", "left", "z-index")} defaultOpen={false}>
      <PropRow label="Position" set={isSet("position")} onReset={() => one("position")(null)}>
        <SelectField
          value={get("position").value}
          placeholder={cs.position}
          onChange={one("position")}
          options={[
            { value: "static", label: "In the flow" },
            { value: "relative", label: "Relative" },
            { value: "absolute", label: "Absolute" },
            { value: "fixed", label: "Fixed to the screen" },
            { value: "sticky", label: "Sticky" },
          ]}
        />
      </PropRow>
      {position !== "static" && (
        <>
          <Pair>
            <LengthRow label="Top" prop="top" get={get} set={set} />
            <LengthRow label="Right" prop="right" get={get} set={set} />
            <LengthRow label="Bottom" prop="bottom" get={get} set={set} />
            <LengthRow label="Left" prop="left" get={get} set={set} />
          </Pair>
          <LengthRow label="Layer" prop="z-index" get={get} set={set} unit="" />
        </>
      )}
    </PanelSection>
  );
}

const WEIGHTS = [
  { value: "100", label: "Thin" },
  { value: "200", label: "Extra light" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra bold" },
  { value: "900", label: "Black" },
];

function TypeSection({ ed, el, kit, extraFonts, palette }: { ed: VisualEditor; el: Element; kit: BrandKit; extraFonts: string[]; palette: { brand: Swatch[]; page: Swatch[] } }) {
  const { cs, get, isSet, one } = readsOf(ed, el);
  const set = ed.setStyle;
  const icon = el.tagName.toUpperCase() === "SVG";
  const fonts = [
    { value: "var(--pg-font-heading)", label: `${kit.fonts.heading.family} (headings)` },
    { value: "var(--pg-font-body)", label: `${kit.fonts.body.family} (body)` },
    ...extraFonts.filter((f) => f !== kit.fonts.heading.family && f !== kit.fonts.body.family).map((f) => ({ value: `"${f}", sans-serif`, label: f })),
    { value: "system-ui, sans-serif", label: "System sans" },
    { value: "Georgia, serif", label: "Georgia" },
  ];
  const deco = get("text-decoration-line").value ?? cs.textDecorationLine;
  const toggleDeco = (word: string) => {
    const parts = new Set(deco.split(" ").filter((w) => w && w !== "none"));
    if (parts.has(word)) parts.delete(word);
    else parts.add(word);
    one("text-decoration-line")(parts.size ? [...parts].join(" ") : "none");
  };
  const italic = (get("font-style").value ?? cs.fontStyle) === "italic";
  const color = (
    <PropRow label={icon ? "Colour" : "Text colour"} set={isSet("color")} onReset={() => one("color")(null)}>
      <ColorField value={get("color").value} placeholder={cs.color} onChange={one("color")} swatches={palette.brand} page={palette.page} allowNone={false} />
    </PropRow>
  );
  if (icon) {
    return (
      <PanelSection title="Colour" set={isSet("color")}>
        {color}
      </PanelSection>
    );
  }
  const family = cs.fontFamily.split(",")[0]?.replace(/["']/g, "").trim();
  return (
    <PanelSection title="Typography" set={isSet("font-family", "font-weight", "font-size", "line-height", "letter-spacing", "color", "text-align", "text-transform", "font-style", "text-decoration-line", "text-wrap")}>
      <PropRow label="Font" set={isSet("font-family")} onReset={() => one("font-family")(null)}>
        <SelectField value={get("font-family").value} placeholder={family} options={fonts} onChange={one("font-family")} ariaLabel="Font" />
      </PropRow>
      <PropRow label="Weight" set={isSet("font-weight")} onReset={() => one("font-weight")(null)}>
        <SelectField value={get("font-weight").value} placeholder={cs.fontWeight} options={WEIGHTS} onChange={one("font-weight")} ariaLabel="Weight" />
      </PropRow>
      <Pair>
        <LengthRow label="Size" prop="font-size" get={get} set={set} min={1} />
        <LengthRow label="Line" prop="line-height" get={get} set={set} unit="" step={0.05} min={0} />
      </Pair>
      <LengthRow label="Letters" prop="letter-spacing" get={get} set={set} unit="em" step={0.01} />
      {color}
      <PropRow label="Align" set={isSet("text-align")} onReset={() => one("text-align")(null)}>
        <IconChoice
          value={get("text-align").value as string | undefined}
          fallback={cs.textAlign === "start" ? "left" : cs.textAlign}
          onChange={one("text-align")}
          options={[
            { value: "left", label: "Left", icon: <AlignLeft /> },
            { value: "center", label: "Centre", icon: <AlignCenter /> },
            { value: "right", label: "Right", icon: <AlignRight /> },
            { value: "justify", label: "Justify", icon: <AlignJustify /> },
          ]}
        />
      </PropRow>
      <PropRow label="Case" set={isSet("text-transform")} onReset={() => one("text-transform")(null)}>
        <IconChoice
          value={get("text-transform").value as string | undefined}
          fallback={cs.textTransform}
          onChange={one("text-transform")}
          options={[
            { value: "none", label: "As written", icon: <CaseSensitive /> },
            { value: "uppercase", label: "Uppercase", icon: <CaseUpper /> },
            { value: "lowercase", label: "Lowercase", icon: <CaseLower /> },
            { value: "capitalize", label: "Capitalise each word", icon: <Type /> },
          ]}
        />
      </PropRow>
      <PropRow label="Style" set={isSet("font-style", "text-decoration-line")}>
        <div className="inline-flex h-7 items-center gap-0.5 rounded-md bg-muted p-0.5">
          {[
            { on: italic, label: "Italic", icon: <Italic />, click: () => one("font-style")(italic ? "normal" : "italic") },
            { on: deco.includes("underline"), label: "Underline", icon: <Underline />, click: () => toggleDeco("underline") },
            { on: deco.includes("line-through"), label: "Strikethrough", icon: <Strikethrough />, click: () => toggleDeco("line-through") },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              aria-pressed={b.on}
              aria-label={b.label}
              title={b.label}
              onClick={b.click}
              className={cn("inline-flex size-6 items-center justify-center rounded-[5px] text-muted-foreground hover:text-foreground [&_svg]:size-3.5", b.on && "bg-background text-foreground shadow-xs")}
            >
              {b.icon}
            </button>
          ))}
        </div>
      </PropRow>
      <PropRow label="Balance" set={isSet("text-wrap")} onReset={() => one("text-wrap")(null)}>
        <Switch size="sm" checked={(get("text-wrap").value ?? cs.getPropertyValue("text-wrap")).includes("balance")} onCheckedChange={(on) => one("text-wrap")(on ? "balance" : "wrap")} aria-label="Balance the lines" />
      </PropRow>
    </PanelSection>
  );
}

/* Fill ------------------------------------------------------------------------------------- */

type FillMode = "none" | "color" | "gradient" | "image";

/** Splits on commas outside brackets. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseGradient(v: string | undefined): { angle: number; from: string; to: string } | null {
  const m = v ? /^linear-gradient\((.*)\)$/i.exec(v.trim()) : null;
  if (!m) return null;
  const parts = splitTop(m[1]);
  const angle = parts[0]?.endsWith("deg") ? parseFloat(parts.shift()!) : 180;
  return { angle, from: parts[0] ?? "#ffffff", to: parts[parts.length - 1] ?? "#000000" };
}

function FillSection({ ed, el, palette }: { ed: VisualEditor; el: Element; palette: { brand: Swatch[]; page: Swatch[] } }) {
  const { cs, get, isSet, one } = readsOf(ed, el);
  const bg = get("background").value;
  const computedMode: FillMode = cs.backgroundImage.includes("gradient") ? "gradient" : cs.backgroundImage.startsWith("url") ? "image" : /rgba\([^)]*,\s*0\)|transparent/.test(cs.backgroundColor) ? "none" : "color";
  const handMode: FillMode | null = bg === undefined ? null : /gradient/i.test(bg) ? "gradient" : /^url\(/i.test(bg) ? "image" : bg === "transparent" || bg === "none" ? "none" : "color";
  const [picked, setPicked] = useState<FillMode | null>(null);
  const mode = picked ?? handMode ?? computedMode;
  const grad = parseGradient(bg) ?? { angle: 135, from: "var(--pg-brand-primary)", to: "var(--pg-brand-accent)" };
  const setGrad = (g: { angle: number; from: string; to: string }) => one("background")(`linear-gradient(${Math.round(g.angle)}deg, ${g.from}, ${g.to})`);
  const image = bg && /^url\(/i.test(bg) ? /url\(["']?([^"')]+)/i.exec(bg)?.[1] : undefined;
  const fit = bg && /\/\s*(contain|cover|auto)/i.exec(bg)?.[1];
  const setImage = (src: string, size = fit ?? "cover") => one("background")(`url("${src}") center / ${size} no-repeat`);
  return (
    <PanelSection title="Fill" set={isSet("background")}>
      <PropRow label="Fill" set={bg !== undefined} onReset={() => { setPicked(null); one("background")(null); }}>
        <IconChoice
          value={(picked ?? handMode ?? undefined) as FillMode | undefined}
          fallback={computedMode}
          onChange={(m) => {
            const next = m ?? computedMode;
            setPicked(next);
            if (next === "none") one("background")("transparent");
            if (next === "color") one("background")(toHex(cs.backgroundColor) && computedMode === "color" ? toHex(cs.backgroundColor)! : "var(--pg-brand-surface)");
            if (next === "gradient") setGrad(grad);
          }}
          options={[
            { value: "none", label: "No fill", icon: <span className="size-3 rounded-[3px] border border-current" /> },
            { value: "color", label: "Colour", icon: <span className="size-3 rounded-[3px] bg-current" /> },
            { value: "gradient", label: "Gradient", icon: <span className="size-3 rounded-[3px] bg-gradient-to-br from-current to-transparent" /> },
            { value: "image", label: "Image", icon: <span className="size-3 rounded-[3px] border border-current bg-[radial-gradient(circle_at_30%_30%,currentColor_25%,transparent_30%)]" /> },
          ]}
        />
      </PropRow>
      {mode === "color" && (
        <PropRow label="Colour" set={handMode === "color"}>
          <ColorField value={handMode === "color" ? bg : undefined} placeholder={cs.backgroundColor} onChange={(v) => one("background")(v)} swatches={palette.brand} page={palette.page} />
        </PropRow>
      )}
      {mode === "gradient" && (
        <>
          <PropRow label="From">
            <ColorField value={grad.from} onChange={(v) => setGrad({ ...grad, from: v ?? grad.from })} swatches={palette.brand} page={palette.page} allowNone={false} />
          </PropRow>
          <PropRow label="To">
            <ColorField value={grad.to} onChange={(v) => setGrad({ ...grad, to: v ?? grad.to })} swatches={palette.brand} page={palette.page} />
          </PropRow>
          <PropRow label="Angle">
            <SliderField value={grad.angle} fallback={135} min={0} max={360} step={5} suffix="°" onChange={(v) => setGrad({ ...grad, angle: v ?? 135 })} />
          </PropRow>
        </>
      )}
      {mode === "image" && (
        <>
          <PropRow label="Image URL">
            <TextField value={image} placeholder="https://…" onCommit={(v) => (v ? setImage(v) : one("background")(null))} ariaLabel="Background image URL" />
          </PropRow>
          {image && (
            <PropRow label="Fit">
              <SelectField
                value={fit}
                placeholder="cover"
                onChange={(v) => setImage(image, v ?? "cover")}
                options={[
                  { value: "cover", label: "Fill the area" },
                  { value: "contain", label: "Show it all" },
                ]}
              />
            </PropRow>
          )}
        </>
      )}
    </PanelSection>
  );
}

function BorderSection({ ed, el, palette }: { ed: VisualEditor; el: Element; palette: { brand: Swatch[]; page: Swatch[] } }) {
  const { cs, get, isSet, one } = readsOf(ed, el);
  const set = ed.setStyle;
  const [corners, setCorners] = useState(false);
  return (
    <PanelSection title="Border and corners" set={isSet("border-width", "border-style", "border-color", "border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius")} defaultOpen={false}>
      <Pair>
        <PropRow label="Width" set={isSet("border-width")} onReset={() => one("border-width")(null)}>
          <LengthField value={get("border-width").value} placeholder={cs.borderTopWidth} onChange={one("border-width")} min={0} ariaLabel="Border width" />
        </PropRow>
        <PropRow label="Style" set={isSet("border-style")} onReset={() => one("border-style")(null)}>
          <SelectField
            value={get("border-style").value}
            placeholder={cs.borderTopStyle}
            onChange={one("border-style")}
            options={[
              { value: "none", label: "None" },
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dashed" },
              { value: "dotted", label: "Dotted" },
            ]}
          />
        </PropRow>
      </Pair>
      <PropRow label="Colour" set={isSet("border-color")} onReset={() => one("border-color")(null)}>
        <ColorField value={get("border-color").value} placeholder={cs.borderTopColor} onChange={one("border-color")} swatches={palette.brand} page={palette.page} />
      </PropRow>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <LengthRow label="Corners" prop="border-radius" get={(p) => ({ value: get(p).value, computed: cs.borderTopLeftRadius })} set={set} min={0} />
        </div>
        <Button size="xs" variant={corners ? "secondary" : "ghost"} onClick={() => setCorners((c) => !c)}>
          Each
        </Button>
      </div>
      {corners && (
        <Pair>
          <LengthRow label="Top L" prop="border-top-left-radius" get={get} set={set} min={0} />
          <LengthRow label="Top R" prop="border-top-right-radius" get={get} set={set} min={0} />
          <LengthRow label="Bottom L" prop="border-bottom-left-radius" get={get} set={set} min={0} />
          <LengthRow label="Bottom R" prop="border-bottom-right-radius" get={get} set={set} min={0} />
        </Pair>
      )}
    </PanelSection>
  );
}

const SHADOWS: Record<string, string> = {
  none: "none",
  soft: "0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.1)",
  medium: "0 4px 12px -2px rgb(0 0 0 / 0.12), 0 2px 4px -2px rgb(0 0 0 / 0.08)",
  large: "0 12px 32px -8px rgb(0 0 0 / 0.2)",
  floating: "0 24px 64px -16px rgb(0 0 0 / 0.3)",
  inner: "inset 0 2px 6px rgb(0 0 0 / 0.12)",
};

const CUSTOM_SHADOW = /^(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px (-?[\d.]+)px (.+)$/;

const num = (v: string | undefined, re: RegExp, fallback: number) => {
  const m = v ? re.exec(v) : null;
  return m ? parseFloat(m[1]) : fallback;
};

function EffectsSection({ ed, el, palette }: { ed: VisualEditor; el: Element; palette: { brand: Swatch[]; page: Swatch[] } }) {
  const { cs, get, isSet, one } = readsOf(ed, el);
  const shadow = get("box-shadow").value;
  const preset = shadow === undefined ? undefined : (Object.entries(SHADOWS).find(([, v]) => v === shadow)?.[0] ?? "custom");
  const custom = shadow ? CUSTOM_SHADOW.exec(shadow) : null;
  const c = custom ? { x: +custom[1], y: +custom[2], blur: +custom[3], spread: +custom[4], color: custom[5] } : { x: 0, y: 8, blur: 24, spread: 0, color: "#00000033" };
  const setCustom = (p: Partial<typeof c>) => {
    const n = { ...c, ...p };
    one("box-shadow")(`${n.x}px ${n.y}px ${n.blur}px ${n.spread}px ${n.color}`);
  };
  const opacity = get("opacity").value;
  return (
    <PanelSection title="Effects" set={isSet("opacity", "box-shadow", "filter", "backdrop-filter", "rotate", "scale", "mix-blend-mode")} defaultOpen={false}>
      <PropRow label="Opacity" set={opacity !== undefined} onReset={() => one("opacity")(null)}>
        <SliderField value={opacity !== undefined ? Math.round(parseFloat(opacity) * 100) : undefined} fallback={Math.round(parseFloat(cs.opacity) * 100)} min={0} max={100} suffix="%" onChange={(v) => one("opacity")(v === null ? null : String(v / 100))} />
      </PropRow>
      <PropRow label="Shadow" set={shadow !== undefined} onReset={() => one("box-shadow")(null)}>
        <SelectField
          value={preset}
          placeholder={cs.boxShadow === "none" ? "None" : "The page's shadow"}
          onChange={(v) => one("box-shadow")(v === null ? null : v === "custom" ? `${c.x}px ${c.y}px ${c.blur}px ${c.spread}px ${c.color}` : SHADOWS[v])}
          options={[
            { value: "none", label: "None" },
            { value: "soft", label: "Soft" },
            { value: "medium", label: "Medium" },
            { value: "large", label: "Large" },
            { value: "floating", label: "Floating" },
            { value: "inner", label: "Inset" },
            { value: "custom", label: "Custom" },
          ]}
        />
      </PropRow>
      {preset === "custom" && (
        <div className="space-y-2 rounded-md bg-muted/50 p-2">
          <Pair>
            {(["x", "y", "blur", "spread"] as const).map((k) => (
              <PropRow key={k} label={k === "x" ? "Across" : k === "y" ? "Down" : k === "blur" ? "Blur" : "Spread"}>
                <LengthField value={`${c[k]}px`} onChange={(v) => setCustom({ [k]: parseFloat(v ?? "0") || 0 })} min={k === "blur" ? 0 : undefined} ariaLabel={`Shadow ${k}`} />
              </PropRow>
            ))}
          </Pair>
          <PropRow label="Colour">
            <ColorField value={c.color} onChange={(v) => setCustom({ color: v ?? "#00000033" })} swatches={palette.brand} page={palette.page} allowNone={false} />
          </PropRow>
        </div>
      )}
      <PropRow label="Blur" set={isSet("filter")} onReset={() => one("filter")(null)}>
        <SliderField value={get("filter").value ? num(get("filter").value, /blur\(([\d.]+)px/, 0) : undefined} fallback={num(cs.filter, /blur\(([\d.]+)px/, 0)} min={0} max={40} suffix="px" onChange={(v) => one("filter")(v ? `blur(${v}px)` : null)} />
      </PropRow>
      <PropRow label="Glass" set={isSet("backdrop-filter")} onReset={() => one("backdrop-filter")(null)}>
        <SliderField value={get("backdrop-filter").value ? num(get("backdrop-filter").value, /blur\(([\d.]+)px/, 0) : undefined} fallback={num(cs.backdropFilter, /blur\(([\d.]+)px/, 0)} min={0} max={40} suffix="px" onChange={(v) => one("backdrop-filter")(v ? `blur(${v}px)` : null)} />
      </PropRow>
      <PropRow label="Rotate" set={isSet("rotate")} onReset={() => one("rotate")(null)}>
        <SliderField value={get("rotate").value ? parseFloat(get("rotate").value!) : undefined} fallback={parseFloat(cs.rotate) || 0} min={-180} max={180} suffix="°" onChange={(v) => one("rotate")(v === null ? null : `${v}deg`)} />
      </PropRow>
      <PropRow label="Scale" set={isSet("scale")} onReset={() => one("scale")(null)}>
        <SliderField value={get("scale").value ? Math.round(parseFloat(get("scale").value!) * 100) : undefined} fallback={cs.scale === "none" ? 100 : Math.round(parseFloat(cs.scale) * 100)} min={50} max={150} suffix="%" onChange={(v) => one("scale")(v === null ? null : String(v / 100))} />
      </PropRow>
      <PropRow label="Blend" set={isSet("mix-blend-mode")} onReset={() => one("mix-blend-mode")(null)}>
        <SelectField
          value={get("mix-blend-mode").value}
          placeholder={cs.mixBlendMode}
          onChange={one("mix-blend-mode")}
          options={["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference", "luminosity"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
        />
      </PropRow>
    </PanelSection>
  );
}

const ENTRANCES = [
  { value: "fade", label: "Fade in" },
  { value: "fade-up", label: "Fade up" },
  { value: "fade-down", label: "Fade down" },
  { value: "slide-left", label: "Slide in from the left" },
  { value: "slide-right", label: "Slide in from the right" },
  { value: "zoom", label: "Zoom in" },
  { value: "blur", label: "Come into focus" },
];

const EASINGS = [
  { value: "cubic-bezier(0.2, 0.7, 0.2, 1)", label: "Smooth" },
  { value: "ease-out", label: "Ease out" },
  { value: "ease-in-out", label: "Ease in and out" },
  { value: "linear", label: "Linear" },
  { value: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: "Bouncy" },
];

function MotionSection({ ed, el }: { ed: VisualEditor; el: Element }) {
  const m = ed.recordOf(el)?.motion;
  return (
    <PanelSection
      title="Motion"
      set={!!m}
      defaultOpen={false}
      aside={
        m?.enter ? (
          <Tooltip>
            <TooltipTrigger render={<Button size="icon-xs" variant="ghost" onClick={ed.replayMotion} aria-label="Play the entrance" />}>
              <Play />
            </TooltipTrigger>
            <TooltipContent>Play the entrance</TooltipContent>
          </Tooltip>
        ) : null
      }
    >
      <PropRow label="Entrance" set={!!m?.enter} onReset={() => ed.setMotion({ enter: undefined })}>
        <SelectField value={m?.enter} placeholder="None" options={ENTRANCES} onChange={(v) => ed.setMotion({ enter: v ?? undefined, trigger: m?.trigger ?? "scroll" })} ariaLabel="Entrance" />
      </PropRow>
      {m?.enter && (
        <>
          <PropRow label="When">
            <SelectField
              value={m.trigger ?? "scroll"}
              options={[
                { value: "scroll", label: "When scrolled into view" },
                { value: "load", label: "When the page opens" },
              ]}
              onChange={(v) => ed.setMotion({ trigger: (v as "load" | "scroll") ?? "scroll" })}
            />
          </PropRow>
          {m.trigger === "load" && (
            <>
              <PropRow label="Duration">
                <SliderField value={m.duration} fallback={700} min={100} max={2000} step={50} suffix="ms" onChange={(v) => ed.setMotion({ duration: v ?? undefined })} />
              </PropRow>
              <PropRow label="Delay">
                <SliderField value={m.delay} fallback={0} min={0} max={2000} step={50} suffix="ms" onChange={(v) => ed.setMotion({ delay: v ?? undefined })} />
              </PropRow>
            </>
          )}
          <PropRow label="Easing">
            <SelectField value={m.easing} placeholder="Smooth" options={EASINGS} onChange={(v) => ed.setMotion({ easing: v ?? undefined })} />
          </PropRow>
        </>
      )}
      <PropRow label="On hover" set={!!m?.hoverEffect} onReset={() => ed.setMotion({ hoverEffect: undefined })}>
        <SelectField
          value={m?.hoverEffect}
          placeholder="Nothing"
          options={[
            { value: "lift", label: "Lift" },
            { value: "grow", label: "Grow" },
            { value: "shrink", label: "Press in" },
            { value: "dim", label: "Dim" },
            { value: "glow", label: "Glow" },
          ]}
          onChange={(v) => ed.setMotion({ hoverEffect: v ?? undefined })}
        />
      </PropRow>
    </PanelSection>
  );
}

/* Header and scope -------------------------------------------------------------------------- */

function ActionButton({ label, onClick, disabled, children, danger }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button size="icon-xs" variant="ghost" onClick={onClick} disabled={disabled} aria-label={label} className={cn(danger && "hover:bg-destructive/10 hover:text-destructive")} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Header({ ed, el }: { ed: VisualEditor; el: Element }) {
  const body = ed.body!;
  const chain: Element[] = [];
  for (let p = el.parentElement; p && p !== body; p = p.parentElement) chain.unshift(p);
  const crumbs = chain.slice(-2);
  const rec = ed.recordOf(el);
  const styled = !!(rec?.style || rec?.phone || rec?.hover || rec?.motion);
  return (
    <div className="space-y-2 border-b px-3 pt-3 pb-2.5">
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-600/10 text-blue-700 dark:text-blue-400 [&_svg]:size-4">
          <KindIcon kind={kindOf(el, ed.win)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{ed.name(el)}</p>
          <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
            {chain.length > 2 && <span>…</span>}
            {crumbs.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1">
                {(i > 0 || chain.length > 2) && <span className="text-muted-foreground/50">›</span>}
                <button type="button" className="truncate hover:text-foreground" onClick={() => ed.select(c, { scroll: true })} onPointerEnter={() => ed.hover(c)} onPointerLeave={() => ed.hover(null)}>
                  {ed.name(c)}
                </button>
              </span>
            ))}
            {!crumbs.length && <span>Top of the page</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <ActionButton label="Select the parent (Esc)" onClick={ed.selectParent} disabled={!el.parentElement || el.parentElement === body}>
          <CornerLeftUp />
        </ActionButton>
        <ActionButton label="Move up (Alt ↑)" onClick={() => ed.move(-1)} disabled={!el.previousElementSibling}>
          <ChevronUp />
        </ActionButton>
        <ActionButton label="Move down (Alt ↓)" onClick={() => ed.move(1)} disabled={!el.nextElementSibling}>
          <ChevronDown />
        </ActionButton>
        <ActionButton label="Duplicate (⌘D)" onClick={ed.duplicate}>
          <Copy />
        </ActionButton>
        <ActionButton label="Delete (⌫)" onClick={ed.remove} danger>
          <Trash2 />
        </ActionButton>
        <span className="flex-1" />
        {styled && (
          <Button size="xs" variant="ghost" onClick={ed.resetStyles} className="text-muted-foreground">
            <RotateCcw data-icon="inline-start" /> Reset styles
          </Button>
        )}
      </div>
    </div>
  );
}

function ScopeBar({ ed }: { ed: VisualEditor }) {
  const phone = ed.scope === "phone";
  return (
    <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
      {phone ? <Smartphone className="size-3.5 shrink-0 text-muted-foreground" /> : <Monitor className="size-3.5 shrink-0 text-muted-foreground" />}
      <p className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground">{phone ? "Changes apply on phones only." : ed.hoverState ? "Styles while the pointer is over it." : "Changes apply on every screen."}</p>
      {!phone && (
        <div className="inline-flex h-6 shrink-0 items-center rounded-md bg-muted p-0.5 text-xs">
          {[
            { on: !ed.hoverState, label: "Normal", click: () => ed.setHoverState(false) },
            { on: ed.hoverState, label: "Hover", click: () => ed.setHoverState(true) },
          ].map((b) => (
            <button key={b.label} type="button" onClick={b.click} aria-pressed={b.on} className={cn("h-5 rounded-[5px] px-2 text-muted-foreground", b.on && "bg-background text-foreground shadow-xs")}>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Empty state ---------------------------------------------------------------------------- */

const SHORTCUTS: [string, string][] = [
  ["Click", "Select"],
  ["Double-click", "Edit text"],
  ["Esc", "Select the parent"],
  ["⌫", "Delete"],
  ["⌘ D", "Duplicate"],
  ["⌥ ↑ ↓", "Move"],
  ["⌘ Z", "Undo"],
  ["⌘ S", "Save"],
];

function Nothing({ ed }: { ed: VisualEditor }) {
  const edited = Object.entries(ed.hand.elements);
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
      <h2 className="text-sm font-medium">Select anything on the page</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Change its colours, type, spacing, layout and motion here, or double-click text to rewrite it. What you change by hand stays: the builder keeps it in every later change unless you ask it to.</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px]">{k}</kbd>
            </dt>
            <dd className="self-center text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      {edited.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-medium">Changed by you</h3>
          <ul className="mt-2 space-y-0.5">
            {edited.map(([id, rec]) => {
              const el = ed.body?.querySelector(`[${PG_ID}="${CSS.escape(id)}"]`);
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={!el}
                    onClick={() => el && ed.select(el, { scroll: true })}
                    onPointerEnter={() => el && ed.hover(el)}
                    onPointerLeave={() => ed.hover(null)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-blue-600" />
                    <span className="truncate">{rec.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* The panel -------------------------------------------------------------------------------- */

const elementKeys = new WeakMap<Element, number>();
let lastKey = 0;
function keyOf(el: Element): number {
  let k = elementKeys.get(el);
  if (k === undefined) {
    k = ++lastKey;
    elementKeys.set(el, k);
  }
  return k;
}

export function Inspector({ ed, kit, fonts, photos }: { ed: VisualEditor; kit: BrandKit; fonts: string[]; photos: { src: string; alt: string }[] }) {
  const palette = usePalette(ed);
  const el = ed.selected;
  if (!ed.ready || !ed.win) return <div className="p-4 text-sm text-muted-foreground">Opening the page…</div>;
  if (!el || !el.isConnected) return <Nothing ed={ed} />;
  const tag = el.tagName.toUpperCase();
  const media = tag === "IMG" || tag === "VIDEO" || tag === "SVG";
  // Keyed by element and scope so section state (open, picked fill) starts fresh per selection,
  // and survives the element getting its data-pg-id on the first edit.
  const key = `${keyOf(el)}-${ed.scope}`;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header ed={ed} el={el} />
      <ScopeBar ed={ed} />
      <div key={key} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ContentSection ed={ed} el={el} photos={photos} />
        <LayoutSection ed={ed} el={el} />
        <SpacingSection ed={ed} el={el} />
        <SizeSection ed={ed} el={el} />
        {(!media || tag === "SVG") && <TypeSection ed={ed} el={el} kit={kit} extraFonts={fonts} palette={palette} />}
        {tag !== "SVG" && <FillSection ed={ed} el={el} palette={palette} />}
        <BorderSection ed={ed} el={el} palette={palette} />
        <EffectsSection ed={ed} el={el} palette={palette} />
        <MotionSection ed={ed} el={el} />
        <PositionSection ed={ed} el={el} />
      </div>
    </div>
  );
}
