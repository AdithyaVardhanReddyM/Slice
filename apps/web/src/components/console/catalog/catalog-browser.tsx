"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/console/primitives";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReadinessMeter, Thumb } from "./atoms";
import { ProductDrawer } from "./product-drawer";
import type { CatalogRow, StyleCoverage } from "./types";

type SortKey =
  "name" | "category" | "price" | "readiness" | "recommended" | "stock";
type Scope = "all" | "gaps" | "unseen";

const PAGE_SIZE = 25;

const sorters: Record<SortKey, (a: CatalogRow, b: CatalogRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  category: (a, b) =>
    a.category.localeCompare(b.category) ||
    a.subcategory.localeCompare(b.subcategory),
  price: (a, b) => a.price - b.price,
  readiness: (a, b) => a.readiness.score - b.readiness.score,
  recommended: (a, b) => a.stats.recommended - b.stats.recommended,
  stock: (a, b) =>
    a.inStock / a.variants.length - b.inStock / b.variants.length,
};

export function CatalogBrowser({
  rows,
  coverage,
  categories,
  multiBrand,
}: {
  rows: CatalogRow[];
  coverage: StyleCoverage[];
  categories: string[];
  multiBrand: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [style, setStyle] = useState("all");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "recommended",
    dir: -1,
  });
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter(
      (r) =>
        (!q || r.haystack.includes(q)) &&
        (category === "all" || r.category === category) &&
        (style === "all" || r.styles.some((s) => s.id === style)) &&
        (scope === "all" ||
          (scope === "gaps" &&
            (r.gaps.length > 0 || r.readiness.tier === "thin")) ||
          (scope === "unseen" && r.stats.recommended === 0)),
    )
    .sort(
      (a, b) =>
        sorters[sort.key](a, b) * sort.dir || a.name.localeCompare(b.name),
    );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE,
  );
  const active =
    query || category !== "all" || style !== "all" || scope !== "all";

  const selectedIndex = selectedId
    ? filtered.findIndex((r) => r.id === selectedId)
    : -1;
  const selected = selectedId
    ? (rows.find((r) => r.id === selectedId) ?? null)
    : null;

  const gapsCount = rows.filter(
    (r) => r.gaps.length > 0 || r.readiness.tier === "thin",
  ).length;
  const unseenCount = rows.filter((r) => r.stats.recommended === 0).length;
  const maxShare = Math.max(...coverage.map((c) => c.share));

  const categoryItems: Record<string, string> = {
    all: "All categories",
    ...Object.fromEntries(categories.map((c) => [c, c])),
  };
  const styleItems: Record<string, string> = {
    all: "All styles",
    ...Object.fromEntries(coverage.map((c) => [c.id, c.label])),
  };

  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : { key, dir: key === "name" || key === "category" ? 1 : -1 },
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

  const sortProps = { sort, onSort: toggleSort };

  return (
    <div className="space-y-6">
      {/* Style coverage */}
      <Card>
        <CardHeader>
          <CardTitle>Style coverage</CardTitle>
          <CardDescription>
            Share of the catalog on each style. Select a style to filter the
            products below.
          </CardDescription>
          {style !== "all" && (
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => reset(() => setStyle("all"))}
              >
                <X />
                Clear filter
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-8 gap-y-1 md:grid-cols-2">
            {coverage.map((c) => {
              const on = style === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  title={c.description}
                  onClick={() => reset(() => setStyle(on ? "all" : c.id))}
                  className={cn(
                    "-mx-2 grid h-9 grid-cols-3 items-center gap-3 rounded-md px-2 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-6",
                    on && "bg-muted",
                    style !== "all" && !on && "text-muted-foreground",
                  )}
                >
                  <span className="truncate sm:col-span-2">{c.label}</span>
                  <span className="hidden h-2 rounded-full bg-muted sm:col-span-2 sm:block">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        c.count === 0
                          ? "bg-transparent"
                          : style !== "all" && !on
                            ? "bg-primary/40"
                            : "bg-primary",
                      )}
                      style={{
                        width: `${Math.max(c.count ? 2 : 0, (c.share / maxShare) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="num text-right">{fmt.pct(c.share, 0)}</span>
                  <span className="num text-right text-muted-foreground">
                    {c.count} SKUs
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Product table */}
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => reset(() => setQuery(e.target.value))}
              placeholder="Search name, SKU, material, color"
              className="pl-8"
            />
          </label>
          <Select
            items={categoryItems}
            value={category}
            onValueChange={(v) => v && reset(() => setCategory(v))}
          >
            <SelectTrigger aria-label="Category" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(categoryItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={styleItems}
            value={style}
            onValueChange={(v) => v && reset(() => setStyle(v))}
          >
            <SelectTrigger aria-label="Style" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(styleItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs
            value={scope}
            onValueChange={(v) => reset(() => setScope(v as Scope))}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="gaps">
                Needs attention
                <UiBadge variant="secondary" className="num">
                  {gapsCount}
                </UiBadge>
              </TabsTrigger>
              <TabsTrigger value="unseen">
                Not recommended
                <UiBadge variant="secondary" className="num">
                  {unseenCount}
                </UiBadge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {active && (
            <Button
              variant="ghost"
              onClick={() =>
                reset(() => {
                  setQuery("");
                  setCategory("all");
                  setStyle("all");
                  setScope("all");
                })
              }
            >
              Reset
            </Button>
          )}
          <span className="num ml-auto text-sm text-muted-foreground">
            {filtered.length === rows.length
              ? `${rows.length} products`
              : `${filtered.length} of ${rows.length}`}
          </span>
        </div>

        <Table className="min-w-5xl table-fixed">
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <SortHead
                label="Product"
                k="name"
                className="pl-4"
                {...sortProps}
              />
              <SortHead
                label="Category"
                k="category"
                className="w-48"
                {...sortProps}
              />
              <SortHead
                label="Price"
                k="price"
                align="right"
                className="w-28"
                {...sortProps}
              />
              <TableHead className="w-52">Style</TableHead>
              <SortHead
                label="Readiness"
                k="readiness"
                className="w-40"
                {...sortProps}
              />
              <SortHead
                label="Recs, 7d"
                k="recommended"
                align="right"
                className="w-28"
                {...sortProps}
              />
              <SortHead
                label="Stock"
                k="stock"
                align="right"
                className="w-28 pr-4"
                {...sortProps}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow
                key={r.id}
                onClick={() => open(r.id)}
                data-state={
                  drawerOpen && selectedId === r.id ? "selected" : undefined
                }
                className="cursor-pointer"
              >
                <TableCell className="py-2.5 pl-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb src={r.image} size={36} />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(r.id);
                        }}
                        className="block w-full truncate text-left font-medium outline-none hover:underline focus-visible:underline"
                      >
                        {r.name}
                      </button>
                      <div className="truncate text-xs text-muted-foreground">
                        {multiBrand && r.brand && <>{r.brand} · </>}
                        {r.id}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="truncate">
                  {r.category}
                  <span className="text-muted-foreground">
                    {" "}
                    / {r.subcategory}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="num">{fmt.money(r.price)}</span>
                  {r.compareAtPrice && (
                    <span className="num block text-xs text-muted-foreground line-through">
                      {fmt.money(r.compareAtPrice)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 overflow-hidden">
                    {r.styles.map((s) => (
                      <Badge
                        key={s.id}
                        tone={style === s.id ? "neutral" : "outline"}
                      >
                        {s.label}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell title={r.gaps.join(", ") || undefined}>
                  <ReadinessMeter
                    score={r.readiness.score}
                    tier={r.readiness.tier}
                  />
                </TableCell>
                <TableCell className="text-right">
                  {r.stats.recommended ? (
                    <span className="num">{r.stats.recommended}</span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  {r.inStock === 0 ? (
                    <Badge tone="bad">Sold out</Badge>
                  ) : (
                    <span
                      className={cn(
                        "num",
                        r.inStock === r.variants.length &&
                          "text-muted-foreground",
                      )}
                    >
                      {r.inStock}/{r.variants.length}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="font-medium">No products match</div>
                  <div className="mt-1 text-muted-foreground">
                    Try a different search or clear the filters.
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <span className="num text-sm text-muted-foreground">
            {filtered.length
              ? `${current * PAGE_SIZE + 1}–${Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of ${filtered.length}`
              : "0 results"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft />
            </Button>
            {Array.from({ length: pages }, (_, i) => (
              <Button
                key={i}
                variant={i === current ? "outline" : "ghost"}
                size="icon-sm"
                onClick={() => setPage(i)}
                aria-current={i === current ? "page" : undefined}
                className="num"
              >
                {i + 1}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>

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

function SortHead({
  label,
  k,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const on = sort.key === k;
  const Icon = on ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <TableHead
      className={cn(align === "right" && "text-right", className)}
      aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSort(k)}
        className={cn(
          "text-sm font-medium",
          align === "right" ? "-mr-2.5" : "-ml-2.5",
        )}
      >
        {label}
        <Icon className={cn(!on && "text-muted-foreground")} />
      </Button>
    </TableHead>
  );
}
