// Pure helpers for the CSV audience path: guessing which columns carry taste,
// splitting multi-value cells, deterministic k-means with a silhouette pick of
// k, and the lift that names a cluster's defining entities. No Convex imports:
// the console imports `suggestMapping` and `splitTerms` directly.

export interface CsvMapping {
  taste: string[];
  city?: string;
  country?: string;
  age?: string;
  gender?: string;
  id?: string;
  name?: string;
}

const TASTE_RE =
  /artist|band|music|film|movie|show|brand|place|restaurant|interest|like|favou?rite|podcast|book|dining|experience|hobby|genre/i;

/** Guess the mapping from column names alone. */
export function suggestMapping(columns: string[]): CsvMapping {
  const pick = (re: RegExp) => columns.find((c) => re.test(c.trim()));
  const city = pick(/^(home_?)?(city|town)$/i) ?? pick(/city/i);
  const country = pick(/country/i);
  const age = pick(/^age(_?(bucket|group|range))?$/i) ?? pick(/\bage\b/i);
  const gender = pick(/gender|sex/i);
  const id = pick(/^(id|customer_?id|guest_?id|member_?id|email)$/i) ?? pick(/\bid$/i);
  const name = pick(/^(first_?name|name|full_?name)$/i) ?? pick(/name/i);
  const reserved = new Set([city, country, age, gender, id, name].filter(Boolean));
  const taste = columns.filter((c) => !reserved.has(c) && TASTE_RE.test(c));
  return { taste, city, country, age, gender, id, name };
}

/** "Bon Iver; Aesop | Wes Anderson" → ["Bon Iver", "Aesop", "Wes Anderson"]. */
export function splitTerms(value: string | undefined | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[;,|\n]/)) {
    const term = raw.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
    if (term.length < 2) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

/** Qloo's demographic buckets, so CSV ages line up with `signal.demographics.age`. */
export const AGE_BUCKETS = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;

export function ageBucket(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase().replace(/\s+/g, "_");
  if ((AGE_BUCKETS as readonly string[]).includes(v)) return v;
  const m = v.match(/\d+/);
  if (!m) return undefined;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 24) return "24_and_younger";
  if (n <= 29) return "25_to_29";
  if (n <= 34) return "30_to_34";
  if (n <= 44) return "35_to_44";
  if (n <= 54) return "45_to_54";
  return "55_and_older";
}

export function normalizeGender(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (/^(m|male|man)$/.test(v)) return "male";
  if (/^(f|female|woman)$/.test(v)) return "female";
  return undefined;
}

/* k-means ----------------------------------------------------------------- */

/** mulberry32: small, seedable, good enough for initialisation. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ClusterRow {
  /** Feature id → weight (entity ids at 1, "city:x" at 0.5, "age:x" at 0.5). */
  features: Record<string, number>;
}

export interface KMeansResult {
  k: number;
  /** Cluster index per row (0..k-1). */
  assignments: number[];
  sizes: number[];
  silhouette: number;
  inertia: number;
}

/** Build dense vectors over the union of feature ids. */
export function vectorize(rows: ClusterRow[]): { dims: string[]; vectors: Float64Array[] } {
  const index = new Map<string, number>();
  for (const r of rows) for (const f of Object.keys(r.features)) if (!index.has(f)) index.set(f, index.size);
  const dims = [...index.keys()];
  // Unit length per row (spherical k-means): a member with eight resolved
  // names and one with three then count the same, so k-means separates groups
  // by what they like rather than splitting whichever group has the richest
  // vocabulary.
  const vectors = rows.map((r) => {
    const vec = new Float64Array(dims.length);
    for (const [f, w] of Object.entries(r.features)) vec[index.get(f)!] = w;
    let norm = 0;
    for (const x of vec) norm += x * x;
    if (norm > 0) {
      norm = Math.sqrt(norm);
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }
    return vec;
  });
  return { dims, vectors };
}

const dist2 = (a: Float64Array, b: Float64Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
};

function kmeansOnce(vectors: Float64Array[], k: number, random: () => number, iterations = 25) {
  const n = vectors.length;
  const d = vectors[0]?.length ?? 0;
  // k-means++ seeding.
  const centroids: Float64Array[] = [Float64Array.from(vectors[Math.floor(random() * n)])];
  const minD = new Float64Array(n).fill(Infinity);
  while (centroids.length < k) {
    let total = 0;
    const last = centroids[centroids.length - 1];
    for (let i = 0; i < n; i++) {
      minD[i] = Math.min(minD[i], dist2(vectors[i], last));
      total += minD[i];
    }
    if (total === 0) {
      centroids.push(Float64Array.from(vectors[Math.floor(random() * n)]));
      continue;
    }
    let r = random() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= minD[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push(Float64Array.from(vectors[pick]));
  }
  const assignments = new Array<number>(n).fill(-1);
  for (let iter = 0; iter < iterations; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = dist2(vectors[i], centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed++;
      }
    }
    const sums = centroids.map(() => new Float64Array(d));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      const v = vectors[i];
      const s = sums[c];
      for (let j = 0; j < d; j++) s[j] += v[j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let j = 0; j < d; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
    if (changed === 0) break;
  }
  let inertia = 0;
  for (let i = 0; i < n; i++) inertia += dist2(vectors[i], centroids[assignments[i]]);
  return { assignments, centroids, inertia };
}

/** Mean silhouette over a precomputed distance matrix (n ≤ ~600). */
function silhouette(dist: Float64Array, n: number, assignments: number[], k: number): number {
  if (k < 2) return -1;
  const sizes = new Array<number>(k).fill(0);
  for (const a of assignments) sizes[a]++;
  let total = 0;
  let counted = 0;
  const sums = new Float64Array(k);
  for (let i = 0; i < n; i++) {
    const own = assignments[i];
    if (sizes[own] <= 1) continue;
    sums.fill(0);
    for (let j = 0; j < n; j++) if (j !== i) sums[assignments[j]] += dist[i * n + j];
    const a = sums[own] / (sizes[own] - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === own || sizes[c] === 0) continue;
      b = Math.min(b, sums[c] / sizes[c]);
    }
    if (!Number.isFinite(b)) continue;
    total += (b - a) / Math.max(a, b, 1e-9);
    counted++;
  }
  return counted ? total / counted : -1;
}

/**
 * Deterministic k-means. `k` fixed, or chosen by silhouette over 2..4.
 * Clusters under `minShare` of the rows are merged into the nearest centroid.
 * Rows with no features (nothing resolved) join the largest cluster.
 */
export function kmeans(
  rows: ClusterRow[],
  options: { k?: number; seed?: number; minShare?: number; kRange?: [number, number] } = {},
): KMeansResult {
  const { seed = 7, minShare = 0.05, kRange = [2, 4] } = options;
  const n = rows.length;
  if (n === 0) return { k: 0, assignments: [], sizes: [], silhouette: -1, inertia: 0 };
  const { vectors } = vectorize(rows);
  const live = vectors.map((v, i) => (v.some((x) => x !== 0) ? i : -1)).filter((i) => i >= 0);
  const lv = live.map((i) => vectors[i]);
  const m = lv.length;
  if (m < 4) {
    return { k: 1, assignments: new Array(n).fill(0), sizes: [n], silhouette: -1, inertia: 0 };
  }
  // Pairwise distances once; reused by every silhouette.
  const dist = new Float64Array(m * m);
  for (let i = 0; i < m; i++)
    for (let j = i + 1; j < m; j++) {
      const d = Math.sqrt(dist2(lv[i], lv[j]));
      dist[i * m + j] = d;
      dist[j * m + i] = d;
    }
  const candidates = options.k ? [Math.max(1, Math.min(options.k, m))] : [];
  if (!candidates.length) for (let k = kRange[0]; k <= Math.min(kRange[1], m - 1); k++) candidates.push(k);

  let best: { k: number; assignments: number[]; inertia: number; sil: number } | null = null;
  for (const k of candidates) {
    let run: ReturnType<typeof kmeansOnce> | null = null;
    for (let restart = 0; restart < 3; restart++) {
      const r = kmeansOnce(lv, k, rng(seed * 1000 + k * 10 + restart));
      if (!run || r.inertia < run.inertia) run = r;
    }
    const sil = silhouette(dist, m, run!.assignments, k);
    if (!best || sil > best.sil) best = { k, assignments: run!.assignments, inertia: run!.inertia, sil };
  }
  let assignments = best!.assignments;
  let k = best!.k;

  // Merge clusters below the minimum share into the nearest remaining centroid.
  const minSize = Math.max(2, Math.ceil(minShare * m));
  for (;;) {
    const sizes = new Array<number>(k).fill(0);
    for (const a of assignments) sizes[a]++;
    const small = sizes.findIndex((s) => s < minSize);
    if (small === -1 || k <= 1) break;
    const d = lv[0].length;
    const centroids = Array.from({ length: k }, () => new Float64Array(d));
    for (let i = 0; i < m; i++) for (let j = 0; j < d; j++) centroids[assignments[i]][j] += lv[i][j] / sizes[assignments[i]];
    for (let i = 0; i < m; i++) {
      if (assignments[i] !== small) continue;
      let bestC = -1;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        if (c === small) continue;
        const dd = dist2(lv[i], centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          bestC = c;
        }
      }
      assignments[i] = bestC;
    }
    assignments = assignments.map((a) => (a > small ? a - 1 : a));
    k--;
  }
  // Renumber by size (largest first) so "Cluster 1" is the biggest.
  const sizes = new Array<number>(k).fill(0);
  for (const a of assignments) sizes[a]++;
  const order = sizes.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const remap = new Map(order.map((old, idx) => [old, idx]));
  assignments = assignments.map((a) => remap.get(a)!);

  const full = new Array<number>(n).fill(0);
  live.forEach((rowIndex, i) => (full[rowIndex] = assignments[i]));
  const finalSizes = new Array<number>(k).fill(0);
  for (const a of full) finalSizes[a]++;
  return {
    k,
    assignments: full,
    sizes: finalSizes,
    silhouette: k >= 2 ? silhouette(dist, m, assignments, k) : -1,
    inertia: best!.inertia,
  };
}

/**
 * Entities over-represented in a cluster: (share in cluster) / (share overall).
 * `inCluster` and `overall` are entity id → member count. Returns ids sorted by lift.
 */
export function lift(
  inCluster: Record<string, number>,
  clusterSize: number,
  overall: Record<string, number>,
  total: number,
  options: { take?: number; minSupport?: number } = {},
): { id: string; lift: number; count: number }[] {
  const { take = 6, minSupport = 2 } = options;
  const out: { id: string; lift: number; count: number }[] = [];
  for (const [id, count] of Object.entries(inCluster)) {
    if (count < minSupport || clusterSize === 0) continue;
    const base = (overall[id] ?? count) / Math.max(1, total);
    out.push({ id, lift: count / clusterSize / Math.max(base, 1e-9), count });
  }
  return out.sort((a, b) => b.lift - a.lift || b.count - a.count).slice(0, take);
}
