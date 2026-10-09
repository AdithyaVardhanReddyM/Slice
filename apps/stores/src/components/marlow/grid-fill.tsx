import { cn } from "cn";

// In a `rule-grid` the hairlines are the grid's own background showing
// through the gaps, so an unfilled last row renders as a solid grey block.
// This pads the last row with blank cells at each breakpoint's column count.
export function GridFill({
  count,
  cols,
}: {
  count: number;
  cols: { base: number; lg: number };
}) {
  const missing = (n: number) => (n - (count % n)) % n;
  const base = missing(cols.base);
  const lg = missing(cols.lg);
  return Array.from({ length: Math.max(base, lg) }, (_, i) => (
    <li
      key={`fill-${i}`}
      aria-hidden
      className={cn(i < base ? "block" : "hidden", i < lg ? "lg:block" : "lg:hidden")}
    />
  ));
}
