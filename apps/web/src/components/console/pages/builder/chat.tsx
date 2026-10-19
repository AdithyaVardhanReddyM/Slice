"use client";

import { ChevronDown, FilePlus2, MousePointer2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BuildStep } from "@/lib/pages/stream";
import type { Audience, Build, BrandItem } from "@/lib/pages/types";
import { TraceList } from "../shared";
import { AttachmentStrip, type Attachment } from "./attachments";
import { DoneBuildCard, LiveBuildCard, StreamingText, ThinkingLine } from "./build-card";
import { MentionText } from "./composer";
import { PlanCard, QuestionCard, type Answer } from "./question-card";
import type { LiveTurn } from "./use-builder";

/* Timeline pieces -------------------------------------------------------------- */

function Steps({ spans, open: openDefault = false, label }: { spans: LiveTurn["spans"]; open?: boolean; label: string }) {
  const [open, setOpen] = useState(openDefault);
  if (spans.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border bg-background/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground" aria-expanded={open}>
        <span>
          {label} ({spans.length})
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t px-3 py-3">
          <TraceList spans={spans} compact />
        </div>
      )}
    </div>
  );
}

function MerchantBubble({ text, audiences, attachments, elements, children }: { text: string; audiences: Audience[]; attachments?: Attachment[]; elements?: { label: string }[]; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {attachments && attachments.length > 0 && <AttachmentStrip items={attachments} className="justify-end" />}
      {text && (
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap">
          <MentionText text={text} audiences={audiences} elements={elements} />
        </div>
      )}
      {children}
    </div>
  );
}

type Message = NonNullable<Build>["messages"][number];

/** A save from the visual editor: what the merchant changed by hand, one line each. */
function HandEditCard({ text, time }: { text: string; time: string }) {
  const lines = text.split("\n").filter(Boolean);
  const [open, setOpen] = useState(lines.length <= 3);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="w-[88%] rounded-2xl rounded-br-md border bg-background text-sm shadow-xs">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left" aria-expanded={open}>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <MousePointer2 className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">You edited the page by hand</span>
            <span className="block text-xs text-muted-foreground">
              {lines.length} change{lines.length === 1 ? "" : "s"} the builder keeps
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <ul className="space-y-1 border-t px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span className="min-w-0">{l}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="px-1 text-xs text-muted-foreground">{time}</span>
    </div>
  );
}

/** Keeps a scroller pinned to the bottom while its content grows, unless the reader scrolled up. */
function useStickToBottom() {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    };
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(inner);
    el.scrollTop = el.scrollHeight;
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);
  return { scroller, content, pin: () => (pinned.current = true) };
}

/**
 * The builder conversation: the merchant's prompts on the right, the agent's
 * turns (a folded card of what it did, then its reply, a question or the page
 * it set up) with their call trace, and the live turn while it runs.
 */
export function BuilderChat({
  build,
  live,
  audiences,
  items = [],
  empty,
  composer,
  onAnswer,
  onConfirmPlan,
}: {
  build: Build | null | undefined;
  live: LiveTurn | null;
  /** The brand's audiences, so "@Name" in messages shows as a pill and options show faces. */
  audiences: Audience[];
  /** The brand's items, for option and recap photos. */
  items?: BrandItem[];
  /** Shown when there are no messages yet. */
  empty: ReactNode;
  composer: ReactNode;
  /** Answers the open question (an option, or typed). */
  onAnswer?: (a: Answer) => void;
  /** The go-ahead for a plan waiting on it. */
  onConfirmPlan?: () => void;
}) {
  const messages = (build?.messages ?? []) as Message[];
  const { scroller, content, pin } = useStickToBottom();
  const answer = (a: Answer) => {
    pin();
    onAnswer?.(a);
  };

  const time = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const lastIndex = messages.length - 1;
  const liveQuestion = live?.steps.find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
  const liveReply = live?.steps.filter((s) => s.kind === "text").map((s) => (s as Extract<BuildStep, { kind: "text" }>).text).join("\n\n") ?? "";
  const liveThought = live?.steps.length && live.steps[live.steps.length - 1].kind === "thought" ? (live.steps[live.steps.length - 1] as Extract<BuildStep, { kind: "thought" }>) : null;
  const liveRunning = !!live && live.status !== null && !live.error;
  const liveHasTools = !!live?.steps.some((s) => s.kind === "tool");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(120%_170px_at_50%_100%,color-mix(in_oklab,var(--primary)_18%,transparent),color-mix(in_oklab,var(--color-amber-300)_12%,transparent)_45%,transparent_78%)]">
      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div ref={content} className="min-h-full">
          {messages.length === 0 && !live ? (
            empty
          ) : (
            <div className="space-y-5 p-4">
              {messages.map((m, i) => {
                if (m.role === "edit") return <HandEditCard key={m.id} text={m.text} time={time(m.at)} />;
                if (m.role === "merchant") {
                  return (
                    <MerchantBubble key={m.id} text={m.text} audiences={audiences} attachments={m.attachments as Attachment[] | undefined} elements={m.elements}>
                      <span className="px-1 text-xs text-muted-foreground">{time(m.at)}</span>
                    </MerchantBubble>
                  );
                }
                const steps = (m.steps ?? []) as BuildStep[];
                const question = steps.find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
                const plan = steps.find((s): s is Extract<BuildStep, { kind: "plan" }> => s.kind === "plan");
                const replySteps = steps.filter((s): s is Extract<BuildStep, { kind: "text" }> => s.kind === "text");
                const reply = replySteps.length ? replySteps.map((s) => s.text).join("\n\n") : m.text;
                const nextMerchant = messages.slice(i + 1).find((x) => x.role === "merchant");
                const open = i === lastIndex && !live;
                return (
                  <div key={m.id} className="flex flex-col items-start gap-2">
                    <DoneBuildCard steps={steps} />
                    {question ? (
                      <QuestionCard question={question.question} answer={nextMerchant?.text} onAnswer={open ? answer : undefined} audiences={audiences} items={items} />
                    ) : (
                      reply && <p className="text-sm leading-6 whitespace-pre-wrap">{reply}</p>
                    )}
                    {plan && (
                      <PlanCard
                        plan={plan.plan}
                        audiences={audiences}
                        items={items}
                        onConfirm={plan.confirm && open ? onConfirmPlan : undefined}
                        onChange={plan.confirm && open ? (text) => answer({ text }) : undefined}
                      />
                    )}
                    <span className="text-xs text-muted-foreground">{time(m.at)}</span>
                    {m.trace && m.trace.length > 0 && (
                      <div className="w-full">
                        <Steps spans={m.trace} label="Calls behind this turn" />
                      </div>
                    )}
                  </div>
                );
              })}
              {live && (
                <>
                  {(live.prompt || live.attachments?.length) && <MerchantBubble text={live.prompt ?? ""} audiences={audiences} attachments={live.attachments} elements={live.elements} />}
                  <div className="flex flex-col items-start gap-2 text-sm leading-6">
                    {live.error ? (
                      <p className="text-destructive">{live.error}</p>
                    ) : live.kind === "generate" || liveHasTools ? (
                      <LiveBuildCard live={live} />
                    ) : (
                      liveRunning && !liveReply && !liveQuestion && <ThinkingLine label={live.steps.length || live.kind !== "plan" ? "Thinking" : (live.status ?? "Thinking")} thought={liveThought} />
                    )}
                    {liveQuestion ? (
                      <QuestionCard question={liveQuestion.question} onAnswer={live.status === null ? answer : undefined} audiences={audiences} items={items} />
                    ) : (
                      liveReply && <StreamingText text={liveReply} live={liveRunning} />
                    )}
                    {live.handoff && live.status && (
                      <p className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground shadow-xs">
                        <FilePlus2 className="size-3.5 shrink-0" />
                        <span className="pg-shimmer">{live.handoff}</span>
                      </p>
                    )}
                    {live.spans.length > 0 && (
                      <div className="w-full">
                        <Steps spans={live.spans} label={live.kind === "generate" ? "Calls behind this build" : "Calls so far"} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="px-4 pt-2 pb-5">{composer}</div>
    </div>
  );
}
