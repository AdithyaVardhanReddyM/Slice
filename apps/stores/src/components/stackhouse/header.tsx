"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { FOLIO_SHOP, href } from "@/lib/stackhouse/shop";
import { useBag } from "./bag";
import { Logo } from "./logo";

const nav = [
  { label: "Books", to: href.books },
  { label: "New arrivals", to: href.newArrivals },
  { label: "Staff picks", to: href.staffPicks },
  { label: "Events", to: href.events },
  { label: "Book club", to: href.bookClub },
  { label: "Visit", to: href.visit },
];

export function Header() {
  const pathname = usePathname();
  const { items } = useBag();
  const [menu, setMenu] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenu(false);
  }

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-(--ff-green) text-[13.5px] text-(--ff-paper)/90">
        <div className="ff-container flex h-9 items-center justify-between gap-4">
          <p className="truncate">
            <span className="hidden sm:inline">{FOLIO_SHOP.street}, {FOLIO_SHOP.neighborhood} · </span>
            Open every day, Mon–Thu till 8pm, Fri–Sat till 9pm
          </p>
          <p className="hidden shrink-0 md:block">Free delivery in Brooklyn on orders over $40</p>
        </div>
      </div>

      <div className="border-b border-(--ff-line) bg-(--ff-paper)/95 backdrop-blur">
        <div className="ff-container flex h-[76px] items-center gap-6">
          <button type="button" onClick={() => setMenu(true)} className="-ml-2 p-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-6" strokeWidth={1.75} />
          </button>
          <Logo className="h-10 sm:h-11" />

          <nav className="ml-6 hidden items-center gap-6 lg:flex" aria-label="Main">
            {nav.map((n) => (
              <Link key={n.label} href={n.to} className="text-[15.5px] font-semibold text-(--ff-ink-soft) transition-colors hover:text-(--ff-green)">
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <form action={href.books} className="relative hidden xl:block" role="search">
              <label htmlFor="ff-search" className="sr-only">
                Search books
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--ff-mute)" strokeWidth={2} />
              <input id="ff-search" name="q" type="search" placeholder="Search titles and authors" className="ff-input h-10 w-64 pl-9 text-[15px]" />
            </form>
            <Link href={href.books} className="rounded-md p-2 hover:bg-(--ff-paper-2) xl:hidden" aria-label="Search books">
              <Search className="size-5" strokeWidth={1.75} />
            </Link>
            <span className="relative rounded-md p-2" aria-label={`Bag, ${items.length} ${items.length === 1 ? "book" : "books"}`}>
              <ShoppingBag className="size-5" strokeWidth={1.75} />
              {items.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid size-[18px] place-items-center rounded-full bg-(--ff-terracotta) text-[11px] font-bold text-white">{items.length}</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setMenu(false)} className="absolute inset-0 bg-(--ff-ink)/40" />
          <div className="absolute left-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-(--ff-paper)">
            <div className="flex h-[76px] items-center justify-between border-b border-(--ff-line) px-5">
              <Logo className="h-10" />
              <button type="button" onClick={() => setMenu(false)} className="-mr-2 p-2" aria-label="Close">
                <X className="size-5" strokeWidth={2} />
              </button>
            </div>
            <form action={href.books} className="px-5 pt-5" role="search">
              <label htmlFor="ff-search-mobile" className="sr-only">
                Search books
              </label>
              <input id="ff-search-mobile" name="q" type="search" placeholder="Search books" className="ff-input w-full" />
            </form>
            <nav className="flex flex-col px-5 py-3" aria-label="Mobile">
              {nav.map((n) => (
                <Link key={n.label} href={n.to} onClick={() => setMenu(false)} className="ff-title border-b border-(--ff-line) py-3.5 text-[22px]">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto p-5 text-[15px] text-(--ff-ink-soft)">
              {FOLIO_SHOP.street}, {FOLIO_SHOP.city}
              <br />
              {FOLIO_SHOP.phone}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
