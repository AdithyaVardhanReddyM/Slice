import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Section-card stat: label, large value, optional badge and supporting line. */
export function StatCard({
  label,
  value,
  badge,
  hint,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  badge?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="num text-2xl font-semibold tabular-nums">
          {value}
        </CardTitle>
        {badge && <CardAction>{badge}</CardAction>}
      </CardHeader>
      {(children || hint) && (
        <CardContent className="mt-auto space-y-2">
          {children}
          {hint && <div className="text-sm text-muted-foreground">{hint}</div>}
        </CardContent>
      )}
    </Card>
  );
}

/** Grid wrapper for a row of StatCards. */
export function StatGrid({
  children,
  className = "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-4", className)}>{children}</div>;
}
