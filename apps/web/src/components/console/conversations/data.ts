import { product, productImage, styleLabel } from "@/lib/mock/catalog";
import { personas } from "@/lib/mock/personas";
import type { Conversation, Outcome } from "@/lib/mock/types";

// View models for the conversation screens. Built on the server so client
// components get plain props and the catalog JSON never ships to the browser.

export interface ConversationSummary {
  id: string;
  startedAt: string;
  city: string;
  region: string;
  opener: string;
  intent: string;
  outcome: Outcome;
  entities: string[];
  thumbs: (string | null)[];
}

export function summarize(c: Conversation): ConversationSummary {
  const firstRecs = c.messages.find((m) => m.recs)?.recs ?? [];
  return {
    id: c.id,
    startedAt: c.startedAt,
    city: c.shopper.city,
    region: c.shopper.region,
    opener: c.messages.find((m) => m.role === "shopper")?.text ?? "",
    intent: c.intent,
    outcome: c.outcome,
    entities: c.profile.entities.map((e) => e.name),
    thumbs: firstRecs.map((r) => productImage(product(r.productId))),
  };
}

/* One conversation ------------------------------------------------------- */

export interface PickView {
  id: string;
  name: string;
  brand?: string;
  price: number;
  image: string | null;
  status: "carted" | "opened" | null;
  match: number;
  /** Why the concierge chose it, in the merchant's words. */
  why: { label: string; value: string }[];
}

export type LineView =
  | { kind: "shopper"; id: string; at: string; text: string }
  | {
      kind: "concierge";
      id: string;
      at: string;
      text: string;
      picks: PickView[];
    }
  | { kind: "end"; id: string; at: string; text: string };

export interface ConversationDetail {
  id: string;
  title: string;
  outcome: Outcome;
  /** Price of the picks the shopper put in their cart. */
  carted: number;
  city: string;
  device: string;
  startedAt: string;
  taste: {
    group: string;
    summary: string;
    loves: string[];
    /** Answers from the taste questions, with the question they answered. */
    picked: { choice: string; question: string }[];
    /** Things the shopper brought up in chat that shaped their taste. */
    mentioned: string[];
  };
  visit: { label: string; value: string }[];
  lines: LineView[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) =>
  xs.length < 2
    ? (xs[0] ?? "")
    : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export function conversationDetail(c: Conversation): ConversationDetail {
  const store = c.storeKey;
  const persona = personas.find(
    (p) => p.store === store && p.label === c.persona,
  );
  const intentFor = (messageId: string) =>
    c.traces.find((t) => t.messageId === messageId)?.intent;

  const lines: LineView[] = c.messages.flatMap((m): LineView[] => {
    if (m.role === "shopper")
      return [{ kind: "shopper", id: m.id, at: m.at, text: m.text }];
    if (m.role === "system")
      // Only how it ended; the opening and the questionnaire live in the shopper card.
      return m.id.endsWith("_m9")
        ? [{ kind: "end", id: m.id, at: m.at, text: m.text }]
        : [];
    if (!m.recs) return []; // The greeting every chat opens with.
    const intent = intentFor(m.id);
    return [
      {
        kind: "concierge",
        id: m.id,
        at: m.at,
        text: m.text,
        picks: m.recs.map((r) => {
          const p = product(r.productId);
          const styles = r.matched.styles.map((s) => styleLabel(store, s));
          const materials = [
            ...new Set(
              r.matched.materials.length
                ? r.matched.materials
                : p.attributes.material,
            ),
          ].slice(0, 2);
          const color = r.matched.colors[0] ?? p.attributes.colors[0];
          const why = [
            styles.length && { label: "Fits their taste", value: list(styles) },
            materials.length && {
              label: "Materials",
              value: `${cap(list(materials))}${color ? `, in ${color}` : ""}`,
            },
            intent && {
              label: "Their request",
              value: intent.category.includes(p.subcategory)
                ? `Answers it (${p.subcategory.toLowerCase()})`
                : `Goes with it (${p.subcategory.toLowerCase()})`,
            },
            intent?.budget && {
              label: "Budget",
              value: `$${p.price}, ${p.price <= intent.budget ? "inside" : "over"} their $${intent.budget}`,
            },
          ].filter((x): x is { label: string; value: string } => !!x);
          return {
            id: p.id,
            name: p.name,
            brand: p.brand,
            price: p.price,
            image: productImage(p),
            status: r.addedToCart ? "carted" : r.clicked ? "opened" : null,
            match: r.score,
            why,
          };
        }),
      },
    ];
  });

  const recs = c.messages.flatMap((m) => m.recs ?? []);
  return {
    id: c.id,
    title: c.intent,
    outcome: c.outcome,
    carted: recs
      .filter((r) => r.addedToCart)
      .reduce((s, r) => s + product(r.productId).price, 0),
    city: `${c.shopper.city}, ${c.shopper.region}`,
    device: c.shopper.device,
    startedAt: c.startedAt,
    taste: {
      group: c.persona,
      summary: persona?.summary ?? "",
      loves: c.profile.styles
        .filter((s) => s.score >= 0.5)
        .map((s) => s.label),
      picked: c.profile.answers.map((a) => ({
        choice: a.choice,
        question: a.question,
      })),
      mentioned: c.profile.entities
        .filter((e) => e.source === "chat")
        .map((e) => e.name),
    },
    visit: [
      { label: "Came from", value: c.shopper.referrer },
      { label: "Started on", value: c.shopper.entryPage },
      {
        label: "Visitor",
        value: c.shopper.returning ? "Returning" : "First visit",
      },
      { label: "Time in chat", value: `${Math.round(c.durationSec / 60)} min` },
    ],
    lines,
  };
}
