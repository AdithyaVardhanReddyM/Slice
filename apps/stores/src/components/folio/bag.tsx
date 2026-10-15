"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Check, ShoppingBag } from "lucide-react";
import { cn } from "cn";

// A demo bag: counts what was added this visit so the header badge moves. No
// checkout behind it.
const BagContext = createContext<{ items: string[]; add: (slug: string) => void }>({ items: [], add: () => {} });

export function BagProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<string[]>([]);
  return <BagContext value={{ items, add: (slug) => setItems((xs) => [...xs, slug]) }}>{children}</BagContext>;
}

export const useBag = () => useContext(BagContext);

export function AddToBag({ slug, title, size = "md", variant = "primary", className }: { slug: string; title: string; size?: "sm" | "md"; variant?: "primary" | "outline"; className?: string }) {
  const { items, add } = useBag();
  const added = items.includes(slug);
  return (
    <button
      type="button"
      onClick={() => add(slug)}
      aria-label={`Add ${title} to bag`}
      className={cn("ff-btn", size === "sm" && "ff-btn-sm", added ? "ff-btn-outline" : variant === "primary" ? "ff-btn-primary" : "ff-btn-outline", className)}
    >
      {added ? <Check className="size-4" strokeWidth={2.25} /> : <ShoppingBag className="size-4" strokeWidth={2} />}
      {added ? "In your bag" : "Add to bag"}
    </button>
  );
}
