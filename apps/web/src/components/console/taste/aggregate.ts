import type { Conversation, QlooEntityType } from "@/lib/mock/types";
import type { StyleCoverage } from "@/components/console/catalog/types";

// Server-side aggregation of shopper taste across conversations. Everything
// returned is plain data for the page's client charts.

export const DOMAINS: { type: QlooEntityType; label: string; urn: string }[] = [
  { type: "artist", label: "Artists", urn: "urn:entity:artist" },
  { type: "tv_show", label: "TV", urn: "urn:entity:tv_show" },
  { type: "movie", label: "Film", urn: "urn:entity:movie" },
  { type: "book", label: "Books", urn: "urn:entity:book" },
  { type: "place", label: "Places", urn: "urn:entity:place" },
  { type: "person", label: "People", urn: "urn:entity:person" },
];

const converted = (c: Conversation) =>
  c.outcome === "purchased" || c.outcome === "added_to_cart";

export interface SignalRow {
  name: string;
  count: number;
  share: number;
  source: "quiz" | "chat" | "mixed";
}

export interface DomainSignals {
  type: QlooEntityType;
  label: string;
  urn: string;
  rows: SignalRow[];
}

export function topSignals(convs: Conversation[], take = 5): DomainSignals[] {
  const total = convs.length || 1;
  return DOMAINS.map((d) => {
    const counts = new Map<string, { count: number; sources: Set<string> }>();
    for (const c of convs) {
      for (const e of c.profile.entities) {
        if (e.type !== d.type) continue;
        const cur = counts.get(e.name) ?? {
          count: 0,
          sources: new Set<string>(),
        };
        cur.count += 1;
        cur.sources.add(e.source);
        counts.set(e.name, cur);
      }
    }
    const rows = [...counts.entries()]
      .map(([name, v]) => ({
        name,
        count: v.count,
        share: v.count / total,
        source: (v.sources.size > 1
          ? "mixed"
          : v.sources.has("chat")
            ? "chat"
            : "quiz") as SignalRow["source"],
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, take);
    return { ...d, rows };
  });
}

export interface Cluster {
  label: string;
  count: number;
  share: number;
  conversion: number;
  revenue: number;
  entities: { name: string; type: QlooEntityType }[];
  tags: string[];
  styles: { label: string; score: number }[];
}

export function clusters(convs: Conversation[]): Cluster[] {
  const total = convs.length || 1;
  const groups = new Map<string, Conversation[]>();
  for (const c of convs)
    groups.set(c.persona, [...(groups.get(c.persona) ?? []), c]);
  return [...groups.entries()]
    .map(([label, cs]) => {
      const entityCounts = new Map<
        string,
        { n: number; type: QlooEntityType }
      >();
      const tagWeights = new Map<string, number>();
      const styleScores = new Map<string, { label: string; sum: number }>();
      for (const c of cs) {
        for (const e of c.profile.entities) {
          const cur = entityCounts.get(e.name) ?? { n: 0, type: e.type };
          cur.n += 1;
          entityCounts.set(e.name, cur);
        }
        for (const t of c.profile.tags)
          tagWeights.set(t.name, (tagWeights.get(t.name) ?? 0) + t.weight);
        for (const s of c.profile.styles) {
          const cur = styleScores.get(s.style) ?? { label: s.label, sum: 0 };
          cur.sum += s.score;
          styleScores.set(s.style, cur);
        }
      }
      return {
        label,
        count: cs.length,
        share: cs.length / total,
        conversion: cs.filter(converted).length / cs.length,
        revenue: cs.reduce((s, c) => s + c.revenue, 0),
        entities: [...entityCounts.entries()]
          .sort((a, b) => b[1].n - a[1].n)
          .slice(0, 3)
          .map(([name, v]) => ({ name, type: v.type })),
        tags: [...tagWeights.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name]) => name),
        styles: [...styleScores.values()]
          .map((s) => ({ label: s.label, score: s.sum / cs.length }))
          .sort((a, b) => b.score - a.score),
      };
    })
    .sort((a, b) => b.count - a.count);
}

export interface HeatCell {
  value: number;
  /** Conversations where both the tag and the style appear. */
  together: number;
  /** The tag directly drove this style in the mapping. */
  driver: boolean;
}

export interface Heatmap {
  tags: { name: string; count: number; share: number }[];
  styles: { id: string; label: string; demand: number }[];
  cells: HeatCell[][];
  max: number;
}

/**
 * Tag × style affinity. A cell is the mean of tag weight × style score over the
 * conversations carrying the tag; co-occurrence without a direct mapping
 * counts at 30%.
 */
export function tasteMap(
  convs: Conversation[],
  styles: { id: string; label: string }[],
  rows = 14,
): Heatmap {
  const total = convs.length || 1;
  const tagStats = new Map<string, { count: number; weight: number }>();
  for (const c of convs) {
    for (const t of c.profile.tags) {
      const cur = tagStats.get(t.name) ?? { count: 0, weight: 0 };
      cur.count += 1;
      cur.weight += t.weight;
      tagStats.set(t.name, cur);
    }
  }
  const tags = [...tagStats.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, rows)
    .map(([name, v]) => ({ name, count: v.count, share: v.count / total }));

  const demand = new Map<string, number>();
  for (const c of convs)
    for (const s of c.profile.styles)
      demand.set(s.style, (demand.get(s.style) ?? 0) + s.score);
  const orderedStyles = styles
    .map((s) => ({ ...s, demand: demand.get(s.id) ?? 0 }))
    .sort((a, b) => b.demand - a.demand);

  let max = 0;
  const cells = tags.map((tag) =>
    orderedStyles.map((style) => {
      let sum = 0;
      let together = 0;
      let driver = false;
      for (const c of convs) {
        const t = c.profile.tags.find((x) => x.name === tag.name);
        if (!t) continue;
        const s = c.profile.styles.find((x) => x.style === style.id);
        if (!s) continue;
        const drives = s.from.includes(t.id);
        driver ||= drives;
        together += 1;
        sum += t.weight * s.score * (drives ? 1 : 0.3);
      }
      const value = sum / tag.count;
      max = Math.max(max, value);
      return { value, together, driver };
    }),
  );
  return { tags, styles: orderedStyles, cells, max };
}

export interface DemandRow {
  id: string;
  label: string;
  demand: number;
  supply: number;
  skus: number;
  gap: number;
}

/** Shopper affinity share vs. catalog share per style. Both sum to 100%. */
export function demandVsSupply(
  convs: Conversation[],
  coverage: StyleCoverage[],
): DemandRow[] {
  const sums = new Map<string, number>();
  let all = 0;
  for (const c of convs) {
    for (const s of c.profile.styles) {
      sums.set(s.style, (sums.get(s.style) ?? 0) + s.score);
      all += s.score;
    }
  }
  return coverage
    .map((c) => {
      const demand = all ? (sums.get(c.id) ?? 0) / all : 0;
      return {
        id: c.id,
        label: c.label,
        demand,
        supply: c.share,
        skus: c.count,
        gap: demand - c.share,
      };
    })
    .sort((a, b) => b.gap - a.gap);
}

export interface CityRow {
  city: string;
  region: string;
  count: number;
  share: number;
  conversion: number;
  topCluster: string;
}

export function cities(convs: Conversation[], take = 8): CityRow[] {
  const total = convs.length || 1;
  const groups = new Map<string, Conversation[]>();
  for (const c of convs) {
    const key = `${c.shopper.city}|${c.shopper.region}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.entries()]
    .map(([key, cs]) => {
      const [city, region] = key.split("|");
      const personaCounts = new Map<string, number>();
      for (const c of cs)
        personaCounts.set(c.persona, (personaCounts.get(c.persona) ?? 0) + 1);
      const [topCluster] = [...personaCounts.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0];
      return {
        city,
        region,
        count: cs.length,
        share: cs.length / total,
        conversion: cs.filter(converted).length / cs.length,
        topCluster,
      };
    })
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
    .slice(0, take);
}
