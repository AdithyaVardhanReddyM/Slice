"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { cn } from "cn";
import { href } from "@/lib/knock/site";

const nav = [
  { label: "Restaurants", to: href.restaurants },
  { label: "Neighbourhoods", to: href.areas },
  { label: "How it works", to: href.how },
  { label: "For restaurants", to: href.partners },
];

/** Logo, pill nav and the order button. Sits inside the yellow hero on the homepage. */
export function Header({ className }: { className?: string }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenu(false);
  }

  return (
    <header className={cn("relative z-30", className)}>
      <div className="flex h-[76px] items-center gap-6">
        <Link href={href.home} aria-label="Knock home" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/knock/logo.svg" alt="Knock" width={150} height={36} className="h-8 w-auto sm:h-9" />
        </Link>

        <nav className="ml-auto hidden items-center gap-2 lg:flex" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.label} href={n.to} aria-current={pathname === n.to ? "page" : undefined} className="kn-pill">
              {n.label}
            </Link>
          ))}
          <Link href={href.restaurants} className="kn-pill w-11 justify-center px-0" aria-label="Search restaurants">
            <Search className="size-[18px]" strokeWidth={2} />
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <Link href={href.restaurants} className="kn-btn kn-btn-red kn-btn-sm hidden sm:inline-flex">
            Order now
          </Link>
          <button type="button" onClick={() => setMenu(true)} className="kn-pill w-11 justify-center px-0 lg:hidden" aria-label="Open menu">
            <Menu className="size-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 bg-(--kn-yellow) lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="kn-container flex h-[76px] items-center justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/knock/logo.svg" alt="Knock" className="h-8 w-auto" />
            <button type="button" onClick={() => setMenu(false)} className="kn-pill w-11 justify-center px-0" aria-label="Close menu">
              <X className="size-5" strokeWidth={2} />
            </button>
          </div>
          <nav className="kn-container mt-6 flex flex-col gap-1" aria-label="Main">
            {nav.map((n) => (
              <Link key={n.label} href={n.to} onClick={() => setMenu(false)} className="kn-display border-b border-(--kn-ink)/20 py-4 text-[40px]">
                {n.label}
              </Link>
            ))}
            <Link href={href.restaurants} onClick={() => setMenu(false)} className="kn-btn kn-btn-red mt-8">
              Order now
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
