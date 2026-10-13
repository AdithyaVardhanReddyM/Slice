"use client";

// The inspector's inputs. Every control shows the value the merchant set by
// hand, or the page's own (computed) value greyed out as its placeholder, and
// reports changes as CSS strings (null clears the hand value).

import { ChevronRight, RotateCcw, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* Layout ----------------------------------------------------------------------- */

export function PanelSection({ title, set, defaultOpen = true, children, aside }: { title: string; set?: boolean; defaultOpen?: boolean; children: ReactNode; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b last:border-b-0">
      <div className="flex h-10 items-center gap-1 pr-2 pl-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium" aria-expanded={open}>
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="truncate">{title}</span>
          {set && <span className="size-1.5 shrink-0 rounded-full bg-blue-600" aria-label="Changed by you" />}
        </button>
        {aside}
      </div>
      {open && <div className="space-y-2 px-3 pb-3.5">{children}</div>}
    </section>
  );
}

/** Label on the left, control on the right; a set value can be reset from the label. */
export function PropRow({ label, set, onReset, children, onScrub, className }: { label: string; set?: boolean; onReset?: () => void; children: ReactNode; onScrub?: (dx: number, done: boolean) => void; className?: string }) {
  const start = useRef<number | null>(null);
  return (
    <div className={cn("group/row grid grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-2", className)}>
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={cn("truncate text-xs", set ? "font-medium text-blue-700 dark:text-blue-400" : "text-muted-foreground", onScrub && "cursor-ew-resize select-none")}
          onPointerDown={
            onScrub
              ? (e) => {
                  start.current = e.clientX;
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                }
              : undefined
          }
          onPointerMove={onScrub ? (e) => start.current !== null && onScrub(e.clientX - start.current, false) : undefined}
          onPointerUp={
            onScrub
              ? (e) => {
                  if (start.current !== null) onScrub(e.clientX - start.current, true);
                  start.current = null;
                }
              : undefined
          }
          title={set ? "Set by you" : undefined}
        >
          {label}
        </span>
        {set && onReset && (
          <button type="button" onClick={onReset} className="hidden size-4 shrink-0 items-center justify-center rounded text-muted-foreground group-hover/row:inline-flex hover:bg-muted hover:text-foreground" aria-label={`Reset ${label.toLowerCase()}`} title="Back to the page's style">
            <RotateCcw className="size-3" />
          </button>
        )}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

const fieldClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-xs tabular-nums outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

/* Text and numbers ------------------------------------------------------------------- */

/** A text field that reports on Enter or blur; Escape restores. */
export function TextField({ value, placeholder, onCommit, className, multiline, ariaLabel }: { value: string | undefined; placeholder?: string; onCommit: (v: string | null) => void; className?: string; multiline?: boolean; ariaLabel?: string }) {
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  // Follow the value while not typing (undo, another control, a new selection).
  const [seen, setSeen] = useState(value);
  if (!focused && seen !== value) {
    setSeen(value);
    setDraft(value ?? "");
  }
  const commit = () => {
    const v = draft.trim();
    if (v === (value ?? "")) return;
    onCommit(v ? draft : null);
  };
  const common = {
    value: draft,
    placeholder,
    "aria-label": ariaLabel,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      commit();
    },
  };
  if (multiline) {
    return <textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} className={cn(fieldClass, "h-auto resize-y py-1.5 leading-5", className)} />;
  }
  return (
    <input
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={cn(fieldClass, className)}
    />
  );
}

const NUM = /^(-?\d*\.?\d+)\s*([a-z%]*)$/i;

export function parseLength(v: string | undefined): { n: number; unit: string } | null {
  const m = v ? NUM.exec(v.trim()) : null;
  return m ? { n: parseFloat(m[1]), unit: m[2] } : null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A computed value for show: "74.9008px" → "74.9px", "-1.29636px" → "-1.3px". */
export function tidy(v: string | undefined): string | undefined {
  const p = parseLength(v);
  if (!p) return v;
  const n = Math.abs(p.n) >= 10 ? Math.round(p.n * 10) / 10 : Math.round(p.n * 100) / 100;
  return `${n}${p.unit}`;
}

/**
 * A CSS length: type "24", "2rem", "50%", "auto". Bare numbers get `unit`.
 * Arrow keys step (Shift ×10, Alt ×0.1); dragging the row's label scrubs.
 */
export function LengthField({
  value,
  placeholder,
  onChange,
  unit = "px",
  step = 1,
  min,
  max,
  className,
  ariaLabel,
}: {
  value: string | undefined;
  placeholder?: string;
  onChange: (v: string | null) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  // Follow the value while not typing (undo, another control, a new selection).
  const [seen, setSeen] = useState(value);
  if (!focused && seen !== value) {
    setSeen(value);
    setDraft(value ?? "");
  }
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const normalise = (raw: string): string | null => {
    const t = raw.trim();
    if (!t) return null;
    const p = parseLength(t);
    if (p) return `${round(clamp(p.n))}${p.unit || unit}`;
    return t;
  };
  return (
    <input
      value={draft}
      placeholder={tidy(placeholder)}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const next = normalise(draft);
        if (next !== (value ?? null)) onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const base = parseLength(draft) ?? parseLength(placeholder) ?? { n: 0, unit };
          const s = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * step * (e.key === "ArrowUp" ? 1 : -1);
          const next = `${round(clamp(base.n + s))}${base.unit || unit}`;
          setDraft(next);
          onChange(next);
        }
      }}
      className={cn(fieldClass, className)}
    />
  );
}

/** Scrub handler for a PropRow label driving a length: pixels dragged → steps. */
export function useScrub(value: string | undefined, placeholder: string | undefined, onChange: (v: string | null) => void, opts: { unit?: string; step?: number; min?: number; max?: number } = {}) {
  const origin = useRef<{ n: number; unit: string } | null>(null);
  return (dx: number, done: boolean) => {
    if (!origin.current) origin.current = parseLength(value) ?? parseLength(placeholder) ?? { n: 0, unit: opts.unit ?? "px" };
    const o = origin.current;
    const n = Math.min(opts.max ?? Infinity, Math.max(opts.min ?? -Infinity, o.n + Math.round(dx / 2) * (opts.step ?? 1)));
    onChange(`${round(n)}${o.unit || opts.unit || "px"}`);
    if (done) origin.current = null;
  };
}

/* Choices ----------------------------------------------------------------------------- */

export function SelectField({ value, placeholder, options, onChange, ariaLabel, className }: { value: string | undefined; placeholder?: string; options: { value: string; label: string }[]; onChange: (v: string | null) => void; ariaLabel?: string; className?: string }) {
  const current = value ?? "";
  const shown = options.find((o) => o.value === placeholder)?.label ?? placeholder;
  // A value set some other way (the builder, a preset) still shows as itself.
  const all = value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
  return (
    <span className={cn("relative block w-full min-w-0", className)}>
      <select
        aria-label={ariaLabel}
        value={current}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(fieldClass, "appearance-none pr-6", !value && "text-muted-foreground")}
      >
        <option value="">{shown ? `${shown}` : "Default"}</option>
        {all.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
    </span>
  );
}

/** Icon buttons, one active; the page's own value is shown faintly when nothing is set. */
export function IconChoice<T extends string>({ value, fallback, options, onChange, className }: { value: T | undefined; fallback?: string; options: { value: T; label: string; icon: ReactNode }[]; onChange: (v: T | null) => void; className?: string }) {
  return (
    <div role="radiogroup" className={cn("inline-flex h-7 w-full items-center rounded-md bg-muted p-0.5", className)}>
      {options.map((o) => {
        const on = value === o.value;
        const ghost = !value && fallback === o.value;
        return (
          <Tooltip key={o.value}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={o.label}
                  onClick={() => onChange(on ? null : o.value)}
                  className={cn(
                    "inline-flex h-6 min-w-0 flex-1 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5",
                    on && "bg-background text-foreground shadow-xs",
                    ghost && "text-foreground/80",
                  )}
                />
              }
            >
              {o.icon}
            </TooltipTrigger>
            <TooltipContent>{o.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function SliderField({ value, fallback, min, max, step = 1, suffix = "", onChange }: { value: number | undefined; fallback: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number | null) => void }) {
  const shown = value ?? fallback;
  return (
    <div className="flex w-full items-center gap-2">
      <Slider className="flex-1" value={shown} min={min} max={max} step={step} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
      <span className={cn("w-10 shrink-0 text-right text-xs tabular-nums", value === undefined && "text-muted-foreground")}>
        {round(shown)}
        {suffix}
      </span>
    </div>
  );
}

/* Colour ------------------------------------------------------------------------------- */

export interface Swatch {
  label: string;
  /** What gets written: a kit token (var(--pg-brand-primary)) or a colour. */
  value: string;
  /** The colour it shows as. */
  color: string;
}

/** "rgb(17, 24, 39)" / "rgba(…)" / "#abc" → "#112739" (with alpha as 8 digits when not opaque). */
export function toHex(css: string | undefined): string | undefined {
  if (!css) return undefined;
  const s = css.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) {
    if (s.length === 4) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
    return s.toLowerCase();
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (!m) return undefined;
  const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (!Number.isFinite(a)) a = 1;
  return `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}${a < 1 ? hex(a * 255) : ""}`;
}

const isTransparent = (c: string | undefined) => !c || c === "transparent" || /rgba?\([^)]*[,/ ]\s*0\s*\)$/.test(c);

function SwatchChip({ color, className }: { color: string | undefined; className?: string }) {
  return (
    <span
      className={cn("relative inline-block size-4 shrink-0 overflow-hidden rounded-[4px]", className)}
      style={{ backgroundImage: "linear-gradient(45deg, #e5e5e5 25%, transparent 25%, transparent 75%, #e5e5e5 75%), linear-gradient(45deg, #e5e5e5 25%, transparent 25%, transparent 75%, #e5e5e5 75%)", backgroundSize: "6px 6px", backgroundPosition: "0 0, 3px 3px" }}
    >
      <span className="absolute inset-0" style={{ background: color ?? "transparent" }} />
      {/* The edge sits on top, so white and pale swatches still read. */}
      <span className="absolute inset-0 rounded-[inherit] ring-1 ring-foreground/20 ring-inset" />
    </span>
  );
}

/** A colour: brand tokens and the page's own colours as swatches, a picker, hex and opacity. */
export function ColorField({ value, placeholder, onChange, swatches, page, allowNone = true }: { value: string | undefined; placeholder?: string; onChange: (v: string | null) => void; swatches: Swatch[]; page: Swatch[]; allowNone?: boolean }) {
  const token = swatches.find((s) => s.value === value);
  const shown = token?.color ?? value ?? placeholder;
  const hex = toHex(token?.color ?? value ?? placeholder);
  const label = token ? token.label : value ? (toHex(value) ?? value) : isTransparent(placeholder) ? "None" : (toHex(placeholder) ?? placeholder ?? "");
  const opaque = hex?.slice(0, 7) ?? "#000000";
  const alpha = hex && hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1;
  const [hexDraft, setHexDraft] = useState(hex ?? "");
  const [seenHex, setSeenHex] = useState(hex);
  if (seenHex !== hex) {
    setSeenHex(hex);
    setHexDraft(hex ?? "");
  }

  const withAlpha = (h: string, a: number) => (a >= 0.995 ? h.slice(0, 7) : `${h.slice(0, 7)}${Math.round(a * 255).toString(16).padStart(2, "0")}`);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" className={cn(fieldClass, "flex items-center gap-2 text-left")}>
            <SwatchChip color={isTransparent(shown) ? "transparent" : shown} />
            <span className={cn("truncate", !value && "text-muted-foreground")}>{label}</span>
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 gap-3">
        <SwatchGrid title="Brand" swatches={swatches} current={value} onPick={onChange} />
        {page.length > 0 && <SwatchGrid title="On this page" swatches={page} current={value} onPick={onChange} />}
        <div className="flex items-center gap-2">
          <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/15">
            <span className="absolute inset-0" style={{ background: opaque }} />
            <input type="color" value={opaque} onChange={(e) => onChange(withAlpha(e.target.value, alpha))} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a colour" />
          </label>
          <input
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={() => {
              const h = toHex(hexDraft.startsWith("#") ? hexDraft : `#${hexDraft}`);
              if (h && h !== hex) onChange(h);
              else setHexDraft(hex ?? "");
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className={fieldClass}
            aria-label="Hex colour"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-muted-foreground">Opacity</span>
          <SliderField value={Math.round(alpha * 100)} fallback={100} min={0} max={100} suffix="%" onChange={(v) => onChange(withAlpha(opaque, (v ?? 100) / 100))} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          {allowNone ? (
            <button type="button" onClick={() => onChange("transparent")} className="text-xs text-muted-foreground hover:text-foreground">
              No colour
            </button>
          ) : (
            <span />
          )}
          {value !== undefined && (
            <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="size-3" /> {"Page's colour"}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SwatchGrid({ title, swatches, current, onPick }: { title: string; swatches: Swatch[]; current: string | undefined; onPick: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{title}</p>
      <div className="grid grid-cols-8 gap-1.5">
        {swatches.map((s) => (
          <button
            key={s.value + s.label}
            type="button"
            title={s.label}
            aria-label={s.label}
            onClick={() => onPick(s.value)}
            className={cn("rounded-[5px] p-0.5 ring-offset-1 transition-shadow", current === s.value ? "ring-2 ring-blue-600" : "hover:ring-1 hover:ring-foreground/30")}
          >
            <SwatchChip color={s.color} className="size-5" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* Box model ------------------------------------------------------------------------------- */

const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];

function BoxInput({ value, placeholder, onChange, label }: { value: string | undefined; placeholder: string; onChange: (v: string | null) => void; label: string }) {
  const strip = (v: string | undefined) => (v && v.endsWith("px") ? v.slice(0, -2) : v);
  return (
    <LengthField
      value={strip(value)}
      placeholder={strip(placeholder)}
      onChange={(v) => onChange(v)}
      ariaLabel={label}
      className={cn("h-6 w-11 border-transparent bg-transparent px-1 text-center hover:border-input", value !== undefined && "font-medium text-blue-700 dark:text-blue-400")}
    />
  );
}

/** Margin around padding, each side editable, like the browser's box model. */
export function BoxModel({ get, set, onHover }: { get: (prop: string) => { value: string | undefined; computed: string }; set: (props: Record<string, string | null>) => void; onHover?: (on: boolean) => void }) {
  const field = (kind: "margin" | "padding", side: Side) => {
    const p = `${kind}-${side}`;
    const { value, computed } = get(p);
    return <BoxInput label={`${kind} ${side}`} value={value} placeholder={computed} onChange={(v) => set({ [p]: v })} />;
  };
  const all = (kind: "margin" | "padding") => {
    const values = SIDES.map((s) => get(`${kind}-${s}`).value);
    const same = values.every((v) => v === values[0]) ? values[0] : undefined;
    return (
      <LengthField
        value={same}
        placeholder={values.some((v) => v !== undefined) ? "Mixed" : "All sides"}
        onChange={(v) => set(Object.fromEntries(SIDES.map((s) => [`${kind}-${s}`, v])))}
        ariaLabel={`${kind} on all sides`}
      />
    );
  };
  return (
    <div className="space-y-2" onPointerEnter={() => onHover?.(true)} onPointerLeave={() => onHover?.(false)}>
      <div className="relative rounded-lg border border-dashed border-orange-300 bg-orange-50/60 px-1.5 py-1 dark:border-orange-900 dark:bg-orange-950/20">
        <span className="absolute top-1 left-2 text-[10px] text-orange-700/80 dark:text-orange-300/80">Margin</span>
        <div className="flex justify-center">{field("margin", "top")}</div>
        <div className="flex items-center justify-between gap-1">
          {field("margin", "left")}
          <div className="relative flex-1 rounded-md border border-dashed border-green-400 bg-green-50/70 px-1 py-1 dark:border-green-900 dark:bg-green-950/20">
            <span className="absolute top-1 left-1.5 text-[10px] text-green-700/80 dark:text-green-300/80">Padding</span>
            <div className="flex justify-center">{field("padding", "top")}</div>
            <div className="flex items-center justify-between">
              {field("padding", "left")}
              <span className="h-4 w-8 rounded-sm bg-background ring-1 ring-foreground/10" />
              {field("padding", "right")}
            </div>
            <div className="flex justify-center">{field("padding", "bottom")}</div>
          </div>
          {field("margin", "right")}
        </div>
        <div className="flex justify-center">{field("margin", "bottom")}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PropRow label="Padding" className="grid-cols-[3.25rem_minmax(0,1fr)]">
          {all("padding")}
        </PropRow>
        <PropRow label="Margin" className="grid-cols-[3.25rem_minmax(0,1fr)]">
          {all("margin")}
        </PropRow>
      </div>
    </div>
  );
}

/* Misc ------------------------------------------------------------------------------------- */

export function ClearButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
      <X className="size-3.5" />
    </button>
  );
}
