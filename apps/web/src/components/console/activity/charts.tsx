"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { spanMeta } from "@/components/console/primitives";
import type { SpanKind } from "@/lib/mock/types";
import type { HourBucket, LatencyBucket } from "./build";

const hh = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

const KINDS: SpanKind[] = ["qloo", "llm", "catalog", "slice"];

/** Trace kinds keep their categorical span colours. */
const callsConfig = Object.fromEntries(
  KINDS.map((k) => [k, { label: spanMeta[k].label, color: spanMeta[k].color }]),
) satisfies ChartConfig;

const latencyConfig = {
  count: { label: "Qloo calls", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Tooltip row in Inter with tabular figures. */
function TipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      {color && (
        <span
          className="size-2.5 flex-none rounded-sm"
          style={{ background: color }}
        />
      )}
      <span className="text-muted-foreground">{label}</span>
      <span className="num ml-auto pl-4 font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

export function CallsPerHour({ buckets }: { buckets: HourBucket[] }) {
  const data = buckets.map((b) => ({
    start: b.start,
    hour: hh(b.start),
    total: b.total,
    ...b.byKind,
  }));

  return (
    <ChartContainer config={callsConfig} className="aspect-auto h-80 w-full">
      <BarChart data={data} margin={{ left: 0, right: 0, top: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={5}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as
                  (typeof data)[number] | undefined;
                if (!p) return null;
                return (
                  <div className="space-y-1.5">
                    <div>
                      {hh(p.start)}–{hh(p.start + 3_600_000)} UTC
                    </div>
                    <TipRow label="All calls" value={p.total} />
                  </div>
                );
              }}
              formatter={(value, name, item) => (
                <TipRow
                  color={item.color}
                  label={spanMeta[name as SpanKind]?.label ?? name}
                  value={value as number}
                />
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {KINDS.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="calls"
            fill={`var(--color-${k})`}
            radius={i === KINDS.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export function LatencyHistogram({ buckets }: { buckets: LatencyBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0) || 1;

  return (
    <ChartContainer config={latencyConfig} className="aspect-auto h-80 w-full">
      <BarChart data={buckets} margin={{ left: 0, right: 0, top: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const b = payload?.[0]?.payload as LatencyBucket | undefined;
                if (!b) return null;
                return b.to === null
                  ? `${b.from}ms or slower`
                  : `${b.from}–${b.to}ms`;
              }}
              formatter={(_, __, item) => {
                const b = item.payload as LatencyBucket;
                return (
                  <div className="grid w-full gap-1.5">
                    <TipRow
                      color={item.color}
                      label="Qloo calls"
                      value={`${b.count} (${((b.count / total) * 100).toFixed(0)}%)`}
                    />
                    <TipRow label="Cache hits" value={b.hits} />
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
