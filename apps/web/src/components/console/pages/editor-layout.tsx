import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One block of the brand editor: what it is on the left, the controls on the
 * right. Blocks stack with a hairline between them.
 */
export function EditorSection({
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
    <section className={cn("grid gap-x-8 gap-y-4 border-b py-8 first:pt-2 last:border-0 lg:grid-cols-[13rem_minmax(0,1fr)]", className)}>
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

/** A labelled control inside an EditorSection, with an optional hint under it. */
export function EditorField({
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
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A single-line setting: label and hint on the left, a compact control on the right. */
export function EditorRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
