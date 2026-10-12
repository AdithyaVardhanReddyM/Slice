"use client";

import Link from "next/link";
import { ArrowLeft, Megaphone, Tag, Users, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Audience, Brand, BrandItem } from "@/lib/pages/types";
import { brandDomain } from "@/lib/pages/urls";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BrandGlyph } from "../brand-shell";
import { BrowserFrame } from "../browser-frame";

/** A fixed app surface: the document never scrolls or rubber-bands, only its panels do. */
export function useAppSurface() {
  useEffect(() => {
    // Both: Chrome reads overscroll-behavior on <html>, Safari on <body>.
    const els = [document.documentElement, document.body];
    const prev = els.map((el) => ({ overflow: el.style.overflow, overscroll: el.style.overscrollBehavior }));
    for (const el of els) {
      el.style.overflow = "hidden";
      el.style.overscrollBehavior = "none";
    }
    return () => {
      els.forEach((el, i) => {
        el.style.overflow = prev[i].overflow;
        el.style.overscrollBehavior = prev[i].overscroll;
      });
    };
  }, []);
}

/** Full-screen editor: a slim top bar, the chat on the left, the canvas on the right. */
export function EditorLayout({ topbar, chat, canvas }: { topbar: ReactNode; chat: ReactNode; canvas: ReactNode }) {
  useAppSurface();
  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-background">
      {topbar}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0">{chat}</aside>
        <section className="flex min-h-0 min-w-0 flex-col bg-muted/40">{canvas}</section>
      </div>
    </div>
  );
}

export function EditorTopbar({
  brand,
  title,
  badge,
  center,
  actions,
}: {
  brand: Brand;
  title: ReactNode;
  badge?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back to pages"
          nativeButton={false}
          render={<Link href={`/dashboard/pages/${brand.slug}/pages`} />}
        >
          <ArrowLeft />
        </Button>
        <Separator orientation="vertical" className="h-4 data-vertical:self-center" />
        <Link href={`/dashboard/pages/${brand.slug}`} className="flex shrink-0 items-center gap-2 rounded-md px-1 py-0.5 text-sm text-muted-foreground hover:text-foreground">
          <BrandGlyph brand={brand} size="sm" />
          <span className="hidden sm:inline">{brand.name}</span>
        </Link>
        <span className="text-muted-foreground/60">/</span>
        <span className="truncate text-sm font-medium">{title}</span>
        {badge}
      </div>
      {center && <div className="hidden shrink-0 md:block">{center}</div>}
      <div className="flex flex-1 items-center justify-end gap-2">{actions}</div>
    </header>
  );
}

type Starter = { icon: LucideIcon; label: string; parts: (string | Audience)[] };

function starters(brand: Brand, audiences: Audience[]): Starter[] {
  const items = ((brand.brief?.items ?? []) as BrandItem[]).filter((i) => i.name);
  const audience = audiences.find((a) => a.status === "ready");
  const lead = items[0]?.name;
  return [
    {
      icon: Megaphone,
      label: lead ? `A launch page for ${lead}` : "A launch page for our newest product",
      parts: [lead ? `A launch page for ${lead}. Lead with what makes it different and get people to buy before it sells through.` : "A launch page for our newest product."],
    },
    {
      icon: Tag,
      label: "A sale page for under 25s",
      parts: ["A sale page with 15% off this week, for people under 25."],
    },
    audience
      ? {
          icon: Users,
          label: `A page for ${audience.name}`,
          parts: ["A page for ", audience, " that leads with what they love and the items that fit them best."],
        }
      : {
          icon: Users,
          label: "A page for people in Berlin",
          parts: ["A page for people in Berlin, with local picks and what the city loves."],
        },
  ];
}

/** "What are we building?" with three brand-aware starting points. */
export function ChatWelcome({ brand, audiences, onPick }: { brand: Brand; audiences: Audience[]; onPick: (parts: (string | Audience)[]) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <h2 className="text-lg font-semibold tracking-tight">What are we building?</h2>
      <p className="mt-1.5 max-w-72 text-sm text-muted-foreground">
        Describe the page in your own words. Type <span className="font-medium text-foreground">@</span> to target a saved audience, or just say who it is for.
      </p>
      <div className="mt-6 grid w-full max-w-sm gap-2">
        {starters(brand, audiences).map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.parts)}
            className="flex items-center gap-3 rounded-xl border bg-background px-3.5 py-2.5 text-left text-sm shadow-xs transition-colors hover:bg-muted/60"
          >
            <s.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The empty canvas before a page exists: the brand's browser frame, waiting. */
export function CanvasPlaceholder({ brand, status, title }: { brand: Brand; status?: string | null; title?: string }) {
  const colors = brand.kit?.colors;
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <BrowserFrame
          className={cn("rounded-xl shadow-sm ring-1 ring-foreground/5 transition-opacity", !status && "opacity-70")}
          priority
          sizes="448px"
          domain={`${brandDomain(brand.slug)}/${title ? "…" : ""}`}
          heroBackground={colors?.primary}
          hero={
            <span className="truncate px-[4%] text-[3.4cqw] font-semibold tracking-tight" style={{ color: colors?.primaryForeground ?? undefined }}>
              {title || brand.name}
            </span>
          }
        />
        <p className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          {status ? (
            <>
              <Spinner className="size-3.5" />
              {status}
            </>
          ) : (
            "Your page appears here as it is built."
          )}
        </p>
      </div>
    </div>
  );
}
