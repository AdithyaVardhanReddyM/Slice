import { Badge } from "@/components/console/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DemandRow } from "./aggregate";
import { CATALOG, SHOPPER } from "./colors";

// Orange = shopper demand, neutral = catalog supply, everywhere on this table.
const BALANCED_PP = 0.03;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pp = (n: number) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(1)} pp`;

function verdict(gap: number): {
  label: string;
  tone: "warn" | "neutral" | "outline";
} {
  if (gap >= BALANCED_PP) return { label: "Under-stocked", tone: "warn" };
  if (gap <= -BALANCED_PP) return { label: "Over-stocked", tone: "neutral" };
  return { label: "Balanced", tone: "outline" };
}

export function DemandLegend() {
  return (
    <span className="flex items-center gap-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ background: SHOPPER }} />
        Shopper affinity
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ background: CATALOG }} />
        Catalog share
      </span>
    </span>
  );
}

export function DemandSupply({ rows }: { rows: DemandRow[] }) {
  const maxShare = Math.max(...rows.flatMap((r) => [r.demand, r.supply]), 0.01);

  return (
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Style</TableHead>
          <TableHead className="w-1/2">Share</TableHead>
          <TableHead className="text-right">Gap</TableHead>
          <TableHead className="pr-4">Verdict</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const v = verdict(r.gap);
          return (
            <TableRow key={r.id}>
              <TableCell className="py-2.5 pl-4">
                <div className="font-medium">{r.label}</div>
                <div className="num text-xs text-muted-foreground">
                  {r.skus} SKUs
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1.5">
                  <PairBar
                    label="Shopper affinity"
                    value={r.demand}
                    max={maxShare}
                    color={SHOPPER}
                  />
                  <PairBar
                    label="Catalog share"
                    value={r.supply}
                    max={maxShare}
                    color={CATALOG}
                  />
                </div>
              </TableCell>
              <TableCell className="num text-right">{pp(r.gap)}</TableCell>
              <TableCell className="pr-4">
                <Badge tone={v.tone}>{v.label}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PairBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3" title={`${label}: ${pct(value)}`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${(value / max) * 100}%`,
            background: color,
          }}
        />
      </span>
      <span className="num w-12 flex-none text-right text-xs text-muted-foreground">
        {pct(value)}
      </span>
    </div>
  );
}
