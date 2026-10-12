// The models the Pages builder can run on (apps/agent/slice_pages/builder.py
// MODELS). The choice is a per-browser preference, shared by every builder tab.

import { useCallback, useSyncExternalStore } from "react";

export const PAGES_MODELS = [
  { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash", short: "3.8 Flash", hint: "Fast. Right for most pages and edits." },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", short: "3.1 Pro", hint: "Slower, more considered copy and structure." },
] as const;

export type PagesModel = (typeof PAGES_MODELS)[number]["value"];

export const DEFAULT_PAGES_MODEL: PagesModel = "gemini-3.8-flash";

const KEY = "slice.pages.model";
const listeners = new Set<() => void>();
// Fallback when storage is unavailable (private windows, blocked site data).
let memory: PagesModel = DEFAULT_PAGES_MODEL;

const isModel = (v: unknown): v is PagesModel => PAGES_MODELS.some((m) => m.value === v);

function read(): PagesModel {
  try {
    const v = window.localStorage.getItem(KEY);
    if (isModel(v)) return v;
  } catch {
    // fall through to memory
  }
  return memory;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePagesModel(): [PagesModel, (m: PagesModel) => void] {
  const model = useSyncExternalStore(subscribe, read, () => DEFAULT_PAGES_MODEL);
  const set = useCallback((m: PagesModel) => {
    memory = m;
    try {
      window.localStorage.setItem(KEY, m);
    } catch {
      // memory holds it for this tab
    }
    listeners.forEach((l) => l());
  }, []);
  return [model, set];
}
