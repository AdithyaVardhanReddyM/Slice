"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "cn";
import { festival, href } from "@/lib/tagide";
import { Wordmark } from "./logo";

const nav = [
  { label: "Lineup", to: href.lineup },
  { label: "Tickets", to: href.tickets },
  { label: "Travel", to: href.travel },
  { label: "Grounds", to: href.grounds },
  { label: "Info", to: href.info },
];

export function Header() {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenu(false);
  }
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <header className="sticky top-0 z-40 border-b border-tg-ink/15 bg-tg-cream/95 backdrop-blur">
      <div className="tg-container flex h-[72px] items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMenu(true)} className="-ml-2 p-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-6" strokeWidth={2} />
          </button>
          <div className="flex flex-col">
            <Wordmark size={28} />
            <span className="-mt-0.5 hidden text-[12px] font-semibold text-tg-ink-soft sm:block">Three nights on the river</span>
          </div>
        </div>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {nav.map((n) => (
            <Link
              key={n.to}
              href={n.to}
              className={cn(
                "tg-label pb-0.5 text-tg-ink-soft transition-colors hover:text-tg-ink",
                isActive(n.to) && "border-b-2 border-tg-orange text-tg-ink",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <div className="hidden text-right text-[12px] font-semibold leading-tight text-tg-ink-soft md:block">
            <div>{festival.dates}</div>
            <div className="text-tg-mute">
              {festival.venue}, {festival.city}
            </div>
          </div>
          <Link href={href.tickets} className="tg-btn bg-tg-orange text-white hover:bg-tg-orange-deep">
            Tickets
          </Link>
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setMenu(false)} className="absolute inset-0 bg-tg-ink/50" />
          <div className="absolute left-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-tg-cream">
            <div className="flex items-center justify-between border-b border-tg-ink/15 px-5 py-5">
              <Wordmark size={26} />
              <button type="button" onClick={() => setMenu(false)} className="-mr-2 p-2" aria-label="Close">
                <X className="size-5" strokeWidth={2} />
              </button>
            </div>
            <nav className="flex flex-col px-5 py-2" aria-label="Mobile">
              {nav.map((n) => (
                <Link key={n.to} href={n.to} className="tg-display border-b border-tg-ink/15 py-4 text-[34px]">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto p-5 text-[13px] font-semibold text-tg-ink-soft">
              {festival.datesLong}
              <br />
              {festival.venue}, {festival.city}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
