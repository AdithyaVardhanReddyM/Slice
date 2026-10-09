"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Product, Variant } from "@slice/demo-catalogs";

export interface CartLine {
  key: string; // `${product.id}:${variant.id}`
  product: Product;
  variant: Variant;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  open: boolean;
  count: number;
  subtotal: number;
  add: (product: Product, variant: Variant, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartState | null>(null);

const linePrice = (l: CartLine) => l.product.price + (l.variant.priceDelta ?? 0);

// localStorage-backed store, one per storage key, so two demo storefronts in
// the same browser don't share a cart. The server snapshot is always empty;
// React re-renders with the stored lines right after hydration.
const EMPTY: CartLine[] = [];
const stores = new Map<string, ReturnType<typeof createStore>>();

function createStore(key: string) {
  let lines = EMPTY;
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
          const raw = localStorage.getItem(key);
          if (raw) lines = JSON.parse(raw);
        } catch {
          // corrupt or unavailable storage: start empty
        }
      }
      return lines;
    },
    getServerSnapshot: () => EMPTY,
    set(update: (prev: CartLine[]) => CartLine[]) {
      lines = update(lines);
      try {
        localStorage.setItem(key, JSON.stringify(lines));
      } catch {
        // private mode etc.; the cart still works in memory
      }
      listeners.forEach((l) => l());
    },
  };
}

function storeFor(key: string) {
  let s = stores.get(key);
  if (!s) {
    s = createStore(key);
    stores.set(key, s);
  }
  return s;
}

export function CartProvider({
  storageKey,
  children,
}: {
  storageKey: string;
  children: ReactNode;
}) {
  const store = storeFor(storageKey);
  const lines = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [open, setOpen] = useState(false);

  const add = useCallback<CartState["add"]>(
    (product, variant, qty = 1) => {
      const key = `${product.id}:${variant.id}`;
      store.set((prev) => {
        const existing = prev.find((l) => l.key === key);
        if (existing) {
          return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
        }
        return [...prev, { key, product, variant, qty }];
      });
      setOpen(true);
    },
    [store],
  );

  const setQty = useCallback<CartState["setQty"]>(
    (key, qty) => {
      store.set((prev) =>
        qty <= 0
          ? prev.filter((l) => l.key !== key)
          : prev.map((l) => (l.key === key ? { ...l, qty } : l)),
      );
    },
    [store],
  );

  const remove = useCallback(
    (key: string) => store.set((prev) => prev.filter((l) => l.key !== key)),
    [store],
  );

  const clear = useCallback(() => store.set(() => EMPTY), [store]);

  const value = useMemo<CartState>(
    () => ({
      lines,
      open,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((n, l) => n + linePrice(l) * l.qty, 0),
      add,
      setQty,
      remove,
      clear,
      setOpen,
    }),
    [lines, open, add, setQty, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

export { linePrice };
