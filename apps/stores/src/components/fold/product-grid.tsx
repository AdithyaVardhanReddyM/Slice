"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Product, Store } from "@slice/demo-catalogs";
import { cn } from "cn";
import { inDept, parseDept } from "@/lib/fold";
import { ProductCard } from "./product-card";

type Sort = "featured" | "new" | "price-asc" | "price-desc" | "rating";

const sorts: { id: Sort; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "new", label: "Just in" },
  { id: "price-asc", label: "Price, low to high" },
  { id: "price-desc", label: "Price, high to low" },
  { id: "rating", label: "Best reviewed" },
];

const tierLabel = { budget: "Under $75", mid: "$75 – $250", premium: "$250 +" } as const;

// Listing body for category, department, label, edit and search pages.
// Subcategory and department live in the URL (so header links can deep-link);
// the facet filters and sort are local.
export function ProductGrid({
  products,
  store,
  subcategories,
  kicker,
  title,
  description,
  facets = ["style", "brand", "color", "price"],
  pillField = "subcategory",
}: {
  products: Product[];
  store: Store;
  subcategories?: string[];
  kicker?: string;
  title: ReactNode;
  description?: string;
  facets?: ("style" | "brand" | "color" | "price")[];
  /** What the pills filter on: subcategories, or whole categories on mixed pages. */
  pillField?: "subcategory" | "category";
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
  const [sort, setSort] = useState<Sort>("featured");
  const [open, setOpen] = useState(false);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  // Facet options come from what's in the current dept + subcategory slice.
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
        (tiers.length === 0 || tiers.includes(p.attributes.priceTier)),
    );
    const by: Record<Sort, (a: Product, b: Product) => number> = {
      featured: (a, b) => Number(b.bestseller ?? false) - Number(a.bestseller ?? false),
      new: (a, b) => Number(b.new ?? false) - Number(a.new ?? false),
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    };
    return [...list].sort(by[sort]);
  }, [base, styles, brands, colors, tiers, sort]);

  const styleOptions = store.styles
    .map((s) => ({ id: s.id, label: s.label, n: base.filter((p) => p.attributes.style.includes(s.id)).length }))
    .filter((s) => s.n > 0);
  const brandOptions = Array.from(new Set(base.map((p) => p.brand ?? "")))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((b) => ({ id: b, label: b, n: base.filter((p) => p.brand === b).length }));
  const colorOptions = Array.from(new Set(base.flatMap((p) => p.attributes.colorFamily))).map((c) => ({
    id: c,
    label: c,
    n: base.filter((p) => p.attributes.colorFamily.includes(c)).length,
  }));
  const tierOptions = (["budget", "mid", "premium"] as const)
    .map((t) => ({ id: t, label: tierLabel[t], n: base.filter((p) => p.attributes.priceTier === t).length }))
    .filter((t) => t.n > 0);

  const active = [
    ...styles.map((v) => ({ v, label: store.styles.find((s) => s.id === v)?.label ?? v, clear: () => setStyles(toggle(styles, v)) })),
    ...brands.map((v) => ({ v, label: v, clear: () => setBrands(toggle(brands, v)) })),
    ...colors.map((v) => ({ v, label: v, clear: () => setColors(toggle(colors, v)) })),
    ...tiers.map((v) => ({ v, label: tierLabel[v as keyof typeof tierLabel], clear: () => setTiers(toggle(tiers, v)) })),
  ];
  const clearAll = () => {
    setStyles([]);
    setBrands([]);
    setColors([]);
    setTiers([]);
  };

  return (
    <main>
      <header className="grid gap-8 px-4 pb-10 pt-14 sm:px-8 lg:grid-cols-[1fr_minmax(0,24rem)] lg:items-end lg:pt-20">
        <div className="fold-rise">
          {kicker && <p className="tag text-fog">{kicker}</p>}
          <h1 className="didone mt-4 text-[17vw] leading-[0.86] sm:text-8xl lg:text-[8.5rem]">{title}</h1>
        </div>
        <div>
          {description && <p className="text-[15px] leading-relaxed text-bone-2">{description}</p>}
          <p className="tag mt-5 text-fog">
            {visible.length} {visible.length === 1 ? "piece" : "pieces"} ·{" "}
            {new Set(visible.map((p) => p.brand)).size} labels
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4 px-4 pb-5 sm:px-8">
        {subcategories && subcategories.length > 1 ? (
          <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
            <Pill on={!sub} onClick={() => setParam("sub", "")}>
              All
            </Pill>
            {subcategories.map((s) => (
              <Pill key={s} on={sub === s} onClick={() => setParam("sub", s)}>
                {s}
              </Pill>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="flex rounded-full border border-seam p-1" role="group" aria-label="Department">
          {([undefined, "women", "men"] as const).map((d) => (
            <button
              key={d ?? "all"}
              type="button"
              onClick={() => setParam("dept", d ?? "")}
              aria-pressed={dept === d}
              className={cn(
                "tag rounded-full px-4 py-2 transition-colors",
                dept === d ? "bg-bone text-night" : "text-bone-2 hover:text-bone",
              )}
            >
              {d ?? "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="sticky top-[var(--fold-header)] z-30 border-y border-seam bg-night/90 backdrop-blur-md">
        <div className="flex items-center gap-4 px-4 py-3 sm:px-8">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="tag flex items-center gap-2 hover:text-signal"
          >
            <span className={cn("inline-block transition-transform duration-300", open && "rotate-45")}>+</span>
            Filter{active.length > 0 && <span className="text-signal">({active.length})</span>}
          </button>
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {active.map((a) => (
              <button
                key={a.v}
                type="button"
                onClick={a.clear}
                className="shrink-0 rounded-full bg-night-3 px-3 py-1 text-xs capitalize text-bone-2 hover:text-signal"
              >
                {a.label} ✕
              </button>
            ))}
            {active.length > 1 && (
              <button type="button" onClick={clearAll} className="tag shrink-0 px-2 text-fog hover:text-bone">
                Clear
              </button>
            )}
          </div>
          <label className="tag flex shrink-0 items-center gap-2 text-fog">
            <span className="hidden sm:inline">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="tag cursor-pointer appearance-none bg-transparent text-bone outline-none"
            >
              {sorts.map((s) => (
                <option key={s.id} value={s.id} className="bg-night-2 normal-case tracking-normal">
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {open && (
          <div className="fade-in grid max-h-[60vh] gap-8 overflow-y-auto border-t border-seam px-4 py-6 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
            {facets.includes("style") && styleOptions.length > 0 && (
              <Facet title="Style" options={styleOptions} selected={styles} onToggle={(v) => setStyles(toggle(styles, v))} />
            )}
            {facets.includes("brand") && brandOptions.length > 1 && (
              <Facet title="Label" options={brandOptions} selected={brands} onToggle={(v) => setBrands(toggle(brands, v))} />
            )}
            {facets.includes("color") && (
              <Facet title="Colour" options={colorOptions} selected={colors} onToggle={(v) => setColors(toggle(colors, v))} />
            )}
            {facets.includes("price") && (
              <Facet title="Price" options={tierOptions} selected={tiers} onToggle={(v) => setTiers(toggle(tiers, v))} />
            )}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="px-6 py-32 text-center">
          <p className="didone text-5xl italic">nothing on this rail.</p>
          <button type="button" onClick={clearAll} className="tag mt-6 text-signal">
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-12 px-4 pt-8 sm:gap-x-5 sm:px-8 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((p, i) => (
            <li key={p.id}>
              <ProductCard product={p} priority={i < 4} sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw" />
            </li>
          ))}
        </ul>
      )}
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
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-colors",
        on ? "border-bone bg-bone text-night" : "border-seam text-bone-2 hover:border-bone hover:text-bone",
      )}
    >
      {children}
    </button>
  );
}

function Facet({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { id: string; label: string; n: number }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="tag text-fog">{title}</p>
      <ul className="mt-3 space-y-1">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onToggle(o.id)}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 py-0.5 text-left text-sm capitalize transition-colors",
                  on ? "text-signal" : "text-bone-2 hover:text-bone",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className={cn("size-2 rounded-full border", on ? "border-signal bg-signal" : "border-fog")} />
                  {o.label}
                </span>
                <span className="text-xs tabular-nums text-fog">{o.n}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
