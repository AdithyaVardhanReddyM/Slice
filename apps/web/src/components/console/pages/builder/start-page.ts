"use client";

import { useMutation } from "convex/react";
import { useCallback } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { postJson } from "@/lib/pages/stream";
import type { Brand, Span } from "@/lib/pages/types";
import { useCompileAudience } from "../new-audience-sheet";
import type { Attachment } from "./attachments";
import type { PageSettings } from "./settings-sheet";

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

export interface StartPageInput {
  /** The page's brief in the merchant's words (opens the new page's chat). */
  text: string;
  /** Saved audiences mentioned with @. */
  audienceIds: string[];
  attachments?: Attachment[];
  /** Settings the merchant set before the first prompt; they beat the plan. */
  settings?: Partial<PageSettings>;
  model?: string;
  /** The page the merchant was editing: its goal, offer, CTA, items and image mode carry over. */
  source?: { id: Id<"pages">; brief: { imageMode: string; inspiration?: string[] } };
  onStatus?: (text: string) => void;
  /** The plan is back: the page's title and the agent's calls so far. */
  onPlan?: (title: string, spans: Span[]) => void;
}

/**
 * Plans a page from a prompt (title, slug, goal, offer, CTA, items, its
 * audiences, including new ones described in words), creates the new
 * audiences, then the page, and returns its slug. The caller opens
 * /[page]?generate=1, where the builder writes it.
 */
export function useStartPage(brand: Brand) {
  const createPage = useMutation(api.pages.create);
  const createAudience = useMutation(api.pagesAudiences.create);
  const compileAudience = useCompileAudience();

  return useCallback(
    async ({ text, audienceIds, attachments = [], settings = {}, model, source, onStatus, onPlan }: StartPageInput) => {
      const res = await postJson<PlanResponse>("/api/pages/plan", { brand_id: brand._id, prompt: text, audience_ids: audienceIds, model, source_page_id: source?.id });
      if (!res.ok) throw new Error(res.error);
      const plan = res.plan;
      const title = settings.title?.trim() || plan.title;
      onPlan?.(title, res.trace ?? []);

      const fresh: Id<"pagesAudiences">[] = [];
      if (plan.newAudiences.length) onStatus?.(`Setting up ${listNames(plan.newAudiences.map((a) => a.name))}`);
      for (const a of plan.newAudiences) {
        const { id } = await createAudience({ brandId: brand._id, name: a.name, kind: a.kind, sources: a.sources });
        fresh.push(id);
        // Runs on its own; the builder waits for the page's audiences before building.
        void compileAudience(id);
      }

      onStatus?.("Creating the page");
      const now = Date.now();
      const key = Math.random().toString(36).slice(2, 10);
      // Attached images ride along as inspiration: the builder sees them on every generate turn.
      const inspiration = attachments.length ? attachments.map((a) => a.url) : (source?.brief.inspiration ?? []);
      const { slug } = await createPage({
        brandId: brand._id,
        title,
        slug: settings.slug?.trim() || plan.slug || undefined,
        brief: {
          goal: settings.goal || plan.goal,
          prompt: text,
          offer: settings.offer?.trim() || plan.offer || undefined,
          cta: { label: settings.ctaLabel?.trim() || plan.cta.label, href: settings.ctaHref?.trim() || plan.cta.href },
          itemIds: plan.itemIds,
          inspiration,
          imageMode: settings.imageMode || source?.brief.imageMode || "pexels",
        },
        audienceIds: [...new Set([...(plan.audienceIds as Id<"pagesAudiences">[]), ...fresh])],
        messages: [
          { id: `${key}-m`, role: "merchant", at: now, text, ...(attachments.length ? { attachments } : {}) },
          { id: key, role: "agent", at: now + 1, text: plan.reply || `Building ${title}.`, trace: cleanSpans(res.trace) },
        ],
      });
      return { slug, title };
    },
    [brand._id, createPage, createAudience, compileAudience],
  );
}
