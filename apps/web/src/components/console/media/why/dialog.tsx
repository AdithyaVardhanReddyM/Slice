"use client";
/* eslint-disable @next/next/no-img-element -- pictures come from Convex storage and Qloo, sized by their boxes */

// The Why modal: why a poster, video, image or clip looks the way it does, and
// how Qloo shaped it. The piece sits on the left with each choice marked on
// it; the right tells the story top to bottom: the idea, how their loves led
// to Qloo traits and on to what is in the frame, each choice with the signals
// it rests on, what was left out, then the audience's taste, who they are and
// where they are. The agent writes the report the first time it is opened
// (slice_media/why.py, about 15 seconds) and it is read live from Convex.
// The Pre-test tab (pretest.tsx) shows it to a simulated panel.

import { useQuery } from "convex/react";
import { ArrowRight, Ban, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import type { MediaAudience, MediaConcept, MediaWhyReport, WhyChoice, WhySignal } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanvas } from "../canvas/context";
import { mediaAction } from "../canvas/use-media-agent";
import { FROM, KIND, listNames, score, Section, SignalChip } from "./bits";
import { demoHeadline, SkewBars, TasteMap, TraitBars, TraitHeatmap } from "./charts";
import { Palette, WhyPreview, type WhySubject } from "./preview";
import { PretestView } from "./pretest";

/** The short reasons saved when it was made, shown while the full report is written. */
function shortWhy(creative: Doc<"mediaCreatives">, campaign: Doc<"mediaCampaigns">) {
  const concept = ((campaign.concepts ?? []) as MediaConcept[]).find((c) => c.audienceKey === creative.audienceKey);
  const reasons = (creative.why?.length ? creative.why : (concept?.why ?? [])).slice(0, 3);
  return concept || reasons.length ? { concept, reasons } : null;
}

/** Reports being written, so a second opener waits for the first instead of starting another. */
const writing = new Set<string>();

const NOUN: Record<WhySubject["kind"], string> = { poster: "poster", video: "video", image: "image", clip: "clip" };

function ago(at: number) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WhyDialog({ subject, open, onOpenChange }: { subject: WhySubject; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { campaignId, campaign, kit } = useCanvas();
  const row = useQuery(api.media.insight, open ? { campaignId, kind: "why", key: subject.id } : "skip");
  const report = (row?.data ?? null) as MediaWhyReport | null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [litChoice, setLitChoice] = useState<string | null>(null);
  const [litTrait, setLitTrait] = useState<string | null>(null);
  const [view, setView] = useState<"why" | "pretest">("why");

  const write = async () => {
    if (writing.has(subject.id)) return;
    writing.add(subject.id);
    setBusy(true);
    setError(null);
    try {
      const r = await mediaAction(campaignId, "why", { item_id: subject.id });
      if (!r.ok) setError(r.error ?? "The explanation could not be written.");
    } finally {
      writing.delete(subject.id);
      setBusy(false);
    }
  };

  // The first time it is opened, write the report (on the next tick, so a remount in dev starts it once).
  useEffect(() => {
    if (!open || row !== null || error || writing.has(subject.id)) return;
    const t = setTimeout(() => void write(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row, error]);

  const audiences = campaign.audiences as MediaAudience[];
  const guessKey = subject.creative?.audienceKey ?? subject.asset?.audienceKey;
  const audienceName = report?.audienceName ?? audiences.find((a) => a.id === guessKey)?.name;
  const stale = !!(report && subject.creative && report.version < subject.creative.version);
  const choices = report?.choices ?? [];
  const lit = litChoice ? [litChoice] : litTrait ? (report?.traits.find((t) => t.name === litTrait)?.choices ?? []) : [];
  const bar = (
    <div className="flex shrink-0 items-center rounded-lg bg-neutral-100 p-0.5">
      {(["why", "pretest"] as const).map((v) => (
        <button key={v} type="button" onClick={() => setView(v)} className={cn("h-7 rounded-md px-3 text-[13px] font-medium transition-colors", view === v ? "bg-white text-neutral-950 shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-neutral-500 hover:text-neutral-900")}>
          {v === "why" ? "Why it works" : "Pre-test"}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(900px,calc(100vh-3rem))] w-[calc(100vw-3rem)] max-w-[1280px] gap-0 overflow-hidden p-0 sm:max-w-[1280px]">
        <div className="grid min-h-0 w-full grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <aside className="hidden min-h-0 flex-col gap-5 bg-[#f5f4f1] p-7 md:flex">
            <p className="truncate text-[13px] text-neutral-500">
              {NOUN[subject.kind][0].toUpperCase() + NOUN[subject.kind].slice(1)}: <span className="text-neutral-800">{subject.name}</span>
            </p>
            <div className="relative min-h-0 flex-1">
              <WhyPreview subject={subject} kit={kit} choices={view === "why" ? choices : []} lit={lit} onLit={setLitChoice} />
            </div>
            {report && report.palette.length > 0 && <Palette palette={report.palette} />}
          </aside>
          {view === "why" ? (
            <WhyBody bar={bar} subject={subject} report={report} audienceName={audienceName} busy={busy} error={error} stale={stale} onWrite={() => void write()} litChoice={litChoice} litTrait={litTrait} setLitChoice={setLitChoice} setLitTrait={setLitTrait} createdAt={row?.createdAt} />
          ) : (
            <div className="flex min-h-0 flex-col">
              <TopBar>{bar}</TopBar>
              <PretestView subject={subject} noun={NOUN[subject.kind]} loves={report ? { audienceKey: report.audienceKey, names: report.loves.map((l) => l.name) } : undefined} onClose={() => onOpenChange(false)} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TopBar({ children }: { children: ReactNode }) {
  return <nav className="flex h-14 shrink-0 items-center gap-1 overflow-x-auto border-b border-neutral-100 px-6 pr-14">{children}</nav>;
}

function WhyBody({
  bar,
  subject,
  report,
  audienceName,
  busy,
  error,
  stale,
  onWrite,
  litChoice,
  litTrait,
  setLitChoice,
  setLitTrait,
  createdAt,
}: {
  bar: ReactNode;
  subject: WhySubject;
  report: MediaWhyReport | null;
  audienceName: string | undefined;
  busy: boolean;
  error: string | null;
  stale: boolean;
  onWrite: () => void;
  litChoice: string | null;
  litTrait: string | null;
  setLitChoice: (id: string | null) => void;
  setLitTrait: (name: string | null) => void;
  createdAt?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState("choices");
  const { campaign } = useCanvas();
  const noun = NOUN[subject.kind];

  if (!report) {
    const short = subject.creative ? shortWhy(subject.creative, campaign) : null;
    return (
      <div className="flex min-h-0 flex-col">
      <TopBar>{bar}</TopBar>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <p className="text-[13px] text-neutral-500">{audienceName ? `Made for ${audienceName}` : "Why it works"}</p>
        <DialogTitle className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-neutral-950">{short?.concept?.hook || short?.concept?.title || `Why this ${noun}`}</DialogTitle>
        <DialogDescription className="sr-only">How this {noun} was shaped by its audience&rsquo;s taste</DialogDescription>
        {error ? (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-[14px] text-red-800">
            <p>{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={onWrite}>
              <RefreshCw /> Try again
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-4 flex items-center gap-2 text-[14px] text-neutral-600">
              <Loader2 className="size-4 animate-spin text-orange-600" />
              Looking at the {noun} next to {audienceName ? `${audienceName}'s` : "its audience's"} taste on Qloo. About 15 seconds.
            </p>
            {short && short.reasons.length > 0 && (
              <ul className="mt-6 space-y-2">
                {short.reasons.map((r, i) => (
                  <li key={i} className="text-[14px] leading-6 text-neutral-700">
                    {r.text} <span className="text-neutral-400">({r.evidence})</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-8 space-y-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          </>
        )}
      </div>
      </div>
    );
  }

  const loves = report.loves.map((l) => l.name);
  const lovesText = listNames(loves, 4) || "their loves";
  const who = loves.length ? `people who love ${listNames(loves, 3)}` : `people in ${report.audienceName}`;
  const taste = report.choices.filter((c) => c.from === "taste");
  const cited = uniq(report.choices.flatMap((c) => c.signals).filter((s) => s.kind !== "love"));
  const topUsed = report.traits.slice(0, 10).filter((t) => t.choices.length).length;
  const tabs = [
    { id: "choices", label: "Choices" },
    ...(report.everyone ? [] : [{ id: "taste", label: "Their taste" }]),
    ...(report.demographics ? [{ id: "who", label: "Who they are" }] : []),
    ...(report.map ? [{ id: "where", label: "Where they are" }] : []),
  ];
  const go = (id: string) => scroller.current?.querySelector(`[data-why-section="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + 72;
    let cur = tabs[0]?.id ?? "choices";
    for (const t of tabs) {
      const s = el.querySelector(`[data-why-section="${t.id}"]`);
      if (s && s.getBoundingClientRect().top <= top) cur = t.id;
    }
    // At the bottom, the last section is the one being read even when it is too short to reach the top.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) cur = tabs[tabs.length - 1]?.id ?? cur;
    setSection(cur);
  };

  return (
    <div className="relative flex min-h-0 flex-col">
      <TopBar>
        {bar}
        <span className="mx-2 h-5 w-px shrink-0 bg-neutral-200" />
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => go(t.id)} className={cn("h-8 shrink-0 rounded-lg px-2.5 text-[13px] transition-colors", section === t.id ? "font-medium text-neutral-950" : "text-neutral-500 hover:text-neutral-900")}>
            {t.label}
          </button>
        ))}
      </TopBar>
      <div ref={scroller} onScroll={onScroll} className={cn("min-h-0 flex-1 overflow-y-auto transition-opacity", busy && "pointer-events-none opacity-50")}>
        <header className="px-8 pt-7 pb-7">
          {stale && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
              You have changed it since this was written.
              <Button size="sm" variant="outline" className="h-7 bg-white" onClick={onWrite} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Update
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2 text-[13px] text-neutral-500">
            {report.everyone ? (
              "Made for everyone"
            ) : (
              <>
                <span className="flex -space-x-1.5">
                  {report.loves.slice(0, 4).map((l) => (l.image ? <img key={l.name} src={l.image} alt="" className="size-5 rounded-full object-cover ring-2 ring-white" /> : null))}
                </span>
                Made for <span className="font-medium text-neutral-900">{report.audienceName}</span>
              </>
            )}
          </div>
          <DialogTitle className="mt-2 text-[28px] leading-tight font-semibold tracking-tight text-neutral-950">{report.idea}</DialogTitle>
          <DialogDescription className="mt-2 text-[15px] leading-6 text-neutral-600">{report.summary}</DialogDescription>
          {!report.everyone && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Fact value={`${taste.length} of ${report.choices.length}`} label="choices come from their taste" />
              <Fact value={String(cited.length)} label={`Qloo signal${cited.length === 1 ? "" : "s"} behind it`} />
              {report.traits.length >= 10 && topUsed > 0 && <Fact value={`${topUsed} of 10`} label="of their strongest traits show" />}
            </div>
          )}
        </header>

        {!report.everyone && (
          <Section id="how" title="How Qloo shaped it" hint={`Qloo knows what people who love ${lovesText} also lean toward. Those leanings decided what is in the ${noun}.`}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
              <FlowCol title="They love" hint="What the audience was built from">
                {report.loves.map((s) => (
                  <SignalChip key={s.name} s={s} who={who} />
                ))}
              </FlowCol>
              <FlowArrow />
              <FlowCol title="Qloo finds they lean" hint="What comes with those loves">
                {cited.length ? cited.map((s) => <SignalChip key={s.name} s={s} who={who} active={litTrait === s.name} onHover={(on) => s.kind === "trait" && setLitTrait(on ? s.name : null)} />) : <span className="text-[13px] text-neutral-400">Nothing cited</span>}
              </FlowCol>
              <FlowArrow />
              <FlowCol title={`So the ${noun} shows`} hint="Choices made for their taste">
                {taste.map((c) => (
                  <span key={c.id} onMouseEnter={() => setLitChoice(c.id)} onMouseLeave={() => setLitChoice(null)} className={cn("flex w-full min-w-0 items-center gap-2 rounded-lg py-0.5 pr-1 text-[13px] text-neutral-800 transition-colors", litChoice === c.id && "text-orange-700")}>
                    <Num n={report.choices.indexOf(c) + 1} on={litChoice === c.id} />
                    <span className="min-w-0 truncate">{c.title}</span>
                  </span>
                ))}
              </FlowCol>
            </div>
          </Section>
        )}

        {report.everyone && (
          <div className="mx-8 mb-7 rounded-xl bg-neutral-50 p-4 text-[14px] leading-6 text-neutral-600">No audience was picked, so this {noun} follows your brand guidelines and your request. Pick an audience in the prompt bar and Slice shapes the next one around their Qloo taste.</div>
        )}

        <Section id="choices" title="Every choice, explained" hint={subject.kind === "video" ? "What it shows and plays, and why." : `Numbered on the ${noun}. Point at one to see it.`}>
          <ol className="space-y-3">
            {report.choices.map((c, i) => (
              <ChoiceCard key={c.id} c={c} n={i + 1} on={litChoice === c.id || (!!litTrait && report.traits.find((t) => t.name === litTrait)?.choices.includes(c.id))} onHover={(on) => setLitChoice(on ? c.id : null)} who={who} litTrait={litTrait} setLitTrait={setLitTrait} />
            ))}
          </ol>
          {report.avoided.length > 0 && (
            <div className="mt-7">
              <p className="mb-3 text-[13px] font-medium text-neutral-950">Left out on purpose</p>
              <ul className="space-y-3">
                {report.avoided.map((a) => (
                  <li key={a.what} className="flex gap-3">
                    <Ban className="mt-0.5 size-4 shrink-0 text-neutral-400" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-neutral-900">{a.what}</p>
                      <p className="mt-0.5 text-[13.5px] leading-5 text-neutral-600">{a.why}</p>
                      {a.signals.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {a.signals.map((s) => (
                            <SignalChip key={s.name} s={s} who={who} />
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {!report.everyone && report.traits.length > 0 && (
          <Section id="taste" title="Their taste, by Qloo" hint={`The traits Qloo finds in people who love ${lovesText}, strongest first. Point at one to see where the ${noun} carries it.`}>
            <TraitBars traits={report.traits} active={litTrait} onHover={setLitTrait} />
            <div className="mt-8">
              <p className="text-[13px] font-medium text-neutral-950">Which trait each choice carries</p>
              <p className="mt-1 mb-3 text-[13px] text-neutral-500">Each column is a numbered choice; a filled cell means it carries that trait, darker for a stronger trait.</p>
              <TraitHeatmap traits={report.traits} choices={report.choices} activeChoice={litChoice} activeTrait={litTrait} onChoice={setLitChoice} onTrait={setLitTrait} />
            </div>
            {report.brands.length > 0 && (
              <div className="mt-8">
                <p className="mb-3 text-[13px] font-medium text-neutral-950">Brands they over-index on</p>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {report.brands.slice(0, 8).map((b) => (
                    <li key={b.name} className={cn("flex min-w-0 items-center gap-2.5 rounded-xl p-2.5 ring-1 ring-black/[0.06]", b.used && "bg-orange-50/60 ring-orange-200")}>
                      {b.image ? <img src={b.image} alt="" className="size-9 shrink-0 rounded-lg bg-white object-contain ring-1 ring-black/[0.06]" /> : <span className="size-9 shrink-0 rounded-lg bg-neutral-100" />}
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-neutral-900">{b.name}</span>
                        {b.affinity !== undefined && <span className="block text-[11px] text-neutral-500 tabular-nums">{score(b.affinity)} out of 100{b.used ? ", cited" : ""}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.culture.length > 0 && (
              <div className="mt-8">
                <p className="mb-3 text-[13px] font-medium text-neutral-950">What they watch and listen to</p>
                <ul className="flex gap-3 overflow-x-auto pb-1">
                  {report.culture.slice(0, 8).map((c) => (
                    <li key={c.name} className="w-24 shrink-0">
                      {c.image ? <img src={c.image} alt="" className={cn("aspect-square w-full rounded-xl bg-neutral-100 object-cover", c.used && "ring-2 ring-orange-400")} /> : <span className="block aspect-square w-full rounded-xl bg-neutral-100" />}
                      <span className="mt-1.5 line-clamp-2 block text-[12px] leading-4 text-neutral-800">{c.name}</span>
                      <span className="block text-[11px] text-neutral-400 capitalize">{c.kind === "tv" ? "Show" : c.kind}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {report.demographics && (
          <Section id="who" title="Who they are" hint={`Qloo's read of who shares these tastes, against the average person.`}>
            <p className="mb-4 text-[18px] font-semibold tracking-tight text-neutral-950">{demoHeadline(report.demographics)}</p>
            <SkewBars demo={report.demographics} />
          </Section>
        )}

        {report.map && (
          <Section id="where" title="Where they are" hint={`Where in ${report.map.region} this taste over-indexes, compared with ${report.map.versus}. Useful for where to place it: billboards, transit, local delivery zones.`}>
            <TasteMap map={report.map} audience={report.audienceName} />
          </Section>
        )}

        <footer className="border-t border-neutral-100 px-8 py-6 text-[12.5px] leading-5 text-neutral-500">
          <p className="mb-2 font-medium text-neutral-700">How this was put together</p>
          <ul className="space-y-1">
            {!report.everyone && (
              <li>
                Taste: Qloo&rsquo;s profile of {report.audienceName}, built from {lovesText}. Numbers are Qloo affinity, 0 to 100.
              </li>
            )}
            <li>Choices: read from the {noun} itself by Gemini, next to the designer&rsquo;s notes. Every Qloo signal it names is checked against the profile; anything it can&rsquo;t match is dropped.</li>
            <li>Colours: measured from the pixels.</li>
            {report.map && <li>Map: Qloo&rsquo;s taste heatmap of {report.map.region}. Place names from OpenStreetMap.</li>}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span>{createdAt ? `Written ${ago(createdAt)}` : null}</span>
            <Button size="sm" variant="outline" onClick={onWrite} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Explain again
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function uniq(signals: WhySignal[]) {
  const seen = new Map<string, WhySignal>();
  for (const s of signals) if (!seen.has(s.name)) seen.set(s.name, s);
  return [...seen.values()].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-neutral-50 px-3 py-1.5 text-[13px] text-neutral-600 ring-1 ring-black/[0.04]">
      <span className="font-semibold text-neutral-950">{value}</span>
      {label}
    </span>
  );
}

function Num({ n, on }: { n: number; on?: boolean }) {
  return <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white transition-colors", on ? "bg-orange-600" : "bg-neutral-900")}>{n}</span>;
}

function FlowCol({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-neutral-50/80 p-3.5 ring-1 ring-black/[0.04]">
      <p className="text-[13px] font-medium text-neutral-950">{title}</p>
      <p className="mb-3 text-[11.5px] text-neutral-500">{hint}</p>
      <div className="flex flex-col items-start gap-1.5">{children}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="hidden items-center lg:flex">
      <ArrowRight className="size-4 text-neutral-300" />
    </div>
  );
}

function ChoiceCard({ c, n, on, onHover, who, litTrait, setLitTrait }: { c: WhyChoice; n: number; on: boolean | undefined; onHover: (on: boolean) => void; who: string; litTrait: string | null; setLitTrait: (name: string | null) => void }) {
  const kind = KIND[c.kind] ?? KIND.subject;
  const from = FROM[c.from] ?? FROM.brand;
  return (
    <li onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} className={cn("flex gap-3.5 rounded-xl p-4 ring-1 transition-colors", on ? "bg-orange-50/50 ring-orange-200" : "ring-black/[0.06]")}>
      <Num n={n} on={on} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-neutral-500 [&_svg]:size-3.5">
          <span className="flex items-center gap-1.5">
            {kind.icon}
            {kind.label}
          </span>
          {c.time !== undefined && <span>at {c.time.toFixed(1)} s</span>}
          <span className={cn("ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px]", from.tone)}>
            {from.icon}
            {from.label}
          </span>
        </div>
        <p className="mt-1.5 text-[15px] font-semibold text-neutral-950">{c.title}</p>
        <p className="mt-0.5 text-[14px] leading-6 text-neutral-600">{c.why}</p>
        {c.signals.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {c.signals.map((s) => (
              <SignalChip key={s.name} s={s} who={who} active={litTrait === s.name} onHover={(o) => s.kind === "trait" && setLitTrait(o ? s.name : null)} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
