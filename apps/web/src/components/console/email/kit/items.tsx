"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { FileUp, UserStar, Plus } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/email/labels";
import type { EmailBrand, EmailItemRow } from "@/lib/email/types";
import { Notice, Spinner } from "@/components/console/setup/atoms";
import { Skeleton } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ItemSheet } from "./item-sheet";
import { ItemsCsvDialog } from "./items-csv";

function ItemCover({ item }: { item: EmailItemRow }) {
  const [broken, setBroken] = useState<string | null>(null);
  const book = item.kind === "book";
  return (
    <span className={cn("relative block overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-black/[0.06]", book ? "aspect-[2/3]" : "aspect-square")}>
      {item.image && broken !== item.image ? (
        // Covers and product photos live on many hosts; next/image would need each allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          onError={() => setBroken(item.image!)}
        />
      ) : (
        <span className="flex size-full items-end bg-neutral-800 p-3 text-sm leading-snug font-semibold text-white/85">{item.name}</span>
      )}
    </span>
  );
}

/** Whether Qloo knows the item, which lets taste picks rank it on more than its tags. */
export function QlooChip({ item }: { item: Pick<EmailItemRow, "qloo"> }) {
  if (!item.qloo)
    return <span className="inline-flex h-5 items-center text-[11px] text-muted-foreground">Not on Qloo</span>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-neutral-900 px-1.5 text-[11px] font-medium text-white">
            <UserStar className="size-3" />
            Qloo match
          </span>
        }
      />
      <TooltipContent className="max-w-64">
        Matched to “{item.qloo.name}” on Qloo, so taste picks can rank it for each reader.
        {item.qloo.tags?.length ? ` Tagged ${item.qloo.tags.slice(0, 4).join(", ")}.` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

/** The brand's catalog as covers: add, edit, import from CSV, and match with Qloo. */
export function ItemsCatalog({ brand, items }: { brand: EmailBrand; items: EmailItemRow[] | undefined }) {
  const resolve = useAction(api.emailItems.resolve);
  // Kept after closing so the sheet can animate out; the key gives each opening fresh fields.
  const [sheet, setSheet] = useState<{ item: EmailItemRow | null; key: number; open: boolean } | null>(null);
  const [csv, setCsv] = useState(false);
  const [matching, setMatching] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "bad" | "neutral"; text: string } | null>(null);
  const unmatched = (items ?? []).filter((i) => !i.qloo && i.kind !== "offer").length;
  const matched = (items ?? []).filter((i) => i.qloo).length;
  const bookish = (brand.about as { categories?: string[] } | undefined)?.categories?.some((c) => /book|fiction|poetry/i.test(c));
  const defaultKind = items?.[0]?.kind ?? (bookish ? "book" : "product");

  async function match() {
    setMatching(true);
    setResult(null);
    try {
      const r = await resolve({ brandId: brand._id });
      setResult(
        r.total === 0
          ? { tone: "neutral", text: "Every item that can be matched already is." }
          : { tone: r.resolved ? "ok" : "neutral", text: `Matched ${r.resolved} of ${r.total} on Qloo.${r.resolved < r.total ? " The rest still rank by their tags." : ""}` },
      );
    } catch (err) {
      setResult({ tone: "bad", text: errorText(err) });
    } finally {
      setMatching(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Catalog</h2>
          <p className="text-sm text-muted-foreground">
            {items === undefined
              ? "Loading…"
              : items.length === 0
                ? "What taste picks choose from. Setup adds what it finds on your homepage."
                : `${items.length} ${items.length === 1 ? "item" : "items"}, ${matched} matched on Qloo`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unmatched > 0 && (
            <Button variant="outline" size="sm" onClick={match} disabled={matching}>
              {matching ? <Spinner data-icon="inline-start" /> : <UserStar data-icon="inline-start" />}
              {matching ? "Matching…" : "Match with Qloo"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCsv(true)}>
            <FileUp data-icon="inline-start" /> Import CSV
          </Button>
          <Button size="sm" onClick={() => setSheet({ item: null, key: Date.now(), open: true })}>
            <Plus data-icon="inline-start" /> Add item
          </Button>
        </div>
      </div>
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
      {items === undefined ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 px-6 py-14 text-center">
          <p className="text-sm font-medium">No items yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Add your books, products or events one by one, or import a CSV with a name, picture, price and link per row.</p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCsv(true)}>
              <FileUp data-icon="inline-start" /> Import CSV
            </Button>
            <Button size="sm" onClick={() => setSheet({ item: null, key: Date.now(), open: true })}>
              <Plus data-icon="inline-start" /> Add item
            </Button>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item._id}>
              <button type="button" onClick={() => setSheet({ item, key: Date.now(), open: true })} className="group block w-full text-left">
                <ItemCover item={item} />
                <span className="mt-2.5 block min-w-0">
                  <span className="line-clamp-2 text-sm leading-snug font-medium text-neutral-950 group-hover:underline group-hover:underline-offset-4">{item.name}</span>
                  {(item.subtitle || item.price) && (
                    <span className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{item.subtitle}</span>
                      {item.price && <span className="num shrink-0 text-neutral-700">{item.price}</span>}
                    </span>
                  )}
                </span>
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <QlooChip item={item} />
                {item.tags.slice(0, 2).map((t) => (
                  <span key={t} className="inline-flex h-5 max-w-full items-center truncate rounded-full bg-neutral-100 px-1.5 text-[11px] text-neutral-600">
                    {t}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {sheet && (
        <ItemSheet
          key={sheet.key}
          brand={brand}
          // The live row, so a cleared Qloo match shows at once; the snapshot once it is deleted.
          item={(sheet.item && items?.find((i) => i._id === sheet.item!._id)) ?? sheet.item}
          defaultKind={defaultKind}
          open={sheet.open}
          onOpenChange={(open) => setSheet({ ...sheet, open })}
        />
      )}
      <ItemsCsvDialog brand={brand} items={items} open={csv} onOpenChange={setCsv} defaultKind={defaultKind} />
    </div>
  );
}
