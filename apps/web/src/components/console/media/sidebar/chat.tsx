"use client";

// The conversation with the agent, in the sidebar. The prompt bar docks under
// it, so this is only the thread: what was asked, what the agent did (its
// steps), and its answers and questions. Which conversation follows the
// selection (the canvas chat, a maker's spot, one item's own); a strip on top
// says whose it is. The editors' own agents show their threads with the same
// Thread.

import { Film, Image as ImageIcon, LayoutTemplate, MessagesSquare, X } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BuildStep } from "@/lib/pages/stream";
import type { Attachment } from "@/components/console/pages/builder/attachments";
import { AttachmentStrip } from "@/components/console/pages/builder/attachments";
import { StreamingText, ThinkingLine } from "@/components/console/pages/builder/build-card";
import { QuestionCard, type Answer } from "@/components/console/pages/builder/question-card";
import { PillText } from "@/components/console/email/editor/chat-composer";
import { DoneTurnCard, LiveTurnCard } from "@/components/console/email/editor/turn-card";
import { useCanvas, type ChatMessage } from "../canvas/context";
import { MEDIA_COPY, MEDIA_PHASES, type MediaAgent } from "../canvas/use-media-agent";
import { MAKER_NAME, type MakerKind } from "../canvas/model";
import { SUGGESTIONS, WHAT_IT_DOES } from "../focus/item-agent";
import { QuestionsCard } from "./questions-card";

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

/** The agent's questions in a saved turn, when it asked several at once. */
const questionsOf = (m: ChatMessage | undefined) => {
  if (m?.role !== "agent") return null;
  const step = ((m.steps ?? []) as BuildStep[]).find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
  return step?.question.questions?.length ? step.question : null;
};

const clock = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const MAKER_ICON: Record<MakerKind, ReactNode> = { image: <ImageIcon />, poster: <LayoutTemplate />, video: <Film /> };

const MAKER_HINT: Record<MakerKind, string> = {
  image: "Describe the image: the subject, the setting, the light and the mood. It lands in the spot on the canvas.",
  poster: "What is the poster for? An offer, a launch, an event. Slice may ask a couple of quick questions, then designs it in the spot on the canvas.",
  video: "What is the video about? Slice may ask about music and voice first, then plans the shots, text and sound, and builds it in the spot on the canvas.",
};

const tip = "rounded-xl bg-neutral-50 p-4 text-sm leading-6 text-neutral-600 ring-1 ring-black/[0.04]";

/** The sidebar's conversation, as the selection decides. */
export function ChatThread() {
  const { agent, thread, threadMessages, threadLoaded, send, compose, select } = useCanvas();
  const maker: MakerKind | null = thread.kind === "draft" ? (thread.spot?.kind ?? thread.node.ghost?.kind ?? null) : null;
  const empty =
    thread.kind === "item" ? (
      <div className="space-y-3">
        <p className="text-[13px] leading-5 text-neutral-600">{WHAT_IT_DOES[thread.noun]}</p>
        <div className="flex flex-col items-start gap-1.5">
          {SUGGESTIONS[thread.noun].map((s) => (
            <button key={s} type="button" onClick={() => compose(s)} className="rounded-full bg-neutral-100 px-3 py-1.5 text-left text-[13px] text-neutral-700 transition-colors hover:bg-neutral-200/70 hover:text-neutral-950">
              {s}
            </button>
          ))}
        </div>
      </div>
    ) : thread.kind === "draft" ? (
      <div className={tip}>{maker ? MAKER_HINT[maker] : "Say what to make; it lands in the spot on the canvas."}</div>
    ) : (
      <div className={tip}>Ask for anything: an image, a poster or a video ad. Or pick one in the toolbar to place it on the canvas first. Select something to open its own conversation.</div>
    );
  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-black/[0.06] px-4">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 [&_svg]:size-3.5">{thread.kind === "campaign" ? <MessagesSquare /> : maker ? MAKER_ICON[maker] : thread.kind === "item" ? MAKER_ICON[thread.noun === "video" ? "video" : thread.noun === "poster" ? "poster" : "image"] : <MessagesSquare />}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-neutral-900">{thread.kind === "campaign" ? "Campaign chat" : thread.kind === "draft" ? (thread.node.ghost ? MAKER_NAME[thread.node.ghost.kind] : thread.node.name) : thread.node.name}</span>
          <span className="block truncate text-[11px] text-neutral-500">{thread.kind === "campaign" ? "Everything on this canvas" : thread.kind === "draft" ? "Its own conversation" : `This ${thread.noun}'s own conversation`}</span>
        </span>
        {thread.kind !== "campaign" && (
          <button type="button" title="Back to the campaign chat" aria-label="Back to the campaign chat" onClick={() => select([])} className="flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900">
            <X className="size-4" />
          </button>
        )}
      </div>
      <Thread key={thread.kind === "campaign" ? "campaign" : thread.thread} agent={agent} messages={threadMessages} onAnswer={(t) => send(t)} className="pb-12" style={{ marginBottom: "calc(var(--dock-h, 120px) + 16px)" }} empty={threadLoaded ? empty : null} />
    </>
  );
}

/** One agent's conversation: the saved turns, then the live one. */
export function Thread({ agent, messages, onAnswer, empty, className, style }: { agent: MediaAgent; messages: ChatMessage[]; onAnswer: (text: string) => void; empty?: ReactNode; className?: string; style?: CSSProperties }) {
  const { scroller, content, pin } = useStickToBottom();
  const live = agent.live && !(agent.live.status === null && !agent.live.error && messages.length > agent.live.baseCount) ? agent.live : null;

  const answer = (a: Answer) => {
    pin();
    onAnswer(a.text);
  };

  const lastAgent = messages.length - 1;
  const liveQuestion = live?.steps.find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
  const liveReply = live?.steps.filter((s) => s.kind === "text").map((s) => (s as Extract<BuildStep, { kind: "text" }>).text).join("\n\n") ?? "";
  const lastStep = live?.steps[live.steps.length - 1];
  const liveThought = lastStep?.kind === "thought" ? lastStep : null;
  const running = !!live && live.status !== null && !live.error;
  const hasTools = !!live?.steps.some((s) => s.kind === "tool");
  const promptSaved = !!live && messages.slice(live.baseCount).some((m) => m.role === "merchant" && m.text.startsWith(live.prompt ?? "\u0000"));
  // A reply to a questions card shows in the card, not as a bubble of its own.
  const answeringCard = !!live && !promptSaved && !!questionsOf(messages[messages.length - 1]);

  return (
    <div ref={scroller} className="media-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain" style={style} data-board-scroll>
      <div ref={content} className={cn("space-y-5 px-4 pt-4", className)}>
        {messages.length === 0 && !live && empty}
        {messages.map((m, i) => {
          if (m.role === "merchant") return questionsOf(messages[i - 1]) ? null : <MerchantBubble key={m.id} text={m.text} attachments={m.attachments} time={clock(m.at)} />;
          const steps = (m.steps ?? []) as BuildStep[];
          const question = steps.find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
          const replies = steps.filter((s): s is Extract<BuildStep, { kind: "text" }> => s.kind === "text");
          const reply = replies.length ? replies.map((s) => s.text).join("\n\n") : m.text;
          const next = messages.slice(i + 1).find((x) => x.role === "merchant");
          const open = i === lastAgent && !live;
          return (
            <div key={m.id} className="flex flex-col items-start gap-2">
              <DoneTurnCard steps={steps} phases={MEDIA_PHASES} copy={MEDIA_COPY} />
              {question?.question.questions?.length ? (
                <QuestionsCard intro={question.question.text} questions={question.question.questions} answer={next?.text ?? (i === lastAgent && answeringCard ? live?.prompt : undefined)} onAnswer={open ? (t) => (pin(), onAnswer(t)) : undefined} />
              ) : question ? (
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
            {!!(live.prompt || live.attachments?.length) && !promptSaved && !answeringCard && <MerchantBubble text={live.prompt ?? ""} attachments={live.attachments} />}
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
              {liveQuestion?.question.questions?.length ? (
                <QuestionsCard intro={liveQuestion.question.text} questions={liveQuestion.question.questions} onAnswer={live.status === null ? (t) => (pin(), onAnswer(t)) : undefined} />
              ) : liveQuestion ? (
                <QuestionCard question={liveQuestion.question} onAnswer={live.status === null ? answer : undefined} audiences={[]} items={[]} />
              ) : (
                liveReply && <StreamingText text={liveReply} live={running} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
