"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Heart, Menu, Search, ShoppingBag, X } from "lucide-react";
import type { Product, StoreNavGroup } from "@slice/demo-catalogs";
import { cn } from "cn";
import { useCart } from "@/lib/cart";
import { href } from "@/lib/fold";
import { useWishlist } from "@/lib/wishlist";
import { FoldWordmark } from "./wordmark";
import { ProductImage } from "./product-image";

export interface MenuGroup extends StoreNavGroup {
  brands: { name: string; slug: string }[];
  features: Product[];
}

const popular = ["Linen shirt", "Loafers", "Fleece", "Black boots", "Cable knit", "Trail runners", "Raffia bag", "Selvedge denim"];

export function Header({ groups }: { groups: MenuGroup[] }) {
  const { count, setOpen } = useCart();
  const { ids: saved } = useWishlist("fold:wishlist");
  const pathname = usePathname();
  const [mega, setMega] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);

  // Close overlays when the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMega(null);
    setMenu(false);
    setSearching(false);
  }

  const active = groups.find((g) => g.category === mega);

  return (
    <header className="sticky top-0 z-40 bg-white" onMouseLeave={() => setMega(null)}>
      <div className="flex h-9 items-center justify-center bg-fd-forest px-4 text-[13px] text-white">
        <p className="truncate">
          Free shipping on orders over $150
          <span className="hidden sm:inline">
            <span className="mx-2 opacity-50">·</span> Free returns within 30 days
          </span>
        </p>
      </div>

      <div className="fd-container grid h-[72px] grid-cols-[1fr_auto_1fr] items-center border-b border-fd-line lg:border-b-0">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMenu(true)} className="-ml-2 p-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-6" strokeWidth={1.6} />
          </button>
          <button type="button" onClick={() => setSearching(true)} className="p-2 lg:hidden" aria-label="Search">
            <Search className="size-[22px]" strokeWidth={1.6} />
          </button>
          <Suspense fallback={<DeptTabs pathname={pathname} dept={null} />}>
            <DeptTabsFromUrl pathname={pathname} />
          </Suspense>
        </div>

        <Link href={href.home} aria-label="Fold home">
          <FoldWordmark className="text-[28px]" />
        </Link>

        <div className="flex items-center justify-end gap-1 sm:gap-2">
          <SearchBox className="mr-2 hidden w-64 lg:block xl:w-80" />
          <Link href={href.saved} className="relative p-2" aria-label={`Wishlist, ${saved.length} saved`}>
            <Heart className="size-[22px]" strokeWidth={1.6} />
            {saved.length > 0 && <Badge>{saved.length}</Badge>}
          </Link>
          <button type="button" onClick={() => setOpen(true)} className="relative -mr-2 p-2" aria-label={`Bag, ${count} items`}>
            <ShoppingBag className="size-[22px]" strokeWidth={1.6} />
            {count > 0 && <Badge>{count}</Badge>}
          </button>
        </div>
      </div>

      <nav className="hidden h-12 border-b border-fd-line lg:block" aria-label="Categories">
        <ul className="fd-container flex h-full items-stretch justify-center gap-1">
          <NavLink href={href.newIn} on={pathname === "/fold/new"} onEnter={() => setMega(null)}>
            New in
          </NavLink>
          {groups.map((g) => (
            <NavLink
              key={g.category}
              href={href.category(g.category)}
              on={pathname.startsWith(href.category(g.category)) || mega === g.category}
              onEnter={() => setMega(g.category)}
            >
              {g.label}
            </NavLink>
          ))}
          <NavLink href={href.brands} on={pathname.startsWith("/fold/brand")} onEnter={() => setMega(null)}>
            Brands
          </NavLink>
          <NavLink href={href.sale} on={pathname === "/fold/sale"} onEnter={() => setMega(null)} className="text-fd-sale">
            Sale
          </NavLink>
        </ul>
      </nav>

      {active && (
        <div className="drop-in absolute inset-x-0 top-full hidden border-b border-fd-line bg-white shadow-[0_24px_40px_-24px_rgba(0,0,0,0.25)] lg:block">
          <div className="fd-container grid grid-cols-[1fr_1fr_2fr] gap-12 py-10">
            <div>
              <p className="text-sm font-semibold">Shop {active.label.toLowerCase()}</p>
              <ul className="mt-4 space-y-2.5 text-[15px] text-fd-ink-2">
                <li>
                  <Link href={href.category(active.category)} className="hover:text-fd-ink hover:underline">
                    View all
                  </Link>
                </li>
                {active.subcategories.map((s) => (
                  <li key={s}>
                    <Link href={href.subcategory(active.category, s)} className="hover:text-fd-ink hover:underline">
                      {s}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Brands</p>
              <ul className="mt-4 space-y-2.5 text-[15px] text-fd-ink-2">
                {active.brands.slice(0, 9).map((b) => (
                  <li key={b.slug}>
                    <Link href={href.brand(b.slug)} className="hover:text-fd-ink hover:underline">
                      {b.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-5">
              {active.features.map((p) => (
                <Link key={p.id} href={href.product(p.slug)} className="group block">
                  <div className="aspect-[4/5] overflow-hidden bg-fd-mist">
                    <ProductImage product={p} sizes="20vw" className="transition-transform duration-700 ease-fd group-hover:scale-[1.03]" />
                  </div>
                  <p className="mt-2.5 text-sm font-semibold">{p.brand}</p>
                  <p className="text-sm text-fd-ink-2">{p.name}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {menu && <MobileMenu groups={groups} onClose={() => setMenu(false)} />}
      {searching && <SearchSheet onClose={() => setSearching(false)} />}
    </header>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute right-0 top-0.5 grid min-w-[18px] place-items-center rounded-full bg-fd-ink px-1 text-[10px] font-semibold leading-[18px] text-white">
      {children}
    </span>
  );
}

function NavLink({
  href: to,
  on,
  onEnter,
  className,
  children,
}: {
  href: string;
  on: boolean;
  onEnter: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex">
      <Link
        href={to}
        onMouseEnter={onEnter}
        onFocus={onEnter}
        className={cn(
          "relative flex items-center px-3 text-[14px] font-medium transition-colors xl:px-4",
          "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-current after:transition-transform after:duration-300 xl:after:inset-x-4",
          on ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100",
          className,
        )}
      >
        {children}
      </Link>
    </li>
  );
}

function DeptTabsFromUrl({ pathname }: { pathname: string }) {
  const params = useSearchParams();
  return <DeptTabs pathname={pathname} dept={pathname === "/fold/shop" ? params.get("dept") : null} />;
}

// Own Suspense boundary: reading search params suspends, and the rest of the
// header must hydrate together with the cart count.
function DeptTabs({ pathname, dept }: { pathname: string; dept: string | null }) {
  const tabs = [
    { label: "Women", to: href.shop("women"), on: dept === "women" },
    { label: "Men", to: href.shop("men"), on: dept === "men" },
    { label: "Everything", to: href.shop(), on: pathname === "/fold/shop" && !dept },
  ];
  return (
    <nav className="hidden items-center gap-6 lg:flex" aria-label="Departments">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.to}
          className={cn(
            "border-b-2 py-1 text-[15px] font-medium transition-colors",
            t.on ? "border-fd-ink" : "border-transparent text-fd-ink-2 hover:text-fd-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function SearchBox({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const go = (query: string) => {
    if (!query.trim()) return;
    router.push(href.search(query.trim()));
    setFocused(false);
    onDone?.();
  };
  return (
    <div className={cn("relative", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex h-11 items-center gap-2 rounded-full bg-fd-mist px-4 ring-fd-ink focus-within:bg-white focus-within:ring-1"
      >
        <Search className="size-[18px] shrink-0 text-fd-mute" strokeWidth={1.8} />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search products and brands"
          aria-label="Search"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fd-mute"
        />
      </form>
      {(focused || autoFocus) && !q && (
        <div className="drop-in absolute inset-x-0 top-full z-10 mt-2 rounded-lg bg-white p-4 shadow-xl ring-1 ring-black/5">
          <p className="text-xs font-medium text-fd-mute">Popular searches</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {popular.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(s)}
                className="rounded-full border border-fd-line px-3 py-1.5 text-sm hover:border-fd-ink"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileMenu({ groups, onClose }: { groups: MenuGroup[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" className="fade-in absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close menu" />
      <div className="drawer-left absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col overflow-y-auto bg-white">
        <div className="flex h-16 items-center justify-between border-b border-fd-line px-5">
          <FoldWordmark className="text-2xl" />
          <button type="button" onClick={onClose} className="-mr-2 p-2" aria-label="Close menu">
            <X className="size-6" strokeWidth={1.6} />
          </button>
        </div>
        <div className="grid grid-cols-3 border-b border-fd-line text-center text-[15px] font-medium">
          <Link href={href.shop("women")} onClick={onClose} className="py-3.5">Women</Link>
          <Link href={href.shop("men")} onClick={onClose} className="border-x border-fd-line py-3.5">Men</Link>
          <Link href={href.shop()} onClick={onClose} className="py-3.5">Everything</Link>
        </div>
        <ul className="py-2 text-[17px]">
          <li><Link href={href.newIn} onClick={onClose} className="block px-5 py-3">New in</Link></li>
          {groups.map((g) => (
            <li key={g.category}>
              <Link href={href.category(g.category)} onClick={onClose} className="block px-5 py-3">
                {g.label}
              </Link>
            </li>
          ))}
          <li><Link href={href.brands} onClick={onClose} className="block px-5 py-3">Brands A–Z</Link></li>
          <li><Link href={href.edits} onClick={onClose} className="block px-5 py-3">Shop by style</Link></li>
          <li><Link href={href.sale} onClick={onClose} className="block px-5 py-3 text-fd-sale">Sale</Link></li>
        </ul>
      </div>
    </div>
  );
}

function SearchSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" className="fade-in absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close search" />
      <div className="drop-in relative flex items-start gap-2 bg-white p-4">
        <SearchBox autoFocus className="flex-1" onDone={onClose} />
        <button type="button" onClick={onClose} className="h-11 px-2 text-[15px]">
          Cancel
        </button>
      </div>
    </div>
  );
}
