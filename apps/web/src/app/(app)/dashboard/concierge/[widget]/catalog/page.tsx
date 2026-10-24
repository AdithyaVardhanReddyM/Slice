import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Database, FileJson, Rss } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CatalogView } from "@/components/console/catalog/catalog-view";
import { catalogRows } from "@/components/console/catalog/rows";
import { SyncActions } from "@/components/console/catalog/sync-actions";
import { Tile } from "@/components/console/home/ui";
import { EmptyState, PageSkeleton } from "@/components/console/primitives";
import { ConsolePage } from "@/components/console/shell-ui";
import { catalogs } from "@/lib/mock/catalog";
import { getWidget, metrics } from "@/lib/mock/widgets";
import { fmt } from "@/lib/format";

export const metadata: Metadata = { title: "Catalog" };

export default function CatalogPage({
  params,
}: PageProps<"/dashboard/concierge/[widget]/catalog">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CatalogContent params={params} />
    </Suspense>
  );
}

function Header({
  meta,
  description,
  actions,
}: {
  meta: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="home-rise flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {meta}
        </div>
        <h1 className="mt-3 text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-neutral-950 sm:text-[44px]">
          Catalog
        </h1>
        <p className="mt-2.5 text-[15px] text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

async function CatalogContent({
  params,
}: {
  params: PageProps<"/dashboard/concierge/[widget]/catalog">["params"];
}) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();

  if (!widget.storeKey) {
    return (
      <ConsolePage>
        <Header
          meta="No source connected"
          description="The products your concierge can pick from."
        />
        <Tile className="mt-10">
          <EmptyState
            className="border-0 py-20"
            title="No catalog connected yet"
            body="Upload a product file or connect a feed. The concierge reads each product's description and details to match it to a shopper's taste."
            action={
              <Link
                href={`/dashboard/concierge/${widget.id}/setup`}
                className={buttonVariants()}
              >
                Connect a catalog
              </Link>
            }
          />
        </Tile>
      </ConsolePage>
    );
  }

  const catalog = catalogs[widget.storeKey];
  // Each concierge reply carries ~3 picks; match the overview's 7-day volume.
  const recsShown = (metrics[widget.id] ?? [])
    .slice(-7)
    .reduce((s, d) => s + d.recsShown, 0);
  const rows = catalogRows(catalog, widget.storeKey, recsShown * 3);
  const SourceIcon =
    widget.catalog.source === "upload"
      ? FileJson
      : widget.catalog.source === "feed"
        ? Rss
        : Database;

  return (
    <ConsolePage>
      <Header
        meta={
          <>
            <SourceIcon className="size-4" />
            <span className="truncate">
              {widget.catalog.sourceLabel}, synced{" "}
              {widget.catalog.lastSyncAt
                ? fmt.ago(widget.catalog.lastSyncAt)
                : "never"}
            </span>
          </>
        }
        description={
          <>
            The <span className="num">{fmt.int(rows.length)}</span> products
            your concierge can pick from.
          </>
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
      <div className="mt-10">
        <CatalogView
          rows={rows}
          categories={catalog.store.nav.map((n) => n.category)}
          styles={catalog.store.styles.map((s) => ({
            id: s.id,
            label: s.label,
          }))}
        />
      </div>
    </ConsolePage>
  );
}
