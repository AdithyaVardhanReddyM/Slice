import { conversations } from "./conversations";
import { product, productImage } from "./catalog";
import { metrics, widgets, type DailyMetric } from "./widgets";
import type { Outcome } from "./types";

// What the console home shows for Concierge, computed on the server so the
// catalog and conversation mocks stay out of the browser bundle.

export const HOME_RANGES = [7, 14] as const;
export type HomeRange = (typeof HOME_RANGES)[number];

export interface FunnelTotals {
  conversations: number;
  recsShown: number;
  clicks: number;
  addToCart: number;
  purchases: number;
  revenue: number;
}

export interface ConciergeRangeData {
  /** Keyed by widget id, plus "all" for every widget in the range. */
  totals: Record<string, FunnelTotals>;
  /** The same span just before; null when the mock series doesn't reach back that far. */
  prev: Record<string, FunnelTotals> | null;
  /** Every widget in the range summed, oldest first. */
  daily: {
    date: string;
    revenue: number;
    conversations: number;
    addToCart: number;
  }[];
}

export interface HomePick {
  id: string;
  name: string;
  price: number;
  image: string | null;
  widgetId: string;
  widgetName: string;
  picked: number;
  carted: number;
}

export interface HomeConversation {
  id: string;
  widgetId: string;
  widgetName: string;
  accent: string;
  city: string;
  intent: string;
  outcome: Outcome;
  revenue: number;
  startedAt: string;
  picks: { id: string; name: string; image: string | null }[];
}

export interface ConciergeHome {
  widgets: {
    id: string;
    name: string;
    domain: string;
    accent: string;
    status: string;
  }[];
  ranges: Record<HomeRange, ConciergeRangeData>;
  picks: HomePick[];
  recent: HomeConversation[];
}

const KEYS = [
  "conversations",
  "recsShown",
  "clicks",
  "addToCart",
  "purchases",
  "revenue",
] as const;

function sum(days: DailyMetric[]): FunnelTotals {
  const t = {
    conversations: 0,
    recsShown: 0,
    clicks: 0,
    addToCart: 0,
    purchases: 0,
    revenue: 0,
  };
  for (const d of days) for (const k of KEYS) t[k] += d[k];
  return t;
}

/** Funnel totals over the last `span` days for the given widgets (every live one by default). */
export function rangeData(span: number, ids?: string[]): ConciergeRangeData {
  const live =
    ids ?? widgets.filter((w) => w.status === "live").map((w) => w.id);
  const comparable = metrics[live[0]].length >= 2 * span;
  const totals: Record<string, FunnelTotals> = {};
  const prev: Record<string, FunnelTotals> = {};
  for (const id of live) {
    const m = metrics[id];
    totals[id] = sum(m.slice(-span));
    prev[id] = sum(m.slice(-2 * span, -span));
  }
  const merge = (rows: FunnelTotals[]) => {
    const t = sum([]);
    for (const r of rows) for (const k of KEYS) t[k] += r[k];
    return t;
  };
  totals.all = merge(live.map((id) => totals[id]));
  prev.all = merge(live.map((id) => prev[id]));
  const daily = metrics[live[0]].slice(-span).map((d, i) => {
    const day = (k: "revenue" | "conversations" | "addToCart") =>
      live.reduce((s, id) => s + metrics[id].slice(-span)[i][k], 0);
    return {
      date: d.date,
      revenue: day("revenue"),
      conversations: day("conversations"),
      addToCart: day("addToCart"),
    };
  });
  return { totals, prev: comparable ? prev : null, daily };
}

/** The picks a conversation ended on: its last message with recommendations. */
const finalRecs = (c: (typeof conversations)[number]) =>
  [...c.messages].reverse().find((m) => m.recs?.length)?.recs ?? [];

function topPicks(): HomePick[] {
  const byId = new Map<string, HomePick>();
  for (const c of conversations) {
    const widget = widgets.find((w) => w.id === c.widgetId)!;
    for (const rec of finalRecs(c)) {
      const p = product(rec.productId);
      const row = byId.get(p.id) ?? {
        id: p.id,
        name: p.name,
        price: p.price,
        image: productImage(p),
        widgetId: widget.id,
        widgetName: widget.name,
        picked: 0,
        carted: 0,
      };
      row.picked += 1;
      if (rec.addedToCart) row.carted += 1;
      byId.set(p.id, row);
    }
  }
  const ranked = [...byId.values()]
    .filter((p) => p.image)
    .sort((a, b) => b.picked + b.carted * 2 - (a.picked + a.carted * 2));
  // Two from each live store, so the grid shows both catalogs.
  return widgets
    .filter((w) => w.status === "live")
    .flatMap((w) => ranked.filter((p) => p.widgetId === w.id).slice(0, 2));
}

export function recent(widgetId?: string): HomeConversation[] {
  return conversations
    .filter((c) => !widgetId || c.widgetId === widgetId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 6)
    .map((c) => {
      const widget = widgets.find((w) => w.id === c.widgetId)!;
      return {
        id: c.id,
        widgetId: widget.id,
        widgetName: widget.name,
        accent: widget.accent,
        city: c.shopper.city,
        intent: c.intent,
        outcome: c.outcome,
        revenue: c.revenue,
        startedAt: c.startedAt,
        picks: finalRecs(c)
          .slice(0, 3)
          .map((r) => {
            const p = product(r.productId);
            return { id: p.id, name: p.name, image: productImage(p) };
          }),
      };
    });
}

export function conciergeHome(): ConciergeHome {
  return {
    widgets: widgets.map((w) => ({
      id: w.id,
      name: w.name,
      domain: w.domain,
      accent: w.accent,
      status: w.status,
    })),
    ranges: { 7: rangeData(7), 14: rangeData(14) },
    picks: topPicks(),
    recent: recent(),
  };
}
