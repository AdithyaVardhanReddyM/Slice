"use client";

import { useSyncExternalStore } from "react";

// Saved product ids per store, in localStorage. Same pattern as the cart: the
// server snapshot is empty and React re-renders with stored ids after hydrating.
const EMPTY: string[] = [];
const stores = new Map<string, ReturnType<typeof createStore>>();

function createStore(key: string) {
  let ids = EMPTY;
  let loaded = false;
  const listeners = new Set<() => void>();
  return {
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot() {
      if (!loaded) {
        loaded = true;
        try {
          ids = JSON.parse(localStorage.getItem(key) ?? "[]");
        } catch {
          // unavailable storage: start empty
        }
      }
      return ids;
    },
    toggle(id: string) {
      ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      try {
        localStorage.setItem(key, JSON.stringify(ids));
      } catch {
        // private mode: keep it in memory
      }
      listeners.forEach((l) => l());
    },
  };
}

export function useWishlist(key: string) {
  let store = stores.get(key);
  if (!store) {
    store = createStore(key);
    stores.set(key, store);
  }
  const ids = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
  return { ids, has: (id: string) => ids.includes(id), toggle: store.toggle };
}
