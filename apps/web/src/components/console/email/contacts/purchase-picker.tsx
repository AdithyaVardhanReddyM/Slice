"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Plus, ShoppingBag, X } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { Thumb } from "@/components/console/pages/shared";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { Input } from "@/components/ui/input";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();

/**
 * What someone bought or booked, newest first: the brand's catalog is
 * suggested as you type (so purchases match its items), and anything else
 * can be added as written.
 */
export function PurchasePicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const brand = useEmailBrand();
  const items = useQuery(api.emailItems.list, { brandId: brand._id });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const byName = useMemo(() => new Map((items ?? []).map((i) => [norm(i.name), i])), [items]);
  const needle = norm(q);
  const suggestions = useMemo(
    () =>
      (items ?? [])
        .filter((i) => !value.some((v) => norm(v) === norm(i.name)) && (!needle || norm(`${i.name} ${i.subtitle ?? ""}`).includes(needle)))
        .slice(0, 6),
    [items, value, needle],
  );

  const add = (name: string) => {
    const t = name.trim();
    if (t.length > 1 && !value.some((v) => norm(v) === norm(t))) onChange([...value, t]);
    setQ("");
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <ShoppingBag className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            add(suggestions[0] && needle ? suggestions[0].name : q);
          }}
          placeholder="Search your catalog, or type what they bought or booked"
          className="pl-9"
        />
        {open && (suggestions.length > 0 || needle) && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
            {suggestions.map((i) => (
              <li key={i._id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(i.name)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                >
                  <Thumb src={i.image} alt="" className="aspect-[2/3] w-7 shrink-0" rounded="rounded" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{i.name}</span>
                    {i.subtitle && <span className="block truncate text-xs text-muted-foreground">{i.subtitle}</span>}
                  </span>
                </button>
              </li>
            ))}
            {needle && !byName.has(needle) && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(q)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                >
                  <Plus className="size-4 text-muted-foreground" /> Add &ldquo;{q.trim()}&rdquo;
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v) => {
            const item = byName.get(norm(v));
            return (
              <li key={v} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border bg-white pr-1 pl-1 text-xs", !item && "pl-2.5")}>
                {item && <Thumb src={item.image} alt="" className="aspect-[2/3] h-5 w-auto shrink-0" rounded="rounded-sm" />}
                {v}
                <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
