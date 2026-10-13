"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "cn";
import { href } from "@/lib/gwen";
import { Wordmark } from "./logo";

const nav = [
  { label: "Perks", to: href.perks },
  { label: "Rewards", to: href.rewards },
  { label: "The app", to: href.app },
  { label: "The card", to: href.card },
  { label: "Fees", to: href.fees },
];

export function Header() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className={cn(
          "gw-glass pointer-events-auto mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 rounded-full pl-5 pr-2 transition-[background-color,box-shadow] duration-300",
          scrolled && "bg-white/85",
        )}
      >
        <Link href={href.home} aria-label="Gwen home" className="shrink-0">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {nav.map((n) => (
            <Link
              key={n.to}
              href={n.to}
              className="rounded-full px-4 py-2 text-[15px] font-medium text-gw-ink/75 transition-colors hover:bg-white/70 hover:text-gw-ink"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link href="#" className="hidden rounded-full px-4 py-2 text-[15px] font-medium text-gw-ink/75 transition-colors hover:text-gw-ink sm:inline-flex">
            Log in
          </Link>
          <Link href={href.apply} className="gw-btn h-12 bg-gw-ink pl-5 pr-4 text-white hover:bg-gw-ink-3">
            Check eligibility
            <ArrowRight className="size-4" strokeWidth={2.2} />
          </Link>
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="ml-1 grid size-12 place-items-center rounded-full bg-white/70 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {menu && (
        <div className="pointer-events-auto fixed inset-0 z-50 bg-gw-ink/30 backdrop-blur-sm lg:hidden" onClick={() => setMenu(false)}>
          <div className="gw-glass mx-3 mt-3 rounded-[28px] bg-white/90 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Wordmark />
              <button type="button" onClick={() => setMenu(false)} className="grid size-11 place-items-center rounded-full bg-gw-mist" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <nav className="mt-6 flex flex-col" aria-label="Mobile">
              {nav.map((n) => (
                <Link key={n.to} href={n.to} onClick={() => setMenu(false)} className="gw-display border-b border-gw-line py-4 text-[28px]">
                  {n.label}
                </Link>
              ))}
            </nav>
            <Link href={href.apply} onClick={() => setMenu(false)} className="gw-btn mt-6 w-full bg-gw-ink text-white">
              Check eligibility
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
