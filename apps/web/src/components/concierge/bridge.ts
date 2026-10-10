"use client";

import type { FromParent, ToParent } from "./types";

// postMessage bridge between the embed (inside the iframe) and slice.js on the
// merchant's page. The parent owns persistence (profile id, session id,
// transcript) because third-party iframe storage is partitioned per site.

export function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function send(msg: ToParent) {
  if (!inIframe()) return;
  window.parent.postMessage(msg, "*");
}

export function onContext(handler: (ctx: FromParent) => void): () => void {
  const listener = (ev: MessageEvent) => {
    const data = ev.data as FromParent | undefined;
    if (data && typeof data === "object" && data.type === "slice:context") handler(data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
