"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { fmt } from "@/lib/format";

export interface TrendPoint {
  date: string;
  conversations: number;
  addToCart: number;
}

const trendConfig = {
  conversations: { label: "Conversations", color: "var(--chart-1)" },
  addToCart: { label: "Added to cart", color: "var(--chart-4)" },
} satisfies ChartConfig;

/** Conversations and add-to-carts per day, on one count axis. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ChartContainer
      config={trendConfig}
      className="aspect-auto h-[260px] w-full"
    >
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fill-conversations" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-conversations)"
              stopOpacity={0.25}
            />
            <stop
              offset="95%"
              stopColor="var(--color-conversations)"
              stopOpacity={0.02}
            />
          </linearGradient>
          <linearGradient id="fill-addToCart" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-addToCart)"
              stopOpacity={0.2}
            />
            <stop
              offset="95%"
              stopColor="var(--color-addToCart)"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(v: string) => fmt.date(v)}
        />
        <YAxis tickLine={false} axisLine={false} width={32} tickMargin={4} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(v) => fmt.dateLong(String(v))}
            />
          }
        />
        <Area
          dataKey="addToCart"
          type="monotone"
          fill="url(#fill-addToCart)"
          stroke="var(--color-addToCart)"
          strokeWidth={2}
          isAnimationActive={false}
        />
        <Area
          dataKey="conversations"
          type="monotone"
          fill="url(#fill-conversations)"
          stroke="var(--color-conversations)"
          strokeWidth={2}
          isAnimationActive={false}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}
