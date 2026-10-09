import { TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/console/primitives";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CityRow, Cluster, DomainSignals } from "./aggregate";

const TYPE_LABEL: Record<string, string> = {
  artist: "Artist",
  tv_show: "TV",
  movie: "Film",
  book: "Book",
  place: "Place",
  person: "Person",
  brand: "Brand",
  podcast: "Podcast",
};

/** Ranked entity lists per domain, laid out as a responsive grid. */
export function SignalGrid({ domains }: { domains: DomainSignals[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {domains.map((d) => {
        const max = Math.max(...d.rows.map((r) => r.count), 1);
        return (
          <div key={d.type} className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{d.label}</h3>
            </div>
            {d.rows.length ? (
              <ol className="divide-y">
                {d.rows.map((r, i) => (
                  <li key={r.name} className="flex h-10 items-center gap-3">
                    <span className="num w-4 flex-none text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-sm">{r.name}</span>
                      {r.source !== "quiz" && (
                        <Badge tone="outline" className="flex-none">
                          {r.source === "chat" ? "From chat" : "Quiz and chat"}
                        </Badge>
                      )}
                    </span>
                    <Progress
                      value={(r.count / max) * 100}
                      className="w-14 flex-none"
                      aria-hidden
                    />
                    <span className="num w-6 flex-none text-right text-sm">
                      {r.count}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                No {d.label.toLowerCase()} signals yet
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ClusterTable({
  clusters,
  total,
}: {
  clusters: Cluster[];
  total: number;
}) {
  const bestConv = Math.max(...clusters.map((c) => c.conversion));
  const avgConv =
    clusters.reduce((s, c) => s + c.conversion * c.count, 0) / (total || 1);
  return (
    <Table className="min-w-5xl">
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Cluster</TableHead>
          <TableHead>Share of shoppers</TableHead>
          <TableHead className="text-right">Conversion</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
          <TableHead>Top signals</TableHead>
          <TableHead className="pr-4">Maps to</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clusters.map((c) => {
          const above = c.conversion >= avgConv;
          const Trend = above ? TrendingUp : TrendingDown;
          return (
            <TableRow key={c.label} className="align-top">
              <TableCell className="max-w-56 py-3 pl-4">
                <div className="font-medium">{c.label}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {c.tags.join(", ")}
                </div>
              </TableCell>
              <TableCell className="w-44 py-3">
                <div className="flex items-center gap-2">
                  <Progress
                    value={c.share * 100}
                    className="flex-1"
                    aria-hidden
                  />
                  <span className="num w-10 text-right">
                    {fmt.pct(c.share, 0)}
                  </span>
                </div>
                <div className="num mt-1 text-xs text-muted-foreground">
                  {c.count} conversations
                </div>
              </TableCell>
              <TableCell className="py-3 text-right">
                <div
                  className={cn(
                    "num",
                    c.conversion === bestConv && "font-semibold",
                  )}
                >
                  {fmt.pct(c.conversion, 0)}
                </div>
                <Badge tone={above ? "ok" : "outline"} className="num mt-1">
                  <Trend />
                  {Math.abs((c.conversion - avgConv) * 100).toFixed(0)} pp vs
                  avg
                </Badge>
              </TableCell>
              <TableCell className="py-3 text-right">
                <div className="num">{fmt.money(c.revenue)}</div>
                <div className="num mt-0.5 text-xs text-muted-foreground">
                  {fmt.money(c.revenue / c.count)} per conversation
                </div>
              </TableCell>
              <TableCell className="py-3 whitespace-normal">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {c.entities.map((e) => (
                    <span key={e.name} className="inline-flex gap-1">
                      {e.name}
                      <span className="text-muted-foreground">
                        ({TYPE_LABEL[e.type] ?? e.type})
                      </span>
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell className="py-3 pr-4 whitespace-normal">
                <div className="flex flex-wrap gap-1">
                  {c.styles.map((s, i) => (
                    <Badge key={s.label} tone={i === 0 ? "neutral" : "outline"}>
                      {s.label}
                      <span className="num text-muted-foreground">
                        {s.score.toFixed(2)}
                      </span>
                    </Badge>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function CityTable({ rows }: { rows: CityRow[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">City</TableHead>
          <TableHead className="w-32">Shoppers</TableHead>
          <TableHead className="pr-4 text-right">Conversion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.city}-${r.region}`}>
            <TableCell className="max-w-40 py-2.5 pl-4">
              <div className="truncate">
                {r.city}{" "}
                <span className="text-muted-foreground">{r.region}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {r.topCluster}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Progress
                  value={(r.count / max) * 100}
                  className="flex-1"
                  aria-hidden
                />
                <span className="num w-6 text-right">{r.count}</span>
              </div>
            </TableCell>
            <TableCell className="num pr-4 text-right">
              {fmt.pct(r.conversion, 0)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
