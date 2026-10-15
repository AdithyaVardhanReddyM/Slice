"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { cn } from "cn";
import { href } from "@/lib/covers/site";
import { Logo } from "./logo";

const nav = [
  { label: "Restaurants", to: href.restaurants },
  { label: "Collections", to: href.collections },
  { label: "Areas", to: href.areas },
  { label: "Editors' notes", to: href.editors },
];

export function Header() {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenu(false);
  }
  const active = (to: string) => !to.includes("#") && (pathname === to || pathname.startsWith(`${to}/`));

  return (
    <header className="sticky top-0 z-40 border-b border-(--cv-line) bg-white/95 backdrop-blur">
      <div className="cv-container flex h-[68px] items-center gap-8">
        <Logo className="h-8 sm:h-[34px]" />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {nav.map((n) => (
            <Link
              key={n.label}
              href={n.to}
              aria-current={active(n.to) ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-[15px] font-medium text-(--cv-ink-soft) transition-colors hover:bg-(--cv-bg) hover:text-(--cv-ink)",
                active(n.to) && "text-(--cv-ink) underline decoration-(--cv-primary) decoration-2 underline-offset-[10px]",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Link href={href.restaurants} className="rounded-full p-2.5 text-(--cv-ink-soft) hover:bg-(--cv-bg) hover:text-(--cv-ink) lg:hidden" aria-label="Find a table">
            <Search className="size-5" strokeWidth={1.9} />
          </Link>
          <button type="button" className="hidden rounded-full px-4 py-2 text-[15px] font-semibold text-(--cv-ink) hover:bg-(--cv-bg) sm:block">
            Sign in
          </button>
          <Link href={href.app} className="cv-btn cv-btn-primary cv-btn-sm hidden sm:inline-flex">
            Get the app
          </Link>
          <button type="button" onClick={() => setMenu(true)} className="-mr-2 rounded-full p-2.5 lg:hidden" aria-label="Open menu">
            <Menu className="size-6" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setMenu(false)} className="absolute inset-0 bg-(--cv-ink)/40" />
          <div className="absolute right-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-white">
            <div className="flex h-[68px] items-center justify-between border-b border-(--cv-line) px-5">
              <Logo className="h-8" />
              <button type="button" onClick={() => setMenu(false)} className="-mr-2 rounded-full p-2.5" aria-label="Close">
                <X className="size-5" strokeWidth={2} />
              </button>
            </div>
            <nav className="flex flex-col px-5 py-3" aria-label="Mobile">
              {nav.map((n) => (
                <Link key={n.label} href={n.to} onClick={() => setMenu(false)} className="cv-title border-b border-(--cv-line) py-4 text-[20px]">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto grid gap-2.5 p-5">
              <Link href={href.app} onClick={() => setMenu(false)} className="cv-btn cv-btn-primary w-full">
                Get the app
              </Link>
              <button type="button" className="cv-btn cv-btn-outline w-full">
                Sign in
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
