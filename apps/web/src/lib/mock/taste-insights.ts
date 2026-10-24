import type { Product } from "@slice/demo-catalogs";
import { styleCoverage } from "@/components/console/catalog/rows";
import { catalogs, product, productImage, styleLabel } from "./catalog";
import { conversationsFor } from "./conversations";
import { CITY_COORDS } from "./geo";
import { rangeData } from "./home";
import { personas, type Persona } from "./personas";
import type { Conversation, QlooEntityType, Widget } from "./types";

// Taste insights for one widget, computed on the server: who the shoppers are,
// which styles they want against what the store stocks, what to add next and
// which products suit the most of them. Everything comes from the concierge's
// own conversations and the merchant's catalog.

export interface InsightPick {
  id: string;
  name: string;
  image: string | null;
}

export interface InsightGroup {
  label: string;
  summary: string;
  count: number;
  share: number;
  /** Their share of every pick shoppers added to a cart. */
  cartShare: number;
  /** Average price of what they carted (or were shown, when nothing was carted). */
  avgItem: number;
  /** Their strongest styles on the store's own axis. */
  styles: string[];
  into: { name: string; kind: string }[];
  /** What they most often ask the concierge for. */
  comesFor: string[];
  picks: InsightPick[];
}

export interface InsightStyle {
  id: string;
  label: string;
  /** Share of shopper style affinity. */
  demand: number;
  /** Share of the catalog. */
  supply: number;
  products: number;
  verdict: "more" | "balanced" | "less";
}

export type InsightIdea =
  | {
      kind: "request";
      title: string;
      groups: string[];
      perMonth: number;
      quote: string;
      conversationId: string;
    }
  | {
      kind: "style";
      title: string;
      group: string | null;
      /** Chats from that group asking for this kind of product. */
      asks: number;
      /** Products in the store with this style and kind. */
      stock: number;
      demand: number;
      supply: number;
    };

export interface InsightProduct extends InsightPick {
  price: number;
  detail: string;
  /** Share of shoppers whose taste it suits. */
  reach: number;
  groups: string[];
}

export interface InsightPlace {
  city: string;
  region: string;
  lat: number;
  lon: number;
  shoppers: number;
  /** Shoppers in this city per taste group. */
  byGroup: Record<string, number>;
}

export interface TasteInsightsData {
  shoppers: number;
  since: string;
  groups: InsightGroup[];
  styles: InsightStyle[];
  ideas: InsightIdea[];
  products: InsightProduct[];
  /** Every city with shoppers, most shoppers first. */
  places: InsightPlace[];
}

const KIND: Partial<Record<QlooEntityType, string>> = {
  artist: "Music",
  tv_show: "TV",
  movie: "Film",
  book: "Books",
  place: "Travel",
  person: "People",
};

/** A style counts as short or long when its two shares differ by more than this. */
const SLACK = 0.025;
/** How well a product has to fit a group before it counts as suiting them. */
const SUITS = 0.6;

const recsOf = (c: Conversation) => c.messages.flatMap((m) => m.recs ?? []);
const cartedCount = (cs: Conversation[]) =>
  cs.reduce((s, c) => s + recsOf(c).filter((r) => r.addedToCart).length, 0);
const asked = (c: Conversation) => c.traces[0]?.intent.category ?? [];

function top<T>(counts: Map<T, number>, take: number): T[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([k]) => k);
}

function bump<T>(counts: Map<T, number>, key: T, by = 1) {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

const overlaps = (values: string[], against: string[]) =>
  values.filter((v) =>
    against.some((a) => {
      const x = v.toLowerCase();
      const y = a.toLowerCase();
      return x.includes(y) || y.includes(x);
    }),
  ).length;

/** How well a product fits a taste group: style first, then materials and colours. */
function fit(p: Product, persona: Persona) {
  const style = Math.max(
    0,
    ...p.attributes.style.map(
      (s) => persona.styles.find((x) => x.style === s)?.score ?? 0,
    ),
  );
  const traits = [...p.attributes.material, ...p.attributes.colors];
  const detail = traits.length
    ? overlaps(traits, [...persona.materials, ...persona.palette]) /
      traits.length
    : 0;
  return style * 0.75 + detail * 0.25;
}

export function tasteInsights(widget: Widget): TasteInsightsData | null {
  const store = widget.storeKey;
  const convs = conversationsFor(widget.id);
  if (!store || convs.length === 0) return null;
  const catalog = catalogs[store];
  const n = convs.length;
  const monthly = rangeData(30, [widget.id]).totals.all.conversations;

  const allCarted = cartedCount(convs) || 1;
  const byGroup = new Map<string, Conversation[]>();
  for (const c of convs)
    byGroup.set(c.persona, [...(byGroup.get(c.persona) ?? []), c]);
  const personaOf = (label: string) =>
    personas.find((p) => p.store === store && p.label === label);

  /* Groups ----------------------------------------------------------------- */

  const groups: InsightGroup[] = [...byGroup.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, cs]) => {
      const persona = personaOf(label);
      const kinds = new Map<string, number>();
      const picks = new Map<string, number>();
      const cartedPrices: number[] = [];
      const shownPrices: number[] = [];
      for (const c of cs) {
        if (c.outcome !== "no_match")
          for (const k of asked(c)) bump(kinds, k);
        for (const r of recsOf(c)) {
          const price = product(r.productId).price;
          shownPrices.push(price);
          bump(picks, r.productId, r.addedToCart ? 3 : 1);
          if (r.addedToCart) cartedPrices.push(price);
        }
      }
      const prices = cartedPrices.length ? cartedPrices : shownPrices;
      return {
        label,
        summary: persona?.summary ?? "",
        count: cs.length,
        share: cs.length / n,
        cartShare: cartedCount(cs) / allCarted,
        avgItem: prices.reduce((s, x) => s + x, 0) / (prices.length || 1),
        styles: (persona?.styles ?? [])
          .filter((s) => s.score >= 0.5)
          .slice(0, 2)
          .map((s) => styleLabel(store, s.style)),
        into: (persona?.entities ?? []).slice(0, 3).map((e) => ({
          name: e.name,
          kind: KIND[e.type] ?? "",
        })),
        comesFor: top(kinds, 2),
        picks: top(picks, 3).map((id) => {
          const p = product(id);
          return { id, name: p.name, image: productImage(p) };
        }),
      };
    });

  /* Styles: shopper demand against catalog share --------------------------- */

  const demandBy = new Map<string, number>();
  let demandAll = 0;
  for (const c of convs)
    for (const s of c.profile.styles) {
      bump(demandBy, s.style, s.score);
      demandAll += s.score;
    }
  const styles: InsightStyle[] = styleCoverage(catalog)
    .map((c) => {
      const demand = demandAll ? (demandBy.get(c.id) ?? 0) / demandAll : 0;
      const gap = demand - c.share;
      return {
        id: c.id,
        label: c.label,
        demand,
        supply: c.share,
        products: c.count,
        verdict: (gap > SLACK
          ? "more"
          : gap < -SLACK
            ? "less"
            : "balanced") as InsightStyle["verdict"],
      };
    })
    .sort((a, b) => b.demand - a.demand);

  /* What to add next ------------------------------------------------------- */

  const requests = new Map<string, Conversation[]>();
  for (const c of convs)
    if (c.gap) requests.set(c.gap, [...(requests.get(c.gap) ?? []), c]);
  const requestIdeas: InsightIdea[] = [...requests.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([gap, cs]) => ({
      kind: "request",
      title: gap,
      groups: top(
        cs.reduce((m, c) => (bump(m, c.persona), m), new Map<string, number>()),
        2,
      ),
      perMonth: Math.max(1, Math.round((cs.length / n) * monthly)),
      quote: cs[0].messages.find((m) => m.role === "shopper")?.text ?? "",
      conversationId: cs[0].id,
    }));

  const styleIdeas: InsightIdea[] = styles
    .filter((s) => s.verdict === "more")
    .sort((a, b) => b.demand - b.supply - (a.demand - a.supply))
    .slice(0, 3)
    .map((s) => {
      // The shoppers who lean on this style, and what they ask for.
      const fans = convs.filter(
        (c) =>
          c.outcome !== "no_match" &&
          c.profile.styles.some((x) => x.style === s.id && x.score >= SUITS),
      );
      const kinds = new Map<string, number>();
      for (const c of fans) for (const k of asked(c)) bump(kinds, k);
      const inStyle = catalog.products.filter((p) =>
        p.attributes.style.includes(s.id),
      );
      const best = [...kinds.entries()]
        .map(([kind, asks]) => ({
          kind,
          asks,
          stock: inStyle.filter((p) => p.subcategory === kind).length,
        }))
        .sort((a, b) => b.asks / (1 + b.stock) - a.asks / (1 + a.stock))[0];
      const group = top(
        fans.reduce(
          (m, c) => (bump(m, c.persona), m),
          new Map<string, number>(),
        ),
        1,
      )[0];
      return {
        kind: "style",
        title: best
          ? `More ${s.label} ${best.kind.toLowerCase()}`
          : `More ${s.label} pieces`,
        group: group ?? null,
        asks: best?.asks ?? 0,
        stock: best?.stock ?? s.products,
        demand: s.demand,
        supply: s.supply,
      };
    });

  /* Products that suit the most shoppers ----------------------------------- */

  const weights = [...byGroup.entries()]
    .map(([label, cs]) => ({ persona: personaOf(label), share: cs.length / n }))
    .filter((g): g is { persona: Persona; share: number } => !!g.persona);
  const perKind = new Map<string, number>();
  const products: InsightProduct[] = catalog.products
    .filter((p) => p.images.length)
    .map((p) => {
      const fits = weights.map((g) => ({ ...g, fit: fit(p, g.persona) }));
      const suited = fits
        .filter((f) => f.fit >= SUITS)
        .sort((a, b) => b.share - a.share);
      return {
        p,
        reach: suited.reduce((s, f) => s + f.share, 0),
        mean: fits.reduce((s, f) => s + f.fit * f.share, 0),
        groups: suited.map((f) => f.persona.label),
      };
    })
    .filter((x) => x.reach > 0)
    .sort((a, b) => b.reach - a.reach || b.mean - a.mean)
    .filter((x) => {
      // At most two of a kind, so the row shows range.
      const seen = perKind.get(x.p.subcategory) ?? 0;
      perKind.set(x.p.subcategory, seen + 1);
      return seen < 2;
    })
    .slice(0, 6)
    .map(({ p, reach, groups }) => ({
      id: p.id,
      name: p.name,
      image: productImage(p),
      price: p.price,
      detail: p.subcategory,
      reach,
      groups,
    }));

  /* Where they are ------------------------------------------------------- */

  const byCity = new Map<string, Conversation[]>();
  for (const c of convs) {
    const key = `${c.shopper.city}, ${c.shopper.region}`;
    byCity.set(key, [...(byCity.get(key) ?? []), c]);
  }
  const places: InsightPlace[] = [...byCity.entries()]
    .filter(([key]) => CITY_COORDS[key])
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, cs]) => {
      const [lat, lon] = CITY_COORDS[key];
      return {
        city: cs[0].shopper.city,
        region: cs[0].shopper.region,
        lat,
        lon,
        shoppers: cs.length,
        byGroup: Object.fromEntries(
          cs.reduce((m, c) => (bump(m, c.persona), m), new Map<string, number>()),
        ),
      };
    });

  return {
    shoppers: n,
    since: convs.reduce(
      (min, c) => (c.startedAt < min ? c.startedAt : min),
      convs[0].startedAt,
    ),
    groups,
    styles,
    // Unmet requests first: they're the clearest gaps.
    ideas: [...requestIdeas, ...styleIdeas].slice(0, 4),
    products,
    places,
  };
}
