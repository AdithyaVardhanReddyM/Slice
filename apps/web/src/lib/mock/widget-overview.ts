import { product, productImage, styleLabel } from "./catalog";
import { conversationsFor } from "./conversations";
import {
  rangeData,
  recent,
  type ConciergeRangeData,
  type HomeConversation,
} from "./home";
import { personas } from "./personas";
import type { Widget } from "./types";

// A widget's Overview, computed on the server so the catalog and conversation
// mocks stay out of the browser bundle.

export const OVERVIEW_RANGES = [7, 14, 30] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

export interface OverviewProduct {
  id: string;
  name: string;
  detail: string;
  price: number;
  image: string | null;
  shown: number;
  clicked: number;
  carted: number;
  matchedOn: string | null;
}

export interface OverviewGroup {
  label: string;
  summary: string;
  share: number;
  /** Their strongest style on the store's own axis. */
  style: string | null;
}

export interface OverviewGap {
  gap: string;
  quote: string;
  conversationId: string;
  /** Requests a month at the widget's current volume. */
  perMonth: number;
}

export interface WidgetOverviewData {
  widget: Pick<
    Widget,
    "id" | "name" | "domain" | "accent" | "logo" | "status" | "vertical"
  >;
  ranges: Record<OverviewRange, ConciergeRangeData>;
  sample: number;
  products: OverviewProduct[];
  groups: OverviewGroup[];
  gaps: OverviewGap[];
  /** Share of conversations where nothing in the catalog fit. */
  noMatch: number;
  recent: HomeConversation[];
  /** The clock "ago" is measured from; the sample world's unless set. */
  now?: number;
}

export function widgetOverview(widget: Widget): WidgetOverviewData {
  const store = widget.storeKey!;
  const convs = conversationsFor(widget.id);
  const n = convs.length;
  const ranges = Object.fromEntries(
    OVERVIEW_RANGES.map((r) => [r, rangeData(r, [widget.id])]),
  ) as Record<OverviewRange, ConciergeRangeData>;
  const monthly = ranges[30].totals.all.conversations;

  const byGroup = new Map<string, number>();
  for (const c of convs)
    byGroup.set(c.persona, (byGroup.get(c.persona) ?? 0) + 1);
  const groups = [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => {
      const persona = personas.find(
        (p) => p.store === store && p.label === label,
      );
      const top = persona?.styles[0]?.style;
      return {
        label,
        summary: persona?.summary ?? "",
        share: count / n,
        style: top ? styleLabel(store, top) : null,
      };
    });

  const stats = new Map<
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
        const cur = stats.get(r.productId) ?? {
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
        stats.set(r.productId, cur);
      }
    }
  }
  const products = [...stats.entries()]
    .sort((a, b) => b[1].carted - a[1].carted || b[1].shown - a[1].shown)
    .slice(0, 5)
    .map(([id, s]) => {
      const p = product(id);
      const driver = [...s.drivers.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0];
      return {
        id,
        name: p.name,
        detail: p.subcategory,
        price: p.price,
        image: productImage(p),
        shown: s.shown,
        clicked: s.clicked,
        carted: s.carted,
        matchedOn: driver ? styleLabel(store, driver) : null,
      };
    });

  const byGap = new Map<string, OverviewGap & { count: number }>();
  for (const c of convs) {
    if (!c.gap) continue;
    const cur = byGap.get(c.gap) ?? {
      gap: c.gap,
      quote: c.messages.find((m) => m.role === "shopper")!.text,
      conversationId: c.id,
      perMonth: 0,
      count: 0,
    };
    cur.count++;
    byGap.set(c.gap, cur);
  }
  const gaps = [...byGap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(({ count, ...g }) => ({
      ...g,
      perMonth: Math.round((count / n) * monthly),
    }));

  return {
    widget: {
      id: widget.id,
      name: widget.name,
      domain: widget.domain,
      accent: widget.accent,
      logo: widget.logo,
      status: widget.status,
      vertical: widget.vertical,
    },
    ranges,
    sample: n,
    products,
    groups,
    gaps,
    noMatch: convs.filter((c) => c.outcome === "no_match").length / n,
    recent: recent(widget.id),
  };
}
