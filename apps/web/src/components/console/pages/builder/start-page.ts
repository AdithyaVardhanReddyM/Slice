"use client";

import { useMutation } from "convex/react";
import { useCallback } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { postJson, type BuildStep, type PlanRecap, type Question } from "@/lib/pages/stream";
import type { Audience, Brand, Build, Span } from "@/lib/pages/types";
import { useCompileAudience } from "../use-compile-audience";
import type { Attachment } from "./attachments";
import type { PageSettings } from "./settings-sheet";

export interface Plan {
  title: string;
  slug: string;
  goal: string;
  offer: string;
  cta: { label: string; href: string };
  itemIds: string[];
  audienceIds: string[];
  /** Simple audiences, or "custom" ones combining a city, age bands, gender, interests and lifestyle segments. */
  newAudiences: { name: string; kind: string; sources: Audience["sources"] }[];
  reply: string;
}

type PlanResponse = { ok: true; plan: Plan; trace?: Span[] } | { ok: true; question: Question; trace?: Span[] } | { ok: false; error: string };

export type PlanOutcome = { question: Question; trace: Span[] } | { plan: Plan; trace: Span[] };

export type ChatMessage = NonNullable<Build>["messages"][number];

/** Only the fields the backend's span validator accepts. */
const cleanSpans = (spans: Span[] = []) =>
  spans.map((s) => ({ kind: String(s.kind), name: String(s.name), ms: Number(s.ms) || 0, result: String(s.result ?? ""), ...(typeof s.started === "number" ? { started: s.started } : {}) }));

const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The page's brief in the merchant's words: the first prompt, then each question with its answer. */
function briefFrom(text: string, transcript: ChatMessage[]): string {
  const lines = [text.trim()];
  transcript.forEach((m, i) => {
    const q = ((m.steps ?? []) as BuildStep[]).find((s) => s.kind === "question");
    const answer = transcript.slice(i + 1).find((x) => x.role === "merchant");
    if (q?.kind === "question" && answer) lines.push(`${q.question.text} ${answer.text.trim()}`);
  });
  return lines.join("\n");
}

/** The plan as the chat recaps it. */
export const recapOf = (plan: Plan, settings: Partial<PageSettings> = {}, audienceIds?: string[]): PlanRecap => ({
  title: settings.title?.trim() || plan.title,
  goal: settings.goal || plan.goal,
  offer: settings.offer?.trim() || plan.offer || undefined,
  cta: { label: settings.ctaLabel?.trim() || plan.cta.label, href: settings.ctaHref?.trim() || plan.cta.href },
  itemIds: plan.itemIds,
  audienceIds: audienceIds ?? plan.audienceIds,
  newAudiences: audienceIds ? [] : plan.newAudiences.map((a) => a.name),
});

export interface PlanInput {
  /** The merchant's first prompt. */
  text: string;
  /** Saved audiences mentioned with @ or picked from an option. */
  audienceIds: string[];
  /** The questions asked since the first prompt and the merchant's answers. */
  conversation?: { role: string; text: string }[];
  model?: string;
  /** The page the merchant was editing (the builder's hand-off); its settings carry over and nothing is asked. */
  source?: { id: Id<"pages">; brief: { imageMode: string; inspiration?: string[] } };
  /** False when nobody can answer a question. */
  ask?: boolean;
}

/** Asks the planner what to build: a plan, or a question when the prompt leaves too much open. */
export function usePlanPage(brand: Brand) {
  return useCallback(
    async ({ text, audienceIds, conversation = [], model, source, ask = true }: PlanInput): Promise<PlanOutcome> => {
      const res = await postJson<PlanResponse>("/api/pages/plan", {
        brand_id: brand._id,
        prompt: text,
        audience_ids: audienceIds,
        model,
        source_page_id: source?.id,
        conversation,
        ask: ask && !source,
      });
      if (!res.ok) throw new Error(res.error);
      if ("question" in res) return { question: res.question, trace: res.trace ?? [] };
      return { plan: res.plan, trace: res.trace ?? [] };
    },
    [brand._id],
  );
}

export interface CreateInput {
  text: string;
  attachments?: Attachment[];
  /** Settings the merchant set before the first prompt; they beat the plan. */
  settings?: Partial<PageSettings>;
  source?: PlanInput["source"];
  /** The conversation that led to the plan (first prompt, questions, answers); without it, just the prompt. */
  transcript?: ChatMessage[];
  onStatus?: (text: string) => void;
}

/**
 * Creates the plan's new audiences (compiling in the background), then the
 * page with the conversation as its opening chat, and returns its slug. The
 * caller opens /[page]?generate=1, where the builder writes it.
 */
export function useCreatePage(brand: Brand) {
  const createPage = useMutation(api.pages.create);
  const createAudience = useMutation(api.pagesAudiences.create);
  const compileAudience = useCompileAudience();

  return useCallback(
    async (plan: Plan, trace: Span[], { text, attachments = [], settings = {}, source, transcript, onStatus }: CreateInput) => {
      const title = settings.title?.trim() || plan.title;
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
      const audienceIds = [...new Set([...(plan.audienceIds as Id<"pagesAudiences">[]), ...fresh])];
      // Attached images ride along as inspiration: the builder sees them on every generate turn.
      const inspiration = attachments.length ? attachments.map((a) => a.url) : (source?.brief.inspiration ?? []);
      // Earlier recaps waiting for a go-ahead are superseded by the one this page is created from.
      const opening: ChatMessage[] = transcript?.length
        ? transcript.filter((m) => !((m.steps ?? []) as BuildStep[]).some((s) => s.kind === "plan"))
        : [{ id: `${key}-m`, role: "merchant", at: now, text, ...(attachments.length ? { attachments } : {}) }];
      const steps: BuildStep[] = [{ kind: "plan", plan: recapOf(plan, settings, audienceIds) }];
      const { slug } = await createPage({
        brandId: brand._id,
        title,
        slug: settings.slug?.trim() || plan.slug || undefined,
        brief: {
          goal: settings.goal || plan.goal,
          prompt: briefFrom(text, opening),
          offer: settings.offer?.trim() || plan.offer || undefined,
          cta: { label: settings.ctaLabel?.trim() || plan.cta.label, href: settings.ctaHref?.trim() || plan.cta.href },
          itemIds: plan.itemIds,
          inspiration,
          imageMode: settings.imageMode || source?.brief.imageMode || "pexels",
        },
        audienceIds,
        messages: [
          ...opening.map((m) => ({ id: m.id, role: m.role, at: m.at, text: m.text, ...(m.steps?.length ? { steps: m.steps } : {}), ...(m.attachments ? { attachments: m.attachments } : {}), ...(m.trace ? { trace: cleanSpans(m.trace as Span[]) } : {}) })),
          { id: key, role: "agent", at: now + 1, text: plan.reply || `Building ${title}.`, steps, trace: cleanSpans(trace) },
        ],
      });
      return { slug, title };
    },
    [brand._id, createPage, createAudience, compileAudience],
  );
}

export interface StartPageInput extends Omit<PlanInput, "ask" | "conversation"> {
  attachments?: Attachment[];
  settings?: Partial<PageSettings>;
  onStatus?: (text: string) => void;
  /** The plan is back: the page's title and the agent's calls so far. */
  onPlan?: (title: string, spans: Span[]) => void;
}

/**
 * Plans and creates a page in one go, without questions (the builder's
 * hand-off to a page for another audience), and returns its slug.
 */
export function useStartPage(brand: Brand) {
  const planPage = usePlanPage(brand);
  const create = useCreatePage(brand);
  return useCallback(
    async ({ text, audienceIds, attachments = [], settings = {}, model, source, onStatus, onPlan }: StartPageInput) => {
      const out = await planPage({ text, audienceIds, model, source, ask: false });
      if (!("plan" in out)) throw new Error("The planner asked a question instead of planning");
      onPlan?.(settings.title?.trim() || out.plan.title, out.trace);
      return create(out.plan, out.trace, { text, attachments, settings, source, onStatus });
    },
    [planPage, create],
  );
}
