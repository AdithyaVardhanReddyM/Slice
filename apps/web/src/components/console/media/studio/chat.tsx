"use client";

// The studio chat: ask for changes in your own words. Messages carry what is
// selected (layers, a shot, the time), so "make this bigger" or "warmer light
// here" lands on the right thing. Attachments join the campaign library.

import { MessagesSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import type { BuildStep } from "@/lib/pages/stream";
import { usePagesModel } from "@/lib/pages/models";
import { useMediaUpload } from "@/lib/media/upload";
import { AttachmentStrip, type Attachment } from "@/components/console/pages/builder/attachments";
import { StreamingText, ThinkingLine } from "@/components/console/pages/builder/build-card";
import { QuestionCard, type Answer } from "@/components/console/pages/builder/question-card";
import { ChatComposer, PillText } from "@/components/console/email/editor/chat-composer";
import { DoneTurnCard, LiveTurnCard } from "@/components/console/email/editor/turn-card";
import { useStudio } from "./context";
import { MEDIA_COPY, MEDIA_PHASES, type MediaSelection } from "./use-media-agent";

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

function AgentAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
      <MessagesSquare className="size-3.5" />
    </span>
  );
}

function MerchantBubble({ text, attachments, time }: { text: string; attachments?: Attachment[]; time?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {attachments && attachments.length > 0 && <AttachmentStrip items={attachments} className="justify-end" size="sm" />}
      {text && (
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-neutral-100 px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap">
          <PillText text={text} />
        </div>
      )}
      {time && <span className="px-1 text-xs text-muted-foreground">{time}</span>}
    </div>
  );
}

const clock = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function MediaChat() {
  const { campaignId, agent, messages, composer, creative, creatives, doc, selection, playback } = useStudio();
  const [model, setModel] = usePagesModel();
  const upload = useMediaUpload(campaignId);
  const { scroller, content, pin } = useStickToBottom();
  const live = agent.live && !(agent.live.status === null && !agent.live.error && messages.length > agent.live.baseCount) ? agent.live : null;

  const sel = (): MediaSelection => ({
    creativeId: creative?._id,
    ...(selection.kind === "layers" ? { layerIds: selection.ids } : {}),
    ...(selection.kind === "clip" ? { clipId: selection.id } : {}),
    ...(doc?.kind === "video" ? { time: Math.round(playback.time * 10) / 10 } : {}),
  });
  const answer = (a: Answer) => {
    pin();
    void agent.send(a.text, [], sel());
  };

  const video = doc?.kind === "video";
  const suggestions = !creatives.length
    ? ["Make the posters and videos for every audience", "Start with one 15-second story video", "Just posters for now, at the lowest cost"]
    : video
      ? ["Make the opening shot more striking", "Add a voiceover in our brand voice", "Tighten it to 10 seconds", "Make a square cut for the feed"]
      : ["Make the headline punchier", "Try a bolder layout", "Use a product photo as the hero", "Make a version for print with a QR code"];

  const lastAgent = messages.length - 1;
  const liveQuestion = live?.steps.find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
  const liveReply = live?.steps.filter((s) => s.kind === "text").map((s) => (s as Extract<BuildStep, { kind: "text" }>).text).join("\n\n") ?? "";
  const lastStep = live?.steps[live.steps.length - 1];
  const liveThought = lastStep?.kind === "thought" ? lastStep : null;
  const running = !!live && live.status !== null && !live.error;
  const hasTools = !!live?.steps.some((s) => s.kind === "tool");
  const promptSaved = !!live && messages.slice(live.baseCount).some((m) => m.role === "merchant" && m.text === live.prompt);
  const names = creatives.map((c) => c.name);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div ref={content} className="space-y-5 px-4 pt-4 pb-4">
          {messages.length === 0 && !live && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <AgentAvatar />
                <div className="rounded-2xl rounded-tl-md bg-neutral-100 px-3.5 py-2.5 text-sm leading-6">
                  {creatives.length ? "What should change? Select something first and I will work on exactly that." : "Tell me what to make, or press Generate and I will design every creative from the brief."}
                </div>
              </div>
              <div className="flex flex-col items-start gap-1.5 pl-9">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => composer.current?.set(s)} className="rounded-full bg-white px-3 py-1.5 text-left text-xs text-neutral-700 ring-1 ring-black/[0.08] transition-colors hover:bg-neutral-50 hover:text-neutral-950">
                    {s}
                  </button>
                ))}
              </div>
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
                {question ? <QuestionCard question={question.question} answer={next?.text} onAnswer={open ? answer : undefined} audiences={[]} items={[]} /> : reply && <p className="text-sm leading-6 whitespace-pre-wrap">{reply}</p>}
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
                ) : live.kind === "generate" || hasTools ? (
                  <LiveTurnCard live={live} sections={names} phases={MEDIA_PHASES} copy={MEDIA_COPY} />
                ) : (
                  running && !liveReply && !liveQuestion && <ThinkingLine label="Thinking" thought={liveThought} />
                )}
                {liveQuestion ? <QuestionCard question={liveQuestion.question} onAnswer={live.status === null ? answer : undefined} audiences={[]} items={[]} /> : liveReply && <StreamingText text={liveReply} live={running} />}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="shrink-0 px-3 pt-2 pb-2">
        <ChatComposer
          ref={composer}
          placeholder={selection.kind === "none" ? "Ask for a change" : "Ask about the selection"}
          busy={agent.busy}
          onStop={agent.stop}
          model={model}
          onModelChange={setModel}
          onUpload={async (file) => {
            const up = await upload(file, { accept: ["image"] });
            return { url: up.url ?? "", name: file.name, type: file.type };
          }}
          onSubmit={({ text, attachments }) => {
            pin();
            void agent.send(text, attachments, sel());
          }}
        />
        <p className="px-1 pt-2 text-center text-[11px] leading-4 text-muted-foreground">Chat turns use an LLM; studio buttons call the models directly.</p>
      </div>
    </div>
  );
}
