import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  PackageSearch,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { TrendChart } from "@/components/console/charts";
import { RangePicker } from "@/components/console/overview/range-picker";
import {
  OutcomeBadge,
  PageHeader,
  PageSkeleton,
  ProductThumb,
} from "@/components/console/primitives";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt } from "@/lib/format";
import { product, styleLabel } from "@/lib/mock/catalog";
import { conversationsFor } from "@/lib/mock/conversations";
import type { QlooEntityType } from "@/lib/mock/types";
import { getWidget, metrics } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Overview" };

const TYPE_LABEL: Record<QlooEntityType, string> = {
  artist: "Artist",
  movie: "Film",
  tv_show: "TV show",
  book: "Book",
  person: "Person",
  place: "Destination",
  brand: "Brand",
  podcast: "Podcast",
};

type Params = PageProps<"/dashboard/[widget]">["params"];

export default function OverviewPage({
  params,
}: PageProps<"/dashboard/[widget]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Params }) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();
  if (widget.status === "setup" || !widget.storeKey)
    redirect(`/dashboard/${widget.id}/setup`);
  const store = widget.storeKey;
  const base = `/dashboard/${widget.id}`;

  const days = metrics[widget.id];
  type Day = (typeof days)[number];
  const sum = (k: keyof Day, xs: Day[] = days) =>
    xs.reduce((a, d) => a + (d[k] as number), 0);
  const change = (k: keyof Day) =>
    sum(k, days.slice(15)) / sum(k, days.slice(0, 15)) - 1;

  const totals = {
    conversations: sum("conversations"),
    recsShown: sum("recsShown"),
    clicks: sum("clicks"),
    addToCart: sum("addToCart"),
    purchases: sum("purchases"),
    revenue: sum("revenue"),
  };

  const kpis = [
    {
      label: "Conversations",
      value: fmt.int(totals.conversations),
      delta: change("conversations"),
      footer: "Shoppers who opened the concierge and talked to it",
    },
    {
      label: "Click-through rate",
      value: fmt.pct(totals.clicks / totals.recsShown),
      delta: 0.034,
      footer: "Recommendations opened ÷ recommendations shown",
    },
    {
      label: "Added to cart",
      value: fmt.int(totals.addToCart),
      delta: change("addToCart"),
      footer: "Products added after a recommendation",
    },
    {
      label: "Influenced revenue",
      value: fmt.money(totals.revenue),
      delta: change("revenue"),
      footer: "Orders containing a recommended product",
    },
  ];

  const convs = conversationsFor(widget.id);
  const n = convs.length;

  const entityCounts = new Map<
    string,
    {
      name: string;
      type: QlooEntityType;
      count: number;
      styles: Map<string, number>;
    }
  >();
  for (const c of convs) {
    for (const e of c.profile.entities) {
      const cur = entityCounts.get(e.name) ?? {
        name: e.name,
        type: e.type,
        count: 0,
        styles: new Map(),
      };
      cur.count++;
      const top = c.profile.styles[0];
      if (top) cur.styles.set(top.label, (cur.styles.get(top.label) ?? 0) + 1);
      entityCounts.set(e.name, cur);
    }
  }
  const topEntities = [...entityCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const prodStats = new Map<
    string,
    {
      shown: number;
      clicked: number;
      carted: number;
      drivers: Map<string, number>;
    }
  >();
  for (const c of convs) {
    for (const m of c.messages) {
      for (const r of m.recs ?? []) {
        const cur = prodStats.get(r.productId) ?? {
          shown: 0,
          clicked: 0,
          carted: 0,
          drivers: new Map(),
        };
        cur.shown++;
        if (r.clicked) cur.clicked++;
        if (r.addedToCart) cur.carted++;
        for (const s of r.matched.styles)
          cur.drivers.set(s, (cur.drivers.get(s) ?? 0) + 1);
        prodStats.set(r.productId, cur);
      }
    }
  }
  const topProducts = [...prodStats.entries()]
    .sort((a, b) => b[1].carted - a[1].carted || b[1].shown - a[1].shown)
    .slice(0, 5);

  const gaps = Object.values(
    convs
      .filter((c) => c.gap)
      .reduce<
        Record<
          string,
          { gap: string; count: number; quote: string; id: string }
        >
      >((acc, c) => {
        const cur = acc[c.gap!] ?? {
          gap: c.gap!,
          count: 0,
          quote: c.messages.find((m) => m.role === "shopper")!.text,
          id: c.id,
        };
        cur.count++;
        acc[c.gap!] = cur;
        return acc;
      }, {}),
  ).sort((a, b) => b.count - a.count);

  const funnel: [string, number][] = [
    ["Opened the concierge", Math.round(totals.conversations * 1.34)],
    ["Shared their taste", totals.conversations],
    ["Saw recommendations", totals.recsShown],
    ["Opened a recommendation", totals.clicks],
    ["Added to cart", totals.addToCart],
    ["Purchased", totals.purchases],
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Overview"
        description={`How the ${widget.name} concierge performed over the last 30 days.`}
        actions={<RangePicker />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader>
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {k.value}
              </CardTitle>
              <CardAction>
                <Badge variant="outline">
                  {k.delta >= 0 ? <TrendingUp /> : <TrendingDown />}
                  {fmt.delta(k.delta)}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {k.footer}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Daily activity</CardTitle>
            <CardDescription>
              Conversations and add-to-carts per day
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={days.map((d) => ({
                date: d.date,
                conversations: d.conversations,
                addToCart: d.addToCart,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>
              From opening the concierge to purchase
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {funnel.map(([label, value], i) => (
              <div key={label} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {i > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {fmt.pct(value / funnel[i - 1][1], 0)}
                      </span>
                    )}
                    <span className="font-medium">{fmt.int(value)}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(value / funnel[0][1]) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What shoppers are into</CardTitle>
            <CardDescription>
              Most common Qloo signals across {n} recent conversations
            </CardDescription>
            <CardAction>
              <Link
                href={`${base}/taste`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Taste insights <ArrowRight />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Signal</TableHead>
                  <TableHead>Maps to</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topEntities.map((e) => {
                  const lead = [...e.styles.entries()].sort(
                    (a, b) => b[1] - a[1],
                  )[0]?.[0];
                  return (
                    <TableRow key={e.name}>
                      <TableCell>
                        <div className="font-medium">{e.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {TYPE_LABEL[e.type]}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.pct(e.count / n, 0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Catalog gaps</CardTitle>
            <CardDescription>
              Requests the catalog couldn&apos;t answer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {gaps.map((g) => (
              <div
                key={g.gap}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <PackageSearch className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{g.gap}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ~{Math.round((g.count / n) * totals.conversations)}{" "}
                      requests / 30 days
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">“{g.quote}”</p>
                  <Link
                    href={`${base}/conversations/${g.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    View conversation <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              When nothing fits, the concierge says so instead of forcing a
              pick.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Most recommended products</CardTitle>
            <CardDescription>Across recent conversations</CardDescription>
            <CardAction>
              <Link
                href={`${base}/catalog`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Catalog <ArrowRight />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Matched on</TableHead>
                  <TableHead className="text-right">Shown</TableHead>
                  <TableHead className="text-right">Opened</TableHead>
                  <TableHead className="text-right">Added to cart</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map(([id, s]) => {
                  const p = product(id);
                  const driver = [...s.drivers.entries()].sort(
                    (a, b) => b[1] - a[1],
                  )[0]?.[0];
                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProductThumb product={p} size={36} />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.subcategory} · {fmt.money(p.price)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {driver ? styleLabel(store, driver) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.shown}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.clicked}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {s.carted}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent conversations</CardTitle>
            <CardAction>
              <Link
                href={`${base}/conversations`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                View all <ArrowRight />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            {convs.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                href={`${base}/conversations/${c.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.intent}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.shopper.city}, {c.shopper.region} ·{" "}
                    {fmt.ago(c.startedAt)}
                  </div>
                </div>
                <OutcomeBadge outcome={c.outcome} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
