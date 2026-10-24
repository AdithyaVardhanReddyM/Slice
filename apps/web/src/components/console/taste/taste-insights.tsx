import Link from "next/link";
import type { ReactNode } from "react";
import { PackageSearch, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type {
  InsightGroup,
  InsightIdea,
  InsightStyle,
  TasteInsightsData,
} from "@/lib/mock/taste-insights";
import type { Widget } from "@/lib/mock/types";
import { RemoteImage, Tile, TileHeader } from "@/components/console/home/ui";
import { ConsolePage } from "@/components/console/shell-ui";
import { WidgetGlyph } from "@/components/console/sidebar";
import type { TasteMapGeometry } from "./map-geometry";
import { TasteMap } from "./taste-map";

/** "Bedroom lighting, vases": the first kept as written, the rest lowercased. */
const listOf = (items: string[]) =>
  items.map((s, i) => (i ? s.toLowerCase() : s)).join(", ");

/* Header ------------------------------------------------------------------------------------ */

export function TasteHeader({
  widget,
  meta,
}: {
  widget: Pick<Widget, "name" | "accent" | "logo">;
  meta: ReactNode;
}) {
  return (
    <header className="home-rise">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <WidgetGlyph
          name={widget.name}
          accent={widget.accent}
          logo={widget.logo}
        />
        <span className="truncate">{meta}</span>
      </div>
      <h1 className="mt-3 text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-neutral-950 sm:text-[44px]">
        Taste insights
      </h1>
      <p className="mt-2.5 text-[15px] text-muted-foreground">
        Who shops at {widget.name}, where they are, and what to stock next.
      </p>
    </header>
  );
}

/* Your shoppers ----------------------------------------------------------------------------- */

function GroupCard({ group }: { group: InsightGroup }) {
  const rows: [string, ReactNode][] = [
    [
      "Loves",
      <span key="loves" className="flex flex-wrap gap-1.5">
        {group.styles.map((s) => (
          <span
            key={s}
            className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700"
          >
            {s}
          </span>
        ))}
      </span>,
    ],
    ["Into", group.into.map((e) => e.name).join(", ")],
    ["Comes for", listOf(group.comesFor)],
  ];
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.06]">
      <div className="grid h-28 grid-cols-3 gap-px overflow-hidden bg-neutral-100">
        {group.picks.map((p) => (
          <RemoteImage
            key={p.id}
            src={p.image}
            alt={p.name}
            className="h-28 w-full object-cover"
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold tracking-tight text-neutral-950">
            {group.label}
          </h3>
          <span className="num shrink-0 text-[15px] font-semibold text-neutral-950">
            {fmt.pct(group.share, 0)}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{group.summary}</p>
        <dl className="mt-4 mb-5 space-y-2.5">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-3 text-sm"
            >
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="min-w-0 text-neutral-900">{value}</dd>
            </div>
          ))}
        </dl>
        <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-black/[0.06] pt-4">
          {(
            [
              ["Of all carts", fmt.pct(group.cartShare, 0)],
              ["Typical item", fmt.money(group.avgItem)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">
                {label}
              </dt>
              <dd className="num mt-0.5 truncate text-sm font-semibold text-neutral-950">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}

function Shoppers({ data }: { data: TasteInsightsData }) {
  return (
    <Tile delay={60}>
      <TileHeader
        title="Your shoppers"
        hint="Groups of shoppers who share a taste, from what they told the concierge"
      />
      <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
        {data.groups.map((g) => (
          <GroupCard key={g.label} group={g} />
        ))}
      </div>
    </Tile>
  );
}

/* What to stock ----------------------------------------------------------------------------- */

const VERDICT: Record<
  InsightStyle["verdict"],
  { label: string; className: string }
> = {
  more: { label: "Stock more", className: "bg-orange-50 text-orange-700" },
  balanced: {
    label: "About right",
    className: "bg-neutral-100 text-neutral-600",
  },
  less: { label: "Over-stocked", className: "bg-neutral-100 text-neutral-500" },
};

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2.5 rounded-full" style={{ background: tone }} />
      {label}
    </span>
  );
}

/** The styles where shopper taste and the catalog disagree most, short first. */
function Styles({
  data,
  className,
}: {
  data: TasteInsightsData;
  className?: string;
}) {
  const gap = (s: InsightStyle) => s.demand - s.supply;
  const rows = [
    ...data.styles
      .filter((s) => s.verdict === "more")
      .sort((a, b) => gap(b) - gap(a))
      .slice(0, 3),
    ...data.styles
      .filter((s) => s.verdict === "less")
      .sort((a, b) => gap(a) - gap(b))
      .slice(0, 3),
  ];
  const max = Math.max(0.0001, ...rows.flatMap((s) => [s.demand, s.supply]));
  return (
    <Tile delay={180} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Styles: wanted vs stocked"
        hint="Where shopper taste and your catalog disagree most"
        actions={
          <span className="hidden items-center gap-3 sm:flex">
            <Legend tone="#f97316" label="Shoppers" />
            <Legend tone="#d4d4d4" label="Your catalog" />
          </span>
        }
      />
      <ul className="mt-3 flex-1 divide-y divide-black/[0.05] px-6 pb-3">
        {rows.map((s) => (
          <li
            key={s.id}
            className="grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_6.5rem] items-center gap-4 py-3"
          >
            <span className="min-w-0">
              <span className="block text-sm leading-snug font-medium text-neutral-950">
                {s.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {s.products} products
              </span>
            </span>
            <span className="space-y-1.5">
              {(
                [
                  [s.demand, "bg-linear-to-r from-orange-400 to-orange-600"],
                  [s.supply, "bg-neutral-300"],
                ] as const
              ).map(([value, tone], i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-50">
                    <span
                      className={cn("block h-full rounded-full", tone)}
                      style={{ width: `${(value / max) * 100}%` }}
                    />
                  </span>
                  <span className="num w-8 text-right text-xs text-muted-foreground">
                    {fmt.pct(value, 0)}
                  </span>
                </span>
              ))}
            </span>
            <span
              className={cn(
                "justify-self-end rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
                VERDICT[s.verdict].className,
              )}
            >
              {VERDICT[s.verdict].label}
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

function Idea({ idea, base }: { idea: InsightIdea; base: string }) {
  const request = idea.kind === "request";
  const body = (
    <>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          request
            ? "bg-amber-100 text-amber-800"
            : "bg-orange-100 text-orange-700",
        )}
      >
        {request ? (
          <PackageSearch className="size-4" />
        ) : (
          <TrendingUp className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-neutral-950">
            {idea.title}
          </span>
          <span className="num shrink-0 text-xs text-muted-foreground">
            {request
              ? `~${idea.perMonth} a month`
              : `${fmt.pct(idea.demand, 0)} of taste`}
          </span>
        </span>
        <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
          {request ? (
            <>
              Asked for by {idea.groups.join(" and ")} shoppers. Nothing in your
              catalog fits.
            </>
          ) : idea.group && idea.asks ? (
            <>
              {idea.group} shoppers ask for these in {idea.asks} chats. You
              have {idea.stock} in this style.
            </>
          ) : (
            <>
              {fmt.pct(idea.demand, 0)} of shopper taste,{" "}
              {fmt.pct(idea.supply, 0)} of your catalog.
            </>
          )}
        </span>
      </span>
    </>
  );
  const box =
    "flex items-start gap-3 rounded-2xl bg-neutral-50 p-3.5 ring-1 ring-black/[0.04]";
  return request ? (
    <Link
      href={`${base}/conversations/${idea.conversationId}`}
      className={cn(box, "transition-colors hover:bg-neutral-100")}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

function Ideas({
  data,
  base,
  className,
}: {
  data: TasteInsightsData;
  base: string;
  className?: string;
}) {
  return (
    <Tile delay={220} className={cn("flex flex-col", className)}>
      <TileHeader
        title="What to add next"
        hint="Requests you couldn't answer, and styles you're short on"
      />
      <ul className="flex-1 space-y-3 px-6 pt-5 pb-6">
        {data.ideas.map((idea) => (
          <li key={idea.title}>
            <Idea idea={idea} base={base} />
          </li>
        ))}
        {data.ideas.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">
            Your catalog covers what shoppers ask for.
          </li>
        )}
      </ul>
    </Tile>
  );
}

/* Products ---------------------------------------------------------------------------------- */

function Products({ data }: { data: TasteInsightsData }) {
  return (
    <Tile delay={260}>
      <TileHeader
        title="Products that suit the most shoppers"
        hint="Strong picks for your homepage and ads"
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-6 sm:grid-cols-3 xl:grid-cols-6">
        {data.products.map((p) => (
          <div key={p.id} className="min-w-0">
            <span className="block aspect-[4/5] overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/[0.04]">
              <RemoteImage
                src={p.image}
                alt={p.name}
                className="size-full object-cover"
              />
            </span>
            <span
              title={p.name}
              className="mt-3 block truncate text-sm font-medium text-neutral-950"
            >
              {p.name}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {p.detail}, {fmt.money(p.price)}
            </span>
            <span className="mt-3 flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Suits</span>
              <span className="num text-sm font-semibold text-neutral-950">
                {fmt.pct(p.reach, 0)}
              </span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <span
                className="block h-full rounded-full bg-linear-to-r from-orange-400 to-orange-600"
                style={{ width: `${p.reach * 100}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    </Tile>
  );
}

/* Page -------------------------------------------------------------------------------------- */

/** A widget's taste insights: who its shoppers are, where they are, and what to stock. */
export function TasteInsights({
  widget,
  data,
  geo,
}: {
  widget: Pick<Widget, "id" | "name" | "accent" | "logo">;
  data: TasteInsightsData;
  geo: TasteMapGeometry;
}) {
  const base = `/dashboard/concierge/${widget.id}`;
  return (
    <ConsolePage>
      <TasteHeader
        widget={widget}
        meta={`${fmt.int(data.shoppers)} shoppers since ${fmt.date(data.since)}`}
      />
      <div className="mt-10 space-y-5">
        <Shoppers data={data} />
        <TasteMap
          geo={geo}
          places={data.places}
          groups={data.groups}
          delay={120}
        />
        <div className="grid gap-5 lg:grid-cols-12">
          <Ideas data={data} base={base} className="lg:col-span-5" />
          <Styles data={data} className="lg:col-span-7" />
        </div>
        <Products data={data} />
      </div>
    </ConsolePage>
  );
}
