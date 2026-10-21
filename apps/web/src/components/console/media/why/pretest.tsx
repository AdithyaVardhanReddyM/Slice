"use client";

// The Why modal's Pre-test tab: a simulated panel. Five people Gemini builds
// from an audience's Qloo profile and Qloo's age and gender skew see the piece
// and say whether they would stop (slice_media/pretest.py, ported from Shaik's
// studio pre-test in PR #3). It is labelled as simulated everywhere it shows a
// number. Fixes go to the piece's own Slice conversation, which makes a new
// version.

import { useQuery } from "convex/react";
import { Loader2, Minus, Plus, RefreshCw, Send, Users } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { MediaAudience, MediaPretest, PretestAction, PretestPerson } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanvas, type ChatMessage } from "../canvas/context";
import { keyOf, rootAsset } from "../canvas/model";
import { agentOf, mediaAction, type ItemRef } from "../canvas/use-media-agent";
import { listNames, ORANGE, Section, SignalChip } from "./bits";
import { demoHeadline } from "./charts";
import type { WhySubject } from "./preview";

const ACTION: Record<PretestAction, { label: string; fill: string }> = {
  scroll_past: { label: "Scrolls past", fill: "#d4d4d4" },
  pause: { label: "Pauses", fill: "#fdba74" },
  tap: { label: "Taps through", fill: "#f97316" },
  save_or_share: { label: "Saves or shares", fill: "#c2410c" },
};

const IMPACT = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;

const running = new Set<string>();

export function PretestView({ subject, noun, loves, onClose }: { subject: WhySubject; noun: string; loves?: { audienceKey: string; names: string[] }; onClose: () => void }) {
  // `loves` comes from the Why report, which also knows who an older image was made for.
  const { campaignId, campaign, agents, assets, select, setSidebar, focus, notify } = useCanvas();
  const row = useQuery(api.media.insight, { campaignId, kind: "pretest", key: subject.id });
  const result = (row?.data ?? null) as MediaPretest | null;
  const audiences = (campaign.audiences as MediaAudience[]).filter((a) => a.id !== "all" && a.kind !== "everyone");
  const madeFor = subject.creative?.audienceKey ?? subject.asset?.audienceKey ?? loves?.audienceKey;
  const [picked, setPicked] = useState<string | null>(null);
  const audience = picked ?? result?.audienceKey ?? (madeFor && audiences.some((a) => a.id === madeFor) ? madeFor : undefined);
  const [busy, setBusy] = useState(running.has(subject.id));
  const [error, setError] = useState<string | null>(null);

  // The piece's own conversation with Slice: the one its editor and the canvas sidebar show.
  const item: ItemRef = subject.creative
    ? { kind: "creative", id: subject.id, thread: subject.creative.thread ?? subject.creative._id }
    : (() => {
        const root = rootAsset(subject.asset!, assets);
        return { kind: "asset", id: subject.id, thread: root.thread ?? root._id };
      })();
  const messages = (useQuery(api.media.itemChat, { campaignId, itemId: item.thread }) ?? []) as ChatMessage[];
  const agent = agentOf(agents, item.thread, { history: messages.map((m) => ({ role: m.role, text: m.text })), item });

  const run = async () => {
    if (running.has(subject.id)) return;
    running.add(subject.id);
    setBusy(true);
    setError(null);
    try {
      const r = await mediaAction(campaignId, "pretest", { item_id: subject.id, ...(audience ? { audience_id: audience } : {}) });
      if (!r.ok) setError(r.error ?? "The panel could not be run.");
    } finally {
      running.delete(subject.id);
      setBusy(false);
    }
  };

  const sendFixes = (fixes: MediaPretest["fixes"]) => {
    if (!result) return;
    const missed = result.personas.filter((p) => p.action === "scroll_past").map((p) => p.name);
    const text = [
      `Make these changes from the pre-test with ${result.audienceName}${missed.length ? ` (${listNames(missed, 5)} scrolled past)` : ""}:`,
      ...fixes.map((f, i) => `${i + 1}. ${f.where ? `${f.where[0].toUpperCase()}${f.where.slice(1)}: ` : ""}${f.what} (${f.why})${f.layer ? ` [layer ${f.layer}]` : ""}`),
    ].join("\n");
    void agent.send(text).catch((err: Error) => notify(err.message, "bad"));
    if (!focus) {
      select([keyOf({ kind: subject.creative ? "creative" : "asset", id: subject.id })]);
      setSidebar({ open: true, tab: "chat" });
    }
    onClose();
  };

  const stale = !!(result && subject.creative && result.version < subject.creative.version);
  const audienceName = audiences.find((a) => a.id === audience)?.name ?? result?.audienceName ?? "Everyone";

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Select items={Object.fromEntries([["all", "Everyone"], ...audiences.map((a) => [a.id, a.name])])} value={audience ?? "all"} onValueChange={(v) => v && setPicked(v)}>
        <SelectTrigger aria-label="Audience for the panel" className="h-8 w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Everyone</SelectItem>
          {audiences.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8" onClick={() => void run()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : result ? <RefreshCw /> : <Users />}
        {busy ? "Asking the panel" : result ? "Run again" : "Run the pre-test"}
      </Button>
    </div>
  );

  if (row === undefined) {
    return (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-8 py-8">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <SimulatedBadge />
        <DialogTitle className="mt-3 text-[28px] leading-tight font-semibold tracking-tight text-neutral-950">Show it to five people before you spend</DialogTitle>
        <DialogDescription className="mt-2 max-w-xl text-[15px] leading-6 text-neutral-600">
          Gemini builds five people from the audience&rsquo;s Qloo profile (what they love, their traits, the brands they lean toward) and Qloo&rsquo;s age and gender skew. Each one sees the {noun} as it will be seen and says whether they would stop, and why.
        </DialogDescription>
        <p className="mt-3 max-w-xl text-[13px] leading-5 text-neutral-500">It is a model&rsquo;s judgement, not a Qloo measurement: use it to catch problems early, not to forecast results. About 20 seconds, and nothing is generated.</p>
        <div className="mt-6">{controls}</div>
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-[13px] text-red-800">{error}</p>}
        {busy && (
          <div className="mt-8 space-y-3">
            <p className="flex items-center gap-2 text-[14px] text-neutral-600">
              <Loader2 className="size-4 animate-spin text-orange-600" /> Five people from {audienceName} are looking at it.
            </p>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        )}
      </div>
    );
  }

  const n = result.personas.length;
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto transition-opacity", busy && "pointer-events-none opacity-50")}>
      <header className="px-8 pt-7 pb-7">
        {stale && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
            You have changed it since the panel saw it.
            <Button size="sm" variant="outline" className="h-7 bg-white" onClick={() => void run()} disabled={busy}>
              <RefreshCw /> Run again
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <SimulatedBadge />
          <span className="text-[13px] text-neutral-500">
            with <span className="font-medium text-neutral-900">{result.audienceName}</span>
          </span>
        </div>
        <DialogTitle className="sr-only">Pre-test with {result.audienceName}</DialogTitle>
        <div className="mt-4 flex items-center gap-6">
          <ScoreRing score={result.score} />
          <div className="min-w-0">
            <p className="text-[22px] leading-tight font-semibold tracking-tight text-neutral-950">
              {result.stopped} of {n} would stop scrolling
            </p>
            <div className="mt-2 flex gap-1.5" aria-hidden>
              {result.personas.map((p) => (
                <span key={p.name} title={`${p.name}: ${ACTION[p.action].label.toLowerCase()}`} className="flex size-7 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white" style={{ background: ACTION[p.action].fill, color: p.action === "scroll_past" || p.action === "pause" ? "#431407" : "#fff" }}>
                  {p.name[0]}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-neutral-500">Panel score out of 100, simulated by Gemini from Qloo data. Not a measurement.</p>
          </div>
        </div>
        <DialogDescription className="mt-5 text-[15px] leading-6 text-neutral-700">{result.verdict}</DialogDescription>
        <div className="mt-5">{controls}</div>
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-[13px] text-red-800">{error}</p>}
      </header>

      <Section title="Where each person landed" hint="Their score out of 10, coloured by what they would do.">
        <ul className="space-y-1.5">
          {result.personas.map((p) => (
            <li key={p.name} className="grid grid-cols-[9rem_minmax(0,1fr)_1.5rem_7.5rem] items-center gap-3 text-[13px]">
              <span className="truncate text-neutral-800">
                {p.name}, {p.age}
              </span>
              <span className="relative h-2.5 rounded-r-full bg-neutral-100">
                <span className="absolute inset-y-0 left-0 rounded-r-full" style={{ width: `${p.score * 10}%`, background: ACTION[p.action].fill }} />
              </span>
              <span className="text-right text-neutral-500 tabular-nums">{p.score}</span>
              <span className="truncate text-neutral-500">{ACTION[p.action].label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-neutral-500">
          {(Object.keys(ACTION) as PretestAction[]).map((a) => (
            <span key={a} className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm" style={{ background: ACTION[a].fill }} />
              {ACTION[a].label}
            </span>
          ))}
        </div>
      </Section>

      {result.fixes.length > 0 && (
        <Section
          title="What to change"
          hint={`What would win over the people who scrolled past. Slice makes a new version of the ${noun}, priced like any change.`}
          aside={
            <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => sendFixes(result.fixes)} disabled={agent.busy}>
              <Send /> Send all to Slice
            </Button>
          }
        >
          <ol className="space-y-3">
            {result.fixes.map((f, i) => (
              <li key={i} className="flex gap-3.5 rounded-xl p-4 ring-1 ring-black/[0.06]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11.5px]", f.impact === "high" ? "bg-orange-100 text-orange-900" : f.impact === "medium" ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600")}>{IMPACT[f.impact]}</span>
                    {f.where && <span className="first-letter:uppercase">{f.where}</span>}
                  </div>
                  <p className="mt-1.5 text-[14.5px] font-medium text-neutral-950">{f.what}</p>
                  <p className="mt-0.5 text-[13.5px] leading-5 text-neutral-600">{f.why}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-8 shrink-0 self-start text-neutral-600" onClick={() => sendFixes([f])} disabled={agent.busy}>
                  <Send /> Send
                </Button>
              </li>
            ))}
          </ol>
          {agent.busy && <p className="mt-3 text-[12px] text-neutral-500">Slice is working on this {noun} already; send when it is done.</p>}
        </Section>
      )}

      <Section title="The panel" hint={result.demographics ? `Ages and genders follow Qloo's skew for ${result.audienceName}: ${demoHeadline(result.demographics).toLowerCase()}. Their tastes are real items of the Qloo profile.` : undefined}>
        <ul className="space-y-3">
          {result.personas.map((p) => (
            <Person key={p.name} p={p} who={loves && loves.audienceKey === result.audienceKey && loves.names.length ? `people who love ${listNames(loves.names, 3)}` : `people in ${result.audienceName}`} />
          ))}
        </ul>
      </Section>

      <footer className="border-t border-neutral-100 px-8 py-6 text-[12.5px] leading-5 text-neutral-500">
        <p className="mb-2 font-medium text-neutral-700">How the pre-test works</p>
        <p>
          Gemini builds five people from {result.everyone ? "the brand's likely buyers (no audience taste was used)" : `${result.audienceName}'s Qloo profile and Qloo's age and gender skew for it`}, then shows each one the {noun} as it will be seen. The panel score is their scores averaged. It is a simulation to catch problems before you spend, not a Qloo measurement and not a forecast.
        </p>
      </footer>
    </div>
  );
}

function SimulatedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-medium text-neutral-700">
      <Users className="size-3.5" /> Simulated panel
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-[84px] shrink-0" role="img" aria-label={`Panel score ${score} out of 100 (simulated)`}>
      <svg viewBox="0 0 84 84" className="size-full -rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" stroke="#f5f5f4" strokeWidth="7" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={ORANGE} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] leading-none font-semibold text-neutral-950">{score}</span>
        <span className="mt-0.5 text-[10px] text-neutral-500">of 100</span>
      </span>
    </div>
  );
}

function Person({ p, who }: { p: PretestPerson; who: string }) {
  const a = ACTION[p.action] ?? ACTION.pause;
  return (
    <li className="rounded-xl p-4 ring-1 ring-black/[0.06]">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[13px] font-semibold text-white">{p.name[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-neutral-950">
            {p.name}, {p.age}
            {p.city && <span className="font-normal text-neutral-500"> in {p.city}</span>}
          </p>
          <p className="text-[12.5px] text-neutral-500">{p.bio}</p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[13px] font-semibold text-neutral-950 tabular-nums">{p.score} of 10</span>
          <span className="flex items-center gap-1.5 text-[12px] text-neutral-600">
            <span className="size-2 rounded-full" style={{ background: a.fill }} />
            {a.label}
          </span>
        </span>
      </div>
      {p.tastes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.tastes.map((s) => (
            <SignalChip key={s.name} s={s} who={who} />
          ))}
        </div>
      )}
      <p className="mt-3 text-[12.5px] text-neutral-500">
        Notices first: <span className="text-neutral-700">{p.firstGlance}</span>
      </p>
      <blockquote className="mt-2 border-l-2 border-orange-200 pl-3 text-[14px] leading-6 text-neutral-800">&ldquo;{p.reaction}&rdquo;</blockquote>
      {(p.likes.length > 0 || p.dislikes.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-neutral-600">
          {p.likes.map((x) => (
            <span key={x} className="flex items-center gap-1">
              <Plus className="size-3.5 text-neutral-400" /> {x}
            </span>
          ))}
          {p.dislikes.map((x) => (
            <span key={x} className="flex items-center gap-1">
              <Minus className="size-3.5 text-neutral-400" /> {x}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
