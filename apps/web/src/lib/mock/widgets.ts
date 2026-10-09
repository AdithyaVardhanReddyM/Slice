import { NOW, rng } from "./random";
import type { Widget } from "./types";

export interface DailyMetric {
  date: string;
  conversations: number;
  recsShown: number;
  clicks: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  qlooCalls: number;
  cacheHits: number;
}

/** 30 days of daily metrics, oldest first, with a weekend lift and a slow ramp. */
function series(seed: number, base: number, aov: number): DailyMetric[] {
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
    const purchases = Math.round(addToCart * (0.42 + r.next() * 0.1));
    const qlooCalls = Math.round(conversations * (3.4 + r.next() * 0.8));
    return {
      date: day.toISOString().slice(0, 10),
      conversations,
      recsShown,
      clicks,
      addToCart,
      purchases,
      revenue: Math.round(purchases * aov * (0.8 + r.next() * 0.4)),
      qlooCalls,
      cacheHits: Math.round(
        qlooCalls * (0.58 + (i / 29) * 0.22 + r.next() * 0.05),
      ),
    };
  });
}

export const metrics: Record<string, DailyMetric[]> = {
  marlow: series(3, 44, 214),
  fold: series(11, 31, 142),
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
      influencedRevenue: 0,
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
    influencedRevenue: sum(last, "revenue"),
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
    publicKey: "pk_live_mrl_7Hq2xV9cLw3T",
    accent: "#1f3fbf",
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
    publicKey: "pk_live_fld_Qm4rN8sKe2Ya",
    accent: "#ff2e88",
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
    publicKey: "pk_test_ost_3Lp9aZ6vYt1R",
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

export const workspace = {
  name: "Slice Demo Co.",
  plan: "Growth",
  qlooQuota: { used: 18_420, limit: 50_000 },
};
