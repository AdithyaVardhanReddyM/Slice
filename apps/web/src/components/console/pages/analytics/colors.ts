// Colours for Pages analytics. A page is one version, so the charts carry a
// single series in brand orange; magnitude uses one sequential ramp.

/** Weekday × hour grid: brand orange at rising opacity, empty cells stay muted. */
const GRID_STEPS = [0.14, 0.28, 0.44, 0.6, 0.78, 1];

export const gridColor = (t: number) => {
  const step = GRID_STEPS[Math.min(GRID_STEPS.length - 1, Math.max(0, Math.floor(t * GRID_STEPS.length)))];
  return `color-mix(in oklch, var(--chart-1) ${Math.round(step * 100)}%, var(--muted))`;
};

/** Click density, light to dark (amber → brand orange → deep red), drawn over a dimmed page. */
export const HEAT_STOPS: [number, string][] = [
  [0, "rgba(255, 214, 102, 0)"],
  [0.18, "#ffd666"],
  [0.45, "#fb923c"],
  [0.72, "#ea580c"],
  [1, "#b42318"],
];

export const heatLegend = `linear-gradient(90deg, ${HEAT_STOPS.slice(1)
  .map(([, c]) => c)
  .join(", ")})`;
