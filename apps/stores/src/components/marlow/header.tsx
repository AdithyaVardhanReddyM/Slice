"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { Store } from "@slice/demo-catalogs";
import { cn } from "cn";
import { useCart } from "@/lib/cart";
import { categoryHref, styleHref, subcategoryHref } from "@/lib/catalog";
import { MarlowWordmark } from "./wordmark";

const ticker = [
  "AW26 collection",
  "160 pieces",
  "7 rooms",
  "22 workshops",
  "Free shipping over $75",
  "100-day returns",
  "Designed in Portland",
];

export function Header({ store }: { store: Store }) {
  const { count, setOpen } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/marlow/search?q=${encodeURIComponent(q.trim())}`);
    setSearching(false);
    setMenu(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-ink bg-chalk">
      <div className="mono overflow-hidden border-b border-ink py-1.5 text-ink">
        <div className="marquee flex w-max whitespace-nowrap">
          {[0, 1].map((n) => (
            <span key={n} className="flex" aria-hidden={n === 1}>
              {ticker.map((t) => (
                <span key={t} className="px-6">
                  {t} <span className="ml-6 text-cobalt">●</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="grid h-14 grid-cols-[auto_1fr_auto] items-stretch">
        <Link href="/marlow" className="flex items-center border-r border-ink px-4 sm:px-6" aria-label="Marlow home">
          <MarlowWordmark />
        </Link>

        <nav className="hidden items-stretch lg:flex">
          {store.nav.map((g) => {
            const active = pathname.startsWith(categoryHref(g.category));
            return (
              <div key={g.category} className="group relative flex">
                <Link
                  href={categoryHref(g.category)}
                  className={cn(
                    "mono flex items-center whitespace-nowrap px-3 transition-colors hover:bg-ink hover:text-chalk xl:px-4",
                    active && "bg-ink text-chalk",
                  )}
                >
                  {g.label}
                </Link>
                <div className="pointer-events-none absolute left-0 top-full z-50 w-64 -translate-y-1 opacity-0 transition duration-200 ease-out-soft group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                  <ul className="border border-ink bg-chalk">
                    {g.subcategories.map((s) => (
                      <li key={s} className="border-b border-rule last:border-0">
                        <Link
                          href={subcategoryHref(g.category, s)}
                          className="block px-4 py-2.5 text-sm hover:bg-ink hover:text-chalk"
                        >
                          {s}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
          <Link
            href={styleHref(store.styles[0].id)}
            className={cn(
              "mono flex items-center px-4 text-cobalt transition-colors hover:bg-cobalt hover:text-chalk",
              pathname.startsWith("/marlow/style") && "bg-cobalt text-chalk",
            )}
          >
            Styles
          </Link>
        </nav>
        <div className="lg:hidden" />

        <div className="flex items-stretch">
          <form
            onSubmit={submitSearch}
            className={cn(
              "flex items-stretch border-l border-ink transition-all duration-300 ease-out-soft",
              searching ? "w-64" : "w-auto",
            )}
          >
            {searching && (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Material, room, color…"
                aria-label="Search"
                className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-mute"
                onBlur={() => !q && setSearching(false)}
              />
            )}
            <button
              type={searching ? "submit" : "button"}
              onClick={() => !searching && setSearching(true)}
              className="mono px-4 hover:bg-ink hover:text-chalk"
            >
              Search
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mono border-l border-ink px-4 hover:bg-ink hover:text-chalk sm:px-6"
          >
            Bag <span className={cn("ml-1", count > 0 && "text-cobalt")}>({count})</span>
          </button>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="mono border-l border-ink px-4 lg:hidden"
            aria-label="Menu"
          >
            {menu ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {menu && (
        <div className="fade-in border-t border-ink lg:hidden">
          <ul>
            {store.nav.map((g) => (
              <li key={g.category} className="border-b border-rule">
                <Link
                  href={categoryHref(g.category)}
                  onClick={() => setMenu(false)}
                  className="display block px-4 py-3 text-3xl"
                >
                  {g.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={styleHref(store.styles[0].id)}
                onClick={() => setMenu(false)}
                className="display block px-4 py-3 text-3xl text-cobalt"
              >
                Styles
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
