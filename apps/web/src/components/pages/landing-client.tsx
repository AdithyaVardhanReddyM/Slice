"use client";

/* eslint-disable @next/next/no-img-element -- Qloo entity images come from Qloo's CDN */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";

// The visitor-side behaviour of a published page: count the view and CTA
// clicks, and the on-page taste quiz that switches the variant.

const VISITOR_KEY = "slice_visitor";

function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "anon" + Math.random().toString(36).slice(2, 12);
  }
}

/** The quiz answer, read server-side by /p/[slug] to pick the variant. */
function rememberChoice(slug: string, segmentId: string) {
  const safeSlug = slug.replace(/[^a-z0-9-]/g, "");
  document.cookie = `slp_${safeSlug}=${encodeURIComponent(segmentId)}; path=/p/${safeSlug}; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

export function LandingTracker({
  pageId,
  segmentId,
  source,
  city,
}: {
  pageId: Id<"pages">;
  segmentId: string;
  source: string;
  city?: string;
}) {
  const track = useMutation(api.pages.track);
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const vid = visitorId();
    if (sent.current !== segmentId) {
      sent.current = segmentId;
      track({ pageId, segmentId, type: "view", visitorId: vid, source, city }).catch(() => {});
    }
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("[data-lp-cta]");
      if (el) track({ pageId, segmentId, type: "cta", visitorId: vid, source, city }).catch(() => {});
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pageId, segmentId, source, city, track]);

  return null;
}

export interface QuizOption {
  segmentId: string;
  name: string;
  anchor: { name: string; image?: string; type: string };
}

const typeLabel = (type: string) =>
  ({ artist: "Music", movie: "Film", tv_show: "TV", brand: "Brand", destination: "Place", podcast: "Podcast", book: "Book" })[
    type.split(":").pop() ?? ""
  ] ?? "Taste";

export function TasteQuiz({
  slug,
  pageId,
  options,
  current,
  picked,
}: {
  slug: string;
  pageId: Id<"pages">;
  options: QuizOption[];
  current: string;
  picked: boolean;
}) {
  const router = useRouter();
  const track = useMutation(api.pages.track);
  const [open, setOpen] = useState(!picked);
  const [pending, setPending] = useState<string | null>(null);

  const choose = (segmentId: string) => {
    setPending(segmentId);
    rememberChoice(slug, segmentId);
    track({ pageId, segmentId, type: "quiz", visitorId: visitorId(), source: "quiz" }).catch(() => {});
    // A shared ?seg= link outranks the quiz, so drop it once they've chosen.
    const url = new URL(window.location.href);
    if (url.searchParams.has("seg")) {
      url.searchParams.delete("seg");
      router.replace(url.pathname + url.search, { scroll: false });
    } else {
      router.refresh();
    }
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="mx-auto max-w-6xl px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
        >
          Not quite you? Pick what feels closer
        </button>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-6 pb-6">
      <div className="rounded-3xl border border-[color-mix(in_srgb,var(--lp-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--lp-text)_3%,var(--lp-bg))] p-5">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-semibold">Which of these feels most like you?</p>
          <button type="button" onClick={() => setOpen(false)} className="text-xs opacity-60 hover:opacity-100">
            Skip
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          {options.map((o) => {
            const active = o.segmentId === current && picked;
            // Waiting for the refreshed page to arrive with the new variant.
            const loading = pending !== null && pending !== current;
            const img = o.anchor.image?.startsWith("https://") ? o.anchor.image : undefined;
            return (
              <button
                key={o.segmentId}
                type="button"
                disabled={loading}
                onClick={() => choose(o.segmentId)}
                className={`group flex items-center gap-3 rounded-2xl border p-2 text-left transition hover:border-[var(--lp-accent)] ${
                  active
                    ? "border-[var(--lp-accent)] bg-[color-mix(in_srgb,var(--lp-accent)_10%,transparent)]"
                    : "border-[color-mix(in_srgb,var(--lp-text)_12%,transparent)]"
                } ${loading && pending === o.segmentId ? "animate-pulse" : ""}`}
              >
                <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--lp-accent)_20%,var(--lp-bg))]">
                  {img ? <img src={img} alt="" className="size-full object-cover" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{o.anchor.name}</span>
                  <span className="block text-xs opacity-60">{typeLabel(o.anchor.type)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
