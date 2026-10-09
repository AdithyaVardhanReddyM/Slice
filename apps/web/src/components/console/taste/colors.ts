// Chart colors for the taste screens. Plain module so server and client
// components can both import it.

/** Shopper demand vs catalog supply: brand orange against the neutral series. */
export const SHOPPER = "var(--chart-1)";
export const CATALOG = "var(--chart-4)";

/** Single-hue sequential scale: the primary orange at increasing opacity. */
export const HEAT_RAMP = [10, 22, 36, 50, 64, 80, 100].map(
  (pct) => `color-mix(in oklch, var(--chart-1) ${pct}%, transparent)`,
);
