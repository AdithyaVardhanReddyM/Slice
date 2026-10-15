"use client";

// Compact inspector controls for the studio's narrow side panel.

import { ImageOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MediaKit } from "@slice/backend/convex/mediaTypes";

export function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2.5 border-b px-4 py-3.5 last:border-b-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-7 items-center gap-3", className)}>
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** A number box that commits on blur or Enter, and nudges with the arrow keys. */
export function Num({ value, onChange, min, max, step = 1, suffix, label, className }: { value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; label?: string; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const round = (n: number) => Math.round(n / step) * step;
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (Number.isFinite(n)) onChange(clamp(round(n)));
  };
  const shown = draft ?? (value === undefined ? "" : String(Number(value.toFixed(step < 1 ? 2 : 0))));
  return (
    <label className={cn("flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md bg-neutral-100/80 px-2 text-xs ring-1 ring-transparent focus-within:bg-white focus-within:ring-sky-500", className)}>
      {label && <span className="shrink-0 text-muted-foreground">{label}</span>}
      <input
        inputMode="decimal"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const k = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            onChange(clamp(round((value ?? 0) + k)));
            setDraft(null);
          }
        }}
        className="w-full min-w-0 bg-transparent tabular-nums outline-none"
      />
      {suffix && <span className="shrink-0 text-muted-foreground">{suffix}</span>}
    </label>
  );
}

export function Seg<T extends string>({ value, onChange, options, className }: { value: T | undefined; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; className?: string }) {
  return (
    <div role="radiogroup" className={cn("flex h-7 flex-1 items-center gap-0.5 rounded-md bg-neutral-100/80 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          title={o.title}
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("flex h-full flex-1 items-center justify-center rounded-[5px] px-1.5 text-xs text-neutral-600 transition-colors hover:text-neutral-950", value === o.value && "bg-white text-neutral-950 shadow-sm")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, children, title }: { on: boolean | undefined; onChange: (v: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={!!on}
      onClick={() => onChange(!on)}
      className={cn("flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950", on && "bg-neutral-900 text-white hover:bg-neutral-800 hover:text-white")}
    >
      {children}
    </button>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

/** The kit's colours as swatches, a picker and a hex box. */
export function ColorPick({ value, onChange, kit, none }: { value: string | undefined; onChange: (v: string | undefined) => void; kit: MediaKit | undefined; none?: boolean }) {
  const swatches = Array.from(new Set(Object.values(kit?.colors ?? {}).filter((c): c is string => typeof c === "string" && c.startsWith("#")).concat(["#ffffff", "#000000"])));
  const [draft, setDraft] = useState<string | null>(null);
  const gradient = !!value && value.includes("gradient");
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {none && (
          <button type="button" title="None" onClick={() => onChange(undefined)} className={cn("relative size-5 overflow-hidden rounded-full bg-white ring-1 ring-black/15", !value && "ring-2 ring-sky-500")}>
            <span className="absolute top-1/2 left-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-500" />
          </button>
        )}
        {swatches.map((c) => (
          <button key={c} type="button" title={c} onClick={() => onChange(c)} className={cn("size-5 rounded-full ring-1 ring-black/15", value?.toLowerCase() === c.toLowerCase() && "ring-2 ring-sky-500 ring-offset-1")} style={{ background: c }} />
        ))}
        <label title="Pick a colour" className="relative size-5 cursor-pointer overflow-hidden rounded-full ring-1 ring-black/15" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
          <input type="color" value={value && HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
      {!gradient && (
        <input
          value={draft ?? value ?? ""}
          placeholder={none ? "None" : "#000000"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null) onChange(draft.trim() || undefined);
            setDraft(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-7 w-full rounded-md bg-neutral-100/80 px-2 font-mono text-xs outline-none focus:bg-white focus:ring-1 focus:ring-sky-500"
        />
      )}
      {gradient && <p className="truncate font-mono text-[11px] text-muted-foreground" title={value}>{value}</p>}
    </div>
  );
}

/** A picture; with onFocal, a click sets the point kept in view when it crops. */
export function ImagePreview({ src, focal, onFocal, contain }: { src?: string; focal?: { x: number; y: number }; onFocal?: (p: { x: number; y: number }) => void; contain?: boolean }) {
  if (!src)
    return (
      <div className="flex aspect-video items-center justify-center rounded-md bg-neutral-100 text-muted-foreground">
        <ImageOff className="size-4" />
      </div>
    );
  return (
    <div className="flex justify-center rounded-md bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:12px_12px] ring-1 ring-black/5">
      <div
        className={cn("relative inline-block max-w-full", contain && "p-2", onFocal && "cursor-crosshair")}
        onClick={(e) => {
          if (!onFocal) return;
          const r = (e.currentTarget.firstElementChild as HTMLElement).getBoundingClientRect();
          const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
          onFocal({ x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) });
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="block max-h-48 max-w-full" />
        {focal && <span className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} />}
      </div>
    </div>
  );
}

export function SmallButton({ onClick, children, disabled, tone = "default", title, className }: { onClick?: () => void; children: ReactNode; disabled?: boolean; tone?: "default" | "danger" | "primary"; title?: string; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium ring-1 transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5",
        tone === "default" && "bg-white text-neutral-800 ring-black/10 hover:bg-neutral-50",
        tone === "danger" && "bg-white text-destructive ring-destructive/25 hover:bg-destructive/5",
        tone === "primary" && "bg-neutral-900 text-white ring-neutral-900 hover:bg-neutral-800",
        className,
      )}
    >
      {children}
    </button>
  );
}
