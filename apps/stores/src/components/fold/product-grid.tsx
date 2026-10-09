"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import type { Product, Store } from "@slice/demo-catalogs";
import { cn } from "cn";
import { inDept, parseDept } from "@/lib/fold";
import { ProductCard } from "./product-card";

export type Sort = "featured" | "new" | "price-asc" | "price-desc" | "rating";

const sorts: { id: Sort; label: string }[] = [
  { id: "featured", label: "Recommended" },
  { id: "new", label: "Newest" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "rating", label: "Top rated" },
];

const tierLabel = { budget: "Under $75", mid: "$75 – $250", premium: "Over $250" } as const;

type Facet = "dept" | "style" | "brand" | "color" | "price" | "sort";

// Listing body for category, department, brand, style, sale and search pages.
// Subcategory and department live in the URL so header links can deep-link;
// the other filters and the sort are local.
export function ProductGrid({
  products,
  store,
  subcategories,
  pillField = "subcategory",
  crumbs,
  title,
  description,
  banner,
  facets = ["style", "brand", "color", "price"],
  initialSort = "featured",
}: {
  products: Product[];
  store: Store;
  subcategories?: string[];
  /** What the pills filter on: subcategories, or whole categories on mixed pages. */
  pillField?: "subcategory" | "category";
  crumbs?: { label: string; href?: string }[];
  title: ReactNode;
  description?: string;
  /** Replaces the default title block (brand pages). */
  banner?: ReactNode;
  facets?: ("style" | "brand" | "color" | "price")[];
  initialSort?: Sort;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sub = params.get("sub") ?? "";
  const dept = parseDept(params.get("dept"));

  const [styles, setStyles] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [saleOnly, setSaleOnly] = useState(false);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [open, setOpen] = useState<Facet | null>(null);
  const [panelLeft, setPanelLeft] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const toggleOpen = (f: Facet, button: HTMLElement) => {
    const bar = barRef.current;
    if (bar) {
      const left = button.getBoundingClientRect().left - bar.getBoundingClientRect().left;
      setPanelLeft(Math.max(16, Math.min(left, bar.clientWidth - 304)));
    }
    setOpen((o) => (o === f ? null : f));
  };

  // Facet options come from the current department + pill slice.
  const base = useMemo(
    () => products.filter((p) => inDept(p, dept) && (!sub || p[pillField] === sub)),
    [products, dept, sub, pillField],
  );

  const visible = useMemo(() => {
    const list = base.filter(
      (p) =>
        (styles.length === 0 || p.attributes.style.some((s) => styles.includes(s))) &&
        (brands.length === 0 || brands.includes(p.brand ?? "")) &&
        (colors.length === 0 || p.attributes.colorFamily.some((c) => colors.includes(c))) &&
        (tiers.length === 0 || tiers.includes(p.attributes.priceTier)) &&
        (!saleOnly || p.compareAtPrice !== undefined),
    );
    const by: Record<Sort, (a: Product, b: Product) => number> = {
      featured: (a, b) => Number(b.bestseller ?? false) - Number(a.bestseller ?? false),
      new: (a, b) => Number(b.new ?? false) - Number(a.new ?? false),
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    };
    return [...list].sort(by[sort]);
  }, [base, styles, brands, colors, tiers, saleOnly, sort]);

  const count = (pred: (p: Product) => boolean) => base.filter(pred).length;
  const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
  const options: Record<"style" | "brand" | "color" | "price", { id: string; label: string; n: number }[]> = {
    style: store.styles
      .map((s) => ({ id: s.id, label: s.label, n: count((p) => p.attributes.style.includes(s.id)) }))
      .filter((o) => o.n > 0),
    brand: Array.from(new Set(base.map((p) => p.brand ?? "")))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((b) => ({ id: b, label: b, n: count((p) => p.brand === b) })),
    color: Array.from(new Set(base.flatMap((p) => p.attributes.colorFamily))).map((c) => ({
      id: c,
      label: capitalize(c),
      n: count((p) => p.attributes.colorFamily.includes(c)),
    })),
    price: (["budget", "mid", "premium"] as const)
      .map((t) => ({ id: t, label: tierLabel[t], n: count((p) => p.attributes.priceTier === t) }))
      .filter((o) => o.n > 0),
  };
  const state = {
    style: [styles, setStyles],
    brand: [brands, setBrands],
    color: [colors, setColors],
    price: [tiers, setTiers],
  } as const;
  const facetLabel = { style: "Style", brand: "Brand", color: "Colour", price: "Price" };

  const active = [
    ...styles.map((v) => ({ key: `s-${v}`, label: store.styles.find((s) => s.id === v)?.label ?? v, clear: () => setStyles(toggle(styles, v)) })),
    ...brands.map((v) => ({ key: `b-${v}`, label: v, clear: () => setBrands(toggle(brands, v)) })),
    ...colors.map((v) => ({ key: `c-${v}`, label: capitalize(v), clear: () => setColors(toggle(colors, v)) })),
    ...tiers.map((v) => ({ key: `t-${v}`, label: tierLabel[v as keyof typeof tierLabel], clear: () => setTiers(toggle(tiers, v)) })),
    ...(saleOnly ? [{ key: "sale", label: "On sale", clear: () => setSaleOnly(false) }] : []),
  ];
  const clearAll = () => {
    setStyles([]);
    setBrands([]);
    setColors([]);
    setTiers([]);
    setSaleOnly(false);
  };
  const hasSale = base.some((p) => p.compareAtPrice !== undefined);

  return (
    <main>
      <div className="fd-container pt-6">
        {crumbs && (
          <nav className="flex flex-wrap items-center gap-1 text-sm text-fd-mute" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5" />}
                {c.href ? (
                  <Link href={c.href} className="hover:text-fd-ink hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-fd-ink">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {banner ?? (
          <header className="mt-6 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-[40px] sm:leading-tight">{title}</h1>
            {description && <p className="mt-3 text-[15px] leading-relaxed text-fd-ink-2">{description}</p>}
          </header>
        )}

        {subcategories && subcategories.length > 1 && (
          <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Pill on={!sub} onClick={() => setParam("sub", "")}>
              All
            </Pill>
            {subcategories.map((s) => (
              <Pill key={s} on={sub === s} onClick={() => setParam("sub", s)}>
                {s}
              </Pill>
            ))}
          </div>
        )}
      </div>

      <div ref={barRef} className="sticky top-[var(--fold-header)] z-30 mt-6 border-y border-fd-line bg-white">
        <div className="fd-container flex items-center gap-3 py-3">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
            <FacetButton active={!!dept} open={open === "dept"} onClick={(el) => toggleOpen("dept", el)}>
              {dept ? (dept === "women" ? "Women" : "Men") : "Department"}
            </FacetButton>
            {facets.map((f) => (
              <FacetButton key={f} active={state[f][0].length > 0} open={open === f} onClick={(el) => toggleOpen(f, el)}>
                {facetLabel[f]}
                {state[f][0].length > 0 && <span>({state[f][0].length})</span>}
              </FacetButton>
            ))}
            {hasSale && (
              <button
                type="button"
                onClick={() => setSaleOnly((s) => !s)}
                aria-pressed={saleOnly}
                className={cn(
                  "flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                  saleOnly ? "border-fd-sale bg-fd-sale text-white" : "border-fd-line hover:border-fd-ink",
                )}
              >
                On sale
              </button>
            )}
          </div>
          <p className="hidden shrink-0 text-sm text-fd-mute md:block">{visible.length} items</p>
          <FacetButton open={open === "sort"} onClick={(el) => toggleOpen("sort", el)} className="shrink-0">
            <span className="hidden sm:inline">Sort:</span>
            {sorts.find((s) => s.id === sort)?.label}
          </FacetButton>
        </div>

        {open && (
          <div
            className="drop-in absolute top-full z-10 mt-1 max-h-[60vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg bg-white p-2 shadow-xl ring-1 ring-black/5"
            style={open === "sort" ? { right: 16 } : { left: panelLeft }}
          >
            {open === "dept" &&
              ([undefined, "women", "men"] as const).map((d) => (
                <Option
                  key={d ?? "all"}
                  label={d ? (d === "women" ? "Women (incl. unisex)" : "Men (incl. unisex)") : "All departments"}
                  checked={dept === d}
                  radio
                  onClick={() => {
                    setParam("dept", d ?? "");
                    setOpen(null);
                  }}
                />
              ))}
            {open === "sort" &&
              sorts.map((s) => (
                <Option
                  key={s.id}
                  label={s.label}
                  checked={sort === s.id}
                  radio
                  onClick={() => {
                    setSort(s.id);
                    setOpen(null);
                  }}
                />
              ))}
            {(open === "style" || open === "brand" || open === "color" || open === "price") && (
              <>
                {options[open].map((o) => {
                  const [selected, set] = state[open];
                  return (
                    <Option
                      key={o.id}
                      label={o.label}
                      n={o.n}
                      checked={selected.includes(o.id)}
                      onClick={() => set(toggle(selected, o.id))}
                    />
                  );
                })}
                <div className="mt-1 flex items-center justify-between border-t border-fd-line px-2 pt-2">
                  <button type="button" onClick={() => state[open][1]([])} className="py-1.5 text-sm text-fd-mute underline">
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="rounded-full bg-fd-ink px-4 py-1.5 text-sm font-semibold text-white"
                  >
                    Show {visible.length}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="fd-container">
        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-4">
            {active.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={a.clear}
                className="flex items-center gap-1.5 rounded-full bg-fd-mist py-1.5 pl-3.5 pr-2.5 text-sm hover:bg-fd-line"
              >
                {a.label}
                <X className="size-3.5" />
              </button>
            ))}
            <button type="button" onClick={clearAll} className="ml-1 text-sm font-medium underline">
              Clear all
            </button>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="py-28 text-center">
            <p className="text-lg font-semibold">No items match these filters</p>
            <p className="mt-1 text-sm text-fd-mute">Try removing a filter or two.</p>
            <button type="button" onClick={clearAll} className="mt-6 rounded-full bg-fd-ink px-6 py-2.5 text-sm font-semibold text-white">
              Clear filters
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-10 pt-6 md:grid-cols-3 lg:gap-x-6 xl:grid-cols-4">
            {visible.map((p, i) => (
              <li key={p.id}>
                <ProductCard product={p} priority={i < 4} sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
        on ? "bg-fd-ink text-white" : "bg-fd-mist text-fd-ink hover:bg-fd-line",
      )}
    >
      {children}
    </button>
  );
}

function FacetButton({
  open,
  active,
  onClick,
  className,
  children,
}: {
  open: boolean;
  active?: boolean;
  onClick: (el: HTMLElement) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={(e) => onClick(e.currentTarget)}
      className={cn(
        "flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors",
        active || open ? "border-fd-ink" : "border-fd-line hover:border-fd-ink",
        className,
      )}
    >
      {children}
      <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
    </button>
  );
}

function Option({
  label,
  n,
  checked,
  radio,
  onClick,
}: {
  label: string;
  n?: number;
  checked: boolean;
  radio?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={radio ? "menuitemradio" : "menuitemcheckbox"}
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-fd-mist"
    >
      <span
        className={cn(
          "grid size-[18px] shrink-0 place-items-center border transition-colors",
          radio ? "rounded-full" : "rounded-[4px]",
          checked ? "border-fd-ink bg-fd-ink text-white" : "border-fd-mute/50",
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="flex-1">{label}</span>
      {n !== undefined && <span className="text-fd-mute">{n}</span>}
    </button>
  );
}
