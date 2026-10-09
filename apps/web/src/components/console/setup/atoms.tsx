"use client";

import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Check, Copy, Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

/** Like `Field`, but a div: safe to wrap chip groups and other button sets. */
export function FieldGroup({
  label,
  hint,
  aside,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="group" className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {aside && (
          <span className="text-xs text-muted-foreground">{aside}</span>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Input with a fixed leading (and optional trailing) adornment, e.g. `https://` or `%`. */
export function AdornedInput({
  prefix,
  suffix,
  className,
  inputClassName,
  ...props
}: ComponentProps<"input"> & {
  prefix?: ReactNode;
  suffix?: ReactNode;
  inputClassName?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-8 w-full items-stretch overflow-hidden rounded-lg border border-input bg-transparent text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:bg-input/30",
        className,
      )}
    >
      {prefix && (
        <span className="flex items-center border-r bg-muted px-2.5 text-muted-foreground select-none">
          {prefix}
        </span>
      )}
      <input
        className={cn(
          "min-w-0 flex-1 bg-transparent px-2.5 outline-none placeholder:text-muted-foreground",
          inputClassName,
        )}
        {...props}
      />
      {suffix && (
        <span className="flex items-center pr-2.5 text-muted-foreground select-none">
          {suffix}
        </span>
      )}
    </span>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "default";
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the state still confirms intent.
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={copy}
      className={className}
    >
      {copied ? (
        <Check data-icon="inline-start" />
      ) : (
        <Copy data-icon="inline-start" />
      )}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}

/** Removable tokens with an inline "add" field. Enter or comma commits. */
export function TokenInput({
  values,
  onChange,
  placeholder,
  validate,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Return an error message to reject a value. */
  validate?: (value: string) => string | null;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const v = draft.trim().replace(/,$/, "");
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setError("Already added");
      return;
    }
    const problem = validate?.(v) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    onChange([...values, v]);
    setDraft("");
    setError(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent p-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="h-6 gap-1 pr-1">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <X />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="h-6 min-w-36 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        {draft && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
          >
            <Plus data-icon="inline-start" /> Add
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 aria-hidden className={cn("size-4 animate-spin", className)} />
  );
}

/** Radio group laid out as a grid of `ChoiceCard`s. */
export function ChoiceCardGroup<T extends string>({
  value,
  onValueChange,
  className,
  children,
  ...props
}: {
  value: T | null;
  onValueChange: (value: T) => void;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      className={cn("grid gap-3", className)}
      {...props}
    >
      {children}
    </RadioGroup>
  );
}

/** Selectable card inside a `ChoiceCardGroup` (vertical, catalog source). */
export function ChoiceCard({
  value,
  icon,
  title,
  description,
  className,
}: {
  value: string;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-data-checked:border-primary has-data-checked:bg-primary/5",
        className,
      )}
    >
      <span className="flex items-start justify-between gap-2">
        {icon && (
          <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {icon}
          </span>
        )}
        <RadioGroupItem value={value} className="ml-auto" />
      </span>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        {description && (
          <span className="block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/** Two-column settings row: label + help on the left, control on the right. */
export function FormRow({
  title,
  description,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-8 gap-y-3 p-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]",
        className,
      )}
    >
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {aside && (
          <div className="pt-1 text-xs text-muted-foreground">{aside}</div>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Small tinted notice for inline warnings and info. */
export function Notice({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: "neutral" | "warn" | "bad" | "ok";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        tone === "neutral" && "bg-muted/50 text-muted-foreground",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "bad" && "border-red-200 bg-red-50 text-red-700",
        tone === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        className,
      )}
    >
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Labelled, muted stage for the shopper-facing previews beside a step. */
export function PreviewFrame({
  title,
  actions,
  caption,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  actions?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-3 xl:sticky xl:top-20", className)}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {actions}
      </div>
      <div className={cn("rounded-xl border bg-muted/50 p-6", bodyClassName)}>
        {children}
      </div>
      {caption && (
        <div className="text-xs text-muted-foreground">{caption}</div>
      )}
    </div>
  );
}
