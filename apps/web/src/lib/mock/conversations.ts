import type { Product } from "@slice/demo-catalogs";
import { catalogs, product, styleLabel } from "./catalog";
import { personas, type Persona, type Scenario } from "./personas";
import { NOW, entityId, rng, slug } from "./random";
import type {
  Candidate,
  Conversation,
  Message,
  Outcome,
  Recommendation,
  Span,
  StoreKey,
  TasteProfile,
  TurnTrace,
} from "./types";

const MODEL = "gemini-3.8-flash";
const STORE_NAME: Record<StoreKey, string> = { marlow: "Marlow", fold: "Fold" };

function buildProfile(persona: Persona): TasteProfile {
  const entities = persona.entities.map((e) => ({
    id: entityId(e.name),
    name: e.name,
    type: e.type,
    source: e.source,
  }));
  const tags = persona.tags.map((t) => ({
    id: `urn:tag:keyword:qloo:${slug(t.name)}`,
    name: t.name,
    weight: t.weight,
    from: t.from.map((i) => entities[i].id),
  }));
  return {
    answers: persona.answers,
    entities,
    tags,
    styles: persona.styles.map((s) => ({
      style: s.style,
      label: styleLabel(persona.store, s.style),
      score: s.score,
      from: s.from.map((i) => tags[i].id),
    })),
    palette: persona.palette,
    materials: persona.materials,
  };
}

const fuzzy = (values: string[], against: string[]) =>
  values.filter((v) =>
    against.some(
      (a) => v.toLowerCase().includes(a) || a.includes(v.toLowerCase()),
    ),
  );

function scoreProduct(p: Product, persona: Persona, scenario: Scenario) {
  const styleScores = p.attributes.style.map(
    (s) => persona.styles.find((ps) => ps.style === s)?.score ?? 0.12,
  );
  const materials = fuzzy(p.attributes.material, persona.materials);
  const colors = fuzzy(p.attributes.colors, persona.palette);
  const taste = Math.min(
    0.99,
    0.72 * Math.max(...styleScores) +
      0.14 * Math.min(1, materials.length / 2) +
      0.14 * Math.min(1, colors.length / 2),
  );
  const intent = scenario.category.includes(p.subcategory) ? 0.93 : 0.71;
  const constraints = scenario.budget && p.price > scenario.budget ? 0.55 : 1;
  const score = 0.5 * taste + 0.38 * intent + 0.12 * constraints;
  return {
    score,
    breakdown: { taste, intent, constraints },
    matched: {
      styles: p.attributes.style.filter((s) =>
        persona.styles.some((ps) => ps.style === s),
      ),
      materials,
      colors,
    },
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round2 = (n: number) => Math.round(n * 100) / 100;

function buildRecs(
  ids: string[],
  persona: Persona,
  scenario: Scenario,
  profile: TasteProfile,
  outcome: Outcome,
  primary: boolean,
): Recommendation[] {
  const scored = ids
    .map((id) => ({
      p: product(id),
      ...scoreProduct(product(id), persona, scenario),
    }))
    .sort((a, b) => b.score - a.score);

  return scored.map(({ p, score, breakdown, matched }, i) => {
    const styleNames = matched.styles.map((s) => styleLabel(persona.store, s));
    const mats = matched.materials.length
      ? matched.materials
      : p.attributes.material.slice(0, 2);
    const color = (matched.colors[0] ?? p.attributes.colors[0]) || "";
    const drivers = profile.styles
      .filter((s) => matched.styles.includes(s.style))
      .flatMap((s) => s.from)
      .map((id) => profile.tags.find((t) => t.id === id)!)
      .filter(Boolean)
      .slice(0, 2);
    const sources = profile.entities
      .filter((e) => drivers.some((d) => d.from.includes(e.id)))
      .slice(0, 2)
      .map((e) => e.name);
    const inBudget = scenario.budget ? p.price <= scenario.budget : true;

    return {
      productId: p.id,
      rank: i + 1,
      score: round2(score),
      breakdown: {
        taste: round2(breakdown.taste),
        intent: round2(breakdown.intent),
        constraints: round2(breakdown.constraints),
      },
      reason: `${cap(mats.slice(0, 2).join(" and "))}${color ? `, in ${color}` : ""}.${
        scenario.budget && inBudget ? ` $${p.price}, inside your budget.` : ""
      }`,
      rationale: `${sources.join(" and ") || "The shopper's picks"} resolve on Qloo to ${
        drivers
          .map((d) => `${d.name} (${Math.round(d.weight * 100)}%)`)
          .join(" and ") || "a weak taste signal"
      }, which maps to ${
        styleNames.join(" and ") || "no strong catalog style"
      }. ${p.name} is tagged ${p.attributes.style
        .map((s) => styleLabel(persona.store, s))
        .join(" / ")} in ${p.attributes.material.slice(0, 3).join(", ")}.${
        scenario.category.includes(p.subcategory)
          ? ` It answers the ask directly (${p.subcategory}).`
          : ` It's a pairing, not the direct ask (${p.subcategory}).`
      }${scenario.budget ? ` $${p.price} against a $${scenario.budget} budget.` : ""}`,
      matched,
      clicked:
        primary &&
        i === 0 &&
        ["purchased", "added_to_cart", "clicked"].includes(outcome),
      addedToCart:
        primary && i === 0 && ["purchased", "added_to_cart"].includes(outcome),
    };
  });
}

function buildTrace(
  id: string,
  messageId: string,
  persona: Persona,
  scenario: Scenario,
  profile: TasteProfile,
  recs: Recommendation[],
  firstTurn: boolean,
  r: ReturnType<typeof rng>,
): TurnTrace {
  const spans: Span[] = [];
  let t = 0;
  const add = (s: Omit<Span, "id" | "start">, at = t) => {
    const span = { ...s, id: `${id}_s${spans.length + 1}`, start: at };
    spans.push(span);
    return span;
  };

  const parse = add({
    kind: "llm",
    name: "Parse shopper turn",
    duration: r.int(340, 520),
    model: MODEL,
    tokens: { input: r.int(1400, 2200), output: r.int(60, 110) },
    result: `intent → ${scenario.category.join(" | ")}${scenario.budget ? ` · budget ≤ $${scenario.budget}` : ""}`,
  });
  t += parse.duration;

  const load = add({
    kind: "slice",
    name: "Load session taste profile",
    duration: r.int(3, 7),
    result: firstTurn
      ? `${profile.answers.length} answers · profile not built yet`
      : `cached · ${profile.tags.length} tags, ${profile.styles.length} styles`,
  });
  t += load.duration;

  if (firstTurn) {
    let longest = 0;
    for (const e of profile.entities) {
      const hit = r.chance(0.8);
      const s = add({
        kind: "qloo",
        name: "Resolve entity",
        method: "GET",
        path: "/search",
        params: { query: e.name, types: `urn:entity:${e.type}` },
        cache: hit ? "hit" : "miss",
        duration: hit ? r.int(3, 9) : r.int(170, 320),
        result: `${e.name} → ${e.id.slice(0, 8)}`,
      });
      longest = Math.max(longest, s.duration);
    }
    t += longest;

    const ids = profile.entities.map((e) => e.id).join(",");
    const tagsCall = add({
      kind: "qloo",
      name: "Taste tags for entities",
      method: "GET",
      path: "/v2/insights",
      params: {
        "filter.type": "urn:tag",
        "signal.interests.entities": ids,
        take: "25",
      },
      cache: "miss",
      duration: r.int(520, 780),
      result: `25 tags · top ${profile.tags
        .slice(0, 2)
        .map((x) => `${x.name} ${x.weight.toFixed(2)}`)
        .join(", ")}`,
    });
    if (persona.store === "fold") {
      add(
        {
          kind: "qloo",
          name: "Brand affinity",
          method: "GET",
          path: "/v2/insights",
          params: {
            "filter.type": "urn:entity:brand",
            "signal.interests.entities": ids,
            take: "15",
          },
          cache: "miss",
          duration: r.int(480, 690),
          result: "15 brands · 3 carried (used as a weak signal only)",
        },
        t,
      );
    }
    t += tagsCall.duration;

    const map = add({
      kind: "slice",
      name: "Map taste tags → catalog styles",
      duration: r.int(24, 46),
      result: profile.styles
        .slice(0, 2)
        .map((s) => `${s.style} ${s.score.toFixed(2)}`)
        .join(" · "),
    });
    t += map.duration;
  }

  const catalog = catalogs[persona.store];
  const filtered = r.int(11, 24);
  const filter = add({
    kind: "catalog",
    name: "Filter catalog",
    duration: r.int(8, 16),
    result: `${catalog.products.length} → ${filtered} (${scenario.constraints.slice(0, 2).join(", ")}, in stock)`,
  });
  t += filter.duration;

  const scoreSpan = add({
    kind: "catalog",
    name: "Score candidates",
    duration: r.int(16, 30),
    result: `${filtered} scored · top ${recs.length + scenario.alsoRan.length} to ranker`,
  });
  t += scoreSpan.duration;

  const rank = add({
    kind: "llm",
    name: "Rank & write reply",
    duration: r.int(880, 1460),
    model: MODEL,
    tokens: { input: r.int(3600, 5200), output: r.int(140, 260) },
    result: `${recs.length} picks · ${r.int(48, 86)} words`,
  });
  t += rank.duration;

  const guard = add({
    kind: "slice",
    name: "Guardrails",
    duration: r.int(1, 4),
    result: "stock ✓ · budget ✓ · claims grounded in catalog ✓",
  });
  t += guard.duration;

  const notes = [
    "lower taste fit",
    "similar to a higher pick",
    "lower intent match",
    "out of stock in most variants",
  ];
  const candidates: Candidate[] = [
    ...recs.map((x) => ({
      productId: x.productId,
      score: x.score,
      kept: true,
    })),
    ...scenario.alsoRan.map((pid, i) => {
      const p = product(pid);
      const s = scoreProduct(p, persona, scenario);
      const over = scenario.budget && p.price > scenario.budget;
      return {
        productId: pid,
        score: round2(
          Math.min(s.score, recs[recs.length - 1].score - 0.02 - i * 0.015),
        ),
        kept: false,
        note: over ? `over budget ($${p.price})` : notes[i % notes.length],
      };
    }),
  ];

  return {
    id,
    messageId,
    totalMs: t,
    spans,
    intent: {
      summary: scenario.intent,
      category: scenario.category,
      budget: scenario.budget,
      room: scenario.room,
      constraints: scenario.constraints,
    },
    retrieval: { catalogSize: catalog.products.length, filtered, candidates },
  };
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

const ENTRY: Record<StoreKey, string[]> = {
  marlow: [
    "/marlow",
    "/marlow/living",
    "/marlow/bedroom",
    "/marlow/lighting",
    "/marlow/kitchen-and-dining",
  ],
  fold: [
    "/fold",
    "/fold/new",
    "/fold/outerwear",
    "/fold/footwear",
    "/fold/brands",
  ],
};
const REFERRERS = [
  "instagram.com",
  "google.com",
  "direct",
  "pinterest.com",
  "newsletter",
  "tiktok.com",
];

/** Skews later picks toward the first personas so audience shares aren't flat. */
function weighted(x: number, n: number): number {
  return Math.min(n - 1, Math.floor(Math.pow(x, 1.7) * n));
}

function generate(
  widgetId: string,
  store: StoreKey,
  count: number,
  seed: number,
) {
  const r = rng(seed);
  const pool = personas.filter((p) => p.store === store);
  const out: Conversation[] = [];
  let clock = NOW - r.int(2, 9) * 60_000;

  for (let i = 0; i < count; i++) {
    const persona = pool[i < pool.length ? i : weighted(r.next(), pool.length)];
    const scenario = r.pick(persona.scenarios);
    const outcome = r.pick(scenario.outcomes);
    const [city, region] = r.pick(persona.cities);
    const profile = buildProfile(persona);
    const id = `cnv_${entityId(`${widgetId}:${i}`).slice(0, 8).toLowerCase()}`;
    const t0 = clock;
    const at = (s: number) => iso(t0 + s * 1000);
    const messages: Message[] = [];
    const traces: TurnTrace[] = [];
    const entryPage = r.pick(ENTRY[store]);

    messages.push({
      id: `${id}_m0`,
      role: "system",
      at: at(0),
      text: `Opened the concierge on ${entryPage}`,
    });
    messages.push({
      id: `${id}_m1`,
      role: "concierge",
      at: at(1),
      text: `Hi! I'm the ${STORE_NAME[store]} concierge. A few quick picks so I know your taste, or skip them and just ask.`,
    });
    messages.push({
      id: `${id}_m2`,
      role: "system",
      at: at(38),
      text: `Taste questionnaire · ${profile.answers.length} answers`,
    });
    messages.push({
      id: `${id}_m3`,
      role: "shopper",
      at: at(52),
      text: scenario.opener,
    });

    const recs = buildRecs(
      scenario.picks,
      persona,
      scenario,
      profile,
      outcome,
      !scenario.followUp || outcome === "abandoned",
    );
    const t1 = buildTrace(
      `${id}_t1`,
      `${id}_m4`,
      persona,
      scenario,
      profile,
      recs,
      true,
      r,
    );
    traces.push(t1);
    let s = 52 + Math.ceil(t1.totalMs / 1000) + 1;
    messages.push({
      id: `${id}_m4`,
      role: "concierge",
      at: at(s),
      text: scenario.reply,
      recs,
      traceId: t1.id,
    });

    let finalRecs = recs;
    if (
      scenario.followUp &&
      outcome !== "abandoned" &&
      outcome !== "no_match"
    ) {
      s += r.int(25, 70);
      messages.push({
        id: `${id}_m5`,
        role: "shopper",
        at: at(s),
        text: scenario.followUp.ask,
      });
      const fScenario = {
        ...scenario,
        category: [
          ...new Set(
            scenario.followUp.picks.map((x) => product(x).subcategory),
          ),
        ],
      };
      finalRecs = buildRecs(
        scenario.followUp.picks,
        persona,
        fScenario,
        profile,
        outcome,
        true,
      );
      const t2 = buildTrace(
        `${id}_t2`,
        `${id}_m6`,
        persona,
        fScenario,
        profile,
        finalRecs,
        false,
        r,
      );
      traces.push(t2);
      s += Math.ceil(t2.totalMs / 1000) + 1;
      messages.push({
        id: `${id}_m6`,
        role: "concierge",
        at: at(s),
        text: scenario.followUp.reply,
        recs: finalRecs,
        traceId: t2.id,
      });
    }

    const top = product(finalRecs[0].productId);
    s += r.int(20, 90);
    const outcomeText: Record<Outcome, string> = {
      purchased: `Checked out with ${top.name} · $${top.price}`,
      added_to_cart: `Added ${top.name} to cart`,
      clicked: `Opened ${top.name}`,
      browsing: "Still browsing the store",
      no_match: `No matching product: ${scenario.gap ?? scenario.intent}`,
      abandoned: "Closed the concierge without opening a pick",
    };
    messages.push({
      id: `${id}_m9`,
      role: "system",
      at: at(s),
      text: outcomeText[outcome],
    });

    out.push({
      id,
      widgetId,
      storeKey: store,
      shopper: {
        anonId: `shp_${entityId(id).slice(0, 4).toLowerCase()}${entityId(id).slice(9, 13).toLowerCase()}`,
        city,
        region,
        device: r.chance(0.58)
          ? "mobile"
          : r.chance(0.85)
            ? "desktop"
            : "tablet",
        entryPage,
        referrer: r.pick(REFERRERS),
        returning: r.chance(0.27),
      },
      startedAt: iso(t0),
      durationSec: s,
      outcome,
      intent: scenario.intent,
      persona: persona.label,
      profile,
      messages,
      traces,
      revenue: outcome === "purchased" ? top.price : 0,
      gap: scenario.gap,
    });

    clock -= r.int(7, 52) * 60_000;
  }
  return out;
}

export const conversations: Conversation[] = [
  ...generate("marlow", "marlow", 64, 7),
  ...generate("fold", "fold", 30, 19),
];

export function conversationsFor(widgetId: string) {
  return conversations.filter((c) => c.widgetId === widgetId);
}

export function getConversation(id: string) {
  return conversations.find((c) => c.id === id);
}
