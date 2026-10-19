"use client";

// An agent turn as the chat shows it, the email version of the Pages build
// card: a generate turn as a fixed list of phases (so the merchant sees what
// is left), an edit turn as its steps in order, each with what it brought back
// (photos, Qloo faces, taste words). Finished turns fold to one line.

import { AlertCircle, Check, ChevronDown, ChevronRight, Circle, Minus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BuildStep, StepPreview } from "@/lib/pages/stream";
import { clock, cleanThought, turnLength, useNow, useTypewriter, type ThoughtStep, type ToolStep } from "@/components/console/pages/builder/build-steps";
import { Spinner } from "@/components/console/setup/atoms";
import type { EmailLiveTurn } from "./use-email-agent";

export interface Phase {
  id: string;
  label: string;
  tools: string[];
}

/** How a card names its work; Media passes its own. */
export interface TurnCopy {
  generating: string;
  editing: string;
  /** "Wrote the email" */
  wrote: string;
  /** "Worked on the email" */
  worked: string;
  /** Tools whose use means the turn wrote something. */
  writeTools: string[];
}

const EMAIL_COPY: TurnCopy = { generating: "Writing your email", editing: "Working on your email", wrote: "Wrote the email", worked: "Worked on the email", writeTools: ["add_section", "start_email"] };

/** What a generate turn does, in order (slice_mail's writing flow). */
const PHASES: Phase[] = [
  { id: "read", label: "Reading the brand and the audience", tools: ["get_brand", "get_audience", "get_email"] },
  { id: "taste", label: "Finding cultural hooks with Qloo", tools: ["qloo_search", "qloo_insights"] },
  { id: "items", label: "Picking items by taste", tools: ["pick_items", "list_items"] },
  { id: "imagery", label: "Gathering photographs", tools: ["search_images"] },
  { id: "write", label: "Writing the email", tools: ["start_email", "add_section"] },
  { id: "review", label: "Checking it on desktop and phone", tools: ["review_email", "edit_email"] },
];

type PhaseStatus = "pending" | "active" | "done" | "skipped" | "failed";

interface PhaseView {
  phase: Phase;
  status: PhaseStatus;
  tools: ToolStep[];
  thoughts: ThoughtStep[];
  t?: number;
  ms?: number;
}

function readPhases(steps: BuildStep[], live: boolean, list: Phase[]) {
  const phaseOf = (name: string) => list.findIndex((p) => p.tools.includes(name));
  const views: PhaseView[] = list.map((phase) => ({ phase, status: "pending", tools: [], thoughts: [] }));
  let waiting: ThoughtStep[] = [];
  for (const s of steps) {
    if (s.kind === "thought") waiting.push(s);
    else if (s.kind === "tool") {
      const i = phaseOf(s.name);
      if (i < 0) continue;
      views[i].thoughts.push(...waiting);
      views[i].tools.push(s);
      waiting = [];
    }
  }
  const frontier = views.reduce((m, v, i) => (v.tools.length ? i : m), -1);
  for (const [i, v] of views.entries()) {
    if (v.tools.length) {
      const running = v.tools.some((t) => t.status === "running");
      v.status = running ? "active" : v.tools.every((t) => t.status === "failed") ? "failed" : "done";
      const start = Math.min(...v.tools.map((t) => t.t ?? 0));
      const end = Math.max(...v.tools.map((t) => (t.t ?? 0) + (t.ms ?? 0)));
      v.t = start;
      v.ms = running ? undefined : Math.max(0, end - start);
    } else if (i < frontier || !live) v.status = "skipped";
  }
  const anyRunning = views.some((v) => v.status === "active");
  if (!live && waiting.length && frontier >= 0) views[frontier].thoughts.push(...waiting);
  return { phases: views, thinking: live && !anyRunning ? (waiting[waiting.length - 1] ?? null) : null, thinkingAfter: frontier };
}

function StatusIcon({ status }: { status: PhaseStatus | ToolStep["status"] }) {
  return (
    <span className="flex size-3.5 items-center justify-center">
      {status === "active" || status === "running" ? (
        <Spinner className="size-3.5 text-foreground/70" />
      ) : status === "done" ? (
        <Check className="size-3.5 text-emerald-600" strokeWidth={2.5} />
      ) : status === "failed" ? (
        <AlertCircle className="size-3.5 text-destructive" />
      ) : status === "skipped" ? (
        <Minus className="size-3.5 text-muted-foreground/50" />
      ) : (
        <Circle className="size-2.5 text-muted-foreground/35" strokeWidth={3} />
      )}
    </span>
  );
}

function Row({ icon, last, children }: { icon: ReactNode; last?: boolean; children: ReactNode }) {
  return (
    <li className="relative pb-3 pl-6 last:pb-0">
      {!last && <span aria-hidden className="absolute top-5 bottom-0.5 left-[6.5px] w-px bg-border" />}
      <span className="absolute top-[3px] left-0">{icon}</span>
      {children}
    </li>
  );
}

function Picture({ src, className, title }: { src: string; className?: string; title?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  // Photos come from Pexels, Qloo and the brand's site: many hosts.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" title={title} onError={() => setBroken(true)} className={cn("shrink-0 bg-muted object-cover", className)} />;
}

/** What a step brought back: Qloo faces, photos, taste words, review notes. */
function PreviewStrip({ preview }: { preview?: StepPreview }) {
  if (!preview) return null;
  const { faces = [], images = [], chips = [], notes = [] } = preview;
  return (
    <div className="mt-1.5 space-y-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      {faces.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="flex -space-x-1.5">
            {faces.slice(0, 6).map((f) => (
              <span key={f.image} className="size-6 overflow-hidden rounded-full bg-muted ring-2 ring-background">
                <Picture src={f.image} title={f.name} className="size-full" />
              </span>
            ))}
          </span>
          <span className="truncate text-xs text-muted-foreground">{faces.slice(0, 3).map((f) => f.name).join(", ")}</span>
        </div>
      )}
      {images.length > 0 && (
        <div className="flex gap-1">
          {images.slice(0, 5).map((src) => (
            <Picture key={src} src={src} className="h-9 w-12 rounded-md ring-1 ring-foreground/5" />
          ))}
          {images.length > 5 && <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-[11px] text-muted-foreground">+{images.length - 5}</span>}
        </div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.slice(0, 6).map((c) => (
            <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[11px] leading-4 text-muted-foreground">
              {c}
            </span>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <ul className="space-y-0.5 text-xs leading-5 text-muted-foreground">
          {notes.map((n) => (
            <li key={n} className="line-clamp-1">
              <span className="mr-1.5 text-muted-foreground/60">•</span>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThoughtStream({ text }: { text: string }) {
  const shown = useTypewriter(cleanThought(text), true);
  if (!shown) return null;
  return (
    <div className={cn("mt-1 flex max-h-[7.5rem] flex-col justify-end overflow-hidden", shown.length > 360 && "[mask-image:linear-gradient(to_bottom,transparent,#000_2rem)]")}>
      <p className="text-xs leading-5 whitespace-pre-wrap text-muted-foreground">{shown}</p>
    </div>
  );
}

function ThoughtToggle({ thought }: { thought: ThoughtStep }) {
  const [open, setOpen] = useState(false);
  const body = cleanThought(thought.text);
  if (!body) return null;
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-expanded={open}>
        <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
        {thought.ms && thought.ms >= 1000 ? `Thought for ${clock(thought.ms)}` : "Thought"}
      </button>
      {open && <p className="mt-1 pl-4 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">{body}</p>}
    </div>
  );
}

function ToolLine({ step, compact }: { step: ToolStep; compact?: boolean }) {
  const running = step.status === "running";
  return (
    <div className={cn(compact && "mt-1.5")}>
      <div className="flex items-baseline gap-1.5 text-xs leading-5">
        {compact && <StatusIcon status={step.status} />}
        <span className={cn("min-w-0", running ? "pg-shimmer" : compact ? "text-foreground/80" : "text-foreground")}>{step.label}</span>
        {!running && step.ms !== undefined && step.ms >= 1000 && <span className="num shrink-0 text-muted-foreground/70">{clock(step.ms)}</span>}
      </div>
      {step.summary && <p className={cn("text-xs leading-5 text-muted-foreground", step.status === "failed" && "text-destructive", compact && "pl-5")}>{step.summary}</p>}
      <div className={cn(compact && "pl-5")}>
        <PreviewStrip preview={step.preview} />
      </div>
    </div>
  );
}

function ThinkingRow({ label, thought, last }: { label: string; thought: ThoughtStep | null; last: boolean }) {
  return (
    <Row icon={<StatusIcon status="active" />} last={last}>
      <span className="pg-shimmer text-sm leading-5">{label}</span>
      {thought && <ThoughtStream key={thought.t} text={thought.text} />}
    </Row>
  );
}

function PhaseRow({ view, last, live, now, startedAt, sections }: { view: PhaseView; last: boolean; live: boolean; now: number; startedAt: number; sections?: string[] }) {
  const { phase, status, tools } = view;
  const active = status === "active";
  const elapsed = active && view.t !== undefined ? now - startedAt - view.t : view.ms;
  // Writing calls add_section once per section: show the sections, not a dozen lines.
  const writing = phase.id === "write";
  const single = !writing && tools.length === 1 ? tools[0] : null;
  return (
    <Row icon={<StatusIcon status={status} />} last={last}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("text-sm leading-5", active ? "pg-shimmer" : status === "pending" || status === "skipped" ? "text-muted-foreground/70" : "text-foreground")}>{phase.label}</span>
        {elapsed !== undefined && elapsed >= 1000 && <span className="num shrink-0 text-xs text-muted-foreground/80">{clock(elapsed)}</span>}
      </div>
      {!live && view.thoughts.map((t, i) => <ThoughtToggle key={i} thought={t} />)}
      {writing ? (
        sections && sections.length > 0 && (status === "active" || status === "done") ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {sections.map((name, i) => {
              const current = active && i === sections.length - 1;
              return (
                <span
                  key={`${name}-${i}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 animate-in fade-in-0 zoom-in-95 duration-300",
                    current ? "border-foreground/15 bg-background" : "border-transparent bg-muted text-muted-foreground",
                  )}
                >
                  {!current && <Check className="size-2.5" strokeWidth={3} />}
                  <span className={cn(current && "pg-shimmer")}>{name}</span>
                </span>
              );
            })}
          </div>
        ) : null
      ) : single ? (
        <>
          {single.summary && <p className={cn("text-xs leading-5 text-muted-foreground", single.status === "failed" && "text-destructive")}>{single.summary}</p>}
          <PreviewStrip preview={single.preview} />
        </>
      ) : (
        tools.map((t, i) => <ToolLine key={i} step={t} compact />)
      )}
    </Row>
  );
}

function PhaseList({ steps, live, now = 0, startedAt = 0, status, sections, list = PHASES }: { steps: BuildStep[]; live: boolean; now?: number; startedAt?: number; status?: string | null; sections?: string[]; list?: Phase[] }) {
  const { phases, thinking, thinkingAfter } = readPhases(steps, live, list);
  const idle = live && !phases.some((p) => p.status === "active");
  const label = thinking || steps.length ? "Thinking" : status || "Starting";
  const rows: ReactNode[] = [];
  if (idle && thinkingAfter < 0) rows.push(<ThinkingRow key="thinking" label={label} thought={thinking} last={false} />);
  phases.forEach((v, i) => {
    rows.push(<PhaseRow key={v.phase.id} view={v} last={i === phases.length - 1 && !(idle && thinkingAfter === i)} live={live} now={now} startedAt={startedAt} sections={sections} />);
    if (idle && thinkingAfter === i) rows.push(<ThinkingRow key="thinking" label={label} thought={thinking} last={i === phases.length - 1} />);
  });
  return <ol>{rows}</ol>;
}

function StepList({ steps, live }: { steps: BuildStep[]; live: boolean }) {
  const rows: ReactNode[] = [];
  let thoughts: ThoughtStep[] = [];
  const tools = steps.filter((s): s is ToolStep => s.kind === "tool");
  steps.forEach((s, i) => {
    if (s.kind === "thought") {
      thoughts.push(s);
      return;
    }
    if (s.kind !== "tool") return;
    const before = thoughts;
    thoughts = [];
    rows.push(
      <Row key={i} icon={<StatusIcon status={s.status} />} last={s === tools[tools.length - 1] && !(live && s.status !== "running")}>
        {!live && before.map((t, j) => <ThoughtToggle key={j} thought={t} />)}
        <ToolLine step={s} />
      </Row>,
    );
  });
  const running = tools.some((t) => t.status === "running");
  if (live && !running) rows.push(<ThinkingRow key="thinking" label="Thinking" thought={thoughts[thoughts.length - 1] ?? null} last />);
  return <ol>{rows}</ol>;
}

/** The turn while it runs: phases for a generate turn, steps for an edit, a live clock. */
export function LiveTurnCard({ live, sections, phases = PHASES, copy = EMAIL_COPY }: { live: Pick<EmailLiveTurn, "kind" | "status" | "error" | "steps" | "startedAt">; sections: string[]; phases?: Phase[]; copy?: TurnCopy }) {
  const running = live.status !== null && !live.error;
  const now = useNow(running);
  const generate = live.kind === "generate";
  return (
    <div className="w-full overflow-hidden rounded-xl border bg-background shadow-xs animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="flex items-center justify-between gap-3 border-b px-3.5 py-2.5">
        <span className="text-sm font-medium">{generate ? copy.generating : copy.editing}</span>
        <span className="num text-xs text-muted-foreground">{clock(now - live.startedAt)}</span>
      </div>
      <div className="px-3.5 py-3">
        {generate ? <PhaseList steps={live.steps} live={running} now={now} startedAt={live.startedAt} status={live.status} sections={sections} list={phases} /> : <StepList steps={live.steps} live={running} />}
      </div>
    </div>
  );
}

/** A finished turn, folded to one line ("Wrote the email in 1m 12s"); opens to its steps. */
export function DoneTurnCard({ steps, phases = PHASES, copy = EMAIL_COPY }: { steps: BuildStep[]; phases?: Phase[]; copy?: TurnCopy }) {
  const [open, setOpen] = useState(false);
  const tools = steps.filter((s): s is ToolStep => s.kind === "tool");
  if (tools.length === 0) return null;
  const wrote = tools.some((t) => copy.writeTools.includes(t.name));
  const total = turnLength(steps);
  const failed = tools.some((t) => t.status === "failed");
  const label = wrote ? (total >= 1000 ? `${copy.wrote} in ${clock(total)}` : copy.wrote) : total >= 1000 ? `Worked for ${clock(total)}` : copy.worked;
  return (
    <div className="w-full overflow-hidden rounded-xl border bg-background/70">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground" aria-expanded={open}>
        <Check className="size-3.5 text-emerald-600" strokeWidth={2.5} />
        <span className="text-foreground/80">{label}</span>
        <span className="ml-1">
          {tools.length} step{tools.length === 1 ? "" : "s"}
          {failed ? ", some retried" : ""}
        </span>
        <ChevronDown className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t px-3.5 py-3">{wrote ? <PhaseList steps={steps} live={false} list={phases} /> : <StepList steps={steps} live={false} />}</div>}
    </div>
  );
}
