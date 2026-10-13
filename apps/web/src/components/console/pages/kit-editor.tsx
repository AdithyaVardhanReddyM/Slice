"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandKit } from "@/lib/pages/types";
import { Input, Segmented, Select, Textarea } from "@/components/console/form";
import { TokenInput } from "@/components/console/setup/atoms";
import { Switch } from "@/components/ui/switch";
import { EditorField, EditorRow, EditorSection } from "./editor-layout";

const COLOR_ROLES: { key: keyof BrandKit["colors"]; label: string; hint: string }[] = [
  { key: "background", label: "Background", hint: "Page canvas" },
  { key: "foreground", label: "Text", hint: "Headings and body" },
  { key: "primary", label: "Primary", hint: "Buttons and links" },
  { key: "primaryForeground", label: "On primary", hint: "Text on buttons" },
  { key: "accent", label: "Accent", hint: "Highlights" },
  { key: "muted", label: "Muted", hint: "Secondary text" },
  { key: "surface", label: "Surface", hint: "Cards and panels" },
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

function ColorSwatch({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  const valid = HEX.test(draft);
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2 pr-3 transition-colors focus-within:border-ring">
      <label
        className="relative block size-10 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/10 ring-inset"
        style={{ background: valid ? draft : value }}
      >
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
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="truncate text-xs text-muted-foreground">{hint}</span>
        </div>
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(v);
            if (HEX.test(v)) onChange(v);
          }}
          onBlur={() => !valid && setDraft(value)}
          aria-invalid={!valid}
          aria-label={`${label} hex value`}
          className={cn("num h-5 w-full bg-transparent text-sm text-muted-foreground uppercase outline-none focus:text-foreground", !valid && "text-destructive")}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function FontField({
  role,
  font,
  sample,
  onChange,
}: {
  role: string;
  font: BrandKit["fonts"]["heading"];
  sample: string;
  onChange: (f: BrandKit["fonts"]["heading"]) => void;
}) {
  const href = font.source === "google" ? googleFontHref([font.family]) : null;
  return (
    <div className="overflow-hidden rounded-lg border">
      {href && <link rel="stylesheet" href={href} />}
      <div className="border-b bg-muted/40 px-4 py-5">
        <div className="text-xs text-muted-foreground">
          {role} · {font.family || "Unset"}
        </div>
        <p className="mt-1 truncate text-2xl leading-tight" style={{ fontFamily: `"${font.family}", ${font.fallback || "sans-serif"}` }}>
          {sample}
        </p>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <EditorField label="Family">
          <Input value={font.family} onChange={(e) => onChange({ ...font, family: e.target.value })} />
        </EditorField>
        <EditorField label="Source">
          <Select value={font.source} onChange={(e) => onChange({ ...font, source: e.target.value as "google" | "system" })}>
            <option value="google">Google Fonts</option>
            <option value="system">System</option>
          </Select>
        </EditorField>
        <EditorField label="Fallback stack" className="sm:col-span-2">
          <Input value={font.fallback} onChange={(e) => onChange({ ...font, fallback: e.target.value })} />
        </EditorField>
      </div>
    </div>
  );
}

function LogoPreview({ kit, brandName }: { kit: BrandKit; brandName: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = kit.logo?.src;
  return (
    <div
      className="flex h-24 items-center justify-center rounded-lg px-8 ring-1 ring-foreground/10"
      style={{ background: kit.logo?.onDark ? kit.colors.foreground : kit.colors.background }}
    >
      {src && broken !== src ? (
        // Merchant logos live on arbitrary hosts; next/image would need every one allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={kit.logo?.alt ?? brandName} className="max-h-12 max-w-full object-contain" onError={() => setBroken(src)} />
      ) : src ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImageOff className="size-4" /> The logo URL did not load
        </span>
      ) : (
        <span
          className="truncate text-2xl font-semibold"
          style={{
            color: kit.logo?.onDark ? kit.colors.background : kit.colors.foreground,
            fontFamily: `"${kit.fonts.heading.family}", ${kit.fonts.heading.fallback}`,
          }}
        >
          {kit.wordmark || brandName}
        </span>
      )}
    </div>
  );
}

function IconPreview({ src }: { src?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {src && broken !== src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-6 object-contain" onError={() => setBroken(src)} />
      ) : (
        <ImageOff className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}

type KitProps = { kit: BrandKit; onChange: (kit: BrandKit) => void; brandName: string };

/** Logo, colours, type and shape. Controlled: the parent owns the kit and saves it. */
export function KitIdentityEditor({ kit, onChange, brandName }: KitProps) {
  const set = <K extends keyof BrandKit>(key: K, value: BrandKit[K]) => onChange({ ...kit, [key]: value });
  return (
    <div>
      <EditorSection title="Logo" description="Sits in the header of every page. Paste a URL to replace the one Slice found.">
        <LogoPreview kit={kit} brandName={brandName} />
        <div className="grid gap-4 sm:grid-cols-2">
          <EditorField label="Logo URL" aside="Optional">
            <Input
              value={kit.logo?.src ?? ""}
              placeholder="https://…/logo.svg"
              onChange={(e) => set("logo", e.target.value ? { src: e.target.value, alt: kit.logo?.alt ?? brandName, onDark: kit.logo?.onDark } : undefined)}
            />
          </EditorField>
          <EditorField label="Wordmark" aside="Optional" hint="Shown when there is no logo image.">
            <Input value={kit.wordmark ?? ""} placeholder={brandName} onChange={(e) => set("wordmark", e.target.value || undefined)} />
          </EditorField>
          <EditorField label="Icon URL" aside="Optional" hint="A square mark for small tiles in Slice, like the brand switcher." className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <IconPreview src={kit.icon} />
              <Input value={kit.icon ?? ""} placeholder="https://…/icon.png" onChange={(e) => set("icon", e.target.value || undefined)} />
            </div>
          </EditorField>
        </div>
        <EditorRow label="Dark background" hint="The logo is light and needs the text colour behind it.">
          <Switch checked={!!kit.logo?.onDark} onCheckedChange={(v) => kit.logo && set("logo", { ...kit.logo, onDark: v })} disabled={!kit.logo} />
        </EditorRow>
      </EditorSection>

      <EditorSection title="Colours" description="Seven roles every section draws from. Click a swatch or type a hex value.">
        <div className="grid gap-2 sm:grid-cols-2">
          {COLOR_ROLES.map((r) => (
            <ColorSwatch
              key={r.key}
              label={r.label}
              hint={r.hint}
              value={kit.colors[r.key]}
              onChange={(hex) => set("colors", { ...kit.colors, [r.key]: hex })}
            />
          ))}
        </div>
      </EditorSection>

      <EditorSection title="Typography" description="Loaded from Google Fonts when available; the fallback stack covers the rest.">
        <FontField role="Headings" font={kit.fonts.heading} sample={brandName} onChange={(f) => set("fonts", { ...kit.fonts, heading: f })} />
        <FontField
          role="Body"
          font={kit.fonts.body}
          sample="The quick brown fox jumps over the lazy dog"
          onChange={(f) => set("fonts", { ...kit.fonts, body: f })}
        />
      </EditorSection>

      <EditorSection title="Shape" description="Corners, spacing and buttons. The preview shows each change.">
        <div className="divide-y rounded-lg border">
          <div className="p-3">
            <EditorRow label="Corner radius" hint="Cards, images and inputs.">
              <Segmented
                value={kit.radius}
                onChange={(v) => set("radius", v)}
                options={(["none", "sm", "md", "lg", "full"] as const).map((v) => ({
                  value: v,
                  label: { none: "None", sm: "Small", md: "Medium", lg: "Large", full: "Full" }[v],
                }))}
              />
            </EditorRow>
          </div>
          <div className="p-3">
            <EditorRow label="Buttons" hint="Shape of every call to action.">
              <Segmented
                value={kit.buttonStyle}
                onChange={(v) => set("buttonStyle", v)}
                options={[
                  { value: "pill", label: "Pill" },
                  { value: "rounded", label: "Rounded" },
                  { value: "square", label: "Square" },
                ]}
              />
            </EditorRow>
          </div>
          <div className="p-3">
            <EditorRow label="Density" hint="Space between and inside sections.">
              <Segmented
                value={kit.density}
                onChange={(v) => set("density", v)}
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "regular", label: "Regular" },
                  { value: "airy", label: "Airy" },
                ]}
              />
            </EditorRow>
          </div>
          <div className="p-3">
            <EditorRow label="Uppercase labels" hint="Eyebrows, tags and button text.">
              <Switch checked={kit.uppercaseLabels} onCheckedChange={(v) => set("uppercaseLabels", v)} />
            </EditorRow>
          </div>
        </div>
      </EditorSection>
    </div>
  );
}

/** How the brand writes and photographs. */
export function KitVoiceEditor({ kit, onChange }: Omit<KitProps, "brandName">) {
  const set = <K extends keyof BrandKit>(key: K, value: BrandKit[K]) => onChange({ ...kit, [key]: value });
  return (
    <div>
      <EditorSection title="Voice" description="How the brand sounds. The builder writes every headline and paragraph to this.">
        <EditorField label="Summary">
          <Textarea rows={3} value={kit.voice.summary} onChange={(e) => set("voice", { ...kit.voice, summary: e.target.value })} />
        </EditorField>
        <EditorField label="Do" aside={`${kit.voice.do.length} rules`}>
          <TokenInput values={kit.voice.do} onChange={(v) => set("voice", { ...kit.voice, do: v })} placeholder="Add a rule" />
        </EditorField>
        <EditorField label="Avoid" aside={`${kit.voice.avoid.length} rules`}>
          <TokenInput values={kit.voice.avoid} onChange={(v) => set("voice", { ...kit.voice, avoid: v })} placeholder="Add a rule" />
        </EditorField>
      </EditorSection>

      <EditorSection title="Imagery" description="How the brand photographs. Used to search stock photos and to prompt generated images.">
        <EditorField label="Style" hint="Subjects, light and mood.">
          <Textarea rows={2} value={kit.imagery.style} onChange={(e) => set("imagery", { ...kit.imagery, style: e.target.value })} />
        </EditorField>
        <EditorField label="Treatment" hint="Crops, frames and finishing.">
          <Textarea rows={2} value={kit.imagery.treatment} onChange={(e) => set("imagery", { ...kit.imagery, treatment: e.target.value })} />
        </EditorField>
      </EditorSection>
    </div>
  );
}
