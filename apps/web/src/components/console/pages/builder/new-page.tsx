"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Settings2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { postJson } from "@/lib/pages/stream";
import { usePagesModel } from "@/lib/pages/models";
import type { Audience, Span } from "@/lib/pages/types";
import { Button } from "@/components/ui/button";
import { useBrand } from "../brand-context";
import { useCompileAudience } from "../new-audience-sheet";
import { BuilderChat } from "./chat";
import { PromptComposer, type ComposerHandle, type ComposerValue } from "./composer";
import { CanvasPlaceholder, ChatWelcome, EditorLayout, EditorTopbar } from "./editor-shell";
import { PageSettingsSheet, type PageSettings } from "./settings-sheet";
import type { LiveTurn } from "./use-builder";

interface Plan {
  title: string;
  slug: string;
  goal: string;
  offer: string;
  cta: { label: string; href: string };
  itemIds: string[];
  audienceIds: string[];
  newAudiences: { name: string; kind: string; sources: { demographics?: { age?: string; gender?: string }; location?: { city: string; country?: string }; interests?: string[] } }[];
  reply: string;
}

type PlanResponse = { ok: true; plan: Plan; trace?: Span[] } | { ok: false; error: string };

/** Only the fields the backend's span validator accepts. */
const cleanSpans = (spans: Span[] = []) =>
  spans.map((s) => ({ kind: String(s.kind), name: String(s.name), ms: Number(s.ms) || 0, result: String(s.result ?? ""), ...(typeof s.started === "number" ? { started: s.started } : {}) }));

const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * /dashboard/pages/[brand]/new: an empty editor. The first prompt is planned
 * by the agent (title, slug, goal, offer, CTA, items, audiences, including new
 * audiences described in words), the page is created, and the builder takes
 * over on the page's own route to build every version.
 */
export function NewPageBuilder() {
  const brand = useBrand();
  const router = useRouter();
  const audiences = (useQuery(api.pagesAudiences.list, { brandId: brand._id }) ?? []) as Audience[];
  const createPage = useMutation(api.pages.create);
  const createAudience = useMutation(api.pagesAudiences.create);
  const compileAudience = useCompileAudience();
  const composer = useRef<ComposerHandle>(null);
  const [settings, setSettings] = useState<Partial<PageSettings>>({ imageMode: "pexels" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [turn, setTurn] = useState<LiveTurn | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [model, setModel] = usePagesModel();

  const status = (text: string) => setTurn((t) => (t ? { ...t, status: text } : t));

  async function start({ text, mentions }: ComposerValue) {
    setTurn({ variantId: "", kind: "edit", status: "Reading your brief", spans: [], text: "", error: null, prompt: text });
    try {
      const res = await postJson<PlanResponse>("/api/pages/plan", { brand_id: brand._id, prompt: text, audience_ids: mentions.map((a) => a._id), model });
      if (!res.ok) throw new Error(res.error);
      const plan = res.plan;
      const pageTitle = settings.title?.trim() || plan.title;
      setTitle(pageTitle);
      setTurn((t) => (t ? { ...t, spans: res.trace ?? [] } : t));

      const fresh: Id<"pagesAudiences">[] = [];
      if (plan.newAudiences.length) status(`Setting up ${listNames(plan.newAudiences.map((a) => a.name))}`);
      for (const a of plan.newAudiences) {
        const { id } = await createAudience({ brandId: brand._id, name: a.name, kind: a.kind, sources: a.sources });
        fresh.push(id);
        // Runs on its own; the builder waits for each audience before building its version.
        void compileAudience(id);
      }

      status("Creating the page");
      const now = Date.now();
      const key = Math.random().toString(36).slice(2, 10);
      const { slug } = await createPage({
        brandId: brand._id,
        title: pageTitle,
        slug: settings.slug?.trim() || plan.slug || undefined,
        brief: {
          goal: settings.goal || plan.goal,
          prompt: text,
          offer: (settings.offer?.trim() || plan.offer) || undefined,
          cta: { label: settings.ctaLabel?.trim() || plan.cta.label, href: settings.ctaHref?.trim() || plan.cta.href },
          itemIds: plan.itemIds,
          imageMode: settings.imageMode || "pexels",
        },
        audienceIds: [...(plan.audienceIds as Id<"pagesAudiences">[]), ...fresh],
        messages: [
          { id: `${key}-m`, role: "merchant", at: now, text },
          { id: key, role: "agent", at: now + 1, text: plan.reply || `Building ${pageTitle}.`, trace: cleanSpans(res.trace) },
        ],
      });
      status("Starting the builder");
      router.replace(`/dashboard/pages/${brand.slug}/${slug}?generate=1`);
    } catch (err) {
      setTurn((t) => (t ? { ...t, status: null, error: String((err as Error).message ?? err).replace(/^Error: /, "") } : t));
    }
  }

  const busy = !!turn && turn.status !== null;

  return (
    <EditorLayout
      topbar={
        <EditorTopbar
          brand={brand}
          title={title ?? (settings.title?.trim() || "New page")}
          actions={
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 data-icon="inline-start" /> Settings
            </Button>
          }
        />
      }
      chat={
        <BuilderChat
          build={null}
          live={turn}
          variants={[]}
          audiences={audiences}
          empty={<ChatWelcome brand={brand} audiences={audiences} onPick={(parts) => composer.current?.set(parts)} />}
          composer={
            <PromptComposer
              ref={composer}
              autoFocus
              brandSlug={brand.slug}
              audiences={audiences}
              placeholder="Describe the page you want…"
              disabled={busy}
              model={model}
              onModelChange={setModel}
              onSubmit={(v) => void start(v)}
            />
          }
        />
      }
      canvas={
        <>
          <CanvasPlaceholder brand={brand} status={turn?.status} title={title ?? undefined} />
          <PageSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} brandSlug={brand.slug} initial={settings} draft onSave={(v) => setSettings(v)} />
        </>
      }
    />
  );
}
