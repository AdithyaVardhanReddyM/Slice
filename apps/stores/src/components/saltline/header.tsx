"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "cn";
import { href, openHotels } from "@/lib/saltline";
import { Logo } from "./logo";

const nav = [
  { label: "Hotels", to: href.hotels },
  { label: "Experiences", to: href.experiences },
  { label: "Offers", to: href.offers },
  { label: "Journal", to: href.journal },
  { label: "About", to: href.about },
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
    <header className="sticky top-0 z-40 border-b border-sl-line/70 bg-sl-paper">
      <div className="sl-container flex h-[76px] items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMenu(true)} className="-ml-2 p-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-6" strokeWidth={1.5} />
          </button>
          <Logo height={34} />
        </div>
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
          {nav.map((n) => (
            <Link
              key={n.to}
              href={n.to}
              className={cn(
                "text-[15px] text-sl-charcoal-soft transition-colors hover:text-sl-charcoal",
                isActive(n.to) && "text-sl-charcoal underline decoration-sl-sea decoration-[1.5px] underline-offset-[9px]",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Link
          href={href.plan()}
          className="hidden border border-sl-charcoal px-5 py-2.5 text-[14px] font-medium tracking-wide text-sl-charcoal transition-colors hover:bg-sl-charcoal hover:text-sl-paper sm:inline-block"
        >
          Plan your stay
        </Link>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setMenu(false)} className="absolute inset-0 bg-sl-charcoal/40" />
          <div className="drawer-left absolute left-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-sl-paper">
            <div className="flex items-center justify-between border-b border-sl-line px-5 py-5">
              <Logo height={30} />
              <button type="button" onClick={() => setMenu(false)} className="-mr-2 p-2" aria-label="Close">
                <X className="size-5" strokeWidth={1.5} />
              </button>
            </div>
            <nav className="flex flex-col px-5 py-2" aria-label="Mobile">
              {nav.map((n) => (
                <Link key={n.to} href={n.to} className="sl-serif border-b border-sl-line py-4 text-[28px]">
                  {n.label}
                </Link>
              ))}
              <div className="mt-6 flex flex-col gap-2 text-sm text-sl-mute">
                {openHotels.map((h) => (
                  <Link key={h.slug} href={href.hotel(h.slug)} className="hover:text-sl-charcoal">
                    {h.name}
                  </Link>
                ))}
              </div>
            </nav>
            <Link href={href.plan()} className="m-5 mt-auto border border-sl-charcoal py-3 text-center text-[15px] font-medium">
              Plan your stay
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
