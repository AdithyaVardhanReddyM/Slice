"use client";

// Dev-only (/p/_build): replays a build of an existing page through the real
// chat card and canvas on a compressed clock, so the build experience can be
// checked without running the agent. The steps are scripted; the page, its
// photos and the brand are real.

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { HtmlDoc } from "@slice/backend/convex/pagesTypes";
import type { BuildStep, StepPreview } from "@/lib/pages/stream";
import type { Brand, Variant } from "@/lib/pages/types";
import { Button } from "@/components/ui/button";
import { LiveBuildCard, StreamingText } from "./build-card";
import { PreviewFrame } from "./preview";
import type { LiveTurn } from "./use-builder";

type Beat = { at: number; apply: (t: LiveTurn) => LiveTurn };

const THOUGHTS = [
  "**Reading the brief**\n\nThe page is for everyone, so the brand's own Qloo read carries the taste: electronic and indie leaning, late nights by the river, a crowd that travels for a lineup. I want the audience profile, the ranked passes and the homepage together before deciding the angle.",
  "**Planning the page**\n\nThe homepage is cream with black type, an expanded display face and an orange ticket button; the striped ribbon is its signature, so the hero needs it. The lineup is the reason to come, so it goes right after the hero, re-ranked by what this crowd plays most. Passes next, with the three-day pass first since it fits best, then getting there and the grounds. I have site photos for the stages; I will look for one night shot of a crowd under lights for the culture moment.",
  "**Writing it**\n\nHeadline under ten words, built on the river and the three days. Ticket cards reuse the homepage's black cards with orange price tags. Every section gets its evidence line.",
];

function imagesOf(html: string) {
  const out: { src: string; alt: string }[] = [];
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
    if (src && !out.some((o) => o.src === src)) out.push({ src, alt: /\salt="([^"]*)"/.exec(tag)?.[1] ?? "" });
  }
  return out;
}

function script(doc: HtmlDoc): { beats: Beat[]; end: number } {
  const imgs = imagesOf(doc.html);
  const faces: StepPreview["faces"] = imgs.filter((i) => i.alt).slice(0, 6).map((i) => ({ name: i.alt.split(/[,.]/)[0].slice(0, 28), image: i.src }));
  const photos = imgs.map((i) => i.src);
  const sections = doc.sections.map((s) => s.id);
  const beats: Beat[] = [];
  let at = 0;
  const step = (ms: number, apply: Beat["apply"]) => {
    at += ms;
    beats.push({ at, apply });
  };
  const think = (text: string, ms: number) => {
    const words = text.split(/(?<=\s)/);
    const per = Math.max(1, Math.round(words.length / (ms / 120)));
    for (let i = 0; i < words.length; i += per) {
      const chunk = words.slice(i, i + per).join("");
      step(120, (t) => {
        const last = t.steps[t.steps.length - 1];
        if (last?.kind === "thought" && i > 0) return { ...t, steps: [...t.steps.slice(0, -1), { ...last, text: last.text + chunk }] };
        return { ...t, steps: [...t.steps, { kind: "thought", text: chunk, t: Date.now() - t.startedAt }] };
      });
    }
  };
  const call = (name: string, label: string) =>
    step(80, (t) => ({ ...t, status: label, steps: [...t.steps, { kind: "tool", name, label, status: "running", t: Date.now() - t.startedAt }] }));
  const done = (name: string, summary: string, preview?: StepPreview) =>
    step(80, (t) => ({
      ...t,
      steps: t.steps.map((s) => (s.kind === "tool" && s.name === name && s.status === "running" ? { ...s, status: "done", summary, preview, ms: Date.now() - t.startedAt - (s.t ?? 0) } : s)) as BuildStep[],
    }));

  step(1200, (t) => ({ ...t, status: "Loading the brand, the page and the audience" }));
  think(THOUGHTS[0], 2600);
  call("get_audience_detail", "Reading the audience's taste profile");
  call("pick_items", "Ranking the brand's items by taste fit");
  call("get_brand_site", "Reading the brand's homepage");
  at += 1800;
  done("get_audience_detail", "68 tags, 9 brands, 19 culture refs", { chips: ["Electronic", "Indie", "Late nights", "Dance music", "Festival travel", "Warm"], faces });
  at += 700;
  done("pick_items", "Three-day pass, Three-day pass + camping, VIP three-day", { images: photos.slice(2, 5), chips: ["Three-day pass", "VIP three-day"] });
  at += 900;
  done("get_brand_site", "16 site photos, 39 KB markup", { images: photos.slice(0, 6) });
  think(THOUGHTS[1], 4200);
  call("search_images", "Finding photographs");
  at += 1600;
  done("search_images", '3 photos for "festival crowd under stage lights at night"', { images: photos.slice(5, 8) });
  think(THOUGHTS[2], 2400);
  // write_page streams: meta and css first, then the markup top to bottom.
  step(300, (t) => ({ ...t, status: "Writing the page", draft: { css: "", html: "", fonts: [] }, steps: [...t.steps, { kind: "tool", name: "write_page", label: "Writing the page", status: "running", t: Date.now() - t.startedAt }] }));
  const css = doc.css;
  for (let i = 0; i < css.length; i += 160) {
    const chunk = css.slice(i, i + 160);
    step(70, (t) => ({ ...t, draft: { ...(t.draft ?? { html: "", fonts: [] }), css: (t.draft?.css ?? "") + chunk, fonts: doc.meta.fonts ?? [], html: t.draft?.html ?? "" } }));
  }
  const html = doc.html;
  for (let i = 0; i < html.length; i += 220) {
    const chunk = html.slice(i, i + 220);
    step(55, (t) => ({ ...t, draft: { css: t.draft?.css ?? "", fonts: t.draft?.fonts ?? [], html: (t.draft?.html ?? "") + chunk } }));
  }
  step(400, (t) => t);
  done("write_page", `${sections.length} sections`, { chips: sections });
  at += 1400;
  call("review_page", "Reviewing the page against the brand's homepage");
  at += 6000;
  done("review_page", "brand match 9/10, quality 8/10, 2 issues", { notes: ["The lineup grid is tight on mobile; give the cards more air", "The hero ribbon sits over the headline on small screens"] });
  call("edit_page", "Editing the page");
  at += 1500;
  done("edit_page", `2 changes, ${sections.length} sections`);
  call("explain_page", "Writing up why the page is built this way");
  at += 2500;
  done("explain_page", `${sections.length} sections explained`);
  const reply = "The page leads with the river and three days of music, and puts the lineup straight after the hero, re-ranked for this crowd. It keeps the homepage's cream, black and orange, the expanded headlines and the striped ribbon.";
  for (let i = 0; i < reply.length; i += 24) {
    const chunk = reply.slice(i, i + 24);
    step(60, (t) => {
      const last = t.steps[t.steps.length - 1];
      if (last?.kind === "text") return { ...t, steps: [...t.steps.slice(0, -1), { ...last, text: last.text + chunk }] };
      return { ...t, steps: [...t.steps, { kind: "text", text: chunk, t: Date.now() - t.startedAt }] };
    });
  }
  step(600, (t) => ({ ...t, status: null }));
  return { beats, end: at };
}

export function BuildReplay({ brand, pageSlug, variant, doc, speed = 1, stopAt }: { brand: Brand; pageSlug: string; variant: Variant; doc: HtmlDoc; speed?: number; /** Freeze the replay this many seconds in. */ stopAt?: number }) {
  const { beats } = useMemo(() => script(doc), [doc]);
  const [run, setRun] = useState(0);
  const [turn, setTurn] = useState<LiveTurn | null>(null);

  useEffect(() => {
    const start: LiveTurn = { variantId: variant._id, kind: "generate", status: "Starting", spans: [], steps: [], text: "", error: null, startedAt: Date.now(), draft: null };
    const timers = beats.filter((b) => stopAt === undefined || b.at / speed <= stopAt * 1000).map((b) => setTimeout(() => setTurn((t) => b.apply(t ?? start)), b.at / speed));
    const first = setTimeout(() => setTurn(start), 0);
    return () => {
      clearTimeout(first);
      timers.forEach(clearTimeout);
    };
  }, [beats, run, speed, stopAt, variant._id]);

  const wrote = !!turn?.steps.some((s) => s.kind === "tool" && s.name === "write_page" && s.status === "done");
  const shown = useMemo(() => (wrote ? variant : { ...variant, doc: undefined }) as Variant, [wrote, variant]);
  const reply = turn?.steps.filter((s) => s.kind === "text").map((s) => (s as { text: string }).text).join("") ?? "";

  return (
    <div className="fixed inset-0 grid grid-cols-[26rem_minmax(0,1fr)] bg-muted/40 font-sans text-foreground">
      <aside className="scrollbar-thin flex min-h-0 flex-col gap-3 overflow-y-auto border-r bg-background p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Build replay for {brand.name}</p>
          <Button size="xs" variant="outline" onClick={() => setRun((r) => r + 1)}>
            <RotateCcw data-icon="inline-start" /> Replay
          </Button>
        </div>
        {turn && <LiveBuildCard live={turn} />}
        {reply && <StreamingText text={reply} live={turn?.status !== null} />}
      </aside>
      <section className="flex min-h-0 flex-col p-3">
        <PreviewFrame key={run} brand={brand} pageSlug={pageSlug} variant={shown} device="desktop" reloadKey={0} live={turn} className="min-h-0 flex-1" />
      </section>
    </div>
  );
}
