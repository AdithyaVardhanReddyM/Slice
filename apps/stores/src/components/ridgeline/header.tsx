"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, ShoppingBag, X } from "lucide-react";
import { cn } from "cn";
import { useCart } from "@/lib/cart";
import { href } from "@/lib/ridgeline";
import { Logo } from "./logo";

const nav = [
  { label: "Coffee", to: href.coffee },
  { label: "Subscriptions", to: href.subscriptions },
  { label: "Gifts", to: href.gifts },
  { label: "Cafés", to: href.cafes },
  { label: "About", to: href.about },
  { label: "Journal", to: href.journal },
];

export function Header() {
  const { count, setOpen } = useCart();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);

  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenu(false);
  }

  const isActive = (to: string) => pathname === to || (to !== href.home && pathname.startsWith(to + "/"));

  return (
    <header className="sticky top-0 z-40 border-b border-rl-line bg-rl-cream">
      <p className="bg-rl-ink px-4 py-2 text-center text-[13px] text-rl-cream">
        Free shipping on orders over $40 <span className="mx-2 opacity-50">·</span> Roasted and shipped within 48 hours
        <span className="hidden sm:inline">
          <span className="mx-2 opacity-50">·</span> Austin café opening in November
        </span>
      </p>
      <div className="rl-container flex h-[72px] items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMenu(true)} className="-ml-2 p-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-6" strokeWidth={1.75} />
          </button>
          <Logo height={40} />
        </div>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {nav.map((n) => (
            <Link
              key={n.to}
              href={n.to}
              className={cn(
                "text-[15px] font-medium text-rl-ink-soft transition-colors hover:text-rl-rust",
                isActive(n.to) && "text-rl-ink underline decoration-rl-rust decoration-2 underline-offset-[10px]",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-[4px] border border-rl-ink px-3.5 py-2 text-sm font-semibold hover:bg-rl-ink hover:text-rl-cream"
          aria-label={`Open bag, ${count} items`}
        >
          <ShoppingBag className="size-4" strokeWidth={1.75} />
          <span className="tabular-nums">{count}</span>
        </button>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setMenu(false)} className="absolute inset-0 bg-rl-ink/40" />
          <div className="drawer-left absolute left-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-rl-cream">
            <div className="flex items-center justify-between border-b border-rl-line px-5 py-4">
              <Logo height={36} />
              <button type="button" onClick={() => setMenu(false)} className="-mr-2 p-2" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex flex-col px-5 py-4" aria-label="Mobile">
              {nav.map((n) => (
                <Link key={n.to} href={n.to} className="rl-serif border-b border-rl-line py-4 text-2xl">
                  {n.label}
                </Link>
              ))}
            </nav>
            <p className="mt-auto px-5 pb-8 text-sm text-rl-mute">
              Roasted on Alberta Street, Portland. Cafés in Portland and Seattle; Austin opening in November.
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
