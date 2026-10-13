"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Lock, Settings2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { usePagesModel } from "@/lib/pages/models";
import type { BuildStep } from "@/lib/pages/stream";
import { briefOf, type Audience, type BrandItem, type Build, type Span } from "@/lib/pages/types";
import { brandDomain } from "@/lib/pages/urls";
import { Button } from "@/components/ui/button";
import { useBrand } from "../brand-context";
import { BuildCanvas } from "./build-canvas";
import { BuilderChat } from "./chat";
import { useAttachmentUpload, type Attachment } from "./attachments";
import { PromptComposer, type ComposerHandle, type ComposerValue } from "./composer";
import { CanvasPlaceholder, ChatWelcome, EditorLayout, EditorTopbar } from "./editor-shell";
import type { Answer } from "./question-card";
import { PageSettingsSheet, type PageSettings } from "./settings-sheet";
import { recapOf, useCreatePage, usePlanPage, type ChatMessage, type Plan } from "./start-page";
import { newTurn, type LiveTurn } from "./use-builder";

const msgId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * /dashboard/pages/[brand]/new: an empty editor. The first prompt goes to the
 * planner, which either sets the page up (title, goal, offer, CTA, items and
 * who it is for, including new audiences described in words) or, when the
 * prompt leaves too much open, asks a question with options. After questions,
 * it recaps the page and waits for "Looks good, build it". Then the page is
 * created and the builder takes over on the page's own route.
 */
export function NewPageBuilder() {
  const brand = useBrand();
  const router = useRouter();
  const audiences = (useQuery(api.pagesAudiences.list, { brandId: brand._id }) ?? []) as Audience[];
  const items = useMemo(() => ((briefOf(brand)?.items ?? []) as BrandItem[]), [brand]);
  const planPage = usePlanPage(brand);
  const createPage = useCreatePage(brand);
  const composer = useRef<ComposerHandle>(null);
  const [settings, setSettings] = useState<Partial<PageSettings>>({ imageMode: "pexels" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turn, setTurn] = useState<LiveTurn | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [model, setModel] = usePagesModel();
  const upload = useAttachmentUpload();
  // The first prompt (and what came with it), every audience named so far, and a plan waiting on its go-ahead.
  const first = useRef<{ text: string; attachments: Attachment[] } | null>(null);
  const named = useRef<Set<string>>(new Set());
  const [pending, setPending] = useState<{ plan: Plan; trace: Span[] } | null>(null);

  const status = (text: string) => setTurn((t) => (t ? { ...t, status: text } : t));
  const fail = (err: unknown) => setTurn((t) => (t ? { ...t, status: null, error: String((err as Error).message ?? err).replace(/^Error: /, "") } : t));

  async function create(plan: Plan, trace: Span[], transcript: ChatMessage[]) {
    const head = first.current;
    if (!head) return;
    setTurn(newTurn({ variantId: "", kind: "plan", status: "Creating the page" }));
    setTitle(settings.title?.trim() || plan.title);
    try {
      const { slug } = await createPage(plan, trace, { text: head.text, attachments: head.attachments, settings, transcript, onStatus: status });
      status("Starting the builder");
      router.replace(`/dashboard/pages/${brand.slug}/${slug}?generate=1`);
    } catch (err) {
      fail(err);
    }
  }

  /** Plan from the conversation so far: ask the next question, recap for a go-ahead, or create. */
  async function plan(transcript: ChatMessage[]) {
    const head = first.current;
    if (!head) return;
    setTurn(newTurn({ variantId: "", kind: "plan", status: transcript.length > 1 ? "Thinking" : "Reading your brief" }));
    try {
      const out = await planPage({
        text: head.text,
        audienceIds: [...named.current],
        conversation: transcript.slice(1).map((m) => ({ role: m.role, text: m.text })),
        model,
      });
      if ("question" in out) {
        setMessages((m) => [...m, { id: msgId(), role: "agent", at: Date.now(), text: out.question.text, steps: [{ kind: "question", question: out.question }] satisfies BuildStep[], trace: out.trace }]);
        setTurn(null);
        return;
      }
      // Straight from the prompt: build. After questions: show what was decided first.
      const discussed = transcript.some((m) => m.role === "agent");
      if (!discussed) return create(out.plan, out.trace, transcript);
      setPending({ plan: out.plan, trace: out.trace });
      setTitle(settings.title?.trim() || out.plan.title);
      setMessages((m) => [
        ...m,
        {
          id: msgId(),
          role: "agent",
          at: Date.now(),
          text: "Here is the page I will build. Anything to change before I start?",
          steps: [{ kind: "plan", plan: recapOf(out.plan, settings), confirm: true }] satisfies BuildStep[],
          trace: out.trace,
        },
      ]);
      setTurn(null);
    } catch (err) {
      fail(err);
    }
  }

  /** The merchant's words: the first prompt, an answer, or a change to the recap. */
  function say(text: string, extra: { audienceIds?: string[]; attachments?: Attachment[] } = {}) {
    const clean = text.trim();
    if (!clean && !extra.attachments?.length) return;
    for (const id of extra.audienceIds ?? []) named.current.add(id);
    if (!first.current) first.current = { text: clean, attachments: extra.attachments ?? [] };
    setPending(null);
    const message: ChatMessage = { id: msgId(), role: "merchant", at: Date.now(), text: clean, ...(extra.attachments?.length ? { attachments: extra.attachments } : {}) };
    const transcript = [...messages, message];
    setMessages(transcript);
    void plan(transcript);
  }

  const submit = ({ text, mentions, attachments }: ComposerValue) => say(text, { audienceIds: mentions.map((a) => a._id), attachments });
  const answer = ({ text, audienceId }: Answer) => say(text, { audienceIds: audienceId ? [audienceId] : [] });
  const confirm = () => {
    if (pending) void create(pending.plan, pending.trace, messages);
  };

  const busy = !!turn && turn.status !== null;
  const started = messages.length > 0;
  const waiting = started && !turn;
  const label = turn?.status ?? (waiting ? (pending ? "Waiting for your go-ahead" : "Waiting for your answer") : null);

  return (
    <EditorLayout
      topbar={
        <EditorTopbar
          brand={brand}
          title={title ?? (settings.title?.trim() || "New page")}
          actions={
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 data-icon="inline-start" /> Settings
            </Button>
          }
        />
      }
      chat={
        <BuilderChat
          build={{ messages } as unknown as Build}
          live={turn}
          audiences={audiences}
          items={items}
          onAnswer={answer}
          onConfirmPlan={confirm}
          empty={<ChatWelcome brand={brand} audiences={audiences} onPick={(parts) => composer.current?.set(parts)} />}
          composer={
            <PromptComposer
              ref={composer}
              autoFocus
              brandSlug={brand.slug}
              audiences={audiences}
              placeholder={started ? "Answer, or tell me more…" : "Describe the page you want…"}
              disabled={busy}
              model={model}
              onModelChange={setModel}
              onUpload={upload}
              onSubmit={submit}
            />
          }
        />
      }
      canvas={
        <>
          {started ? (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
                <div className="grid h-10 shrink-0 grid-cols-[1fr_minmax(0,28rem)_1fr] items-center gap-2 border-b px-2">
                  <span />
                  <span className="flex h-6 min-w-0 items-center justify-center gap-1.5 rounded-md bg-muted px-3 text-xs text-muted-foreground">
                    <Lock className="size-3 shrink-0" />
                    <span className="truncate">
                      {brandDomain(brand.slug)}/{title ? "…" : ""}
                    </span>
                  </span>
                  <span />
                </div>
                <div className="relative min-h-0 flex-1">
                  <BuildCanvas mode="sketch" brand={brand} label={turn?.error ? null : label} startedAt={turn?.startedAt} />
                </div>
              </div>
            </div>
          ) : (
            <CanvasPlaceholder brand={brand} />
          )}
          <PageSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} brandSlug={brand.slug} initial={settings} draft onSave={(v) => setSettings(v)} />
        </>
      }
    />
  );
}
