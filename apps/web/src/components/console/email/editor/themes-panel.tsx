"use client";

// Themes: the email's colours, fonts, button shape and corners. The current
// theme up top (with Edit theme for hand changes), then the brand's own theme
// from its kit and the presets. Colours set as theme tokens follow a switch;
// fixed colours stay.

import { ArrowLeft, Check, Pencil } from "lucide-react";
import { useState } from "react";
import { applyTheme, isColorValue, normalizeHex, THEME_PRESETS, themeFromKit } from "@slice/backend/convex/emailThemes";
import type { EmailDoc, EmailFont, EmailKit, EmailTheme } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { IconChoice, PanelSection, PropRow, SelectField, SliderField } from "@/components/console/pages/builder/visual/controls";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ThemeFonts } from "./theme-fonts";
import { useEditorEnv } from "./context";
import { fieldClass, Swatch } from "./fields";
import { COLOR_TOKENS, themeSwatches } from "./model";
import { GroupLabel, PanelHeader } from "./panel-ui";

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "Arial, Helvetica, sans-serif";

/** Google fonts the theme editor offers, with weights each family really ships. */
const FONTS: EmailFont[] = [
  { family: "Inter", fallback: SANS, google: true, weights: [400, 600, 700] },
  { family: "DM Sans", fallback: SANS, google: true, weights: [400, 500, 700] },
  { family: "Karla", fallback: SANS, google: true, weights: [400, 500, 700] },
  { family: "Lato", fallback: SANS, google: true, weights: [400, 700] },
  { family: "Manrope", fallback: SANS, google: true, weights: [400, 600, 700] },
  { family: "Work Sans", fallback: SANS, google: true, weights: [400, 600, 700] },
  { family: "IBM Plex Sans", fallback: SANS, google: true, weights: [400, 600, 700] },
  { family: "Space Grotesk", fallback: SANS, google: true, weights: [400, 500, 700] },
  { family: "Montserrat", fallback: SANS, google: true, weights: [400, 600, 700] },
  { family: "Syne", fallback: SANS, google: true, weights: [500, 600, 700] },
  { family: "Fraunces", fallback: SERIF, google: true, weights: [400, 600, 700] },
  { family: "Playfair Display", fallback: SERIF, google: true, weights: [400, 700] },
  { family: "DM Serif Display", fallback: SERIF, google: true, weights: [400] },
  { family: "Cormorant Garamond", fallback: SERIF, google: true, weights: [500, 600, 700] },
  { family: "EB Garamond", fallback: SERIF, google: true, weights: [400, 600, 700] },
  { family: "Libre Baskerville", fallback: SERIF, google: true, weights: [400, 700] },
  { family: "Lora", fallback: SERIF, google: true, weights: [400, 600, 700] },
  { family: "Source Serif 4", fallback: SERIF, google: true, weights: [400, 600, 700] },
  { family: "Arial", fallback: SANS, google: false },
  { family: "Georgia", fallback: SERIF, google: false },
];

const sameTheme = (a: EmailTheme, b: EmailTheme) =>
  a.fonts.heading.family === b.fonts.heading.family && a.fonts.body.family === b.fonts.body.family && COLOR_TOKENS.every((t) => normalizeHex(a.colors[t.key], "") === normalizeHex(b.colors[t.key], ""));

function ThemeCard({ theme, name, note, current, onPick, large }: { theme: EmailTheme; name: string; note?: string; current?: boolean; onPick?: () => void; large?: boolean }) {
  const swatches = themeSwatches(theme);
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!onPick}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-xl bg-white p-2.5 text-left ring-1 transition-shadow disabled:cursor-default",
        current ? "ring-2 ring-blue-600" : "ring-black/[0.08] hover:ring-black/25",
      )}
    >
      <ThemeFonts theme={theme} />
      <span
        className={cn("flex shrink-0 items-center justify-center rounded-lg ring-1 ring-black/5", large ? "size-16 text-3xl" : "size-12 text-2xl")}
        style={{ background: theme.colors.surface, color: theme.colors.text, fontFamily: `'${theme.fonts.heading.family}', ${theme.fonts.heading.fallback}` }}
      >
        Aa
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          {note && <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-px text-[10px] text-neutral-600">{note}</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {theme.fonts.heading.family}
          {theme.fonts.body.family !== theme.fonts.heading.family && ` and ${theme.fonts.body.family}`}
        </span>
        <span className="mt-1.5 flex gap-1">
          {swatches.map((c, i) => (
            <Swatch key={i} color={c} className="size-4 rounded-full" />
          ))}
        </span>
      </span>
      {current && (
        <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-blue-600 text-white">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function HexRow({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const hex = normalizeHex(value, "#000000");
  const [draft, setDraft] = useState(hex);
  const [seen, setSeen] = useState(hex);
  if (seen !== hex) {
    setSeen(hex);
    setDraft(hex);
  }
  return (
    <PropRow label={label}>
      <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/15">
        <span className="absolute inset-0" style={{ background: hex }} />
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${label} colour`} />
      </label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft.trim().startsWith("#") ? draft.trim() : `#${draft.trim()}`;
          if (isColorValue(v)) onChange(normalizeHex(v, hex));
          else setDraft(hex);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={fieldClass}
        aria-label={`${label} hex`}
      />
    </PropRow>
  );
}

const PAIRS: { key: keyof EmailTheme["colors"]; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "onPrimary", label: "On primary" },
  { key: "accent", label: "Accent" },
  { key: "onAccent", label: "On accent" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted fill" },
  { key: "surface", label: "Email" },
  { key: "backdrop", label: "Backdrop" },
  { key: "border", label: "Lines" },
];

function ThemeEditor({ theme, onBack }: { theme: EmailTheme; onBack: () => void }) {
  const { editor } = useEditorEnv();
  const set = (patch: Partial<EmailTheme>, coalesce?: string) => editor.apply([{ op: "set_theme", set: { ...patch, id: undefined, name: "Custom" } }], { coalesce: coalesce ? `theme:${coalesce}` : undefined });
  const fontOptions = FONTS.map((f) => ({ value: f.family, label: f.family }));
  const pickFont = (slot: "heading" | "body", family: string | null) => {
    const f = FONTS.find((x) => x.family === family);
    if (f) set({ fonts: { ...theme.fonts, [slot]: f } });
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 px-3 pt-3 pb-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to themes">
          <ArrowLeft />
        </Button>
        <h2 className="text-[15px] font-semibold tracking-tight">Edit theme</h2>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain border-t">
        <PanelSection title="Colours">
          {PAIRS.map((p) => (
            <HexRow key={p.key} label={p.label} value={theme.colors[p.key]} onChange={(hex) => set({ colors: { ...theme.colors, [p.key]: hex } }, `color-${p.key}`)} />
          ))}
        </PanelSection>
        <PanelSection title="Fonts">
          <PropRow label="Headings">
            <SelectField value={theme.fonts.heading.family} options={fontOptions} onChange={(v) => pickFont("heading", v)} ariaLabel="Heading font" />
          </PropRow>
          <PropRow label="Body">
            <SelectField value={theme.fonts.body.family} options={fontOptions} onChange={(v) => pickFont("body", v)} ariaLabel="Body font" />
          </PropRow>
          <p className="text-[11px] leading-4 text-muted-foreground">Apple Mail and iOS show web fonts; Gmail and Outlook fall back to {theme.fonts.body.fallback.split(",")[0]}.</p>
        </PanelSection>
        <PanelSection title="Buttons and corners">
          <PropRow label="Buttons">
            <IconChoice
              value={theme.button.shape}
              onChange={(v) => v && set({ button: { ...theme.button, shape: v } })}
              options={[
                { value: "square", label: "Square", icon: <span className="h-3 w-5 rounded-none border-[1.5px] border-current" /> },
                { value: "rounded", label: "Rounded", icon: <span className="h-3 w-5 rounded-[3px] border-[1.5px] border-current" /> },
                { value: "pill", label: "Pill", icon: <span className="h-3 w-5 rounded-full border-[1.5px] border-current" /> },
              ]}
            />
          </PropRow>
          <PropRow label="Capitals">
            <Switch size="sm" checked={theme.button.uppercase} onCheckedChange={(on) => set({ button: { ...theme.button, uppercase: on } })} aria-label="Button labels in capitals" />
          </PropRow>
          <PropRow label="Corners">
            <SliderField value={theme.radius} fallback={8} min={0} max={24} suffix="px" onChange={(v) => v !== null && set({ radius: v }, "radius")} />
          </PropRow>
        </PanelSection>
      </div>
    </div>
  );
}

export function ThemesPanel() {
  const { editor, brand } = useEditorEnv();
  const [editing, setEditing] = useState(false);
  const doc = editor.doc as EmailDoc;
  const theme = doc.theme;
  const brandTheme = themeFromKit((brand.kit ?? undefined) as EmailKit | undefined);
  const use = (t: EmailTheme) => editor.change((d) => applyTheme(d, t));

  if (editing) return <ThemeEditor theme={theme} onBack={() => setEditing(false)} />;
  const presetMatch = THEME_PRESETS.find((t) => t.id === theme.id) ?? (theme.id === "brand" ? brandTheme : undefined);
  const name = theme.id === "brand" ? `${brand.name}` : (presetMatch?.name ?? theme.name ?? "Custom");

  return (
    <div className={cn("flex h-full min-h-0 flex-col", editor.locked && "pointer-events-none opacity-60")}>
      <PanelHeader title="Themes" subtitle="Colours and fonts for the whole email." />
      <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-6">
        <div className="space-y-2">
          <GroupLabel>Current theme</GroupLabel>
          <ThemeCard theme={theme} name={name} note={theme.id === "brand" ? "Brand" : !theme.id ? "Edited" : undefined} current large />
          <Button variant="outline" size="sm" className="w-full" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" /> Edit theme
          </Button>
        </div>
        <div className="space-y-2">
          <GroupLabel>From your brand kit</GroupLabel>
          <ThemeCard theme={brandTheme} name={brand.name} note="Brand" current={theme.id === "brand" && sameTheme(theme, brandTheme)} onPick={() => use(brandTheme)} />
        </div>
        <div className="space-y-2">
          <GroupLabel>Themes</GroupLabel>
          {THEME_PRESETS.map((t) => (
            <ThemeCard key={t.id} theme={t} name={t.name ?? t.id ?? "Theme"} current={theme.id === t.id} onPick={() => use(t)} />
          ))}
        </div>
      </div>
    </div>
  );
}
