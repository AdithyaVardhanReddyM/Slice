"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { inIframe, onContext, send } from "./bridge";
import { Building } from "./building";
import { Chat } from "./chat";
import { Questionnaire, type QuestionnaireResult } from "./questionnaire";
import { chatStream } from "./stream";
import { TastePanel } from "./taste-panel";
import type { FromParent, Message, PageContext, StoreInfo, TasteProfile } from "./types";
import { Welcome } from "./welcome";

type Screen = "welcome" | "questionnaire" | "building" | "chat";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Outside an iframe (dev: /embed/concierge?key=fold) the page persists its own state. */
function localContext(key: string): FromParent {
  const get = (k: string, s: Storage) => {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  };
  let sessionId = get(`slice:${key}:session`, sessionStorage);
  if (!sessionId) {
    sessionId = uid();
    try {
      sessionStorage.setItem(`slice:${key}:session`, sessionId);
    } catch {
      /* ignore */
    }
  }
  let messages: Message[] = [];
  try {
    messages = JSON.parse(get(`slice:${key}:transcript`, sessionStorage) ?? "[]");
  } catch {
    messages = [];
  }
  return {
    type: "slice:context",
    key,
    sessionId,
    profileId: get(`slice:${key}:profile`, localStorage),
    page: { url: location.href, path: location.pathname, title: document.title, product: null },
    messages,
  };
}

export function ConciergeApp() {
  const params = useSearchParams();
  const keyParam = params.get("key") ?? "";
  const framed = typeof window !== "undefined" && inIframe();

  const [ctx, setCtx] = useState<FromParent | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [tasteOpen, setTasteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);
  const openerStarted = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The transcript at the moment a turn starts, sent along so the agent can
  // rebuild its memory if its server restarted.
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const key = ctx?.key ?? keyParam;
  const store = useQuery(api.catalog.store, key ? { key } : "skip") as StoreInfo | null | undefined;
  const profile = useQuery(api.taste.get, profileId ? { id: profileId as Id<"tasteProfiles"> } : "skip") as
    | TasteProfile
    | null
    | undefined;
  const build = useAction(api.taste.build);

  // Adopt the context (and the parent's persisted state) in one go.
  const adopt = useCallback((c: FromParent) => {
    const restored = (c.messages ?? []).filter((m) => !m.streaming);
    setCtx(c);
    setProfileId(c.profileId);
    setMessages(restored);
    setScreen(c.profileId || restored.length > 0 ? "chat" : "welcome");
  }, []);

  // Handshake with slice.js, or run standalone.
  useEffect(() => {
    if (!framed) {
      if (keyParam) {
        const c = localContext(keyParam);
        queueMicrotask(() => adopt(c));
      }
      return;
    }
    const off = onContext(adopt);
    send({ type: "slice:ready" });
    return off;
  }, [framed, keyParam, adopt]);

  // Persist back to the parent (or to this window's storage when standalone).
  useEffect(() => {
    if (!ctx) return;
    const clean = messages.filter((m) => !m.streaming).slice(-30);
    if (framed) {
      send({ type: "slice:state", profileId, messages: clean });
    } else {
      try {
        localStorage.setItem(`slice:${ctx.key}:profile`, profileId ?? "");
        if (!profileId) localStorage.removeItem(`slice:${ctx.key}:profile`);
        sessionStorage.setItem(`slice:${ctx.key}:transcript`, JSON.stringify(clean));
      } catch {
        /* ignore */
      }
    }
  }, [messages, profileId, ctx, framed]);

  const page: PageContext | null = ctx?.page ?? null;

  const runTurn = useCallback(
    async (input: { kind: "open" | "user"; text?: string; openerFor?: string }) => {
      if (!ctx) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setBusy(true);
      const history = messagesRef.current;
      const id = uid();
      setMessages((ms) => [
        ...ms,
        ...(input.kind === "user" ? [{ id: `${id}-u`, role: "shopper" as const, text: input.text ?? "" }] : []),
        {
          id,
          role: "concierge",
          text: "",
          streaming: true,
          status: "Thinking",
          ...(input.openerFor ? { openerFor: input.openerFor } : {}),
        },
      ]);
      const patch = (fn: (m: Message) => Message) =>
        setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
      try {
        for await (const ev of chatStream(
          {
            sessionId: ctx.sessionId,
            storeKey: ctx.key,
            profileId,
            page,
            message: input.text,
            kind: input.kind,
            history,
            signals: ctx.signals,
          },
          ac.signal,
        )) {
          switch (ev.type) {
            case "status":
              patch((m) => ({ ...m, status: ev.text }));
              break;
            case "text":
              patch((m) => ({ ...m, text: m.text + ev.delta, status: undefined }));
              break;
            case "text_done":
              patch((m) => ({ ...m, text: ev.text }));
              break;
            case "picks":
              patch((m) => ({ ...m, picks: ev.picks }));
              break;
            case "done":
              patch((m) => ({
                ...m,
                text: ev.text || m.text,
                trace: ev.trace,
                totalMs: ev.totalMs,
                streaming: false,
                status: undefined,
              }));
              break;
            case "error":
              patch((m) => ({ ...m, error: ev.message, streaming: false, status: undefined }));
              break;
          }
        }
      } catch (err) {
        if (!ac.signal.aborted) patch((m) => ({ ...m, error: String(err), streaming: false }));
      } finally {
        patch((m) => ({ ...m, streaming: false, status: undefined }));
        setBusy(false);
      }
    },
    [ctx, profileId, page],
  );

  // Proactive opener: once per session when chat opens empty, and again when the
  // shopper lands on a product page we haven't spoken about.
  useEffect(() => {
    if (screen !== "chat" || !ctx || busy) return;
    if (profileId && profile === undefined) return; // wait for the profile to load
    const product = page?.product;
    const productId = product?.id || product?.sku || product?.url || product?.name;
    const pageKey = productId ? `product:${productId}` : "home";
    const marker = `${ctx.sessionId}:${pageKey}`;
    if (openerStarted.current === marker) return;
    openerStarted.current = marker;
    // Already greeted this page in this session (survives reloads via the transcript).
    // Older transcripts have no tag, so also accept a reply that names the product.
    const greeted = messages.some(
      (m) =>
        (m.openerFor === pageKey && !m.error) ||
        (!!product?.name && m.role === "concierge" && m.text.includes(product.name)),
    );
    const fresh = messages.length === 0;
    if (greeted || (!fresh && !productId)) return;
    queueMicrotask(() => void runTurn({ kind: "open", openerFor: pageKey }));
  }, [screen, ctx, busy, profileId, profile, page, messages, runTurn]);

  async function finishQuestionnaire(r: QuestionnaireResult) {
    if (!ctx) return;
    setScreen("building");
    setBuildError(null);
    setBriefing(false);
    try {
      const { profileId: pid } = await build({
        storeKey: ctx.key,
        city: r.city,
        age: r.age,
        gender: r.gender,
        answers: r.answers,
        entities: r.entities,
        freeText: r.freeText,
      });
      setProfileId(pid);
      setMessages([]);
      openerStarted.current = null;
      // Write the taste brief now (one model call) so the first turn goes
      // straight to picks. The loader shows it as its last stage.
      setBriefing(true);
      try {
        await fetch("/api/concierge/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile_id: pid, store_key: ctx.key }),
        });
      } catch {
        /* the agent writes it on the first turn instead */
      }
      setScreen("chat");
    } catch (err) {
      setBuildError(String(err));
    }
  }

  function navigate(url: string, productId?: string) {
    if (framed) send({ type: "slice:navigate", url, productId });
    else window.open(url, "_blank", "noopener");
  }

  function reset() {
    setTasteOpen(false);
    setProfileId(null);
    setMessages([]);
    openerStarted.current = null;
    setScreen("questionnaire");
  }

  if (!ctx) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--mute)]">
        {keyParam || framed ? "Connecting…" : "Missing ?key= for this store."}
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {screen === "welcome" && (
        <Welcome
          store={store ?? null}
          onTune={() => setScreen("questionnaire")}
          onBrowse={() => setScreen("chat")}
          onClose={framed ? () => send({ type: "slice:close" }) : undefined}
        />
      )}
      {screen === "questionnaire" && (
        <Questionnaire
          storeName={store?.name ?? "the store"}
          onDone={finishQuestionnaire}
          onCancel={() => setScreen(messages.length || profileId ? "chat" : "welcome")}
          onTrace={() => {}}
        />
      )}
      {screen === "building" && (
        <Building briefing={briefing} storeName={store?.name ?? "this store"} error={buildError} />
      )}
      {screen === "chat" && (
        <Chat
          store={store ?? null}
          profile={profile ?? null}
          page={page}
          messages={messages}
          busy={busy}
          onSend={(text) => runTurn({ kind: "user", text })}
          onOpenTaste={() => setTasteOpen(true)}
          onTune={() => setScreen("questionnaire")}
          onClose={() => send({ type: "slice:close" })}
          onNavigate={navigate}
          inIframe={framed}
        />
      )}
      {tasteOpen && profile && (
        <TastePanel
          profile={profile}
          store={store ?? null}
          onClose={() => setTasteOpen(false)}
          onAdd={(text) => {
            setTasteOpen(false);
            runTurn({ kind: "user", text: `I also love ${text}.` });
          }}
          onReset={reset}
        />
      )}
    </div>
  );
}
