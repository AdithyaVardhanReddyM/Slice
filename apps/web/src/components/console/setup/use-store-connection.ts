"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";

export type StorePlatform = "shopify" | "woocommerce";
type Action = "connect" | "keys" | "sync" | "disconnect";

const POPUP = "width=620,height=760";

async function call(action: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/concierge/catalog/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; url?: string };
  if (!res.ok || json.ok === false) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/**
 * A widget's store connection (Shopify through Composio, WooCommerce over its
 * REST API): the live state from Convex plus the actions, which go through
 * /api/concierge/catalog to the agent. Approval happens in a popup on the
 * platform's own screen; the popup lands on /store-connected, which tells
 * this page to check in.
 */
export function useStoreConnection(widgetKey: string | undefined) {
  const data = useQuery(api.catalogConnections.forWidget, widgetKey ? { key: widgetKey } : "skip");
  const connection = data?.connection ?? null;
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popup = useRef<Window | null>(null);

  const run = useCallback(
    async (action: Action, path: string, body: Record<string, unknown> = {}) => {
      if (!widgetKey) {
        setError("This widget isn't saved to your account yet, so it can't connect a store.");
        return null;
      }
      setBusy(action);
      setError(null);
      try {
        return await call(path, { widgetKey, ...body });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [widgetKey],
  );

  // Shopify approval doesn't call Slice back; asking the agent moves it on.
  const checkIn = useCallback(() => {
    if (widgetKey) void call("status", { widgetKey }).catch(() => {});
  }, [widgetKey]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "slice:store-connected") checkIn();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [checkIn]);

  // While a connection waits on the merchant, check now and then: the popup may be closed by hand.
  const pending = connection?.status === "pending";
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(checkIn, 4000);
    return () => clearInterval(t);
  }, [pending, checkIn]);

  async function connect(platform: StorePlatform, shop: string) {
    // Opened before the request so the browser treats it as the click's own window.
    popup.current = window.open("", "slice-store-connect", POPUP);
    const res = await run("connect", "connect", { platform, shop });
    if (!res?.url) {
      popup.current?.close();
      return;
    }
    if (popup.current && !popup.current.closed) popup.current.location.href = res.url;
    else popup.current = window.open(res.url, "slice-store-connect", POPUP);
  }

  return {
    /** undefined while loading or with no widget; null when nothing is connected. */
    connection,
    ready: data !== undefined || !widgetKey,
    busy,
    error,
    clearError: () => setError(null),
    connect,
    reopen: () => popup.current?.focus(),
    saveKeys: (site: string, consumerKey: string, consumerSecret: string) =>
      run("keys", "woo-keys", { site, consumerKey, consumerSecret }),
    sync: () => run("sync", "sync"),
    disconnect: () => run("disconnect", "disconnect"),
  };
}

export type StoreConnection = ReturnType<typeof useStoreConnection>;
