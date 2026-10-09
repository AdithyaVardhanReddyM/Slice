import Link from "next/link";
import type { ReactNode } from "react";
import { SliceWordmark } from "@/components/console/logo";
import { AccountButton } from "./account-button";

/** Top bar + page body for screens outside a widget (list, create). */
export function StandaloneShell({
  children,
  actions,
}: {
  children: ReactNode;
  /** Extra controls left of the account button. */
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background/95 px-6 backdrop-blur">
        <Link href="/dashboard" aria-label="All widgets">
          <SliceWordmark />
        </Link>
        <div className="flex items-center gap-3">
          {actions}
          <AccountButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
