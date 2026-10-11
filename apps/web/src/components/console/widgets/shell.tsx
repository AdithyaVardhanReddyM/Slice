"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SERVICES } from "@/lib/services";
import { SliceWordmark } from "@/components/console/logo";
import { AccountButton } from "./account-button";

/**
 * Top bar + page body for screens outside a widget console: the services
 * home, each service's client list, create flows and placeholders. The
 * service links are the console's primary navigation.
 */
export function StandaloneShell({
  children,
  actions,
}: {
  children: ReactNode;
  /** Extra controls left of the account button. */
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background/95 px-6 backdrop-blur">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" aria-label="Services">
            <SliceWordmark />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Services">
            {SERVICES.map((s) => {
              const href = `/dashboard/${s.segment}`;
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={s.id}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {actions}
          <AccountButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
