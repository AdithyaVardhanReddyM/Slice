"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PillTabs, Tile } from "@/components/console/home/ui";
import { Thumb } from "./atoms";
import { ProductDrawer } from "./product-drawer";
import type { CatalogRow } from "./types";

type Scope = "all" | "details" | "unpicked";
type SortKey = "picked" | "price" | "name";

const PAGE_SIZE = 20;

/** Missing an attribute the matcher scores, or too little copy to read. */
export const needsDetails = (r: CatalogRow) =>
  r.gaps.length > 0 || r.readiness.tier === "thin";

/** What a gap asks the merchant to add, as the end of "Most need …". */
const GAP_ASK: Record<string, string> = {
  "Fewer than 2 colors": "a second color",
  "Fewer than 2 use cases": "another use case",
  "No room": "a room",
  "No occasion": "an occasion",
  "No fit": "a fit",
};

const SORTS: Record<SortKey, (a: CatalogRow, b: CatalogRow) => number> = {
  picked: (a, b) => a.stats.recommended - b.stats.recommended,
  price: (a, b) => a.price - b.price,
  name: (a, b) => a.name.localeCompare(b.name),
};

const GRID =
  "grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem] lg:grid-cols-[minmax(0,1fr)_12rem_5.5rem_5.5rem_7rem]";

/** The catalog's health at a glance, then every product, with one open in a drawer. */
export function CatalogView({
  rows,
  categories,
  styles,
}: {
  rows: CatalogRow[];
  categories: string[];
  styles: { id: string; label: string }[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [style, setStyle] = useState("all");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "picked",
    dir: -1,
  });
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const thin = rows.filter(needsDetails);
  const unpicked = rows.filter((r) => r.stats.recommended === 0);
  const ready = rows.length - thin.length;
  const gapCounts = new Map<string, number>();
  for (const r of thin)
    for (const g of r.gaps) gapCounts.set(g, (gapCounts.get(g) ?? 0) + 1);
  const topGap = [...gapCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter(
      (r) =>
        (!q || r.haystack.includes(q)) &&
        (category === "all" || r.category === category) &&
        (style === "all" || r.styles.some((s) => s.id === style)) &&
        (scope === "all" ||
          (scope === "details" && needsDetails(r)) ||
          (scope === "unpicked" && r.stats.recommended === 0)),
    )
    .sort(
      (a, b) => SORTS[sort.key](a, b) * sort.dir || a.name.localeCompare(b.name),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE,
  );

  const selectedIndex = selectedId
    ? filtered.findIndex((r) => r.id === selectedId)
    : -1;
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };
  const focus = (s: Scope) => {
    reset(() => setScope(scope === s ? "all" : s));
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : { key, dir: key === "name" ? 1 : -1 },
    );
  const open = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };
  const step = (dir: 1 | -1) => {
    if (!filtered.length) return;
    const next = (selectedIndex + dir + filtered.length) % filtered.length;
    setSelectedId(filtered[next].id);
    setPage(Math.floor(next / PAGE_SIZE));
  };

  const categoryItems: Record<string, string> = {
    all: "All categories",
    ...Object.fromEntries(categories.map((c) => [c, c])),
  };
  const styleItems: Record<string, string> = {
    all: "All styles",
    ...Object.fromEntries(styles.map((s) => [s.id, s.label])),
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        <Tile delay={60} className="flex flex-col p-6">
          <p className="text-sm font-medium text-muted-foreground">
            Ready to match
          </p>
          <p className="num mt-3 text-4xl leading-none font-medium tracking-[-0.04em] text-neutral-950">
            {fmt.pct(ready / Math.max(1, rows.length), 0)}
          </p>
          <span className="mt-4 block h-2 overflow-hidden rounded-full bg-neutral-100">
            <span
              className="block h-full rounded-full bg-linear-to-r from-orange-400 to-orange-600"
              style={{ width: `${(ready / Math.max(1, rows.length)) * 100}%` }}
            />
          </span>
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="num">{ready}</span> of{" "}
            <span className="num">{rows.length}</span> products have enough
            detail to match by taste.
          </p>
        </Tile>
        <HealthCard
          delay={120}
          label="Need details"
          value={thin.length}
          on={scope === "details"}
          onClick={() => focus("details")}
        >
          {thin.length === 0
            ? "Every product has what the concierge needs."
            : topGap
              ? `Most need ${GAP_ASK[topGap] ?? topGap.toLowerCase()}.`
              : "Their descriptions are too short to read well."}
        </HealthCard>
        <HealthCard
          delay={180}
          label="Not picked this week"
          value={unpicked.length}
          on={scope === "unpicked"}
          onClick={() => focus("unpicked")}
        >
          The concierge didn&apos;t recommend these in the last 7 days.
        </HealthCard>
      </div>

      <div ref={listRef} className="scroll-mt-24">
        <Tile delay={240}>
          <div className="flex flex-wrap items-center gap-2 px-6 pt-6">
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Search products</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => reset(() => setQuery(e.target.value))}
                placeholder="Search products"
                className="rounded-full pl-9"
              />
            </label>
            <FilterSelect
              label="Category"
              items={categoryItems}
              value={category}
              onChange={(v) => reset(() => setCategory(v))}
            />
            <FilterSelect
              label="Style"
              items={styleItems}
              value={style}
              onChange={(v) => reset(() => setStyle(v))}
            />
            <div className="ml-auto">
              <PillTabs
                label="Show"
                size="sm"
                value={scope}
                onChange={(v) => reset(() => setScope(v))}
                options={[
                  { value: "all", label: "All" },
                  { value: "details", label: "Need details" },
                  { value: "unpicked", label: "Not picked" },
                ]}
              />
            </div>
          </div>

          <div
            className={cn(
              GRID,
              "mt-5 border-y border-black/[0.05] bg-neutral-50/70 px-6 py-2 text-xs text-muted-foreground",
            )}
          >
            <SortButton k="name" sort={sort} onSort={toggleSort}>
              Product
            </SortButton>
            <span className="hidden lg:block">Style</span>
            <span className="hidden justify-self-end md:block">
              <SortButton k="price" sort={sort} onSort={toggleSort}>
                Price
              </SortButton>
            </span>
            <span className="hidden justify-self-end md:block">
              <SortButton k="picked" sort={sort} onSort={toggleSort}>
                Picked, 7d
              </SortButton>
            </span>
            <span className="justify-self-end">Status</span>
          </div>

          <ul className="divide-y divide-black/[0.05]">
            {visible.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => open(r.id)}
                  className={cn(
                    GRID,
                    "w-full px-6 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none",
                    drawerOpen && selectedId === r.id && "bg-neutral-50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Thumb src={r.image} size={44} className="rounded-xl" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-neutral-950">
                        {r.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.brand ? `${r.brand}, ` : `${r.category}, `}
                        {r.subcategory}
                      </span>
                    </span>
                  </span>
                  <span className="hidden min-w-0 flex-wrap gap-1 lg:flex">
                    {r.styles.map((s) => (
                      <span
                        key={s.id}
                        className="truncate rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
                      >
                        {s.label}
                      </span>
                    ))}
                  </span>
                  <span className="num hidden text-right text-sm text-neutral-900 md:block">
                    {fmt.money(r.price)}
                    {r.compareAtPrice && (
                      <span className="block text-xs text-muted-foreground line-through">
                        {fmt.money(r.compareAtPrice)}
                      </span>
                    )}
                  </span>
                  <span className="num hidden text-right text-sm md:block">
                    {r.stats.recommended ? (
                      <span className="text-neutral-900">
                        {r.stats.recommended}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </span>
                  <span className="justify-self-end">
                    <Status row={r} />
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="px-6 py-16 text-center">
                <p className="text-sm font-medium text-neutral-950">
                  No products match
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a different search or clear the filters.
                </p>
              </li>
            )}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-black/[0.05] px-6 py-3">
            <span className="num text-sm text-muted-foreground">
              {filtered.length
                ? `${current * PAGE_SIZE + 1} to ${Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of ${filtered.length}`
                : "No results"}
            </span>
            <span className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous page"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next page"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                <ChevronRight />
              </Button>
            </span>
          </div>
        </Tile>
      </div>

      <ProductDrawer
        row={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onStep={step}
        position={
          selectedIndex >= 0
            ? { index: selectedIndex, total: filtered.length }
            : null
        }
      />
    </div>
  );
}

function HealthCard({
  label,
  value,
  on,
  onClick,
  delay,
  children,
}: {
  label: string;
  value: number;
  on: boolean;
  onClick: () => void;
  delay: number;
  children: ReactNode;
}) {
  return (
    <Tile
      delay={delay}
      className={cn(
        "transition-shadow",
        on && "ring-2 ring-neutral-900/80",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className="group flex h-full w-full flex-col p-6 text-left focus-visible:outline-none"
      >
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        <span className="num mt-3 text-4xl leading-none font-medium tracking-[-0.04em] text-neutral-950">
          {value}
        </span>
        <span className="mt-4 text-sm text-muted-foreground">{children}</span>
        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-neutral-700 group-hover:text-neutral-950">
          {on ? "Show all products" : "Review them"}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    </Tile>
  );
}

function Status({ row }: { row: CatalogRow }) {
  // Ready is the normal state, so it stays quiet; only problems get a pill.
  if (row.inStock > 0 && !needsDetails(row))
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Ready
      </span>
    );
  const [label, className] =
    row.inStock === 0
      ? ["Sold out", "bg-neutral-100 text-neutral-600"]
      : ["Needs details", "bg-amber-50 text-amber-800"];
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {label}
    </span>
  );
}

function FilterSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Record<string, string>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} className="w-44 rounded-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SortButton({
  k,
  sort,
  onSort,
  children,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  children: ReactNode;
}) {
  const on = sort.key === k;
  const Icon = sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-neutral-950",
        on && "font-medium text-neutral-900",
      )}
    >
      {children}
      {on && <Icon className="size-3" />}
    </button>
  );
}
