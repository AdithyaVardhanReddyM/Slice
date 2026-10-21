"use client";

// What this campaign has cost in model calls, kept out of the way: a quiet
// pill in the top bar with a ring for how much of the cap is used, and on
// click where the money went (by kind of generation, and the latest calls).
// It is there so whoever runs Slice can watch spend while making demos; the
// cap stops generation before it would be passed.

import { useMutation } from "convex/react";
import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { isDesignJob, modelLabel } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usd } from "../prompt/options";
import { useCanvas } from "./context";

const KIND: Record<string, string> = { image: "Images", video: "Video", edit: "Video edits", extend: "Extensions", music: "Music", voice: "Voice", export: "Exports" };

/** How much of the cap is used, as a short bar beside the amount. */
function Meter({ ratio, className }: { ratio: number; className: string }) {
  return (
    <span className="h-1 w-7 overflow-hidden rounded-full bg-neutral-200">
      <span className={cn("block h-full rounded-full", className)} style={{ width: `${Math.max(4, Math.min(100, ratio * 100))}%` }} />
    </span>
  );
}

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

export function SpendPill() {
  const { campaign, campaignId, jobs: all } = useCanvas();
  // Design placeholders cost nothing; they only hold a spot on the canvas.
  const jobs = all.filter((j) => !isDesignJob(j.kind));
  const update = useMutation(api.media.update);
  const [cap, setCap] = useState<string | null>(null);
  const running = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const committed = running.reduce((s, j) => s + j.estimate, 0);
  const used = campaign.spend + committed;
  const ratio = campaign.budget > 0 ? used / campaign.budget : 0;
  const tone = ratio > 0.9 ? "bg-red-500" : ratio > 0.7 ? "bg-amber-500" : "bg-neutral-500";

  const byKind = new Map<string, { usd: number; n: number }>();
  for (const j of jobs) {
    if (j.status !== "done") continue;
    const k = KIND[j.kind] ?? j.kind;
    const cur = byKind.get(k) ?? { usd: 0, n: 0 };
    byKind.set(k, { usd: cur.usd + (j.cost ?? j.estimate), n: cur.n + 1 });
  }
  const rows = [...byKind.entries()].sort((a, b) => b[1].usd - a[1].usd);
  const top = Math.max(0.0001, ...rows.map(([, v]) => v.usd));
  const recent = jobs.filter((j) => j.status !== "queued").slice(0, 6);

  const commit = () => {
    const n = Number(cap);
    if (cap !== null && Number.isFinite(n) && n >= 0.5) void update({ id: campaignId, budget: Math.round(n * 100) / 100 });
    setCap(null);
  };

  return (
    <Popover>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-neutral-700 tabular-nums transition-colors hover:bg-neutral-100 data-popup-open:bg-neutral-100" title="Spend on this campaign">
        {usd(campaign.spend)}
        <Meter ratio={ratio} className={tone} />
        {committed > 0 && <Loader2 className="size-3 animate-spin text-neutral-400" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="space-y-3 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Model spend</span>
            <span className="text-xs text-muted-foreground">this campaign, list prices</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{usd(campaign.spend)}</span>
            {committed > 0 && <span className="text-xs text-muted-foreground tabular-nums">+ {usd(committed)} running</span>}
          </div>
          <div className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className={cn("h-full rounded-full", ratio > 0.9 ? "bg-red-500" : ratio > 0.7 ? "bg-amber-500" : "bg-neutral-900")} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{Math.round(ratio * 100)}% of the cap</span>
              {cap === null ? (
                <button type="button" onClick={() => setCap(String(campaign.budget))} className="tabular-nums underline-offset-2 hover:text-foreground hover:underline">
                  Cap {usd(campaign.budget)}
                </button>
              ) : (
                <span className="flex items-center gap-1">
                  $
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={cap}
                    onChange={(e) => setCap(e.target.value.replace(/[^\d.]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit();
                      if (e.key === "Escape") setCap(null);
                    }}
                    className="h-6 w-14 rounded bg-neutral-100 px-1.5 text-right text-xs text-foreground tabular-nums outline-none"
                  />
                  <button type="button" onClick={commit} aria-label="Save cap" className="rounded p-0.5 hover:bg-neutral-100">
                    <Check className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => setCap(null)} aria-label="Cancel" className="rounded p-0.5 hover:bg-neutral-100">
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="space-y-2 border-t p-4">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">
                <span className="truncate text-neutral-600">
                  {k} <span className="text-neutral-400">{v.n}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <span className="block h-full rounded-full bg-neutral-400" style={{ width: `${(v.usd / top) * 100}%` }} />
                </span>
                <span className="text-right font-medium tabular-nums">{usd(v.usd)}</span>
              </div>
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div className="border-t px-4 py-3">
            <p className="pb-1.5 text-xs font-medium text-muted-foreground">Latest calls</p>
            <ul className="space-y-1">
              {recent.map((j) => (
                <li key={j._id} className="flex items-center gap-2 text-xs">
                  <span className={cn("size-1.5 shrink-0 rounded-full", j.status === "done" ? "bg-emerald-500" : j.status === "failed" ? "bg-red-500" : "bg-amber-400")} />
                  <span className="min-w-0 flex-1 truncate">{modelLabel(j.model)}</span>
                  <span className="text-neutral-400">{ago(j.updatedAt)}</span>
                  <span className="w-12 text-right tabular-nums">{j.status === "failed" ? "—" : j.status === "done" ? usd(j.cost ?? j.estimate) : `≈${usd(j.estimate)}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="border-t px-4 py-2.5 text-[11px] leading-4 text-muted-foreground">Chat turns aren&apos;t counted (they cost a fraction of a cent). Generation stops before it would pass the cap.</p>
      </PopoverContent>
    </Popover>
  );
}
