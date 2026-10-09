"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Product, Store } from "@slice/demo-catalogs";
import { cn } from "cn";
import { GridFill } from "./grid-fill";
import { ProductCard } from "./product-card";

type Sort = "featured" | "price-asc" | "price-desc" | "rating" | "new";

const sorts: { id: Sort; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "new", label: "Newest" },
  { id: "price-asc", label: "Price ↑" },
  { id: "price-desc", label: "Price ↓" },
  { id: "rating", label: "Top rated" },
];

// Category / style / search results body: subcategory index, facet filters
// and sorting, all client-side over the server-provided product list.
export function ProductGrid({
  products,
  store,
  subcategories,
  title,
  description,
  count,
}: {
  products: Product[];
  store: Store;
  subcategories?: string[];
  title: string;
  description?: string;
  count?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sub = params.get("sub") ?? "";

  const [styles, setStyles] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setSub = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("sub", value);
    else next.delete("sub");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const visible = useMemo(() => {
    let list = products.filter(
      (p) =>
        (!sub || p.subcategory === sub) &&
        (styles.length === 0 || p.attributes.style.some((s) => styles.includes(s))) &&
        (colors.length === 0 || p.attributes.colorFamily.some((c) => colors.includes(c))) &&
        (tiers.length === 0 || tiers.includes(p.attributes.priceTier)),
    );
    switch (sort) {
      case "price-asc":
        list = [...list].sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list = [...list].sort((a, b) => b.price - a.price);
        break;
      case "rating":
        list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case "new":
        list = [...list].sort((a, b) => Number(b.new ?? false) - Number(a.new ?? false));
        break;
      default:
        list = [...list].sort(
          (a, b) => Number(b.bestseller ?? false) - Number(a.bestseller ?? false),
        );
    }
    return list;
  }, [products, sub, styles, colors, tiers, sort]);

  const usedStyles = store.styles.filter((s) =>
    products.some((p) => p.attributes.style.includes(s.id)),
  );
  const usedColors = Array.from(new Set(products.flatMap((p) => p.attributes.colorFamily)));
  const activeCount = styles.length + colors.length + tiers.length;

  return (
    <main>
      <header className="grid gap-6 border-b border-ink px-4 pb-8 pt-10 sm:px-6 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-end">
        <h1 className="display text-[18vw] leading-[0.84] sm:text-8xl lg:text-9xl">{title}</h1>
        <div>
          {description && <p className="text-sm leading-relaxed text-mute">{description}</p>}
          <p className="mono mt-4">
            {visible.length} of {count ?? products.length} pieces
          </p>
        </div>
      </header>

      {subcategories && subcategories.length > 0 && (
        <ol className="flex overflow-x-auto border-b border-ink">
          <li className="shrink-0">
            <Tab active={!sub} onClick={() => setSub("")}>
              All
            </Tab>
          </li>
          {subcategories.map((s, i) => (
            <li key={s} className="shrink-0">
              <Tab active={sub === s} onClick={() => setSub(s)} index={i + 1}>
                {s}
              </Tab>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-center justify-between border-b border-ink">
        <button
          type="button"
          className="mono px-4 py-3 sm:px-6 lg:hidden"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          Filters{activeCount > 0 && ` (${activeCount})`}
        </button>
        <p className="mono hidden px-6 py-3 text-mute lg:block">Filter</p>
        <div className="flex min-w-0 overflow-x-auto">
          {sorts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              className={cn(
                "mono shrink-0 whitespace-nowrap border-l border-rule px-3 py-3 transition-colors sm:px-4",
                sort === s.id ? "bg-ink text-chalk" : "hover:bg-stone",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr]">
        <aside
          className={cn(
            "border-b border-ink lg:border-b-0 lg:border-r",
            !filtersOpen && "hidden lg:block",
          )}
        >
          <div className="sticky top-[5.5rem] divide-y divide-rule">
            <Facet title="Style">
              {usedStyles.map((s) => (
                <Check
                  key={s.id}
                  label={s.label}
                  count={products.filter((p) => p.attributes.style.includes(s.id)).length}
                  checked={styles.includes(s.id)}
                  onChange={() => setStyles(toggle(styles, s.id))}
                />
              ))}
            </Facet>
            <Facet title="Color">
              {usedColors.map((c) => (
                <Check
                  key={c}
                  label={c}
                  checked={colors.includes(c)}
                  onChange={() => setColors(toggle(colors, c))}
                />
              ))}
            </Facet>
            <Facet title="Price">
              {(["budget", "mid", "premium"] as const).map((t) => (
                <Check
                  key={t}
                  label={{ budget: "Under $100", mid: "$100 – $400", premium: "$400 and up" }[t]}
                  checked={tiers.includes(t)}
                  onChange={() => setTiers(toggle(tiers, t))}
                />
              ))}
            </Facet>
            {activeCount > 0 && (
              <div className="px-4 py-4 sm:px-6">
                <button
                  type="button"
                  className="mono text-cobalt link-rule"
                  onClick={() => {
                    setStyles([]);
                    setColors([]);
                    setTiers([]);
                  }}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </aside>

        {visible.length === 0 ? (
          <div className="px-6 py-32 text-center">
            <p className="display text-5xl">Nothing matches</p>
            <p className="mono mt-4 text-mute">Try fewer filters</p>
          </div>
        ) : (
          <ul className="rule-grid grid-cols-2 border-b border-ink lg:grid-cols-3">
            {visible.map((p, i) => (
              <li key={p.id}>
                <ProductCard product={p} priority={i < 3} />
              </li>
            ))}
            <GridFill count={visible.length} cols={{ base: 2, lg: 3 }} />
          </ul>
        )}
      </div>
    </main>
  );
}

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

function Tab({
  active,
  onClick,
  index,
  children,
}: {
  active: boolean;
  onClick: () => void;
  index?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-baseline gap-2 whitespace-nowrap border-r border-rule px-4 py-3 text-sm transition-colors",
        active ? "bg-ink text-chalk" : "hover:bg-stone",
      )}
    >
      {index !== undefined && (
        <span className={cn("mono", active ? "text-chalk/60" : "text-mute")}>
          {String(index).padStart(2, "0")}
        </span>
      )}
      {children}
    </button>
  );
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-5 sm:px-6">
      <p className="mono text-mute">{title}</p>
      <div className="mt-3 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Check({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="group flex cursor-pointer items-center justify-between gap-3 text-sm capitalize">
      <span className="flex items-center gap-2.5">
        <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
        <span className="size-3 border border-ink transition-colors peer-checked:bg-cobalt peer-checked:border-cobalt group-hover:border-cobalt" />
        <span className={cn(checked && "text-cobalt")}>{label}</span>
      </span>
      {count !== undefined && <span className="mono text-mute">{count}</span>}
    </label>
  );
}
