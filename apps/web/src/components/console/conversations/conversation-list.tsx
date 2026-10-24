"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type { Outcome } from "@/lib/mock/types";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutcomeBadge } from "../primitives";
import type { ConversationSummary } from "./data";

type Filter = "all" | "added_to_cart" | "clicked" | "no_match";

const matches: Record<Filter, (o: Outcome) => boolean> = {
  all: () => true,
  added_to_cart: (o) => o === "added_to_cart",
  clicked: (o) => o === "clicked",
  no_match: (o) => o === "no_match",
};

export function ConversationList({
  widgetId,
  items,
}: {
  widgetId: string;
  items: ConversationSummary[];
  total: number;
}) {
  const { id: activeId } = useParams<{ id?: string }>();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (c) =>
        matches[filter](c.outcome) &&
        (!q ||
          [c.opener, c.intent, c.city, c.id, ...c.entities]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [items, filter, query]);

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_28px_-16px_rgba(20,20,20,0.10)]">
      <div className="space-y-3 border-b p-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-base font-semibold">Conversations</h1>
          <span className="text-sm text-muted-foreground tabular-nums">
            {visible.length}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="pl-8"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="added_to_cart">In cart</TabsTrigger>
            <TabsTrigger value="clicked">Opened</TabsTrigger>
            <TabsTrigger value="no_match">No match</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ul className="scrollbar-thin flex-1 overflow-y-auto">
        {visible.map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard/concierge/${widgetId}/conversations/${c.id}`}
              className={cn(
                "block space-y-2 border-b px-4 py-3 transition-colors hover:bg-muted/50",
                c.id === activeId && "bg-muted hover:bg-muted",
              )}
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{c.intent}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmt.ago(c.startedAt)}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {c.city}, {c.region}
              </p>
              <div className="flex items-center justify-between gap-2">
                <OutcomeBadge outcome={c.outcome} />
                <div className="flex -space-x-1.5">
                  {c.thumbs.map((src, i) =>
                    src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="size-6 rounded-md object-cover ring-2 ring-background"
                      />
                    ) : null,
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            No conversations match.
          </li>
        )}
      </ul>
    </div>
  );
}
