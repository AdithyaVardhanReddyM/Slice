"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { Product, StoreNavGroup } from "@slice/demo-catalogs";
import { cn } from "cn";
import { useCart } from "@/lib/cart";
import { href } from "@/lib/fold";
import { FoldWordmark } from "./wordmark";
import { ProductImage } from "./product-image";

export interface MenuGroup extends StoreNavGroup {
  brands: { name: string; slug: string }[];
  feature?: Product;
}

const ticker = [
  "24 labels on one rail",
  "8 new to Fold this season",
  "Free shipping over $150",
  "Free returns within 30 days",
  "Lisbon · Seoul · Portland · Oslo · Berlin · Kojima",
];

const suggestions = ["linen", "loafers", "fleece", "black boots", "cable knit", "trail", "raffia", "selvedge"];

export function Header({ groups }: { groups: MenuGroup[] }) {
  const { count, setOpen } = useCart();
  const pathname = usePathname();
  const [mega, setMega] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);

  // Close the overlays on navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMega(null);
    setMenu(false);
    setSearching(false);
  }

  const active = groups.find((g) => g.category === mega);

  return (
    <header className="sticky top-0 z-40" onMouseLeave={() => setMega(null)}>
      <div className="overflow-hidden border-b border-seam bg-night-2 py-2 text-fog">
        <div className="ticker flex w-max whitespace-nowrap">
          {[0, 1].map((n) => (
            <span key={n} className="flex" aria-hidden={n === 1}>
              {ticker.map((t) => (
                <span key={t} className="tag px-8">
                  {t}
                  <span className="ml-8 text-signal">✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="border-b border-seam bg-night/90 backdrop-blur-md">
        <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-8">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="tag lg:hidden"
              aria-label="Open menu"
            >
              Menu
            </button>
            {/* Its own boundary: reading search params suspends, and the rest of
                the header must hydrate together with the cart count. */}
            <Suspense fallback={<DeptNav dept={null} pathname={pathname} />}>
              <DeptNavFromUrl pathname={pathname} />
            </Suspense>
          </div>

          <Link href={href.home} aria-label="Fold home" className="px-4">
            <FoldWordmark className="text-[2.6rem]" />
          </Link>

          <div className="flex items-center justify-end gap-5">
            <button type="button" onClick={() => setSearching(true)} className="tag underline-grow pb-0.5">
              Search
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="tag flex items-center gap-2"
              aria-label={`Bag, ${count} items`}
            >
              <span className="hidden sm:inline">Bag</span>
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-[10px] tracking-normal transition-colors",
                  count > 0 ? "bg-signal text-night" : "border border-seam text-fog",
                )}
              >
                {count}
              </span>
            </button>
          </div>
        </div>

        <nav className="hidden h-11 items-stretch justify-center gap-1 border-t border-seam lg:flex" aria-label="Categories">
          {groups.map((g) => {
            const on = pathname.startsWith(href.category(g.category));
            return (
              <Link
                key={g.category}
                href={href.category(g.category)}
                onMouseEnter={() => setMega(g.category)}
                onFocus={() => setMega(g.category)}
                className={cn(
                  "tag flex items-center px-3.5 transition-colors xl:px-5",
                  on || mega === g.category ? "text-bone" : "text-bone-2/70 hover:text-bone",
                  on && "text-signal",
                )}
              >
                {g.label}
              </Link>
            );
          })}
          <span className="mx-2 my-3 w-px bg-seam" />
          <Link
            href={href.brands}
            onMouseEnter={() => setMega(null)}
            className={cn("tag flex items-center px-3.5 xl:px-5", pathname.startsWith("/fold/brand") ? "text-signal" : "text-bone")}
          >
            Labels A–Z
          </Link>
          <Link
            href={href.edits}
            onMouseEnter={() => setMega(null)}
            className={cn("tag flex items-center px-3.5 xl:px-5", pathname.startsWith("/fold/edit") ? "text-signal" : "text-bone")}
          >
            The edits
          </Link>
        </nav>
      </div>

      {/* Mega menu: subcategories, the labels that make them, one picture. */}
      {active && (
        <div className="fade-in absolute inset-x-0 top-full hidden border-b border-seam bg-night-2 lg:block">
          <div className="grid grid-cols-[1.1fr_1.4fr_0.8fr] gap-10 px-8 py-10">
            <div>
              <p className="tag text-fog">{active.label}</p>
              <ul className="mt-5 space-y-1.5">
                <li>
                  <Link href={href.category(active.category)} className="didone text-4xl italic hover:text-signal">
                    Shop all
                  </Link>
                </li>
                {active.subcategories.map((s) => (
                  <li key={s}>
                    <Link href={href.subcategory(active.category, s)} className="didone text-4xl hover:text-signal">
                      {s.toLowerCase()}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="tag text-fog">Labels in {active.label.toLowerCase()}</p>
              <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5">
                {active.brands.map((b) => (
                  <li key={b.slug}>
                    <Link href={href.brand(b.slug)} className="text-sm text-bone-2 underline-grow hover:text-bone">
                      {b.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {active.feature && (
              <Link href={href.product(active.feature.slug)} className="group block">
                <div className="aspect-[4/5] overflow-hidden bg-night-3">
                  <ProductImage
                    product={active.feature}
                    sizes="20vw"
                    className="transition-transform duration-700 ease-fold group-hover:scale-105"
                  />
                </div>
                <p className="tag mt-3">{active.feature.brand}</p>
                <p className="mt-1 text-sm text-bone-2">{active.feature.name}</p>
              </Link>
            )}
          </div>
        </div>
      )}

      {menu && <MobileMenu groups={groups} onClose={() => setMenu(false)} />}
      {searching && <SearchSheet onClose={() => setSearching(false)} />}
    </header>
  );
}

function DeptNavFromUrl({ pathname }: { pathname: string }) {
  const params = useSearchParams();
  return <DeptNav pathname={pathname} dept={pathname === "/fold/shop" ? params.get("dept") : null} />;
}

function DeptNav({ pathname, dept }: { pathname: string; dept: string | null }) {
  return (
    <nav className="hidden items-center gap-5 lg:flex" aria-label="Departments">
      {(["women", "men"] as const).map((d) => (
        <Link
          key={d}
          href={href.shop(d)}
          className={cn("tag underline-grow pb-0.5", dept === d ? "text-signal" : "text-bone")}
        >
          {d}
        </Link>
      ))}
      <Link
        href={href.shop()}
        className={cn("tag underline-grow pb-0.5", pathname === "/fold/shop" && !dept ? "text-signal" : "text-bone")}
      >
        Everything
      </Link>
    </nav>
  );
}

function MobileMenu({ groups, onClose }: { groups: MenuGroup[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" className="fade-in absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close menu" />
      <div className="drawer-left absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col overflow-y-auto bg-night-2 px-6 py-6">
        <div className="flex items-center justify-between">
          <FoldWordmark className="text-4xl" />
          <button type="button" onClick={onClose} className="tag">
            Close
          </button>
        </div>
        <div className="mt-8 flex gap-5">
          {(["women", "men"] as const).map((d) => (
            <Link key={d} href={href.shop(d)} onClick={onClose} className="tag text-signal">
              {d}
            </Link>
          ))}
          <Link href={href.shop()} onClick={onClose} className="tag">
            Everything
          </Link>
        </div>
        <ul className="mt-6 space-y-1">
          {groups.map((g) => (
            <li key={g.category}>
              <Link href={href.category(g.category)} onClick={onClose} className="didone block py-1 text-[2.6rem]">
                {g.label.toLowerCase()}
              </Link>
            </li>
          ))}
        </ul>
        <hr className="crease my-6" />
        <Link href={href.brands} onClick={onClose} className="didone text-3xl italic">
          labels a–z
        </Link>
        <Link href={href.edits} onClick={onClose} className="didone mt-2 text-3xl italic">
          the edits
        </Link>
      </div>
    </div>
  );
}

function SearchSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const go = (query: string) => {
    if (!query.trim()) return;
    router.push(href.search(query.trim()));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" className="fade-in absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close search" />
      <div className="fade-in relative border-b border-seam bg-night-2 px-4 pb-10 pt-6 sm:px-8">
        <div className="flex items-center justify-between">
          <p className="tag text-fog">Search 24 labels</p>
          <button type="button" onClick={onClose} className="tag">
            Close
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
          className="mt-6 flex items-end gap-4 border-b border-bone/30 pb-2 focus-within:border-signal"
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="a linen shirt, a label, a mood…"
            aria-label="Search"
            className="didone min-w-0 flex-1 bg-transparent text-4xl italic outline-none placeholder:text-fog/60 sm:text-6xl"
          />
          <button type="submit" className="tag shrink-0 pb-2 text-signal">
            Search →
          </button>
        </form>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="tag mr-2 text-fog">People search</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => go(s)}
              className="rounded-full border border-seam px-3.5 py-1.5 text-sm text-bone-2 transition-colors hover:border-bone hover:text-bone"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
