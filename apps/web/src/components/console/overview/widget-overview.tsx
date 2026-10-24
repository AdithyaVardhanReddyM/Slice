"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type {
  OverviewRange,
  WidgetOverviewData,
} from "@/lib/mock/widget-overview";
import { TrendChart } from "@/components/console/charts";
import {
  CartValueCard,
  FunnelCard,
  RecentConversations,
} from "@/components/console/home/concierge";
import {
  PillTabs,
  RemoteImage,
  Tile,
  TileHeader,
} from "@/components/console/home/ui";
import { ConsolePage } from "@/components/console/shell-ui";
import { StatusText, WidgetGlyph } from "@/components/console/sidebar";

function TileLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-950"
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function ProductsCard({
  data,
  base,
  className,
}: {
  data: WidgetOverviewData;
  base: string;
  className?: string;
}) {
  return (
    <Tile delay={240} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Most recommended"
        hint="Products the concierge picked most, by add-to-carts"
        actions={<TileLink href={`${base}/catalog`}>Catalog</TileLink>}
      />
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3.5rem] gap-x-3 border-y border-black/[0.05] bg-neutral-50/70 px-6 py-2 text-xs text-muted-foreground">
        <span>Product</span>
        <span className="text-right">Shown</span>
        <span className="text-right">Opened</span>
        <span className="text-right">Carted</span>
      </div>
      <ul className="flex-1 divide-y divide-black/[0.05] px-6">
        {data.products.map((p) => (
          <li
            key={p.id}
            className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3.5rem] items-center gap-x-3 py-3"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-black/[0.04]">
                <RemoteImage
                  src={p.image}
                  alt={p.name}
                  className="size-full object-cover"
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-950">
                  {p.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">
                    {p.detail}, {fmt.money(p.price)}
                  </span>
                  {p.matchedOn && (
                    <span className="hidden shrink-0 rounded-full bg-orange-50 px-2 py-px font-medium text-orange-700 sm:inline">
                      {p.matchedOn}
                    </span>
                  )}
                </span>
              </span>
            </span>
            <span className="num text-right text-sm text-muted-foreground">
              {p.shown}
            </span>
            <span className="num text-right text-sm text-muted-foreground">
              {p.clicked}
            </span>
            <span className="num text-right text-sm font-semibold text-neutral-950">
              {p.carted}
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

function ShoppersCard({
  data,
  base,
  className,
}: {
  data: WidgetOverviewData;
  base: string;
  className?: string;
}) {
  const top = Math.max(...data.groups.map((g) => g.share), 0.01);
  return (
    <Tile delay={300} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Who's shopping"
        hint={`Your biggest taste groups, from ${data.sample} shoppers`}
        actions={<TileLink href={`${base}/taste`}>Taste insights</TileLink>}
      />
      <ol className="flex-1 space-y-5 px-6 pt-5 pb-6">
        {data.groups.map((g) => (
          <li key={g.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-neutral-950">
                {g.label}
              </span>
              <span className="num shrink-0 text-sm font-semibold text-neutral-950">
                {fmt.pct(g.share, 0)}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {g.summary}
            </p>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <span
                className="block h-full rounded-full bg-linear-to-r from-orange-400 to-orange-600"
                style={{ width: `${(g.share / top) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </Tile>
  );
}

function GapsCard({
  data,
  base,
  className,
}: {
  data: WidgetOverviewData;
  base: string;
  className?: string;
}) {
  return (
    <Tile delay={180} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Catalog gaps"
        hint="What shoppers asked for that the catalog couldn't answer"
      />
      <ul className="flex-1 space-y-3 px-6 pt-5 pb-6">
        {data.gaps.map((g) => (
          <li key={g.gap}>
            <Link
              href={`${base}/conversations/${g.conversationId}`}
              className="group flex items-start gap-3 rounded-2xl bg-neutral-50 p-3.5 ring-1 ring-black/[0.04] transition-colors hover:bg-neutral-100"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <PackageSearch className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-neutral-950">
                    {g.gap}
                  </span>
                  <span className="num shrink-0 text-xs text-muted-foreground">
                    ~{g.perMonth} a month
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">
                  “{g.quote}”
                </span>
              </span>
            </Link>
          </li>
        ))}
        {data.gaps.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">
            Every request found a match.
          </li>
        )}
      </ul>
      <p className="border-t border-black/[0.05] px-6 py-3.5 text-xs text-muted-foreground">
        <span className="num font-medium text-neutral-950">
          {fmt.pct(data.noMatch, 0)}
        </span>{" "}
        of chats asked for something you don&apos;t sell. The concierge says
        so instead of forcing a pick.
      </p>
    </Tile>
  );
}

/**
 * A widget's Overview: only what the widget itself sees. The journey ends at
 * the cart because checkout runs in the merchant's systems.
 */
export function WidgetOverview({ data }: { data: WidgetOverviewData }) {
  const [range, setRange] = useState<OverviewRange>(30);
  const r = data.ranges[range];
  const t = r.totals.all;
  const base = `/dashboard/concierge/${data.widget.id}`;
  const widgets = [{ ...data.widget }];
  const per = (a: number, b: number) => (b > 0 ? a / b : 0);

  return (
    <ConsolePage>
      <header className="home-rise flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <WidgetGlyph
              name={data.widget.name}
              accent={data.widget.accent}
              logo={data.widget.logo}
            />
            <span className="truncate">
              {data.widget.domain}, {data.widget.vertical}
            </span>
            <StatusText status={data.widget.status} />
          </div>
          <h1 className="mt-3 text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-neutral-950 sm:text-[44px]">
            {data.widget.name}
          </h1>
          <p className="mt-2.5 text-[15px] text-muted-foreground">
            How the concierge did for shoppers on {data.widget.domain} in the
            last {range} days.
          </p>
        </div>
        <PillTabs
          label="Date range"
          value={range}
          onChange={setRange}
          options={[
            { value: 7, label: "7 days" },
            { value: 14, label: "14 days" },
            { value: 30, label: "30 days" },
          ]}
        />
      </header>

      <div className="mt-10 grid gap-5 lg:grid-cols-12">
        <FunnelCard
          data={r}
          widgets={widgets}
          range={range}
          delay={60}
          className="lg:col-span-8"
        />
        <CartValueCard
          data={r}
          widgets={widgets}
          range={range}
          delay={120}
          className="lg:col-span-4"
        >
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-black/10 pt-5">
            {(
              [
                ["Items", fmt.int(t.addToCart)],
                ["Average item", fmt.money(per(t.cartValue, t.addToCart))],
                ["Per chat", fmt.money(per(t.cartValue, t.conversations))],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-xs text-black/60">{label}</dt>
                <dd className="num mt-1 text-lg font-semibold tracking-tight">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </CartValueCard>

        <Tile delay={150} className="lg:col-span-8">
          <TileHeader
            title="Daily activity"
            hint="Conversations and add-to-carts per day"
          />
          <div className="px-3 pt-4 pb-4">
            <TrendChart
              data={r.daily.map((d) => ({
                date: d.date,
                conversations: d.conversations,
                addToCart: d.addToCart,
              }))}
            />
          </div>
        </Tile>
        <GapsCard data={data} base={base} className="lg:col-span-4" />

        <ProductsCard data={data} base={base} className="lg:col-span-7" />
        <ShoppersCard data={data} base={base} className="lg:col-span-5" />

        <RecentConversations
          recent={data.recent}
          delay={360}
          className="lg:col-span-12"
          href={`${base}/conversations`}
        />
      </div>
    </ConsolePage>
  );
}
