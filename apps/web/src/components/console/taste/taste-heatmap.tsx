"use client";

import { useState } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChartTip, TipRow, useChartTip } from "./chart-tip";
import type { Heatmap } from "./aggregate";
import { HEAT_RAMP } from "./colors";

function step(value: number, max: number) {
  if (value <= 0 || max <= 0) return -1;
  return Math.min(
    HEAT_RAMP.length - 1,
    Math.floor((value / max) * HEAT_RAMP.length),
  );
}

export function TasteHeatmap({
  data,
  total,
}: {
  data: Heatmap;
  total: number;
}) {
  const [mode, setMode] = useState<"color" | "values">("color");
  const { ref, tip, show, hide } = useChartTip<{ r: number; c: number }>();
  const cols = data.styles.length;
  const emptyCols = data.styles.filter((s) => s.demand === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Taste to catalog map</CardTitle>
        <CardDescription>
          How the top Qloo taste tags land on your style axis
        </CardDescription>
        <CardAction>
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "color" | "values")}
          >
            <TabsList>
              <TabsTrigger value="color">Color</TabsTrigger>
              <TabsTrigger value="values">Values</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Mean affinity</span>
            <span className="num text-xs">0</span>
            <div className="flex gap-0.5" aria-hidden>
              {HEAT_RAMP.map((c) => (
                <span
                  key={c}
                  className="h-3 w-5 rounded-sm"
                  style={{ background: c }}
                />
              ))}
            </div>
            <span className="num text-xs">{data.max.toFixed(2)}</span>
          </div>
          {emptyCols.length > 0 && (
            <span className="flex items-center gap-2">
              <span className="h-3 w-5 rounded-sm border" />
              No shopper signal yet
            </span>
          )}
        </div>

        <div ref={ref} className="relative" onMouseLeave={hide}>
          <div className="overflow-x-auto">
            <div
              role="table"
              aria-label="Taste tags by catalog style, mean affinity"
              className="grid min-w-3xl gap-0.5"
              style={{
                gridTemplateColumns: `12rem repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              {/* Column headers */}
              <div role="row" className="contents">
                <div
                  role="columnheader"
                  className="flex items-end pb-2 text-sm font-medium"
                >
                  Qloo tag
                </div>
                {data.styles.map((s, c) => (
                  <div
                    key={s.id}
                    role="columnheader"
                    className={cn(
                      "flex items-end justify-center px-0.5 pb-2 text-center text-xs leading-tight",
                      s.demand === 0
                        ? "text-muted-foreground"
                        : "text-foreground",
                      tip?.data.c === c && "font-medium",
                    )}
                  >
                    {s.label}
                  </div>
                ))}
              </div>

              {data.tags.map((tag, r) => (
                <div role="row" key={tag.name} className="contents">
                  <div
                    role="rowheader"
                    className={cn(
                      "flex h-8 items-center justify-between gap-2 pr-3 text-sm",
                      tip?.data.r === r && "font-medium",
                    )}
                  >
                    <span className="truncate">{tag.name}</span>
                    <span className="num flex-none text-xs text-muted-foreground">
                      {fmt.pct(tag.share, 0)}
                    </span>
                  </div>
                  {data.cells[r].map((cell, c) => {
                    const s = step(cell.value, data.max);
                    const noSignal = data.styles[c].demand === 0;
                    const active = tip?.data.r === r && tip?.data.c === c;
                    return (
                      <div
                        role="cell"
                        key={c}
                        onMouseMove={(e) => show(e, { r, c })}
                        className={cn(
                          "flex h-8 items-center justify-center rounded-sm",
                          noSignal ? "border" : s < 0 && "bg-muted",
                          active && "ring-2 ring-foreground",
                        )}
                        style={
                          s >= 0 ? { background: HEAT_RAMP[s] } : undefined
                        }
                      >
                        {mode === "values" && s >= 0 && (
                          <span className="num text-xs">
                            {cell.value.toFixed(2)}
                          </span>
                        )}
                        <span className="sr-only">
                          {tag.name} to {data.styles[c].label}:{" "}
                          {cell.value.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {tip && (
            <ChartTip x={tip.x} y={tip.y}>
              <HeatTip
                data={data}
                r={tip.data.r}
                c={tip.data.c}
                total={total}
              />
            </ChartTip>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HeatTip({
  data,
  r,
  c,
  total,
}: {
  data: Heatmap;
  r: number;
  c: number;
  total: number;
}) {
  const tag = data.tags[r];
  const style = data.styles[c];
  const cell = data.cells[r][c];
  return (
    <>
      <div className="font-medium">
        {tag.name} to {style.label}
      </div>
      <TipRow label="Mean affinity" value={cell.value.toFixed(2)} />
      <TipRow
        label="Tag seen in"
        value={`${tag.count} of ${total} conversations`}
      />
      <div className="text-muted-foreground">
        {style.demand === 0
          ? "No shopper has mapped to this style yet."
          : cell.driver
            ? "This tag directly drives the style mapping."
            : cell.together
              ? "Co-occurs in the same profiles, counted at 30%."
              : "Never seen together."}
      </div>
    </>
  );
}
