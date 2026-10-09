import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Database, FileJson, Rss } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CatalogBrowser } from "@/components/console/catalog/catalog-browser";
import { catalogRows, styleCoverage } from "@/components/console/catalog/rows";
import { StatCard, StatGrid } from "@/components/console/catalog/stat-card";
import { SyncActions } from "@/components/console/catalog/sync-actions";
import {
  EmptyState,
  PageHeader,
  PageSkeleton,
} from "@/components/console/primitives";
import { catalogs } from "@/lib/mock/catalog";
import { getWidget, metrics } from "@/lib/mock/widgets";
import { fmt } from "@/lib/format";

export const metadata: Metadata = { title: "Catalog" };

export default function CatalogPage({
  params,
}: PageProps<"/dashboard/[widget]/catalog">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CatalogContent params={params} />
    </Suspense>
  );
}

async function CatalogContent({
  params,
}: {
  params: PageProps<"/dashboard/[widget]/catalog">["params"];
}) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();

  if (!widget.storeKey) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <PageHeader
          title="Catalog"
          description="The products your concierge can recommend, and how well Slice can read them."
        />
        <Card className="py-0">
          <EmptyState
            className="border-0 py-20"
            title="No catalog connected yet"
            body="Upload a product file or connect a feed. Slice reads descriptions and attributes to match products against each shopper's taste."
            action={
              <Link
                href={`/dashboard/${widget.id}/setup`}
                className={buttonVariants()}
              >
                Connect a catalog
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const catalog = catalogs[widget.storeKey];
  // Each concierge reply carries ~3 picks; match the overview's 7-day volume.
  const recsShown = (metrics[widget.id] ?? [])
    .slice(-7)
    .reduce((s, d) => s + d.recsShown, 0);
  const rows = catalogRows(catalog, widget.storeKey, recsShown * 3);
  const coverage = styleCoverage(catalog);
  const categories = catalog.store.nav.map((n) => n.category);
  const multiBrand = Boolean(catalog.store.brands?.length);

  const total = rows.length;
  const ready = Math.round(widget.catalog.readiness * total);
  const withGaps = rows.filter((r) => r.gaps.length > 0);
  const gapCounts = new Map<string, number>();
  for (const r of withGaps)
    for (const g of r.gaps) gapCounts.set(g, (gapCounts.get(g) ?? 0) + 1);
  const [topGap] = [...gapCounts.entries()].sort((a, b) => b[1] - a[1]);
  const recs = rows.reduce((s, r) => s + r.stats.recommended, 0);
  const surfaced = rows.filter((r) => r.stats.recommended > 0).length;
  const enriched = rows.filter((r) => r.enriched.length > 0).length;

  const SourceIcon =
    widget.catalog.source === "upload"
      ? FileJson
      : widget.catalog.source === "feed"
        ? Rss
        : Database;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Catalog"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <SourceIcon className="size-4 text-muted-foreground" />
              {widget.catalog.sourceLabel}
            </span>
            <span aria-hidden>·</span>
            <span className="num">{fmt.int(total)} products</span>
            <span aria-hidden>·</span>
            <span>
              Synced{" "}
              {widget.catalog.lastSyncAt
                ? fmt.ago(widget.catalog.lastSyncAt)
                : "never"}
            </span>
            {enriched > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="num">{enriched} enriched by Slice</span>
              </>
            )}
          </span>
        }
        actions={
          <SyncActions
            replaceLabel={
              widget.catalog.source === "upload"
                ? "Replace file"
                : "Change source"
            }
          />
        }
      />

      <div className="space-y-6">
        <StatGrid>
          <StatCard
            label="Products"
            value={fmt.int(total)}
            hint={
              multiBrand
                ? `${catalog.store.brands?.length} brands, ${categories.length} categories`
                : `House brand, ${categories.length} categories`
            }
          />
          <StatCard
            label="Taste-ready"
            value={fmt.pct(widget.catalog.readiness, 0)}
            hint={
              <>
                <span className="num">{ready}</span> of{" "}
                <span className="num">{total}</span> have enough copy and
                attributes
              </>
            }
          >
            <Progress
              value={widget.catalog.readiness * 100}
              aria-label="Taste-ready share"
            />
          </StatCard>
          <StatCard
            label="Missing attributes"
            value={fmt.int(withGaps.length)}
            hint={
              topGap ? (
                <>
                  Most common: {topGap[0].toLowerCase()} (
                  <span className="num">{topGap[1]}</span>)
                </>
              ) : (
                "Every product is complete"
              )
            }
          />
          <StatCard
            label="Recommended, last 7 days"
            value={fmt.int(recs)}
            hint={
              <>
                <span className="num">{surfaced}</span> of{" "}
                <span className="num">{total}</span> products surfaced at least
                once
              </>
            }
          />
        </StatGrid>

        <CatalogBrowser
          rows={rows}
          coverage={coverage}
          categories={categories}
          multiBrand={multiBrand}
        />
      </div>
    </div>
  );
}
