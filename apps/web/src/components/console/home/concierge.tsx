"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type {
  ConciergeHome,
  ConciergeRangeData,
  FunnelTotals,
  HomeConversation,
  HomePick,
} from "@/lib/mock/home";
import { OutcomeBadge } from "@/components/console/primitives";
import {
  DeltaChip,
  Initial,
  PillTabs,
  RemoteImage,
  Tile,
  TileHeader,
} from "./ui";

type Widgets = ConciergeHome["widgets"];

const STAGES: { key: keyof FunnelTotals; label: string; noun: string }[] = [
  { key: "conversations", label: "Conversations", noun: "conversations" },
  { key: "recsShown", label: "Saw picks", noun: "saw picks" },
  { key: "clicks", label: "Opened a pick", noun: "opened a pick" },
  { key: "addToCart", label: "Added to cart", noun: "added to cart" },
  { key: "purchases", label: "Purchased", noun: "purchased" },
];

/** Share of a column the bar takes; the rest is the slope down to the next stage. */
const BAR = 78;
/** Tallest bar as a share of the plot, leaving headroom for the callout. */
const PEAK = 78;

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/* Funnel ------------------------------------------------------------------------------------ */

/**
 * The shopper journey as stepped bars: each stage's count with a slope down
 * to the next, the prior period marked above each bar, and a callout on the
 * stage under the pointer.
 */
export function FunnelCard({
  data,
  widgets,
  range,
  delay,
  className,
}: {
  data: ConciergeRangeData;
  widgets: Widgets;
  range: number;
  delay?: number;
  className?: string;
}) {
  const live = widgets.filter((w) => w.status === "live");
  const [widget, setWidget] = useState("all");
  const [sel, setSel] = useState(2);
  const t = data.totals[widget];
  const p = data.prev?.[widget] ?? null;
  const values = STAGES.map((s) => t[s.key]);
  const prior = STAGES.map((s) => (p ? p[s.key] : 0));
  const max = Math.max(1, ...values, ...prior);
  const top = (v: number) => 100 - (v / max) * PEAK;
  const n = STAGES.length;
  const colW = 100 / n;
  const barCenter = (i: number) => i * colW + (colW * BAR) / 200;

  const v = values[sel];
  const step = sel > 0 ? ratio(v, values[sel - 1]) : null;
  const callout = (
    <>
      <span>
        <b className="font-semibold text-neutral-950">{fmt.int(v)}</b>{" "}
        {STAGES[sel].noun}
      </span>
      {step !== null && (
        <>
          <span className="text-neutral-300">|</span>
          <span>
            Conversion{" "}
            <b className="font-semibold text-neutral-950">{fmt.pct(step)}</b>
          </span>
        </>
      )}
      {p && (
        <>
          <span className="text-neutral-300">|</span>
          <span>
            vs prior{" "}
            <b
              className={cn(
                "font-semibold",
                v >= prior[sel] ? "text-emerald-700" : "text-red-700",
              )}
            >
              {prior[sel] ? fmt.delta(v / prior[sel] - 1) : "new"}
            </b>
          </span>
        </>
      )}
    </>
  );

  return (
    <Tile delay={delay} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Shopper journey"
        hint={
          p
            ? `From first message to checkout. Marks show the ${range} days before.`
            : `From first message to checkout, last ${range} days.`
        }
        actions={
          live.length > 1 && (
            <PillTabs
              label="Widget"
              size="sm"
              value={widget}
              onChange={setWidget}
              options={[
                { value: "all", label: "All widgets" },
                ...live.map((w) => ({
                  value: w.id,
                  label: (
                    <>
                      <Initial
                        name={w.name}
                        color={w.accent}
                        className="size-4 rounded-[5px] text-[9px]"
                      />
                      {w.name}
                    </>
                  ),
                })),
              ]}
            />
          )
        }
      />

      <div
        className="relative mt-6 grid flex-1 px-6"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {STAGES.map((s, i) => {
          const on = i === sel;
          return (
            <button
              key={s.key}
              type="button"
              onMouseEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              onClick={() => setSel(i)}
              aria-pressed={on}
              className="relative flex min-w-0 flex-col border-l border-black/[0.06] pt-1 pl-3 text-left outline-none first:border-l-0 focus-visible:ring-2 focus-visible:ring-ring sm:pl-4"
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-0 rounded-t-2xl bg-linear-to-b from-orange-50 via-orange-50/50 to-orange-50/0 transition-opacity duration-300",
                  on ? "opacity-100" : "opacity-0",
                )}
              />
              <span
                className={cn(
                  "relative truncate text-[13px] transition-colors",
                  on ? "font-medium text-neutral-950" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              <span
                className={cn(
                  "num relative mt-1 text-2xl leading-none font-medium tracking-[-0.03em] transition-colors sm:text-[32px]",
                  on ? "text-neutral-950" : "text-neutral-950/40",
                )}
              >
                {fmt.compact(values[i])}
              </span>
              <span className="h-[200px] sm:h-[220px]" />
            </button>
          );
        })}

        <div className="pointer-events-none absolute inset-x-6 bottom-0 h-[200px] sm:h-[220px]">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="home-grow absolute inset-0 size-full"
            aria-hidden
          >
            <defs>
              <linearGradient id="home-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fdba74" stopOpacity="0.85" />
                <stop offset="1" stopColor="#ffedd5" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id="home-bar-on" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ea580c" />
                <stop offset="1" stopColor="#fb923c" />
              </linearGradient>
              <linearGradient id="home-slope" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fed7aa" stopOpacity="0.6" />
                <stop offset="1" stopColor="#fff7ed" stopOpacity="0.25" />
              </linearGradient>
            </defs>
            {values.map((val, i) => {
              const x = i * colW;
              const w = (colW * BAR) / 100;
              const y = top(val);
              return (
                <g key={STAGES[i].key}>
                  {i < n - 1 && (
                    <polygon
                      points={`${x + w},${y} ${x + colW},${top(values[i + 1])} ${x + colW},100 ${x + w},100`}
                      fill="url(#home-slope)"
                    />
                  )}
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={Math.max(0.8, 100 - y)}
                    fill={i === sel ? "url(#home-bar-on)" : "url(#home-bar)"}
                    className="transition-[fill] duration-300"
                  />
                </g>
              );
            })}
            <line
              x1="0"
              y1="100"
              x2="100"
              y2="100"
              stroke="#000"
              strokeOpacity="0.08"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {p &&
            prior.map((val, i) => (
              <span
                key={STAGES[i].key}
                aria-hidden
                className="absolute h-[5px] w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-900/25 ring-2 ring-white"
                style={{ left: `${barCenter(i)}%`, top: `${top(val)}%` }}
              />
            ))}

          <div
            className={cn(
              "absolute flex -translate-y-[calc(100%+14px)] items-center gap-2 rounded-full bg-white/95 px-3.5 py-1.5 text-[13px] whitespace-nowrap text-neutral-600 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.06] backdrop-blur transition-[left,top] duration-300",
              sel === 0
                ? "translate-x-0"
                : sel === n - 1
                  ? "-translate-x-full"
                  : "-translate-x-1/2",
            )}
            style={{
              left:
                sel === 0
                  ? `${0}%`
                  : sel === n - 1
                    ? `${sel * colW + (colW * BAR) / 100}%`
                    : `${barCenter(sel)}%`,
              top: `${p ? Math.min(top(v), top(prior[sel])) : top(v)}%`,
            }}
          >
            {callout}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-black/[0.06] border-t border-black/[0.06]">
        {(
          [
            [
              "Overall conversion",
              fmt.pct(ratio(t.purchases, t.conversations)),
              ratio(t.purchases, t.conversations),
              p && ratio(p.purchases, p.conversations),
            ],
            [
              "Pick click-through",
              fmt.pct(ratio(t.clicks, t.recsShown)),
              ratio(t.clicks, t.recsShown),
              p && ratio(p.clicks, p.recsShown),
            ],
            [
              "Average order",
              fmt.money(ratio(t.revenue, t.purchases)),
              ratio(t.revenue, t.purchases),
              p && ratio(p.revenue, p.purchases),
            ],
          ] as const
        ).map(([label, value, now, before]) => (
          <div key={label} className="min-w-0 px-6 py-4">
            <dt className="truncate text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className="num text-lg font-semibold tracking-tight text-neutral-950">
                {value}
              </span>
              {before !== null && <DeltaChip now={now} before={before} />}
            </dd>
          </div>
        ))}
      </dl>
    </Tile>
  );
}

/* Revenue ----------------------------------------------------------------------------------- */

const JUICE = [
  "radial-gradient(110% 90% at 0% 0%, #ffe642 0%, rgba(255,230,66,0) 62%)",
  "radial-gradient(95% 85% at 100% 100%, #ff7900 0%, rgba(255,121,0,0) 68%)",
  "radial-gradient(60% 55% at 100% 0%, #ffbf00 0%, rgba(255,191,0,0) 70%)",
  "linear-gradient(160deg, #ffd84d 0%, #ffb21e 55%, #ff8a1c 100%)",
].join(", ");

/** A smooth line through the points (Catmull-Rom as cubic Béziers). */
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] ?? pts[i];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[i + 2] ?? pts[i + 1];
    d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  return d;
}

function RevenueSpark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const pts = values.map(
    (v, i) =>
      [
        (i / Math.max(1, values.length - 1)) * 100,
        92 - ((v - min) / Math.max(1, max - min)) * 80,
      ] as [number, number],
  );
  const line = smooth(pts);
  const last = pts[pts.length - 1];
  return (
    <div className="relative h-full min-h-20 w-full">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="home-juice-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.12" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L100,100 L0,100 Z`} fill="url(#home-juice-fill)" />
        <path
          d={line}
          fill="none"
          stroke="#0a0a0a"
          strokeOpacity="0.8"
          strokeWidth="1.75"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      </svg>
      {last && (
        <span
          aria-hidden
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-950 ring-[3px] ring-white/70"
          style={{ left: `${last[0]}%`, top: `${last[1]}%` }}
        />
      )}
    </div>
  );
}

export function RevenueCard({
  data,
  widgets,
  range,
  delay,
  className,
  children,
}: {
  data: ConciergeRangeData;
  widgets: Widgets;
  range: number;
  delay?: number;
  className?: string;
  /** Replaces the split by widget at the bottom. */
  children?: ReactNode;
}) {
  const t = data.totals.all;
  const p = data.prev?.all;
  const live = widgets.filter((w) => w.status === "live");
  return (
    <section
      className={cn(
        "home-rise relative flex flex-col overflow-hidden rounded-3xl p-6 text-neutral-950 shadow-[0_1px_2px_rgba(120,60,0,0.08),0_18px_40px_-20px_rgba(255,121,0,0.55)]",
        className,
      )}
      style={{ background: JUICE, animationDelay: `${delay ?? 0}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">
            Revenue influenced
          </h3>
          <p className="mt-0.5 text-sm text-black/60">
            Orders that began with a concierge pick
          </p>
        </div>
        <Link
          href="/dashboard/concierge"
          aria-label="Open Concierge"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/45 ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white/70"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      </div>

      <p className="num mt-7 text-5xl leading-none font-medium tracking-[-0.045em] sm:text-[56px]">
        {fmt.money(t.revenue)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-black/65">
        {p ? (
          <>
            <DeltaChip now={t.revenue} before={p.revenue} inverse />
            <span>vs the {range} days before</span>
          </>
        ) : (
          <span>Last {range} days</span>
        )}
      </div>

      <div className="mt-6 flex min-h-20 flex-1 flex-col *:flex-1">
        <RevenueSpark values={data.daily.map((d) => d.revenue)} />
      </div>

      {children ?? (
        <ul className="mt-5 space-y-3 border-t border-black/10 pt-5">
          {live.map((w) => {
            const rev = data.totals[w.id]?.revenue ?? 0;
            const share = ratio(rev, t.revenue);
            return (
              <li key={w.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <Initial name={w.name} color={w.accent} />
                    <span className="truncate">{w.name}</span>
                  </span>
                  <span className="num shrink-0">
                    <b className="font-semibold">{fmt.money(rev)}</b>
                    <span className="ml-1.5 text-black/55">
                      {fmt.pct(share, 0)}
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full bg-neutral-950/80 transition-[width] duration-500"
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* Conversations ----------------------------------------------------------------------------- */

function PickStack({ picks }: { picks: HomeConversation["picks"] }) {
  return (
    <span className="flex shrink-0 -space-x-3">
      {picks.map((p, i) => (
        <span
          key={p.id}
          className="relative size-10 overflow-hidden rounded-xl bg-neutral-100 ring-2 ring-white transition-transform group-hover:translate-x-0.5"
          style={{ zIndex: picks.length - i, transitionDelay: `${i * 40}ms` }}
        >
          <RemoteImage
            src={p.image}
            alt={p.name}
            className="size-full object-cover"
          />
        </span>
      ))}
    </span>
  );
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function RecentConversations({
  recent,
  delay,
  className,
  href,
}: {
  recent: HomeConversation[];
  delay?: number;
  className?: string;
  /** Where "View all" goes; omitted on the home, which spans widgets. */
  href?: string;
}) {
  return (
    <Tile delay={delay} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Latest conversations"
        hint="What shoppers came for, and where it ended"
        actions={
          href && (
            <Link
              href={href}
              className="group inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-950"
            >
              View all
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )
        }
      />
      <ul className="mt-3 flex-1 px-3 pb-3">
        {recent.map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard/concierge/${c.widgetId}/conversations/${c.id}`}
              className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors hover:bg-neutral-50 sm:grid-cols-[auto_minmax(0,1fr)_7.5rem_4.5rem_4rem]"
            >
              <PickStack picks={c.picks} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-950">
                  {sentence(c.intent)}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Initial
                    name={c.widgetName}
                    color={c.accent}
                    className="size-3.5 rounded-[4px] text-[8px]"
                  />
                  {c.widgetName} · Shopper in {c.city}
                </span>
              </span>
              <span className="hidden sm:block">
                <OutcomeBadge outcome={c.outcome} />
              </span>
              <span
                className={cn(
                  "num hidden text-right text-sm sm:block",
                  c.revenue
                    ? "font-semibold text-neutral-950"
                    : "text-muted-foreground",
                )}
              >
                {c.revenue ? fmt.money(c.revenue) : "—"}
              </span>
              <span className="text-right text-xs text-muted-foreground">
                {fmt.ago(c.startedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

/* Top picks --------------------------------------------------------------------------------- */

export function TopPicks({
  picks,
  delay,
  className,
}: {
  picks: HomePick[];
  delay?: number;
  className?: string;
}) {
  return (
    <Tile delay={delay} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Most picked"
        hint="Products the concierge recommends most"
      />
      <div className="grid flex-1 grid-cols-2 content-start gap-x-3 gap-y-4 p-6 pt-4">
        {picks.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/concierge/${p.widgetId}/catalog`}
            className="group min-w-0"
          >
            <span className="relative block aspect-[5/4] overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/[0.04]">
              <RemoteImage
                src={p.image}
                alt={p.name}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-neutral-800 shadow-sm backdrop-blur">
                {p.widgetName}
              </span>
            </span>
            <span className="mt-2 block truncate text-sm font-medium text-neutral-950">
              {p.name}
            </span>
            <span className="num mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">
                {p.picked} picks · {p.carted} carted
              </span>
              <span className="shrink-0 text-neutral-700">
                {fmt.money(p.price)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </Tile>
  );
}
