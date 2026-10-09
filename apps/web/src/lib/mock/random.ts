// Deterministic helpers so server and client render identical mock data.

/** Fixed "now" for the mock world: Fri 9 Oct 2026, 14:20 UTC. */
export const NOW = Date.UTC(2026, 9, 9, 14, 20);

export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) =>
      Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  };
}

export function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable UUID-shaped ID for a name (stands in for a Qloo entity ID). */
export function entityId(name: string): string {
  const hex = [0, 1, 2, 3]
    .map((i) => hash(`${name}:${i}`).toString(16).padStart(8, "0"))
    .join("")
    .toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
