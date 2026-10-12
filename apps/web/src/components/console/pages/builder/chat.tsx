"use client";

import { AlertCircle, Check, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BuildStep } from "@/lib/pages/stream";
import type { Audience, Build, Variant } from "@/lib/pages/types";
import { Spinner } from "@/components/console/setup/atoms";
import { TraceList } from "../shared";
import { AttachmentStrip, type Attachment } from "./attachments";
import { MentionText } from "./composer";
import { versionLabel } from "./preview";
import type { LiveTurn } from "./use-builder";

/* Timeline pieces -------------------------------------------------------------- */

const seconds = (ms?: number) => (ms && ms >= 1000 ? `${Math.round(ms / 1000)}s` : null);

/** Gemini's reasoning summary: a shimmering "Thinking" line while it streams, a folded note after. */
function ThoughtStep({ text, ms, live }: { text: string; ms?: number; live: boolean }) {
  const [open, setOpen] = useState(false);
  const body = text.replace(/\*\*/g, "").trim();
  if (live) {
    return (
      <div className="py-1">
        <span className="pg-shimmer text-sm">Thinking</span>
        {body && <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{body}</p>}
      </div>
    );
  }
  if (!body) return null;
  const label = seconds(ms) ? `Thought for ${seconds(ms)}` : "Thought";
  return (
    <div className="py-0.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-expanded={open}>
        <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
        {label}
      </button>
      {open && <p className="mt-1 pl-4 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">{body}</p>}
    </div>
  );
}

function ToolStep({ step }: { step: Extract<BuildStep, { kind: "tool" }> }) {
  const running = step.status === "running";
  const failed = step.status === "failed";
  return (
    <div className="flex items-start gap-2 py-0.5 text-sm">
      <span className="mt-1 flex size-3.5 shrink-0 items-center justify-center">
        {running ? <Spinner className="size-3" /> : failed ? <AlertCircle className="size-3.5 text-destructive" /> : <Check className="size-3.5 text-muted-foreground" />}
      </span>
      <span className="min-w-0 leading-5">
        <span className={cn(running ? "pg-shimmer" : "text-foreground")}>{step.label}</span>
        {step.summary && (
          <span className={cn("ml-1.5 text-muted-foreground", failed && "text-destructive")}>
            {step.summary}
          </span>
        )}
      </span>
    </div>
  );
}

/** The agent's turn as a timeline: thoughts, tool steps and text, in the order they happened. */
function Timeline({ steps, live }: { steps: BuildStep[]; live: boolean }) {
  return (
    <div className="space-y-0.5">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        if (s.kind === "thought") return <ThoughtStep key={i} text={s.text} ms={s.ms} live={live && last} />;
        if (s.kind === "tool") return <ToolStep key={i} step={s} />;
        return (
          <p key={i} className="py-1 text-sm leading-6 whitespace-pre-wrap">
            {s.text}
          </p>
        );
      })}
    </div>
  );
}

function Steps({ spans, open: openDefault = false, label }: { spans: LiveTurn["spans"]; open?: boolean; label: string }) {
  const [open, setOpen] = useState(openDefault);
  if (spans.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border bg-background/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground" aria-expanded={open}>
        <span>
          {label} · {spans.length} call{spans.length === 1 ? "" : "s"}
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

function MerchantBubble({ text, audiences, attachments, children }: { text: string; audiences: Audience[]; attachments?: Attachment[]; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {attachments && attachments.length > 0 && <AttachmentStrip items={attachments} className="justify-end" />}
      {text && (
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap">
          <MentionText text={text} audiences={audiences} />
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * The builder conversation: the merchant's prompts on the right, the agent's
 * turns as timelines (reasoning, tool steps, reply) with their call trace, and
 * the live turn while it runs.
 */
export function BuilderChat({
  build,
  live,
  variants,
  audiences,
  empty,
  composer,
}: {
  build: Build | null | undefined;
  live: LiveTurn | null;
  variants: Variant[];
  /** The brand's audiences, so "@Name" in messages shows as a pill. */
  audiences: Audience[];
  /** Shown when there are no messages yet. */
  empty: ReactNode;
  composer: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const messages = build?.messages ?? [];
  const variantOf = (id?: string) => variants.find((v) => v._id === id);
  const liveVariant = variantOf(live?.variantId);
  const liveLabel = liveVariant ? versionLabel(liveVariant) : null;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, live?.text, live?.spans.length, live?.status, live?.steps.length]);

  const time = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const liveHasReply = !!live?.steps.some((s) => s.kind === "text");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(120%_170px_at_50%_100%,color-mix(in_oklab,var(--primary)_18%,transparent),color-mix(in_oklab,var(--color-amber-300)_12%,transparent)_45%,transparent_78%)]">
      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {messages.length === 0 && !live ? (
          empty
        ) : (
          <div className="space-y-5 p-4">
            {messages.map((m) => {
              const v = variantOf(m.variantId);
              if (m.role === "merchant") {
                return (
                  <MerchantBubble key={m.id} text={m.text} audiences={audiences} attachments={m.attachments as Attachment[] | undefined}>
                    <span className="px-1 text-xs text-muted-foreground">{time(m.at)}</span>
                  </MerchantBubble>
                );
              }
              const steps = (m.steps ?? []) as BuildStep[];
              const hasReplyStep = steps.some((s) => s.kind === "text");
              return (
                <div key={m.id} className="flex flex-col items-start gap-1.5">
                  {steps.length > 0 && (
                    <div className="w-full">
                      <Timeline steps={steps} live={false} />
                    </div>
                  )}
                  {m.text && !hasReplyStep && <p className="text-sm leading-6 whitespace-pre-wrap">{m.text}</p>}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {v && <span>{versionLabel(v)} version ·</span>}
                    <span>{time(m.at)}</span>
                  </div>
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
                {(live.prompt || live.attachments?.length) && <MerchantBubble text={live.prompt ?? ""} audiences={audiences} attachments={live.attachments} />}
                <div className="flex flex-col items-start gap-1 text-sm leading-6">
                  {live.error ? (
                    <p className="text-destructive">{live.error}</p>
                  ) : (
                    <div className="w-full">
                      {live.steps.length > 0 && <Timeline steps={live.steps} live />}
                      {live.status && !liveHasReply && (
                        <p className={cn("flex items-center gap-2 py-1", live.steps.length === 0 ? "text-muted-foreground" : "text-xs text-muted-foreground")}>
                          <span className="pg-shimmer">{live.status}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {live.spans.length > 0 && (
                    <div className="w-full">
                      <Steps spans={live.spans} label={live.kind === "generate" ? `Building the ${liveLabel ?? ""} version` : "Calls so far"} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="px-4 pt-2 pb-5">{composer}</div>
    </div>
  );
}
