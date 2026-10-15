"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SERVICES } from "@/lib/services";
import { SliceWordmark } from "@/components/console/logo";
import { AccountButton } from "./account-button";

const NAV = [
  { href: "/dashboard", label: "Home", exact: true },
  ...SERVICES.map((s) => ({
    href: `/dashboard/${s.segment}`,
    label: s.label,
    exact: false,
  })),
];

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
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-black/[0.05] bg-canvas/85 backdrop-blur-md">
        <div className="relative mx-auto flex h-16 w-full max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link href="/dashboard" aria-label="Home" className="shrink-0">
            <SliceWordmark />
          </Link>
          <nav
            aria-label="Services"
            className="scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06] lg:absolute lg:left-1/2 lg:-translate-x-1/2"
          >
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-colors sm:px-4",
                    active
                      ? "bg-neutral-900 text-white shadow-sm"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            {actions}
            <AccountButton />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
