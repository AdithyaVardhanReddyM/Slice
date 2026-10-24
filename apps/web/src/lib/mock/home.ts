import { conversations } from "./conversations";
import { product, productImage } from "./catalog";
import { metrics, widgets, type DailyMetric } from "./widgets";
import type { Outcome } from "./types";

// What the console home shows for Concierge, computed on the server so the
// catalog and conversation mocks stay out of the browser bundle.

export const HOME_RANGES = [7, 14] as const;
export type HomeRange = (typeof HOME_RANGES)[number];

export interface FunnelTotals {
  visitors: number;
  conversations: number;
  recsShown: number;
  clicks: number;
  addToCart: number;
  cartValue: number;
}

export interface ConciergeRangeData {
  /** Keyed by widget id, plus "all" for every widget in the range. */
  totals: Record<string, FunnelTotals>;
  /** The same span just before; null when the mock series doesn't reach back that far. */
  prev: Record<string, FunnelTotals> | null;
  /** Every widget in the range summed, oldest first. */
  daily: {
    date: string;
    cartValue: number;
    conversations: number;
    addToCart: number;
  }[];
}

export interface HomeConversation {
  id: string;
  widgetId: string;
  widgetName: string;
  accent: string;
  logo?: string;
  city: string;
  intent: string;
  outcome: Outcome;
  /** Price of the picks the shopper added to their cart. */
  carted: number;
  startedAt: string;
  picks: { id: string; name: string; image: string | null }[];
}

export interface ConciergeHome {
  widgets: {
    id: string;
    name: string;
    domain: string;
    accent: string;
    logo?: string;
    status: string;
  }[];
  ranges: Record<HomeRange, ConciergeRangeData>;
  recent: HomeConversation[];
}

const KEYS = [
  "visitors",
  "conversations",
  "recsShown",
  "clicks",
  "addToCart",
  "cartValue",
] as const;

function sum(days: DailyMetric[]): FunnelTotals {
  const t = {
    visitors: 0,
    conversations: 0,
    recsShown: 0,
    clicks: 0,
    addToCart: 0,
    cartValue: 0,
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
    const day = (k: "cartValue" | "conversations" | "addToCart") =>
      live.reduce((s, id) => s + metrics[id].slice(-span)[i][k], 0);
    return {
      date: d.date,
      cartValue: day("cartValue"),
      conversations: day("conversations"),
      addToCart: day("addToCart"),
    };
  });
  return { totals, prev: comparable ? prev : null, daily };
}

/** The picks a conversation ended on: its last message with recommendations. */
const finalRecs = (c: (typeof conversations)[number]) =>
  [...c.messages].reverse().find((m) => m.recs?.length)?.recs ?? [];

export function recent(widgetId?: string): HomeConversation[] {
  return conversations
    .filter((c) => !widgetId || c.widgetId === widgetId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 6)
    .map((c) => {
      const widget = widgets.find((w) => w.id === c.widgetId)!;
      const carted = c.messages
        .flatMap((m) => m.recs ?? [])
        .filter((r) => r.addedToCart)
        .reduce((s, r) => s + product(r.productId).price, 0);
      return {
        id: c.id,
        widgetId: widget.id,
        widgetName: widget.name,
        accent: widget.accent,
        logo: widget.logo,
        city: c.shopper.city,
        intent: c.intent,
        outcome: c.outcome,
        carted,
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
