"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  CacheBadge,
  SpanChip,
  spanMeta,
} from "@/components/console/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt } from "@/lib/format";
import { NOW } from "@/lib/mock/random";
import type { SpanKind } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import type { LogRow } from "./build";

const PAGE_SIZE = 50;
const KINDS: SpanKind[] = ["qloo", "llm", "catalog", "slice"];
const TODAY = new Date(NOW).toISOString().slice(0, 10);

const CACHE_ITEMS: Record<string, string> = {
  all: "Any cache",
  hit: "Hit",
  miss: "Miss",
  stale: "Stale",
};

function Time({ t }: { t: number }) {
  const iso = new Date(t).toISOString();
  const day = iso.slice(0, 10);
  return (
    <span className="num whitespace-nowrap">
      {day !== TODAY && (
        <span className="mr-1.5 text-muted-foreground">{fmt.date(iso)}</span>
      )}
      {iso.slice(11, 19)}
      <span className="text-muted-foreground">.{iso.slice(20, 23)}</span>
    </span>
  );
}

export function SignalLog({
  rows,
  widgetId,
}: {
  rows: LogRow[];
  widgetId: string;
}) {
  const [kind, setKind] = useState<SpanKind | "all">("all");
  const [cache, setCache] = useState("all");
  const [endpoint, setEndpoint] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const endpoints = [
    ...new Set(
      rows
        .filter((r) => kind === "all" || r.kind === kind)
        .map((r) => r.endpoint),
    ),
  ].sort();
  const endpointItems: Record<string, string> = {
    all: "All endpoints",
    ...Object.fromEntries(endpoints.map((e) => [e, e])),
  };
  const counts = Object.fromEntries(
    KINDS.map((k) => [k, rows.filter((r) => r.kind === k).length]),
  );
  const maxMs = Math.max(...rows.map((r) => r.ms), 1);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (cache === "all" || r.cache === cache) &&
      (endpoint === "all" || r.endpoint === endpoint) &&
      (!q ||
        r.name.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.result.toLowerCase().includes(q) ||
        r.conversationId.includes(q) ||
        r.endpoint.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(
    current * PAGE_SIZE,
    (current + 1) * PAGE_SIZE,
  );

  const set = (fn: () => void) => {
    fn();
    setPage(0);
  };

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <Tabs
          value={kind}
          onValueChange={(v) =>
            set(() => {
              const next = v as SpanKind | "all";
              setKind(next);
              setEndpoint("all");
              if (next !== "qloo" && next !== "all") setCache("all");
            })
          }
        >
          <TabsList>
            <TabsTrigger value="all">
              All
              <Badge variant="secondary" className="num">
                {rows.length}
              </Badge>
            </TabsTrigger>
            {KINDS.map((k) => (
              <TabsTrigger key={k} value={k}>
                <span
                  className="size-2 rounded-sm"
                  style={{ background: spanMeta[k].color }}
                />
                {spanMeta[k].label}
                <Badge variant="secondary" className="num">
                  {counts[k]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select
          items={CACHE_ITEMS}
          value={cache}
          onValueChange={(v) => v && set(() => setCache(v))}
          disabled={kind !== "all" && kind !== "qloo"}
        >
          <SelectTrigger aria-label="Cache status" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CACHE_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={endpointItems}
          value={endpoint}
          onValueChange={(v) => v && set(() => setEndpoint(v))}
        >
          <SelectTrigger aria-label="Endpoint" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(endpointItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="relative w-full sm:ml-auto sm:w-72">
          <span className="sr-only">Search the log</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => set(() => setQuery(e.target.value))}
            placeholder="Search params, results, conversation ID"
            className="pl-8"
          />
        </label>
      </div>

      <Table className="min-w-6xl table-fixed">
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-32 pl-4">Time (UTC)</TableHead>
            <TableHead className="w-24">Kind</TableHead>
            <TableHead className="w-52">Operation</TableHead>
            <TableHead className="w-40">Endpoint</TableHead>
            <TableHead>Params</TableHead>
            <TableHead className="w-20">Cache</TableHead>
            <TableHead className="w-32 text-right">Latency</TableHead>
            <TableHead>Result</TableHead>
            <TableHead className="w-28 pr-4">Conversation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => {
            const open = expanded === r.id;
            return (
              <Fragment key={r.id}>
                <TableRow
                  onClick={() => setExpanded(open ? null : r.id)}
                  aria-expanded={open}
                  className={cn("cursor-pointer", open && "border-b-0")}
                >
                  <TableCell className="pl-4">
                    <Time t={r.t} />
                  </TableCell>
                  <TableCell>
                    <SpanChip kind={r.kind} />
                  </TableCell>
                  <TableCell className="truncate font-medium">
                    {r.name}
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    {r.endpoint}
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    {r.summary || "—"}
                  </TableCell>
                  <TableCell>
                    {r.cache ? (
                      <CacheBadge cache={r.cache} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            r.ms >= 1000
                              ? "bg-foreground/70"
                              : "bg-muted-foreground/40",
                          )}
                          style={{
                            width: `${Math.max(3, (r.ms / maxMs) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="num w-12 text-right">
                        {fmt.ms(r.ms)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="truncate">{r.result}</TableCell>
                  <TableCell className="pr-4">
                    <Link
                      href={`/dashboard/${widgetId}/conversations/${r.conversationId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      {r.conversationId}
                    </Link>
                  </TableCell>
                </TableRow>
                {open && (
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={9} className="px-4 pt-1 pb-4">
                      <Expanded row={r} widgetId={widgetId} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {visible.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={9} className="h-32 text-center">
                <div className="font-medium">No calls match these filters</div>
                <div className="mt-1 text-muted-foreground">
                  {cache === "stale"
                    ? "Nothing was served stale: Qloo answered every request in this window."
                    : "Widen the filters or clear the search."}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <span className="num text-sm text-muted-foreground">
          {filtered.length
            ? `${fmt.int(current * PAGE_SIZE + 1)}–${fmt.int(Math.min(filtered.length, (current + 1) * PAGE_SIZE))} of ${fmt.int(filtered.length)} calls`
            : "0 calls"}
        </span>
        <div className="flex items-center gap-2">
          <span className="num text-sm text-muted-foreground">
            Page {current + 1} of {pages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Newer"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Older"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Expanded({ row, widgetId }: { row: LogRow; widgetId: string }) {
  const iso = new Date(row.t).toISOString();
  return (
    <div className="grid gap-4 whitespace-normal lg:grid-cols-5">
      <div className="min-w-0 lg:col-span-3">
        <div className="mb-2 text-sm font-medium">
          {row.kind === "qloo" ? "Request" : "Params"}
        </div>
        <div className="space-y-1.5 overflow-x-auto rounded-lg border bg-background p-3 text-sm">
          {row.kind === "qloo" && (
            <div className="break-all">
              <span className="font-medium">{row.endpoint.split(" ")[0]}</span>{" "}
              https://hackathon.api.qloo.com{row.endpoint.split(" ")[1]}
            </div>
          )}
          {row.params.length ? (
            row.params.map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-3">
                <span className="break-all text-muted-foreground">{k}</span>
                <span className="col-span-2 break-all whitespace-pre-wrap">
                  {v.includes(",") ? v.split(",").join(",\n") : v}
                </span>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground">
              No parameters. Internal step.
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 lg:col-span-2">
        <div className="mb-2 text-sm font-medium">Span</div>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-1.5 rounded-lg border bg-background p-3 text-sm">
          <dt className="text-muted-foreground">Result</dt>
          <dd className="col-span-2">{row.result}</dd>
          <dt className="text-muted-foreground">Started</dt>
          <dd className="num col-span-2">{iso}</dd>
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="num col-span-2">
            {row.ms}ms
            {row.cache && (
              <span className="text-muted-foreground">
                {" "}
                · cache {row.cache}
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">Span and trace</dt>
          <dd className="col-span-2 truncate">
            {row.id} · {row.traceId}
          </dd>
          <dt className="text-muted-foreground">Conversation</dt>
          <dd className="col-span-2">
            <Link
              href={`/dashboard/${widgetId}/conversations/${row.conversationId}`}
              className="inline-flex items-center gap-1 font-medium hover:underline"
            >
              Open {row.conversationId}
              <ArrowUpRight className="size-4" />
            </Link>
          </dd>
        </dl>
      </div>
    </div>
  );
}
