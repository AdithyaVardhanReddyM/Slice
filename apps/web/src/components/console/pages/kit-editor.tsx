"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { BrandKit } from "@/lib/pages/types";
import { Field, Input, Segmented, Select, Textarea } from "@/components/console/form";
import { FieldGroup, TokenInput } from "@/components/console/setup/atoms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Thumb } from "./shared";

const COLOR_ROLES: { key: keyof BrandKit["colors"]; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "foreground", label: "Text" },
  { key: "primary", label: "Primary" },
  { key: "primaryForeground", label: "On primary" },
  { key: "accent", label: "Accent" },
  { key: "muted", label: "Muted" },
  { key: "surface", label: "Surface" },
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A blank kit for brands whose intake has not written one yet. */
export const EMPTY_KIT: BrandKit = {
  colors: {
    background: "#ffffff",
    foreground: "#111111",
    primary: "#111111",
    primaryForeground: "#ffffff",
    accent: "#e5e5e5",
    muted: "#f4f4f4",
    surface: "#fafafa",
  },
  fonts: {
    heading: { family: "Inter", source: "google", fallback: "system-ui, sans-serif" },
    body: { family: "Inter", source: "google", fallback: "system-ui, sans-serif" },
  },
  radius: "md",
  density: "regular",
  imagery: { style: "", treatment: "" },
  voice: { summary: "", do: [], avoid: [] },
  buttonStyle: "rounded",
  uppercaseLabels: false,
};

export function googleFontHref(families: string[]) {
  const fams = [...new Set(families.filter(Boolean))]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&");
  return fams ? `https://fonts.googleapis.com/css2?${fams}&display=swap` : null;
}

function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const valid = HEX.test(draft);
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2">
      <label className="relative block size-9 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/10" style={{ background: valid ? draft : value }}>
        <input
          type="color"
          aria-label={`${label} colour`}
          value={valid && draft.length === 7 ? draft : value}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(v);
            if (HEX.test(v)) onChange(v);
          }}
          onBlur={() => !valid && setDraft(value)}
          aria-invalid={!valid}
          className={cn("num h-6 w-full bg-transparent text-sm outline-none", !valid && "text-destructive")}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function FontField({
  label,
  font,
  onChange,
}: {
  label: string;
  font: BrandKit["fonts"]["heading"];
  onChange: (f: BrandKit["fonts"]["heading"]) => void;
}) {
  const href = font.source === "google" ? googleFontHref([font.family]) : null;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      {href && <link rel="stylesheet" href={href} />}
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
        <Field label={label}>
          <Input value={font.family} onChange={(e) => onChange({ ...font, family: e.target.value })} />
        </Field>
        <Field label="Source">
          <Select value={font.source} onChange={(e) => onChange({ ...font, source: e.target.value as "google" | "system" })}>
            <option value="google">Google Fonts</option>
            <option value="system">System</option>
          </Select>
        </Field>
      </div>
      <p
        className="truncate rounded-md bg-muted/60 px-3 py-2 text-xl"
        style={{ fontFamily: `"${font.family}", ${font.fallback || "sans-serif"}` }}
      >
        The quick brown fox jumps over the lazy dog
      </p>
      <Field label="Fallback stack">
        <Input value={font.fallback} onChange={(e) => onChange({ ...font, fallback: e.target.value })} />
      </Field>
    </div>
  );
}

/** Edits every BrandKit field. Controlled: the parent owns the kit and saves it. */
export function KitEditor({ kit, onChange, brandName }: { kit: BrandKit; onChange: (kit: BrandKit) => void; brandName: string }) {
  const set = <K extends keyof BrandKit>(key: K, value: BrandKit[K]) => onChange({ ...kit, [key]: value });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Palette</CardTitle>
          <CardDescription>Colour roles the pages use. Click a swatch or type a hex value.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {COLOR_ROLES.map((r) => (
              <ColorSwatch
                key={r.key}
                label={r.label}
                value={kit.colors[r.key]}
                onChange={(hex) => set("colors", { ...kit.colors, [r.key]: hex })}
              />
            ))}
          </div>
          <div
            className="flex flex-wrap items-center gap-3 rounded-lg p-4 ring-1 ring-foreground/10"
            style={{ background: kit.colors.background, color: kit.colors.foreground }}
          >
            <span className="text-sm" style={{ fontFamily: `"${kit.fonts.heading.family}", ${kit.fonts.heading.fallback}` }}>
              {brandName}
            </span>
            <span
              className={cn("px-3 py-1.5 text-xs font-medium", kit.uppercaseLabels && "uppercase tracking-wide")}
              style={{
                background: kit.colors.primary,
                color: kit.colors.primaryForeground,
                borderRadius: kit.buttonStyle === "pill" ? 999 : kit.buttonStyle === "square" ? 0 : 8,
              }}
            >
              Primary button
            </span>
            <span className="px-3 py-1.5 text-xs" style={{ background: kit.colors.surface, color: kit.colors.foreground, borderRadius: 8 }}>
              Surface
            </span>
            <span className="size-5 rounded-full" style={{ background: kit.colors.accent }} aria-label="Accent" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Type</CardTitle>
          <CardDescription>Heading and body families, loaded from Google Fonts when available.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <FontField label="Heading font" font={kit.fonts.heading} onChange={(f) => set("fonts", { ...kit.fonts, heading: f })} />
          <FontField label="Body font" font={kit.fonts.body} onChange={(f) => set("fonts", { ...kit.fonts, body: f })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo and shape</CardTitle>
          <CardDescription>Replace the logo with a URL; set corner radius, spacing and button shape.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-4">
            <div
              className="flex size-16 shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/10"
              style={{ background: kit.logo?.onDark ? kit.colors.foreground : kit.colors.background }}
            >
              {kit.logo?.src ? (
                <Thumb src={kit.logo.src} alt={kit.logo.alt} className="size-12" rounded="rounded-none [&_img]:object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">{kit.wordmark?.charAt(0) ?? brandName.charAt(0)}</span>
              )}
            </div>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <Field label="Logo URL" optional>
                <Input
                  value={kit.logo?.src ?? ""}
                  placeholder="https://…/logo.svg"
                  onChange={(e) =>
                    set("logo", e.target.value ? { src: e.target.value, alt: kit.logo?.alt ?? brandName, onDark: kit.logo?.onDark } : undefined)
                  }
                />
              </Field>
              <Field label="Wordmark" hint="Shown when there is no logo image." optional>
                <Input value={kit.wordmark ?? ""} onChange={(e) => set("wordmark", e.target.value || undefined)} />
              </Field>
              <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
                <span>Logo sits on a dark background</span>
                <Switch checked={!!kit.logo?.onDark} onCheckedChange={(v) => kit.logo && set("logo", { ...kit.logo, onDark: v })} disabled={!kit.logo} />
              </label>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Corner radius">
              <Segmented
                value={kit.radius}
                onChange={(v) => set("radius", v)}
                options={(["none", "sm", "md", "lg", "full"] as const).map((v) => ({ value: v, label: v === "none" ? "None" : v.toUpperCase() }))}
              />
            </FieldGroup>
            <FieldGroup label="Density">
              <Segmented
                value={kit.density}
                onChange={(v) => set("density", v)}
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "regular", label: "Regular" },
                  { value: "airy", label: "Airy" },
                ]}
              />
            </FieldGroup>
            <FieldGroup label="Buttons">
              <Segmented
                value={kit.buttonStyle}
                onChange={(v) => set("buttonStyle", v)}
                options={[
                  { value: "pill", label: "Pill" },
                  { value: "rounded", label: "Rounded" },
                  { value: "square", label: "Square" },
                ]}
              />
            </FieldGroup>
            <label className="flex items-center justify-between gap-3 pt-6 text-sm">
              <span>Uppercase labels</span>
              <Switch checked={kit.uppercaseLabels} onCheckedChange={(v) => set("uppercaseLabels", v)} />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voice and imagery</CardTitle>
          <CardDescription>How the brand writes and photographs. The builder follows this on every version.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Voice">
            <Textarea rows={3} value={kit.voice.summary} onChange={(e) => set("voice", { ...kit.voice, summary: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Do">
              <TokenInput values={kit.voice.do} onChange={(v) => set("voice", { ...kit.voice, do: v })} placeholder="Add a rule" />
            </FieldGroup>
            <FieldGroup label="Avoid">
              <TokenInput values={kit.voice.avoid} onChange={(v) => set("voice", { ...kit.voice, avoid: v })} placeholder="Add a rule" />
            </FieldGroup>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Imagery style">
              <Textarea rows={2} value={kit.imagery.style} onChange={(e) => set("imagery", { ...kit.imagery, style: e.target.value })} />
            </Field>
            <Field label="Treatment">
              <Textarea rows={2} value={kit.imagery.treatment} onChange={(e) => set("imagery", { ...kit.imagery, treatment: e.target.value })} />
            </Field>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
