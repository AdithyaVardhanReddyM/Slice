import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Settings block: heading and description on the left, a card of controls on the right. */
export function SettingsSection({
  title,
  description,
  children,
  footer,
  className,
  cardClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  cardClassName?: string;
}) {
  return (
    <section
      className={cn(
        "grid gap-x-10 gap-y-4 border-b py-8 first:pt-6 last:border-0 lg:grid-cols-3",
        className,
      )}
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="min-w-0 lg:col-span-2">
        <Card className={cn("gap-0 py-0", cardClassName)}>{children}</Card>
        {footer && (
          <div className="mt-2 text-sm text-muted-foreground">{footer}</div>
        )}
      </div>
    </section>
  );
}

/** Padded body inside a SettingsSection card. */
export function SectionBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-4 p-4", className)}>{children}</div>;
}

/** Divided SettingRow list inside a SettingsSection card. */
export function SectionRows({ children }: { children: ReactNode }) {
  return <div className="divide-y px-4">{children}</div>;
}
