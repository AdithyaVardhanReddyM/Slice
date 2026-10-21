"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, ShoppingBag, X } from "lucide-react";
import { cn } from "cn";
import { href } from "@/lib/halfmoon/site";

const nav = [
  { label: "Coffee", to: href.shop },
  { label: "Moon Club", to: href.club },
  { label: "Brew guides", to: href.brew },
  { label: "Our story", to: href.story },
  { label: "Visit", to: href.visit },
];

/** On the sky (homepage hero) everything is white; on white pages it's ink. */
export function Header({ tone = "light" }: { tone?: "sky" | "light" }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenu(false);
  }
  const sky = tone === "sky";

  return (
    <header className={cn("relative z-30", sky ? "text-white" : "text-(--hm-ink)")}>
      <div className="hm-container flex h-[84px] items-center gap-8">
        <Link href={href.home} aria-label="Half Moon Coffee home" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sky ? "/halfmoon/logo-light.svg" : "/halfmoon/logo.svg"} alt="Half Moon Coffee" width={140} height={28} className="h-7 w-auto sm:h-8" />
        </Link>
        <nav className="hidden items-center gap-7 text-[14.5px] font-medium lg:flex" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.label} href={n.to} className={cn("transition-opacity hover:opacity-70")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href={href.shop} className={cn("hm-btn hm-btn-sm hidden sm:inline-flex", sky ? "hm-btn-white" : "hm-btn-ink")}>
            Shop coffee
          </Link>
          <button type="button" className={cn("relative flex size-10 items-center justify-center rounded-full", sky ? "hover:bg-white/15" : "hover:bg-black/5")} aria-label="Your bag, empty">
            <ShoppingBag className="size-5" strokeWidth={1.8} />
          </button>
          <button type="button" onClick={() => setMenu(true)} className={cn("flex size-10 items-center justify-center rounded-full lg:hidden", sky ? "hover:bg-white/15" : "hover:bg-black/5")} aria-label="Open menu">
            <Menu className="size-5" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 bg-white text-(--hm-ink) lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="hm-container flex h-[84px] items-center justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/halfmoon/logo.svg" alt="Half Moon Coffee" className="h-7 w-auto" />
            <button type="button" onClick={() => setMenu(false)} className="flex size-10 items-center justify-center rounded-full hover:bg-black/5" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
          <nav className="hm-container mt-4 flex flex-col" aria-label="Main">
            {nav.map((n) => (
              <Link key={n.label} href={n.to} onClick={() => setMenu(false)} className="hm-display border-b border-(--hm-line) py-4 text-[36px]">
                {n.label}
              </Link>
            ))}
            <Link href={href.shop} onClick={() => setMenu(false)} className="hm-btn hm-btn-ink mt-8">
              Shop coffee
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
