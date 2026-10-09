"use client";

import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input as UiInput } from "@/components/ui/input";
import { Switch as UiSwitch } from "@/components/ui/switch";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import {
  Tabs as UiTabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Thin wrappers over shadcn/ui so feature code keeps one import surface.

export function Field({
  label,
  hint,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {optional && (
          <span className="text-xs text-muted-foreground">Optional</span>
        )}
      </span>
      {children}
      {hint && (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <UiInput {...props} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <UiTextarea {...props} />;
}

/** Native select styled to match shadcn inputs. */
export function Select({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        className={cn(
          "h-8 w-full appearance-none rounded-lg border border-input bg-transparent pr-8 pl-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

export function Switch(props: ComponentProps<typeof UiSwitch>) {
  return <UiSwitch {...props} />;
}

/** Row with a label/description on the left and a control on the right. */
export function SettingRow({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-start justify-between gap-6 py-4", className)}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm font-medium">{title}</div>
        {description && (
          <div className="max-w-md text-sm text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

/** Segmented control, styled like shadcn tabs. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "sm",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center rounded-lg bg-muted p-[3px] text-muted-foreground",
        size === "sm" ? "h-8" : "h-9",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-full items-center justify-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-all hover:text-foreground",
            value === o.value && "bg-background text-foreground shadow-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Toggle chip for multi-select sets (domains, tags). */
export function Chip({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
        selected
          ? "border-primary/40 bg-primary/10 text-orange-700"
          : "bg-background text-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* Tabs: shadcn line variant for page sections. */

export function Tabs(props: ComponentProps<typeof UiTabs>) {
  return <UiTabs {...props} />;
}

export function TabList({
  className,
  children,
  ...props
}: ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      variant="line"
      className={cn("w-full justify-start border-b", className)}
      {...props}
    >
      {children}
    </TabsList>
  );
}

export function Tab({
  className,
  ...props
}: ComponentProps<typeof TabsTrigger>) {
  return <TabsTrigger className={cn("flex-none px-2", className)} {...props} />;
}

export const TabPanel = TabsContent;
