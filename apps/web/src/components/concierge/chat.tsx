"use client";

import { ArrowUp, ChevronDown, Eye, Minus, UserStar } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PicksRail } from "./product-card";
import { WhyThese } from "./why-these";
import type { Message, PageContext, StoreInfo, TasteProfile } from "./types";
import { SliceMark } from "./ui";

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
  onNavigate: (url: string, productId?: string) => void;
  inIframe: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const styleLabels = Object.fromEntries(
    (store?.styles ?? []).map((s) => [s.id, s.label]),
  );
  const topStyle =
    profile?.brief?.styles?.[0]?.id ?? profile?.hints.styles[0]?.id;

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
    <div className="flex h-full flex-col bg-[var(--paper)]">
      <div className="relative min-h-0 flex-1">
        <header
          className={cn(
            "sky-header flex items-center justify-between",
            scrolled && "is-scrolled",
          )}
        >
          <TasteButton
            hasProfile={!!profile}
            storeKey={store?.key ?? "store"}
            onOpenTaste={onOpenTaste}
            onTune={onTune}
          />
          <div className="flex min-w-0 items-center gap-2 px-2">
            {store?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo} alt="" className="size-[22px] object-contain" />
            ) : null}
            <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">
              {store?.name ?? "Concierge"}
            </p>
          </div>
          {inIframe ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              className="orb"
            >
              <Minus className="size-[18px]" />
            </button>
          ) : (
            <span className="size-10" aria-hidden />
          )}
        </header>

        <div
          ref={listRef}
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
          className="scroll isolate h-full overflow-y-auto overscroll-none px-3 pb-3"
        >
          <div className="sky-hero -mx-3 mb-1 px-4 pb-5">
            <h1 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">
              Hi there!
              <br />
              What can I find for you?
            </h1>
            <p className="mt-2 text-[13.5px] leading-snug text-[var(--ink-2)]">
              {profile ? (
                <>
                  Picks tuned to your taste
                  {topStyle ? (
                    <>
                      , leaning{" "}
                      <span className="font-medium text-[var(--tang-ink)]">
                        {styleLabels[topStyle] ?? topStyle}
                      </span>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                "Choose a prompt or ask in your own words."
              )}
            </p>
          </div>
          {messages.length === 0 && (
            <div className="px-1 pt-4 text-center text-[13px] text-[var(--mute)]">
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
                  <ConciergeMessage
                    storeName={store?.name ?? "the store"}
                    m={m}
                    styleLabels={styleLabels}
                    onNavigate={onNavigate}
                    hasProfile={!!profile}
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="composer px-3 pb-3 pt-1">
        {suggestions.length > 0 && !busy && !draft && (
          <div className="chip-row scroll -mx-3 mb-2.5 flex gap-1.5 overflow-x-auto px-3">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSend(s)}
                className="suggest"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="composer-box"
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
            aria-label="Message"
            placeholder={
              profile
                ? "Ask anything, or tell me something you love…"
                : "What are you looking for?"
            }
            className="block max-h-32 min-h-[24px] w-full bg-transparent px-1 text-[14px] leading-[1.45] outline-none"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              {page?.product?.name ? (
                <span
                  className="context-chip"
                  title="The concierge can see the product you're viewing"
                >
                  <Eye className="size-3.5 shrink-0" />
                  <span className="truncate">{page.product.name}</span>
                </span>
              ) : profile ? (
                <button
                  type="button"
                  onClick={onOpenTaste}
                  className="context-chip hover:bg-[var(--cream-2)]"
                  title="Your taste profile"
                >
                  <UserStar className="size-3.5 shrink-0" />
                  <span className="truncate">
                    Tuned to{" "}
                    {topStyle
                      ? (styleLabels[topStyle] ?? topStyle)
                      : "your taste"}
                  </span>
                </button>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              aria-label="Send"
              className="send-btn"
            >
              <ArrowUp className="size-[17px]" strokeWidth={2.4} />
            </button>
          </div>
        </form>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[var(--mute)]">
          <SliceMark size={11} />
          Powered by Slice
        </p>
      </div>
    </div>
  );
}

/**
 * The shopper's taste profile lives behind this button. A hover tooltip names it,
 * and the first time a profile exists a small guide points at it once.
 */
function TasteButton({
  hasProfile,
  storeKey,
  onOpenTaste,
  onTune,
}: {
  hasProfile: boolean;
  storeKey: string;
  onOpenTaste: () => void;
  onTune: () => void;
}) {
  const coachKey = `slice:${storeKey}:coach-taste`;
  const [coach, setCoach] = useState(false);

  useEffect(() => {
    if (!hasProfile) return;
    let seen = false;
    try {
      seen = localStorage.getItem(coachKey) === "1";
    } catch {
      /* storage blocked: show it this session */
    }
    if (seen) return;
    const t = setTimeout(() => setCoach(true), 900);
    return () => clearTimeout(t);
  }, [hasProfile, coachKey]);

  function dismiss() {
    setCoach(false);
    try {
      localStorage.setItem(coachKey, "1");
    } catch {
      /* ignore */
    }
  }

  const label = hasProfile ? "Your taste profile" : "Curate it for me";
  return (
    <div className="taste-btn relative">
      <button
        type="button"
        onClick={() => {
          dismiss();
          if (hasProfile) onOpenTaste();
          else onTune();
        }}
        aria-label={label}
        aria-describedby="taste-tip"
        className="orb"
      >
        <UserStar className="size-[18px]" />
      </button>

      {coach ? (
        <div role="dialog" aria-label="Your taste profile" className="coach">
          <p className="text-[13px] font-semibold">Your taste profile</p>
          <p className="mt-1 text-[12.5px] leading-snug text-[var(--ink-2)]">
            Every pick is ranked by it. Tap here to see what shapes your
            recommendations, or add more things you love.
          </p>
          <div className="mt-2.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={dismiss}
              className="h-7 rounded-full px-2.5 text-[12px] font-medium text-[var(--ink-2)] hover:bg-[var(--cream)]"
            >
              Got it
            </button>
            <button
              type="button"
              onClick={() => {
                dismiss();
                onOpenTaste();
              }}
              className="h-7 rounded-full bg-[var(--ink)] px-3 text-[12px] font-medium text-white hover:bg-black"
            >
              Show me
            </button>
          </div>
        </div>
      ) : (
        <span id="taste-tip" role="tooltip" className="tip">
          <span className="block font-semibold">{label}</span>
          <span className="block text-white/75">
            {hasProfile
              ? "Picks are ranked by this. Tap to view or add what you love."
              : "Answer four quick picks so recommendations fit you."}
          </span>
        </span>
      )}
    </div>
  );
}

function ConciergeMessage({
  m,
  storeName,
  styleLabels,
  onNavigate,
  hasProfile,
}: {
  m: Message;
  storeName: string;
  styleLabels: Record<string, string>;
  onNavigate: (url: string, productId?: string) => void;
  hasProfile: boolean;
}) {
  const [showTrace, setShowTrace] = useState(false);
  const hasText = m.text.trim().length > 0;
  // On a product page the greeting reads first and the picks follow it. Elsewhere
  // (e.g. right after tuning) the picks lead.
  const textFirst = m.openerFor?.startsWith("product:") ?? false;
  const picks =
    m.picks && m.picks.length > 0 ? (
      <PicksRail
        picks={m.picks}
        styleLabels={styleLabels}
        onOpen={onNavigate}
        showFit={hasProfile}
      />
    ) : null;
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
      {!textFirst && picks}
      {hasText && (
        <p className="whitespace-pre-wrap px-1 text-[14px] leading-relaxed">
          {m.text}
          {m.streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-[var(--tang)] align-middle" />
          )}
        </p>
      )}
      {m.streaming && hasText && m.status && (
        <p className="px-1 text-[12px] text-[var(--mute)]">{m.status}…</p>
      )}
      {textFirst && picks}
      {m.error && (
        <p className="rounded-xl bg-[var(--qloo-soft)] px-3 py-2 text-[12.5px] text-[var(--qloo)]">
          {m.error}
        </p>
      )}
      {!m.streaming && m.trace && m.trace.length > 0 && (
        <div className="px-1">
          <button
            type="button"
            onClick={() => setShowTrace((s) => !s)}
            aria-expanded={showTrace}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--mute)] hover:text-[var(--ink)]"
          >
            How I chose {m.picks?.length ? "these" : "this"}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                showTrace && "rotate-180",
              )}
            />
          </button>
          {showTrace && (
            <div className="mt-2">
              <WhyThese spans={m.trace} totalMs={m.totalMs} storeName={storeName} styleLabels={styleLabels} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function suggest(
  store: StoreInfo | null,
  page: PageContext | null,
  profile: TasteProfile | null,
  messages: Message[],
): string[] {
  if (messages.some((m) => m.streaming)) return [];
  const out: string[] = [];
  if (page?.product?.name) {
    out.push("Does this fit me?", "What goes with this?");
  }
  if (messages.length <= 1) {
    if (profile)
      out.push("Something for the weekend", "A gift for a friend like me");
    else out.push("Help me pick a gift", "What's good under $100?");
  } else {
    out.push("Show me more like these", "Something under $100");
  }
  const cats = store?.nav.map((g) => g.label) ?? [];
  if (cats[0]) out.push(`Browse ${cats[0].toLowerCase()}`);
  return out.slice(0, 4);
}
