"use client";

import Link from "next/link";
import {
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** The home's card surface: white, soft-edged, on the canvas. `delay` staggers its entrance. */
export function Tile({
  className,
  delay = 0,
  style,
  ...props
}: ComponentProps<"section"> & { delay?: number }) {
  return (
    <section
      className={cn(
        "home-rise relative overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04),0_12px_32px_-16px_rgba(20,20,20,0.10)] ring-1 ring-black/[0.05]",
        className,
      )}
      style={{ animationDelay: `${delay}ms`, ...style }}
      {...props}
    />
  );
}

export function TileHeader({
  title,
  hint,
  actions,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 px-6 pt-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-neutral-950">
          {title}
        </h3>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

/** A service's row title: icon, name, a line of status and the way in. */
export function SectionHeader({
  icon: Icon,
  title,
  meta,
  href,
  linkLabel,
  extra,
}: {
  icon: LucideIcon;
  title: string;
  meta?: ReactNode;
  href: string;
  linkLabel: string;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06]">
          <Icon className="size-[18px] text-neutral-800" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
          {title}
        </h2>
        {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
        {extra}
      </div>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-full px-1 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-950"
      >
        {linkLabel}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

/** Rounded pill switch: the selected option is ink on white. */
export function PillTabs<T extends string | number>({
  value,
  onChange,
  options,
  size = "md",
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06]"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              size === "sm" ? "h-7 px-3 text-[13px]" : "h-8 px-4 text-sm",
              on
                ? "bg-neutral-900 text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Change against the prior period, as a small rounded chip. */
export function DeltaChip({
  now,
  before,
  className,
  inverse,
}: {
  now: number;
  before: number;
  className?: string;
  inverse?: boolean;
}) {
  if (!before)
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {now ? "New" : "No change"}
      </span>
    );
  const change = now / before - 1;
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "num inline-flex h-6 items-center gap-0.5 rounded-full px-2 text-xs font-semibold",
        inverse
          ? "bg-black/[0.08] text-neutral-950"
          : up
            ? "bg-emerald-50 text-emerald-700"
            : "bg-red-50 text-red-700",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {Math.abs(change * 100).toFixed(1)}%
    </span>
  );
}

/** A store or brand logo on white, or its initial on its own colour when it has no logo. */
export function Initial({
  name,
  color,
  logo,
  className,
  style,
}: {
  name: string;
  color: string;
  logo?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white",
        logo && "bg-white ring-1 ring-black/[0.08]",
        className,
      )}
      style={logo ? style : { background: color, ...style }}
    >
      {logo ? (
        // Merchant logos live on arbitrary hosts; next/image would need every one allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="size-[62%] object-contain" />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}

/** An image from someone else's host that falls back to a plain block when it breaks. */
export function RemoteImage({
  src,
  alt = "",
  className,
  fallback,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken)
    return (
      <>
        {fallback ?? <span className={cn("block bg-neutral-100", className)} />}
      </>
    );
  // Product photos and Qloo images live on other hosts; next/image would need each allow-listed.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setBroken(true)}
    />
  );
}
