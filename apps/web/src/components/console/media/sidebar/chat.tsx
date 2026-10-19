"use client";

// The conversation with the agent, in the sidebar. The prompt bar docks under
// it, so this is only the thread: what was asked, what the agent did (its
// steps), and its answers and questions.

import { useEffect, useRef } from "react";
import type { BuildStep } from "@/lib/pages/stream";
import type { Attachment } from "@/components/console/pages/builder/attachments";
import { AttachmentStrip } from "@/components/console/pages/builder/attachments";
import { StreamingText, ThinkingLine } from "@/components/console/pages/builder/build-card";
import { QuestionCard, type Answer } from "@/components/console/pages/builder/question-card";
import { PillText } from "@/components/console/email/editor/chat-composer";
import { DoneTurnCard, LiveTurnCard } from "@/components/console/email/editor/turn-card";
import { useCanvas } from "../canvas/context";
import { MEDIA_COPY, MEDIA_PHASES } from "../canvas/use-media-agent";

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

function MerchantBubble({ text, attachments, time }: { text: string; attachments?: Attachment[]; time?: string }) {
  // Prompt-bar turns carry the picks after the words; the bubble shows only what was typed.
  const words = text.replace(/\n\[Prompt bar:[^\]]*\]\s*$/, "");
  return (
    <div className="flex flex-col items-end gap-1">
      {attachments && attachments.length > 0 && <AttachmentStrip items={attachments} className="justify-end" size="sm" />}
      {words && (
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-neutral-100 px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap">
          <PillText text={words} />
        </div>
      )}
      {time && <span className="px-1 text-xs text-muted-foreground">{time}</span>}
    </div>
  );
}

const clock = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function ChatThread() {
  const { agent, messages, sendPrompt } = useCanvas();
  const { scroller, content, pin } = useStickToBottom();
  const live = agent.live && !(agent.live.status === null && !agent.live.error && messages.length > agent.live.baseCount) ? agent.live : null;

  const answer = (a: Answer) => {
    pin();
    sendPrompt(a.text);
  };

  const lastAgent = messages.length - 1;
  const liveQuestion = live?.steps.find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
  const liveReply = live?.steps.filter((s) => s.kind === "text").map((s) => (s as Extract<BuildStep, { kind: "text" }>).text).join("\n\n") ?? "";
  const lastStep = live?.steps[live.steps.length - 1];
  const liveThought = lastStep?.kind === "thought" ? lastStep : null;
  const running = !!live && live.status !== null && !live.error;
  const hasTools = !!live?.steps.some((s) => s.kind === "tool");
  const promptSaved = !!live && messages.slice(live.baseCount).some((m) => m.role === "merchant" && m.text.startsWith(live.prompt ?? "\u0000"));

  return (
    <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain" data-board-scroll>
      <div ref={content} className="space-y-5 px-4 pt-4 pb-[calc(var(--dock-h,120px)+20px)]">
        {messages.length === 0 && !live && (
          <div className="rounded-xl bg-neutral-50 p-4 text-sm leading-6 text-neutral-600 ring-1 ring-black/[0.04]">
            Ask for anything: an image, a poster, a clip, a video ad or music. Select things on the canvas first to change them or build from them.
          </div>
        )}
        {messages.map((m, i) => {
          if (m.role === "merchant") return <MerchantBubble key={m.id} text={m.text} attachments={m.attachments} time={clock(m.at)} />;
          const steps = (m.steps ?? []) as BuildStep[];
          const question = steps.find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
          const replies = steps.filter((s): s is Extract<BuildStep, { kind: "text" }> => s.kind === "text");
          const reply = replies.length ? replies.map((s) => s.text).join("\n\n") : m.text;
          const next = messages.slice(i + 1).find((x) => x.role === "merchant");
          const open = i === lastAgent && !live;
          return (
            <div key={m.id} className="flex flex-col items-start gap-2">
              <DoneTurnCard steps={steps} phases={MEDIA_PHASES} copy={MEDIA_COPY} />
              {question ? (
                <QuestionCard question={question.question} answer={next?.text} onAnswer={open ? answer : undefined} audiences={[]} items={[]} />
              ) : reply ? (
                <p className="text-sm leading-6 whitespace-pre-wrap">{reply}</p>
              ) : (
                !steps.some((s) => s.kind === "tool") && <p className="text-sm text-muted-foreground">Stopped before it finished.</p>
              )}
              <span className="text-xs text-muted-foreground">{clock(m.at)}</span>
            </div>
          );
        })}
        {live && (
          <>
            {!!(live.prompt || live.attachments?.length) && !promptSaved && <MerchantBubble text={live.prompt ?? ""} attachments={live.attachments} />}
            <div className="flex flex-col items-start gap-2 text-sm leading-6">
              {live.error ? (
                <div className="w-full rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm">
                  <p className="text-destructive">{live.error}</p>
                  <button type="button" onClick={agent.dismissError} className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                    Dismiss
                  </button>
                </div>
              ) : hasTools || live.kind === "generate" ? (
                <LiveTurnCard live={live} sections={[]} phases={MEDIA_PHASES} copy={MEDIA_COPY} />
              ) : (
                running && !liveReply && !liveQuestion && <ThinkingLine label="Thinking" thought={liveThought} />
              )}
              {liveQuestion ? <QuestionCard question={liveQuestion.question} onAnswer={live.status === null ? answer : undefined} audiences={[]} items={[]} /> : liveReply && <StreamingText text={liveReply} live={running} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
