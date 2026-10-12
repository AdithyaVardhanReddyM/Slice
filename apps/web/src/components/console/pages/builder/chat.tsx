"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Audience, Build, Variant } from "@/lib/pages/types";
import { Spinner } from "@/components/console/setup/atoms";
import { TraceList } from "../shared";
import { MentionText } from "./composer";
import { versionLabel } from "./preview";
import type { LiveTurn } from "./use-builder";

function Steps({ spans, open: openDefault = false, label }: { spans: LiveTurn["spans"]; open?: boolean; label: string }) {
  const [open, setOpen] = useState(openDefault);
  if (spans.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground"
        aria-expanded={open}
      >
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

function MerchantBubble({ text, audiences, children }: { text: string; audiences: Audience[]; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[88%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap">
        <MentionText text={text} audiences={audiences} />
      </div>
      {children}
    </div>
  );
}

/**
 * The builder conversation: the merchant's prompts on the right, the agent's
 * replies as plain text with their trace, and the live turn while it runs.
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
  }, [messages.length, live?.text, live?.spans.length, live?.status]);

  const time = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    // A warm glow rising behind the prompt box; messages scroll over it.
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
                  <MerchantBubble key={m.id} text={m.text} audiences={audiences}>
                    <span className="px-1 text-xs text-muted-foreground">{time(m.at)}</span>
                  </MerchantBubble>
                );
              }
              return (
                <div key={m.id} className="flex flex-col items-start gap-1.5">
                  {m.text && <p className="text-sm leading-6 whitespace-pre-wrap">{m.text}</p>}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {v && <span>{versionLabel(v)} version ·</span>}
                    <span>{time(m.at)}</span>
                  </div>
                  {m.trace && m.trace.length > 0 && (
                    <div className="w-full">
                      <Steps spans={m.trace} label="How this was decided" />
                    </div>
                  )}
                </div>
              );
            })}
            {live && (
              <>
                {live.prompt && <MerchantBubble text={live.prompt} audiences={audiences} />}
                <div className="flex flex-col items-start gap-1 text-sm leading-6">
                  {live.error ? (
                    <p className="text-destructive">{live.error}</p>
                  ) : (
                    <>
                      {live.text && <p className="whitespace-pre-wrap">{live.text}</p>}
                      {live.status && (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Spinner className="size-3.5" />
                          {live.status}
                        </p>
                      )}
                    </>
                  )}
                  <div className="w-full">
                    <Steps spans={live.spans} open label={live.kind === "generate" ? `Building the ${liveLabel ?? ""} version` : "Working"} />
                  </div>
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
