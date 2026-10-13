"use client";

import { AlertCircle, Check, ChevronDown, ChevronRight, Circle, Minus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BuildStep, StepPreview } from "@/lib/pages/stream";
import { Spinner } from "@/components/console/setup/atoms";
import {
  clock,
  cleanThought,
  draftColors,
  draftSections,
  readPhases,
  sectionLabel,
  turnLength,
  useNow,
  useTypewriter,
  type PhaseStatus,
  type PhaseView,
  type ThoughtStep,
  type ToolStep,
} from "./build-steps";
import type { Draft, LiveTurn } from "./use-builder";

/* Small pieces ------------------------------------------------------------------ */

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

/** A row on the turn's rail: icon on the line, content beside it. */
function Rail({ icon, last, children }: { icon: ReactNode; last?: boolean; children: ReactNode }) {
  return (
    <li className="relative pb-3 pl-6 last:pb-0">
      {!last && <span aria-hidden className="absolute top-5 bottom-0.5 left-[6.5px] w-px bg-border" />}
      <span className="absolute top-[3px] left-0">{icon}</span>
      {children}
    </li>
  );
}

function Thumb({ src, className }: { src: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  // Images come from the brand's site, Pexels and Qloo: many hosts.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setBroken(true)} className={cn("shrink-0 bg-muted object-cover", className)} />;
}

/** A Qloo face; gone entirely if its picture does not load. */
function Face({ name, image }: { name: string; image: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <span title={name} className="size-6 overflow-hidden rounded-full bg-muted ring-2 ring-background">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" onError={() => setBroken(true)} className="size-full object-cover" />
    </span>
  );
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
              <Face key={f.image} name={f.name} image={f.image} />
            ))}
          </span>
          <span className="truncate text-xs text-muted-foreground">{faces.slice(0, 3).map((f) => f.name).join(", ")}</span>
        </div>
      )}
      {images.length > 0 && (
        <div className="flex gap-1">
          {images.slice(0, 5).map((src) => (
            <Thumb key={src} src={src} className="h-9 w-12 rounded-md ring-1 ring-foreground/5" />
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

/** The live reasoning: typed out as it arrives, newest lines at the bottom. */
function ThoughtStream({ text }: { text: string }) {
  const shown = useTypewriter(cleanThought(text), true);
  if (!shown) return null;
  return (
    <div className={cn("mt-1 flex max-h-[7.5rem] flex-col justify-end overflow-hidden", shown.length > 360 && "[mask-image:linear-gradient(to_bottom,transparent,#000_2rem)]")}>
      <p className="text-xs leading-5 whitespace-pre-wrap text-muted-foreground">{shown}</p>
    </div>
  );
}

/** A finished thought, folded: "Thought for 11s". */
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

/** While write_page streams: the palette as the CSS lands, then each section as it is written. */
function DraftProgress({ draft }: { draft: Draft }) {
  const sections = draftSections(draft.html);
  const colors = draftColors(draft.css, 10);
  if (!sections.length) {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        {colors.length > 0 && (
          <span className="flex -space-x-1">
            {colors.map((c) => (
              <span key={c} className="size-4 rounded-full ring-2 ring-background animate-in zoom-in-50 duration-300" style={{ background: c }} />
            ))}
          </span>
        )}
        <span className="pg-shimmer text-xs">{draft.css ? "Setting the colours and type" : "Starting the page"}</span>
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {sections.map((id, i) => {
        const writing = i === sections.length - 1;
        return (
          <span
            key={id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 animate-in fade-in-0 zoom-in-95 duration-300",
              writing ? "border-foreground/15 bg-background" : "border-transparent bg-muted text-muted-foreground",
            )}
          >
            {!writing && <Check className="size-2.5" strokeWidth={3} />}
            <span className={cn(writing && "pg-shimmer")}>{sectionLabel(id)}</span>
          </span>
        );
      })}
    </div>
  );
}

/** One call in a phase with several (or an edit turn's step). */
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

function PhaseRow({ view, last, live, now, startedAt, draft }: { view: PhaseView; last: boolean; live: boolean; now: number; startedAt: number; draft?: Draft | null }) {
  const { phase, status, tools } = view;
  const active = status === "active";
  const single = tools.length === 1 ? tools[0] : null;
  const elapsed = active && view.t !== undefined ? now - startedAt - view.t : view.ms;
  return (
    <Rail icon={<StatusIcon status={status} />} last={last}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("text-sm leading-5", active ? "pg-shimmer" : status === "pending" || status === "skipped" ? "text-muted-foreground/70" : "text-foreground")}>{phase.label}</span>
        {elapsed !== undefined && elapsed >= 1000 && <span className="num shrink-0 text-xs text-muted-foreground/80">{clock(elapsed)}</span>}
      </div>
      {!live && view.thoughts.map((t, i) => <ThoughtToggle key={i} thought={t} />)}
      {single ? (
        <>
          {single.summary && <p className={cn("text-xs leading-5 text-muted-foreground", single.status === "failed" && "text-destructive")}>{single.summary}</p>}
          <PreviewStrip preview={single.preview} />
        </>
      ) : (
        tools.map((t, i) => <ToolLine key={i} step={t} compact />)
      )}
      {phase.id === "write" && active && draft && <DraftProgress draft={draft} />}
    </Rail>
  );
}

/** The agent between calls: what it is thinking, typed out. */
function ThinkingRow({ label, thought, last }: { label: string; thought: ThoughtStep | null; last: boolean }) {
  return (
    <Rail icon={<StatusIcon status="active" />} last={last}>
      <span className="pg-shimmer text-sm leading-5">{label}</span>
      {thought && <ThoughtStream key={thought.t} text={thought.text} />}
    </Rail>
  );
}

/* Generate: the phases ------------------------------------------------------------ */

function PhaseList({ steps, live, now = 0, startedAt = 0, status, draft }: { steps: BuildStep[]; live: boolean; now?: number; startedAt?: number; status?: string | null; draft?: Draft | null }) {
  const { phases, thinking, thinkingAfter } = readPhases(steps, live);
  // While nothing runs, show the thinking row after the last phase that started.
  const idle = live && !phases.some((p) => p.status === "active");
  const thinkingLabel = thinking ? "Thinking" : steps.length ? "Thinking" : status || "Starting";
  const rows: ReactNode[] = [];
  if (idle && thinkingAfter < 0) rows.push(<ThinkingRow key="thinking" label={thinkingLabel} thought={thinking} last={false} />);
  phases.forEach((v, i) => {
    rows.push(<PhaseRow key={v.phase.id} view={v} last={i === phases.length - 1 && !(idle && thinkingAfter === i)} live={live} now={now} startedAt={startedAt} draft={draft} />);
    if (idle && thinkingAfter === i) rows.push(<ThinkingRow key="thinking" label={thinkingLabel} thought={thinking} last={i === phases.length - 1} />);
  });
  return <ol>{rows}</ol>;
}

/* Edit: the steps in order ---------------------------------------------------------- */

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
      <Rail key={i} icon={<StatusIcon status={s.status} />} last={s === tools[tools.length - 1] && !(live && s.status !== "running")}>
        {!live && before.map((t, j) => <ThoughtToggle key={j} thought={t} />)}
        <ToolLine step={s} />
      </Rail>,
    );
  });
  const running = tools.some((t) => t.status === "running");
  if (live && !running) rows.push(<ThinkingRow key="thinking" label="Thinking" thought={thoughts[thoughts.length - 1] ?? null} last />);
  return <ol>{rows}</ol>;
}

/* Cards ------------------------------------------------------------------------------ */

/** The turn while it runs: phases for a build, steps for an edit, a live clock. */
export function LiveBuildCard({ live }: { live: LiveTurn }) {
  const running = live.status !== null && !live.error;
  const now = useNow(running);
  const generate = live.kind === "generate";
  const title = generate ? "Building your page" : live.draft ? "Rewriting the page" : "Working on your page";
  return (
    <div className="w-full overflow-hidden rounded-xl border bg-background shadow-xs animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="flex items-center justify-between gap-3 border-b px-3.5 py-2.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="num text-xs text-muted-foreground">{clock(now - live.startedAt)}</span>
      </div>
      <div className="px-3.5 py-3">
        {generate ? <PhaseList steps={live.steps} live={running} now={now} startedAt={live.startedAt} status={live.status} draft={live.draft} /> : <StepList steps={live.steps} live={running} />}
      </div>
    </div>
  );
}

/** A finished turn, folded to one line ("Built the page in 2m 14s"); opens to its steps. */
export function DoneBuildCard({ steps }: { steps: BuildStep[] }) {
  const [open, setOpen] = useState(false);
  const tools = steps.filter((s): s is ToolStep => s.kind === "tool");
  if (tools.length === 0) return null;
  const built = tools.some((t) => t.name === "write_page");
  const total = turnLength(steps);
  const failed = tools.some((t) => t.status === "failed");
  const label = built ? (total >= 1000 ? `Built the page in ${clock(total)}` : "Built the page") : total >= 1000 ? `Worked for ${clock(total)}` : "Worked on the page";
  return (
    <div className="w-full overflow-hidden rounded-xl border bg-background/70">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground" aria-expanded={open}>
        <Check className="size-3.5 text-emerald-600" strokeWidth={2.5} />
        <span className="text-foreground/80">{label}</span>
        <span>
          · {tools.length} step{tools.length === 1 ? "" : "s"}
          {failed ? ", some retried" : ""}
        </span>
        <ChevronDown className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t px-3.5 py-3">{built ? <PhaseList steps={steps} live={false} /> : <StepList steps={steps} live={false} />}</div>}
    </div>
  );
}

/** Before any call (or for a turn without calls): "Thinking", with the reasoning typed out. */
export function ThinkingLine({ label, thought }: { label: string; thought?: ThoughtStep | null }) {
  return (
    <div className="w-full py-1">
      <span className="pg-shimmer text-sm">{label}</span>
      {thought && <ThoughtStream key={thought.t} text={thought.text} />}
    </div>
  );
}

/** Typed-out reply while it streams. */
export function StreamingText({ text, live }: { text: string; live: boolean }) {
  const shown = useTypewriter(text, live, 90);
  return <p className="text-sm leading-6 whitespace-pre-wrap">{shown}</p>;
}
