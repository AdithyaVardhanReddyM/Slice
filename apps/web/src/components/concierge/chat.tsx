"use client";

import { ArrowUp, ChevronDown, Fingerprint, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";
import { Trace } from "./trace";
import type { Message, PageContext, StoreInfo, TasteProfile } from "./types";
import { Button, SliceMark } from "./ui";

export function Chat({
  store,
  profile,
  page,
  messages,
  busy,
  onSend,
  onOpenTaste,
  onTune,
  onClose,
  onNavigate,
  inIframe,
}: {
  store: StoreInfo | null;
  profile: TasteProfile | null;
  page: PageContext | null;
  messages: Message[];
  busy: boolean;
  onSend: (text: string) => void;
  onOpenTaste: () => void;
  onTune: () => void;
  onClose: () => void;
  onNavigate: (url: string) => void;
  inIframe: boolean;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const styleLabels = Object.fromEntries((store?.styles ?? []).map((s) => [s.id, s.label]));
  const topStyle = profile?.brief?.styles?.[0]?.id ?? profile?.hints.styles[0]?.id;

  // Follow the conversation.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    onSend(text);
  }

  const suggestions = suggest(store, page, profile, messages);

  return (
    <div className="flex h-full flex-col">
      <div className="sun-rule" />
      <header className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
          <SliceMark size={18} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold leading-tight">{store?.name ?? "Concierge"}</p>
            <p className="truncate text-[11.5px] leading-tight text-[var(--mute)]">Concierge · picks by taste, not trend</p>
          </div>
        </div>
        {profile ? (
          <button
            type="button"
            onClick={onOpenTaste}
            className="inline-flex h-8 max-w-[150px] items-center gap-1.5 rounded-full bg-[var(--sun-soft)] px-2.5 text-[12px] font-medium hover:bg-[var(--sun)]"
            title="Your taste profile"
          >
            <Fingerprint className="size-3.5 shrink-0" />
            <span className="truncate">{topStyle ? styleLabels[topStyle] ?? topStyle : "Your taste"}</span>
          </button>
        ) : (
          <Button variant="secondary" size="sm" onClick={onTune}>
            <SlidersHorizontal className="size-3.5" /> Tune to my taste
          </Button>
        )}
        {inIframe && (
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        )}
      </header>

      <div ref={listRef} className="scroll flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="px-1 pt-8 text-center text-[13px] text-[var(--mute)]">
            <div className="dots mx-auto">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <ol className="space-y-4">
          {messages.map((m) => (
            <li key={m.id}>
              {m.role === "shopper" ? (
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--ink)] px-3.5 py-2 text-[13.5px] leading-snug text-white">
                    {m.text}
                  </p>
                </div>
              ) : (
                <ConciergeMessage m={m} styleLabels={styleLabels} onNavigate={onNavigate} hasProfile={!!profile} />
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-[var(--line)] p-2.5">
        {suggestions.length > 0 && !busy && (
          <div className="scroll mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSend(s)}
                className="shrink-0 rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[12.5px] hover:border-[var(--ink)]"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-white p-1.5 pl-3.5 focus-within:border-[var(--ink)]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={profile ? "Ask for anything, or tell me something you love…" : "What are you looking for?"}
            className="max-h-28 min-h-[36px] flex-1 bg-transparent py-2 text-[13.5px] leading-snug outline-none"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-white transition-opacity disabled:opacity-30"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function ConciergeMessage({
  m,
  styleLabels,
  onNavigate,
  hasProfile,
}: {
  m: Message;
  styleLabels: Record<string, string>;
  onNavigate: (url: string) => void;
  hasProfile: boolean;
}) {
  const [showTrace, setShowTrace] = useState(false);
  const hasText = m.text.trim().length > 0;
  return (
    <div className="space-y-2.5">
      {m.streaming && !hasText && (
        <p className="flex items-center gap-2 text-[13px] text-[var(--mute)]">
          <span className="dots">
            <span />
            <span />
            <span />
          </span>
          {m.status ?? "Thinking"}
        </p>
      )}
      {m.picks && m.picks.length > 0 && (
        <div className="space-y-2">
          {m.picks.map((p) => (
            <ProductCard
              key={p.product.id}
              pick={p}
              styleLabels={styleLabels}
              onOpen={onNavigate}
              showFit={hasProfile}
            />
          ))}
        </div>
      )}
      {hasText && (
        <p className="whitespace-pre-wrap px-1 text-[14px] leading-relaxed">
          {m.text}
          {m.streaming && <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-[var(--tang)] align-middle" />}
        </p>
      )}
      {m.streaming && hasText && m.status && (
        <p className="px-1 text-[12px] text-[var(--mute)]">{m.status}…</p>
      )}
      {m.error && <p className="rounded-xl bg-[var(--qloo-soft)] px-3 py-2 text-[12.5px] text-[var(--qloo)]">{m.error}</p>}
      {!m.streaming && m.trace && m.trace.length > 0 && (
        <div className="px-1">
          <button
            type="button"
            onClick={() => setShowTrace((s) => !s)}
            aria-expanded={showTrace}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--mute)] hover:text-[var(--ink)]"
          >
            How I chose {m.picks?.length ? "these" : "this"}
            {m.totalMs ? <span className="font-normal">· {(m.totalMs / 1000).toFixed(1)}s</span> : null}
            <ChevronDown className={cn("size-3.5 transition-transform", showTrace && "rotate-180")} />
          </button>
          {showTrace && (
            <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--cream)] p-3">
              <Trace spans={m.trace} totalMs={m.totalMs} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function suggest(store: StoreInfo | null, page: PageContext | null, profile: TasteProfile | null, messages: Message[]): string[] {
  if (messages.some((m) => m.streaming)) return [];
  const out: string[] = [];
  if (page?.product?.name) {
    out.push("Does this fit me?", "What goes with this?");
  }
  if (messages.length <= 1) {
    if (profile) out.push("Something for the weekend", "A gift for a friend like me");
    else out.push("Help me pick a gift", "What's good under $100?");
  } else {
    out.push("Show me more like these", "Something under $100");
  }
  const cats = store?.nav.map((g) => g.label) ?? [];
  if (cats[0]) out.push(`Browse ${cats[0].toLowerCase()}`);
  return out.slice(0, 4);
}
