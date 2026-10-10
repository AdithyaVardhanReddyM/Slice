"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "ink";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-[background,transform,opacity] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        variant === "primary" && "bg-[var(--tang)] text-white hover:bg-[#ef6f00]",
        variant === "ink" && "bg-[var(--ink)] text-white hover:bg-black",
        variant === "secondary" &&
          "border border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]",
        variant === "ghost" && "text-[var(--ink-2)] hover:bg-[var(--cream)]",
        className,
      )}
    />
  );
}

export function Chip({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: "neutral" | "qloo" | "catalog" | "llm" | "slice" | "sun";
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-4",
        tone === "neutral" && "bg-[var(--cream-2)] text-[var(--ink-2)]",
        tone === "qloo" && "bg-[var(--qloo-soft)] text-[var(--qloo)]",
        tone === "catalog" && "bg-[var(--catalog-soft)] text-[var(--catalog)]",
        tone === "llm" && "bg-[var(--llm-soft)] text-[var(--llm)]",
        tone === "slice" && "bg-[var(--slice-soft)] text-[var(--slice)]",
        tone === "sun" && "bg-[var(--sun-soft)] text-[var(--ink)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SliceMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 49 34" width={size} height={(size * 34) / 49} aria-hidden="true">
      <path d="M15.4992 0H36.5808L21.0816 22.9729H0L15.4992 0Z" fill="#FFE642" />
      <path
        d="M16.4224 25.102L10.4192 34H32.5008L48 11.0271H31.7024L22.2064 25.102H16.4224Z"
        fill="#FF7900"
      />
    </svg>
  );
}

export function Bar({ value, tone = "ink" }: { value: number; tone?: "ink" | "qloo" | "sun" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="bar">
      <i
        style={{
          width: `${pct}%`,
          background: tone === "qloo" ? "var(--qloo)" : tone === "sun" ? "var(--tang)" : "var(--ink)",
        }}
      />
    </div>
  );
}

export const typeLabel = (urn: string) => {
  const t = urn.split(":").pop() ?? "";
  return { tv_show: "show", videogame: "game" }[t] ?? t.replace(/_/g, " ");
};

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
