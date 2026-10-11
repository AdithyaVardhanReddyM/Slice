"use client";

import { ArrowUp, ChevronDown, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import type { Build, Variant } from "@/lib/pages/types";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusDot, TraceList } from "../shared";
import type { LiveTurn } from "./use-builder";

function Steps({ spans, open: openDefault = false, label }: { spans: LiveTurn["spans"]; open?: boolean; label: string }) {
  const [open, setOpen] = useState(openDefault);
  if (spans.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border bg-background/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground" aria-expanded={open}>
        <span>
          {label} · {spans.length} step{spans.length === 1 ? "" : "s"}
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

export function BuilderChat({
  build,
  live,
  variants,
  activeVariant,
  onSend,
  onStop,
  disabled,
}: {
  build: Build | null | undefined;
  live: LiveTurn | null;
  variants: Variant[];
  activeVariant: Variant | null;
  onSend: (text: string) => void;
  onStop: () => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const messages = build?.messages ?? [];
  const variantName = (id?: string) => variants.find((v) => v._id === id)?.name;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, live?.text, live?.spans.length, live?.status]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !live && (
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Nothing built yet.</p>
            <p className="mt-1">
              Press <span className="text-foreground">Generate all versions</span> to have the agent write every version from the brief and each audience&apos;s taste profile. Then
              ask for changes here: “make the hero warmer”, “swap the second item for the gift set”, “add an FAQ about shipping”.
            </p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.role === "merchant";
          return (
            <div key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
              <div className={cn("max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap", mine ? "bg-foreground text-background" : "bg-muted")}>
                {m.text}
              </div>
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                {m.variantId && variantName(m.variantId) && (
                  <span className="inline-flex items-center gap-1">
                    <StatusDot status={variants.find((v) => v._id === m.variantId)?.status ?? "ready"} /> {variantName(m.variantId)}
                  </span>
                )}
                <span>
                  {new Date(m.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              {!mine && m.trace && m.trace.length > 0 && (
                <div className="w-[90%]">
                  <Steps spans={m.trace} label="How this was decided" />
                </div>
              )}
            </div>
          );
        })}
        {live && (
          <>
            {live.prompt && (
              <div className="flex flex-col items-end gap-1">
                <div className="max-w-[90%] rounded-xl bg-foreground px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-background">{live.prompt}</div>
              </div>
            )}
            <div className="flex flex-col items-start gap-1">
              <div className="w-[90%] rounded-xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
                {live.error ? (
                  <p className="text-destructive">{live.error}</p>
                ) : (
                  <>
                    {live.text && <p className="whitespace-pre-wrap">{live.text}</p>}
                    {live.status && (
                      <p className={cn("flex items-center gap-2 text-muted-foreground", live.text && "mt-2")}>
                        <Spinner className="size-3.5" />
                        {live.status}
                      </p>
                    )}
                  </>
                )}
                <Steps spans={live.spans} open label={live.kind === "generate" ? `Building ${variantName(live.variantId) ?? "version"}` : "Working"} />
              </div>
            </div>
          </>
        )}
      </div>
      <form onSubmit={submit} className="border-t p-3">
        <div className="rounded-xl border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={activeVariant ? `Change the ${activeVariant.name} version…` : "Pick a version first"}
            className="min-h-0 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            disabled={!activeVariant}
          />
          <div className="flex items-center justify-between px-2 pb-2 text-xs text-muted-foreground">
            <span className="truncate">
              {activeVariant ? (
                <>
                  Editing <span className="text-foreground">{activeVariant.name}</span> · Enter to send
                </>
              ) : (
                "No version selected"
              )}
            </span>
            {disabled ? (
              <Button type="button" size="icon-sm" variant="outline" onClick={onStop} aria-label="Stop">
                <Square />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" disabled={!draft.trim() || !activeVariant} aria-label="Send">
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
