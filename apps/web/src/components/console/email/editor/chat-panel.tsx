"use client";

// AI Chat: the conversation with the email agent. The merchant's messages
// (with the blocks they pointed at and any images), each agent turn folded to
// a line with its reply or question, the live turn while it runs, and the
// composer. Questions are answered by clicking an option.

import { MessagesSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { BuildStep } from "@/lib/pages/stream";
import { usePagesModel } from "@/lib/pages/models";
import type { BrandItem } from "@slice/backend/convex/pagesTypes";
import { AttachmentStrip, type Attachment } from "@/components/console/pages/builder/attachments";
import { StreamingText, ThinkingLine } from "@/components/console/pages/builder/build-card";
import { QuestionCard, type Answer } from "@/components/console/pages/builder/question-card";
import { useImageUpload } from "@/components/console/email/kit/use-upload";
import { ChatComposer, PillText } from "./chat-composer";
import { useEditorEnv, type ChatMessage } from "./context";
import { isFooterSection, sectionName } from "./model";
import { PanelHeader } from "./panel-ui";
import { DoneTurnCard, LiveTurnCard } from "./turn-card";

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

function AgentAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
      <MessagesSquare className="size-3.5" />
    </span>
  );
}

function MerchantBubble({ text, attachments, blocks, time }: { text: string; attachments?: Attachment[]; blocks?: { label: string }[]; time?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {attachments && attachments.length > 0 && <AttachmentStrip items={attachments} className="justify-end" size="sm" />}
      {text && (
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-neutral-100 px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap">
          <PillText text={text} blocks={blocks} />
        </div>
      )}
      {time && <span className="px-1 text-xs text-muted-foreground">{time}</span>}
    </div>
  );
}

const time = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function ChatPanel() {
  const { agent, messages, composer, editor, items, brand, audience } = useEditorEnv();
  const [model, setModel] = usePagesModel();
  const upload = useImageUpload();
  const { scroller, content, pin } = useStickToBottom();
  // A finished turn gives way to its saved messages as soon as they arrive.
  const live = agent.live && !(agent.live.status === null && !agent.live.error && messages.length > agent.live.baseCount) ? agent.live : null;
  const doc = editor.doc;

  const asItems: BrandItem[] = items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, description: i.description, price: i.price, image: i.image, url: i.url, tags: i.tags }));
  const answer = (a: Answer) => {
    pin();
    void agent.send(a.text);
  };

  const sections = (doc?.sections ?? []).filter((s) => !isFooterSection(s)).map((s, i) => sectionName(s, i));
  const blank = !doc || doc.sections.every((s) => s.columns.every((c) => c.blocks.every((b) => b.type === "logo" || b.type === "footer" || b.type === "social")));
  const who = audience?.name;
  const suggestions = blank
    ? [
        `A welcome email for new ${brand.name} subscribers`,
        "This week's new arrivals, picked for the audience",
        "An invitation to our next event",
      ]
    : [
        "Make the subject line shorter and warmer",
        who ? `Add a section of picks for ${who}` : "Add a section of picks by taste",
        "Rewrite the intro in our voice",
        "Tighten the copy so it reads well on phones",
      ];

  const lastAgent = messages.length - 1;
  const liveQuestion = live?.steps.find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
  const liveReply = live?.steps.filter((s) => s.kind === "text").map((s) => (s as Extract<BuildStep, { kind: "text" }>).text).join("\n\n") ?? "";
  const lastStep = live?.steps[live.steps.length - 1];
  const liveThought = lastStep?.kind === "thought" ? lastStep : null;
  const running = !!live && live.status !== null && !live.error;
  const hasTools = !!live?.steps.some((s) => s.kind === "tool");
  // The agent may save the merchant's message before its turn ends; then the live bubble would repeat it.
  const promptSaved = !!live && messages.slice(live.baseCount).some((m) => m.role === "merchant" && m.text === live.prompt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="AI Chat" subtitle="Ask for changes in your own words. Point at a block with Edit with AI." />
      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div ref={content} className="space-y-5 px-4 pt-1 pb-4">
          {messages.length === 0 && !live && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <AgentAvatar />
                <div className="rounded-2xl rounded-tl-md bg-neutral-100 px-3.5 py-2.5 text-sm leading-6">
                  {blank ? "What should this email say? Describe it and I will write it for your audience." : "Do you want to change anything?"}
                </div>
              </div>
              <div className="flex flex-col items-start gap-1.5 pl-9">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => composer.current?.set(s)}
                    className="rounded-full bg-white px-3 py-1.5 text-left text-xs text-neutral-700 ring-1 ring-black/[0.08] transition-colors hover:bg-neutral-50 hover:text-neutral-950"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m: ChatMessage, i) => {
            if (m.role === "merchant") return <MerchantBubble key={m.id} text={m.text} attachments={m.attachments} blocks={m.blocks} time={time(m.at)} />;
            const steps = (m.steps ?? []) as BuildStep[];
            const question = steps.find((s): s is Extract<BuildStep, { kind: "question" }> => s.kind === "question");
            const replies = steps.filter((s): s is Extract<BuildStep, { kind: "text" }> => s.kind === "text");
            const reply = replies.length ? replies.map((s) => s.text).join("\n\n") : m.text;
            const next = messages.slice(i + 1).find((x) => x.role === "merchant");
            const open = i === lastAgent && !live;
            return (
              <div key={m.id} className="flex flex-col items-start gap-2">
                <DoneTurnCard steps={steps} />
                {question ? (
                  <QuestionCard question={question.question} answer={next?.text} onAnswer={open ? answer : undefined} audiences={[]} items={asItems} />
                ) : (
                  reply && <p className="text-sm leading-6 whitespace-pre-wrap">{reply}</p>
                )}
                <span className="text-xs text-muted-foreground">{time(m.at)}</span>
              </div>
            );
          })}
          {live && (
            <>
              {(live.prompt || live.attachments?.length) && !promptSaved && <MerchantBubble text={live.prompt ?? ""} attachments={live.attachments} blocks={live.blocks} />}
              <div className="flex flex-col items-start gap-2 text-sm leading-6">
                {live.error ? (
                  <div className="w-full rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm">
                    <p className="text-destructive">{live.error}</p>
                    <button type="button" onClick={agent.dismissError} className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                      Dismiss
                    </button>
                  </div>
                ) : live.kind === "generate" || hasTools ? (
                  <LiveTurnCard live={live} sections={sections} />
                ) : (
                  running && !liveReply && !liveQuestion && <ThinkingLine label="Thinking" thought={liveThought} />
                )}
                {liveQuestion ? (
                  <QuestionCard question={liveQuestion.question} onAnswer={live.status === null ? answer : undefined} audiences={[]} items={asItems} />
                ) : (
                  liveReply && <StreamingText text={liveReply} live={running} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <div className={cn("shrink-0 px-3 pt-2 pb-2")}>
        <ChatComposer
          ref={composer}
          placeholder="Ask me anything"
          busy={agent.busy}
          onStop={agent.stop}
          model={model}
          onModelChange={setModel}
          onUpload={async (file) => ({ url: await upload(file), name: file.name, type: file.type })}
          onSubmit={({ text, attachments, blocks }) => {
            pin();
            void agent.send(text, attachments, blocks);
          }}
        />
        <p className="px-1 pt-2 text-center text-[11px] leading-4 text-muted-foreground">Slice can make mistakes. Check the email before you send it.</p>
      </div>
    </div>
  );
}
