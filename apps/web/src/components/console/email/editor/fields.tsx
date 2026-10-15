"use client";

// Inputs the inspector and the floating toolbar share, for the email doc's
// own values: theme colour slots (a token follows the theme, a hex is fixed),
// padding boxes, alignment and sizes. Generic rows and fields come from the
// Pages visual editor's controls.

import { AlignCenter, AlignLeft, AlignRight, Check, Link2, Link2Off, RotateCcw } from "lucide-react";
import { useState } from "react";
import { isColorValue, normalizeHex, resolveColor } from "@slice/backend/convex/emailThemes";
import type { Align, Box, ColorRef, EmailTheme } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { IconChoice } from "@/components/console/pages/builder/visual/controls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COLOR_TOKENS } from "./model";

export const fieldClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-xs tabular-nums outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function Swatch({ color, className }: { color: string | undefined; className?: string }) {
  return (
    <span className={cn("relative inline-block size-4 shrink-0 overflow-hidden rounded-[4px]", className)} style={{ background: color ?? "transparent" }}>
      <span className="absolute inset-0 rounded-[inherit] ring-1 ring-foreground/15 ring-inset" />
    </span>
  );
}

/** A colour slot: a theme token (follows theme changes) or a fixed colour. `undefined` is the automatic colour. */
export function ColorRefField({
  value,
  onChange,
  theme,
  auto,
  autoLabel = "Automatic",
  trigger,
}: {
  value: ColorRef | undefined;
  onChange: (v: ColorRef | undefined) => void;
  theme: EmailTheme;
  /** The colour shown when nothing is set. */
  auto?: string;
  autoLabel?: string;
  /** A custom trigger (the toolbar's text-colour button); defaults to a field. */
  trigger?: React.ReactElement;
}) {
  const token = COLOR_TOKENS.find((t) => t.ref === value);
  const shown = resolveColor(value, theme) ?? auto;
  const hex = normalizeHex(shown, "#000000");
  const [draft, setDraft] = useState(hex);
  const [seen, setSeen] = useState(hex);
  if (seen !== hex) {
    setSeen(hex);
    setDraft(hex);
  }
  const label = token ? token.label : value ? hex : autoLabel;
  return (
    <Popover>
      <PopoverTrigger
        render={
          trigger ?? (
            <button type="button" className={cn(fieldClass, "flex items-center gap-2 text-left")}>
              <Swatch color={shown} />
              <span className={cn("truncate", !value && "text-muted-foreground")}>{label}</span>
            </button>
          )
        }
      />
      <PopoverContent align="start" className="w-60 gap-3" data-inline-keep>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Theme colours</p>
          <div className="grid grid-cols-7 gap-1.5">
            {COLOR_TOKENS.map((t) => (
              <button
                key={t.ref}
                type="button"
                title={t.label}
                aria-label={t.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(t.ref)}
                className={cn("relative rounded-[6px] p-0.5 ring-offset-1 transition-shadow", value === t.ref ? "ring-2 ring-blue-600" : "hover:ring-1 hover:ring-foreground/30")}
              >
                <Swatch color={theme.colors[t.key]} className="size-6 rounded-[5px]" />
                {value === t.ref && <Check className="absolute inset-0 m-auto size-3 text-white mix-blend-difference" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">Theme colours change with the theme.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/15">
            <span className="absolute inset-0" style={{ background: hex }} />
            <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a colour" />
          </label>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const v = draft.trim().startsWith("#") ? draft.trim() : `#${draft.trim()}`;
              if (isColorValue(v) && v.toLowerCase() !== hex) onChange(normalizeHex(v, hex));
              else setDraft(hex);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className={fieldClass}
            aria-label="Hex colour"
          />
        </div>
        {value !== undefined && (
          <button type="button" onClick={() => onChange(undefined)} className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground">
            <RotateCcw className="size-3" /> {autoLabel}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AlignField({ value, onChange }: { value: Align; onChange: (a: Align) => void }) {
  return (
    <IconChoice
      value={value}
      onChange={(v) => v && onChange(v)}
      options={[
        { value: "left", label: "Left", icon: <AlignLeft /> },
        { value: "center", label: "Centre", icon: <AlignCenter /> },
        { value: "right", label: "Right", icon: <AlignRight /> },
      ]}
    />
  );
}

/** A number with arrow-key steps; commits on blur or Enter. */
export function NumberField({ value, placeholder, onChange, min, max, step = 1, unit, ariaLabel, className }: { value: number | undefined; placeholder?: number; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; unit?: string; ariaLabel: string; className?: string }) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (!focused && seen !== value) {
    setSeen(value);
    setDraft(value === undefined ? "" : String(value));
  }
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = (raw: string) => {
    const n = parseFloat(raw);
    const next = Number.isFinite(n) ? clamp(Math.round(n / step) * step) : undefined;
    if (next !== value) onChange(next);
    setDraft(next === undefined ? "" : String(next));
  };
  return (
    <span className={cn("relative block w-full min-w-0", className)}>
      <input
        value={draft}
        inputMode="decimal"
        placeholder={placeholder === undefined ? "" : String(placeholder)}
        aria-label={ariaLabel}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = parseFloat(draft) || placeholder || 0;
            const next = clamp(Math.round((base + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1)) * 100) / 100);
            setDraft(String(next));
            onChange(next);
          }
        }}
        className={cn(fieldClass, unit && "pr-6")}
      />
      {unit && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-muted-foreground">{unit}</span>}
    </span>
  );
}

const SIDES = ["Top", "Right", "Bottom", "Left"] as const;

/** Padding on four sides, linked by default when they are all the same. */
export function BoxField({ value, fallback, onChange }: { value: Box | undefined; fallback: Box; onChange: (b: Box | undefined) => void }) {
  const box = value ?? fallback;
  const [linked, setLinked] = useState(() => box.every((v) => v === box[0]));
  const set = (i: number, v: number | undefined) => {
    const n = v ?? 0;
    onChange(linked ? [n, n, n, n] : (box.map((x, j) => (j === i ? n : x)) as Box));
  };
  return (
    <div className="flex w-full items-center gap-1.5">
      {linked ? (
        <NumberField value={value ? box[0] : undefined} placeholder={fallback[0]} onChange={(v) => set(0, v)} min={0} max={160} unit="px" ariaLabel="Padding on all sides" />
      ) : (
        <div className="grid flex-1 grid-cols-4 gap-1">
          {SIDES.map((side, i) => (
            <NumberField key={side} value={value ? box[i] : undefined} placeholder={fallback[i]} onChange={(v) => set(i, v)} min={0} max={160} ariaLabel={`${side} padding`} className="[&_input]:px-1 [&_input]:text-center" />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setLinked((l) => !l)}
        aria-label={linked ? "Set each side" : "Same on all sides"}
        title={linked ? "Set each side" : "Same on all sides"}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {linked ? <Link2 className="size-3.5" /> : <Link2Off className="size-3.5" />}
      </button>
    </div>
  );
}

/** Text inside the inspector that commits on blur (labels, alt text, links). */
export function TextInput({ value, onChange, placeholder, ariaLabel, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel: string; multiline?: boolean }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (!focused && seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const common = {
    value: draft,
    placeholder,
    "aria-label": ariaLabel,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      if (draft !== value) onChange(draft);
    },
  };
  return multiline ? (
    <textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} className={cn(fieldClass, "h-auto resize-y py-1.5 leading-5")} />
  ) : (
    <input {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={fieldClass} />
  );
}
