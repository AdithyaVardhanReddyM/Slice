"use client";

import { useAction } from "convex/react";
import { Hash, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { PickedEntity } from "@/lib/pages/definition";
import { Spinner } from "@/components/console/setup/atoms";
import { Thumb } from "./shared";

export type { PickedEntity } from "@/lib/pages/definition";

/** A picked entity or genre tag. */
type Picked = { id: string; name: string; type?: string; image?: string };
type Suggestion = PickedEntity & { subtitle?: string };

const TYPE_LABEL: Record<string, string> = {
  brand: "Brand",
  artist: "Artist",
  movie: "Film",
  tv_show: "TV show",
  book: "Book",
  podcast: "Podcast",
  person: "Person",
  destination: "Destination",
  place: "Place",
  videogame: "Game",
  "urn:tag:genre:music": "Music",
  "urn:tag:genre:media": "Film, TV and books",
};
export const typeLabel = (t: string) => TYPE_LABEL[t] ?? TYPE_LABEL[t.replace("urn:entity:", "")] ?? (t.startsWith("urn:tag") ? "Genre" : "Entity");

/**
 * Search Qloo as you type and pick real entities ("Patagonia", a brand), so a
 * typo or a same-name restaurant never becomes the audience. `types` narrows
 * the search ("artist", "podcast"); `mode="tag"` searches genres instead.
 * Picked items show as chips with their picture and type.
 */
export function InterestPicker<T extends Picked>({
  value,
  onChange,
  types,
  mode = "entity",
  placeholder = "Search brands, artists, films, places…",
  autoFocus = true,
  showType = true,
}: {
  value: T[];
  onChange: (v: T[]) => void;
  types?: string[];
  mode?: "entity" | "tag";
  placeholder?: string;
  autoFocus?: boolean;
  /** Show the type next to each pick; off when the condition already names it. */
  showType?: boolean;
}) {
  const suggestEntities = useAction(api.pagesAudiences.suggestEntities);
  const suggestTags = useAction(api.pagesAudiences.suggestTags);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");
  const seq = useRef(0);
  const typesKey = types?.join(",") ?? "";

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const n = ++seq.current;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const found: Suggestion[] =
          mode === "tag" ? await suggestTags({ query: q }) : ((await suggestEntities({ query: q, ...(typesKey ? { types: typesKey.split(",") } : {}) })) as Suggestion[]);
        if (n !== seq.current) return;
        setResults(found);
        setSearched(q);
        setActive(0);
        setOpen(true);
      } catch {
        /* Qloo unreachable: nothing to suggest */
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, mode, typesKey, suggestEntities, suggestTags]);

  function pick(s: Suggestion) {
    if (!value.some((v) => v.id === s.id)) onChange([...value, { id: s.id, name: s.name, type: s.type, ...(s.image ? { image: s.image } : {}) } as T]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const glyph = (item: { image?: string }, size: string, rounded: string) =>
    mode === "tag" ? (
      <span className={cn("flex shrink-0 items-center justify-center bg-muted text-muted-foreground", size, rounded)}>
        <Hash className="size-3.5" />
      </span>
    ) : (
      <Thumb src={item.image} className={cn(size, "ring-1 ring-foreground/10")} rounded={rounded} />
    );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) {
              seq.current++;
              setResults([]);
              setOpen(false);
              setLoading(false);
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !query && value.length) onChange(value.slice(0, -1));
            if (!open || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[active]) pick(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className="h-9 w-full rounded-lg border border-input bg-background pr-8 pl-8 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {loading && <Spinner className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />}
        {open && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg bg-popover p-1 shadow-lg ring-1 ring-foreground/10">
            {results.length === 0 ? (
              <li className="px-2.5 py-3 text-sm text-muted-foreground">Nothing in Qloo for “{searched}”. Check the spelling.</li>
            ) : (
              results.map((s, i) => (
                <li key={s.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(s)}
                    className={cn("flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left", i === active && "bg-muted")}
                  >
                    {glyph(s, mode === "tag" ? "size-7" : "size-9", "rounded-md")}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      {s.subtitle && <span className="block truncate text-xs text-muted-foreground">{s.subtitle}</span>}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{typeLabel(s.type)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-full bg-muted py-1 pr-1.5 pl-1 text-sm">
              {glyph(v, "size-6", "rounded-full")}
              <span className="font-medium">{v.name}</span>
              {showType && v.type && <span className="text-xs text-muted-foreground">{typeLabel(v.type)}</span>}
              <button
                type="button"
                aria-label={`Remove ${v.name}`}
                onClick={() => onChange(value.filter((x) => x.id !== v.id))}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
