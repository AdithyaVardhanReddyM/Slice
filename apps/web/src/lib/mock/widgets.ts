import { NOW, rng } from "./random";
import type { Widget } from "./types";

// Only what the widget sees for itself: page loads of slice.js, the chat in
// its iframe, and cart adds on the store page. Orders and revenue live in the
// merchant's own systems, so the console never claims them.
export interface DailyMetric {
  date: string;
  /** Shoppers who loaded a page with the widget on it. */
  visitors: number;
  conversations: number;
  recsShown: number;
  clicks: number;
  addToCart: number;
  /** Price of the picks shoppers added to their cart. */
  cartValue: number;
}

/** 30 days of daily metrics, oldest first, with a weekend lift and a slow ramp. */
function series(seed: number, base: number, avgItem: number): DailyMetric[] {
  const r = rng(seed);
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date(NOW - (29 - i) * 86_400_000);
    const dow = day.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.32 : dow === 5 ? 1.12 : 1;
    const ramp = 0.62 + (i / 29) * 0.5;
    const conversations = Math.round(
      base * weekend * ramp * (0.86 + r.next() * 0.28),
    );
    const recsShown = Math.round(conversations * (0.78 + r.next() * 0.08));
    const clicks = Math.round(recsShown * (0.36 + r.next() * 0.08));
    const addToCart = Math.round(clicks * (0.31 + r.next() * 0.07));
    return {
      date: day.toISOString().slice(0, 10),
      visitors: Math.round(conversations / (0.034 + r.next() * 0.012)),
      conversations,
      recsShown,
      clicks,
      addToCart,
      cartValue: Math.round(addToCart * avgItem * (0.8 + r.next() * 0.4)),
    };
  });
}

export const metrics: Record<string, DailyMetric[]> = {
  marlow: series(3, 44, 168),
  fold: series(11, 31, 124),
  ostro: [],
};

function stats(id: string): Widget["stats7d"] {
  const m = metrics[id];
  if (!m.length) {
    return {
      conversations: 0,
      conversationsDelta: 0,
      recCtr: 0,
      addToCart: 0,
      cartValue: 0,
    };
  }
  const last = m.slice(-7);
  const prev = m.slice(-14, -7);
  const sum = (xs: DailyMetric[], k: keyof DailyMetric) =>
    xs.reduce((a, x) => a + (x[k] as number), 0);
  const conv = sum(last, "conversations");
  return {
    conversations: conv,
    conversationsDelta: conv / sum(prev, "conversations") - 1,
    recCtr: sum(last, "clicks") / sum(last, "recsShown"),
    addToCart: sum(last, "addToCart"),
    cartValue: sum(last, "cartValue"),
  };
}

const spark = (id: string) =>
  metrics[id].slice(-14).map((d) => d.conversations);

export const widgets: Widget[] = [
  {
    id: "marlow",
    name: "Marlow",
    domain: "marlow.co",
    vertical: "Home & living",
    status: "live",
    storeKey: "marlow",
    createdAt: "2026-09-21T10:12:00Z",
    accent: "#1f3fbf",
    logo: "/widgets/marlow.svg",
    completedSteps: [
      "store",
      "catalog",
      "taste",
      "concierge",
      "appearance",
      "install",
    ],
    catalog: {
      source: "upload",
      sourceLabel: "marlow-catalog.json",
      products: 160,
      lastSyncAt: "2026-10-09T08:02:00Z",
      readiness: 0.97,
    },
    stats7d: stats("marlow"),
    spark: spark("marlow"),
  },
  {
    id: "fold",
    name: "Fold",
    domain: "fold.store",
    vertical: "Fashion & lifestyle",
    status: "live",
    storeKey: "fold",
    createdAt: "2026-10-02T15:40:00Z",
    accent: "#ff2e88",
    logo: "/widgets/fold.svg",
    completedSteps: [
      "store",
      "catalog",
      "taste",
      "concierge",
      "appearance",
      "install",
    ],
    catalog: {
      source: "feed",
      sourceLabel: "Google Merchant feed",
      products: 180,
      lastSyncAt: "2026-10-09T13:45:00Z",
      readiness: 0.91,
    },
    stats7d: stats("fold"),
    spark: spark("fold"),
  },
  {
    id: "ostro",
    name: "Ostro Wine Club",
    domain: "ostro.wine",
    vertical: "Food & drink",
    status: "setup",
    storeKey: null,
    createdAt: "2026-10-09T11:05:00Z",
    accent: "#7a1f3d",
    completedSteps: ["store"],
    catalog: {
      source: null,
      sourceLabel: "Not connected",
      products: 0,
      lastSyncAt: null,
      readiness: 0,
    },
    stats7d: stats("ostro"),
    spark: [],
  },
];

export function getWidget(id: string) {
  return widgets.find((w) => w.id === id);
}
