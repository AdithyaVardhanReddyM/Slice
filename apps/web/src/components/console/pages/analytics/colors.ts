// Chart colours for Pages analytics. Categorical slots are assigned to
// versions by their position in the page's variant order (default first) and
// never re-ordered when a filter hides one, so a version keeps its colour.
// The set was run through the dataviz palette validator (light surface): all
// adjacent pairs pass CVD and normal-vision separation; three slots sit below
// 3:1 contrast, which the comparison table and legends compensate for.

export const VARIANT_COLORS = ["#ea580c", "#2a78d6", "#1baf7a", "#4a3aa7", "#e87ba4", "#eda100"];

export const variantColor = (index: number) => VARIANT_COLORS[index % VARIANT_COLORS.length];

/** Single-hue sequential ramp for the hourly grid: brand orange at rising opacity. */
export const HEAT_STEPS = [0.08, 0.2, 0.34, 0.5, 0.66, 0.82, 1];

export const heatColor = (t: number) => {
  const step = HEAT_STEPS[Math.min(HEAT_STEPS.length - 1, Math.max(0, Math.floor(t * HEAT_STEPS.length)))];
  return `color-mix(in oklch, var(--chart-1) ${Math.round(step * 100)}%, transparent)`;
};
