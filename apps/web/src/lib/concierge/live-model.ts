import type {
  ConversationDetail,
  ConversationSummary,
  LineView,
  PickView,
} from "@/components/console/conversations/data";
import { styleCoverage } from "@/components/console/catalog/rows";
import type {
  ConciergeRangeData,
  FunnelTotals,
  HomeConversation,
} from "@/lib/mock/home";
import type {
  InsightGroup,
  InsightIdea,
  InsightPlace,
  InsightProduct,
  InsightStyle,
  TasteInsightsData,
} from "@/lib/mock/taste-insights";
import type { Outcome, Widget } from "@/lib/mock/types";
import type {
  OverviewGap,
  OverviewProduct,
  OverviewRange,
  WidgetOverviewData,
} from "@/lib/mock/widget-overview";
import { cityCoords } from "./cities";
import type { LiveConversation, LiveData } from "./live";

// The console's view models built from the widget's own data, in the same
// shapes the sample data uses, so every screen renders either. Only what the
// widget sees: the chat, the profile the shopper built, which picks they
// opened or put in their cart, and how many sessions loaded slice.js.

type Conv = LiveData["conversations"][number];
type Profile = LiveData["profiles"][number];
type Message = Conv["messages"][number];
type Pick = Message["picks"][number];
type Ask = NonNullable<Message["ask"]>;
type StyleDef = LiveData["styles"][number];

const DAY = 86_400_000;
const RANGES = [7, 14, 30] as const satisfies readonly OverviewRange[];
/** How well a product has to fit a shopper before it counts as suiting them. */
const SUITS = 0.6;
/** A style counts as short or long when its two shares differ by more than this. */
const SLACK = 0.025;

const iso = (ms: number) => new Date(ms).toISOString();
const dayOf = (ms: number) => iso(ms).slice(0, 10);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) =>
  xs.length < 2
    ? (xs[0] ?? "")
    : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

function bump<T>(counts: Map<T, number>, key: T, by = 1) {
  counts.set(key, (counts.get(key) ?? 0) + by);
}
function top<T>(counts: Map<T, number>, take: number): T[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([k]) => k);
}

/** "Something for a weekend hike upstate", cut at a word near `max`. */
function clip(text: string, max = 64) {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 12)).replace(/[,.;:]$/, "")}…`;
}

/** The brief speaks to the shopper ("You lean…"); the console speaks about them. */
function aboutThem(text: string) {
  return text
    .replace(/\byou're\b/gi, (m) => (m[0] === "Y" ? "They're" : "they're"))
    .replace(/\byourself\b/gi, "themselves")
    .replace(/\byours\b/gi, "theirs")
    .replace(/\byour\b/gi, (m) => (m[0] === "Y" ? "Their" : "their"))
    .replace(/\byou\b/gi, (m) => (m[0] === "Y" ? "They" : "they"));
}

/** A reply that says the store doesn't have what was asked for. */
const DONT_CARRY =
  /\b(?:don['’]t|do not|doesn['’]t|does not|can['’]t|cannot)\s+(?:currently\s+|really\s+)?(?:carry|stock|sell|offer|have any)\b|\bnot something (?:we|this store|the store|i)\b|\bnothing (?:in (?:the|this|our) (?:catalog|store|shop)|like that)\b|\bno \w+(?: \w+)? in (?:the|this|our) (?:catalog|store|shop)\b/i;

/** A short name for an unmet request: what the concierge searched for, else the request. */
function gapLabel(ask: Ask | undefined, text: string) {
  const label =
    ask?.query ??
    (ask?.keywords?.length ? ask.keywords.join(" ") : undefined) ??
    ask?.subcategory ??
    ask?.category;
  return cap(clip(label ?? text, 40));
}

const ENTITY_KIND: Record<string, string> = {
  "urn:entity:artist": "Music",
  "urn:entity:tv_show": "TV",
  "urn:entity:movie": "Film",
  "urn:entity:book": "Books",
  "urn:entity:place": "Going out",
  "urn:entity:destination": "Travel",
  "urn:entity:brand": "Brands",
  "urn:entity:person": "People",
};

/* One conversation, read ------------------------------------------------------ */

interface Turn {
  message: Message;
  /** The shopper message it answers; null for openers. */
  request: Message | null;
}

interface Read {
  c: Conv;
  profile: Profile | null;
  startedAt: string;
  turns: Turn[];
  /** Every product shown, once, first showing kept. */
  shown: Map<string, Pick>;
  opened: Set<string>;
  carted: Set<string>;
  cartValue: number;
  outcome: Outcome;
  title: string;
  opener: string;
  unmet: { label: string; text: string; at: number }[];
  /** Kinds of product the concierge showed for the shopper's own requests. */
  asked: string[];
  /** The shopper's strongest style on the store's own axis. */
  group: string | null;
}

function styleBook(styles: StyleDef[]) {
  const byId = new Map(styles.map((s) => [s.id, s]));
  return {
    label: (id: string) => byId.get(id)?.label ?? cap(id.replace(/-/g, " ")),
    description: (id: string) => byId.get(id)?.description ?? "",
  };
}
type Styles = ReturnType<typeof styleBook>;

const topStyle = (p: Profile | null) =>
  p?.styles.length
    ? [...p.styles].sort((a, b) => b.weight - a.weight)[0].id
    : null;

function read(c: Conv, profile: Profile | null, styles: Styles): Read {
  const turns: Turn[] = [];
  let pending: Message | null = null;
  for (const m of c.messages) {
    if (m.role === "shopper") pending = m;
    else if (m.role === "concierge") {
      turns.push({ message: m, request: pending });
      pending = null;
    }
  }

  const shown = new Map<string, Pick>();
  for (const t of turns)
    for (const p of t.message.picks) if (!shown.has(p.id)) shown.set(p.id, p);
  const of = (type: "click" | "cart") =>
    new Set(
      c.events
        .filter((e) => e.type === type && e.productId && shown.has(e.productId))
        .map((e) => e.productId!),
    );
  const carted = of("cart");
  const opened = of("click");
  const cartValue = [...carted].reduce((s, id) => s + shown.get(id)!.price, 0);

  const unmet = turns
    .filter(
      (t) =>
        t.request &&
        t.message.picks.length === 0 &&
        (t.message.ask?.noMatches || DONT_CARRY.test(t.message.text)),
    )
    .map((t) => ({
      label: gapLabel(t.message.ask, t.request!.text),
      text: t.request!.text,
      at: t.request!.at,
    }));
  const asked = turns
    .filter((t) => t.request)
    .flatMap((t) => t.message.picks.map((p) => p.subcategory))
    .filter(Boolean);

  const last = turns[turns.length - 1];
  const outcome: Outcome = carted.size
    ? "added_to_cart"
    : opened.size
      ? "clicked"
      : unmet.length && last && !last.message.picks.length
        ? "no_match"
        : shown.size
          ? "browsing"
          : "abandoned";

  const opener =
    c.messages.find((m) => m.role === "shopper" && m.text.trim())?.text ?? "";
  const style = topStyle(profile);
  return {
    c,
    profile,
    startedAt: iso(c.createdAt),
    turns,
    shown,
    opened,
    carted,
    cartValue,
    outcome,
    title: opener
      ? clip(opener)
      : shown.size
        ? "Looked at their opening picks"
        : "Opened the concierge",
    opener,
    unmet,
    asked,
    group: style ? styles.label(style) : null,
  };
}

function readAll(data: LiveData) {
  const styles = styleBook(data.styles);
  const profiles = new Map(data.profiles.map((p) => [p.id, p]));
  const reads = data.conversations
    .map((c) =>
      read(c, (c.profileId && profiles.get(c.profileId)) || null, styles),
    )
    .sort((a, b) => b.c.createdAt - a.c.createdAt);
  return { styles, reads };
}

const placeOf = (p: Profile | null) => p?.city ?? "";

/* Overview -------------------------------------------------------------------- */

const ZERO: FunnelTotals = {
  visitors: 0,
  conversations: 0,
  recsShown: 0,
  clicks: 0,
  addToCart: 0,
  cartValue: 0,
};

function totals(reads: Read[], visits: Map<string, number>, days: string[]) {
  const t = { ...ZERO };
  const chats = new Map<string, number>();
  for (const r of reads) {
    t.conversations++;
    if (r.shown.size) t.recsShown++;
    if (r.opened.size || r.carted.size) t.clicks++;
    t.addToCart += r.carted.size;
    t.cartValue += r.cartValue;
    bump(chats, dayOf(r.c.createdAt));
  }
  // Every chat started on a page with the widget, so a day never has fewer
  // visitors than chats (slice.js only started counting on 25 Oct 2026).
  for (const d of days)
    t.visitors += Math.max(visits.get(d) ?? 0, chats.get(d) ?? 0);
  return t;
}

function rangeOf(
  reads: Read[],
  visits: Map<string, number>,
  span: number,
  now: number,
  widgetId: string,
): ConciergeRangeData {
  const today = Date.parse(dayOf(now));
  const start = today - (span - 1) * DAY;
  const days = (from: number) =>
    Array.from({ length: span }, (_, i) => dayOf(from + i * DAY));
  const inRange = (from: number) =>
    reads.filter(
      (r) => r.c.createdAt >= from && r.c.createdAt < from + span * DAY,
    );
  const cur = totals(inRange(start), visits, days(start));
  const before = start - span * DAY;
  // No comparison until the widget has a conversation from before the range.
  const reachesBack = reads.some((r) => r.c.createdAt < start);
  const prev = reachesBack ? totals(inRange(before), visits, days(before)) : null;

  const byDay = new Map<string, Read[]>();
  for (const r of inRange(start))
    byDay.set(dayOf(r.c.createdAt), [...(byDay.get(dayOf(r.c.createdAt)) ?? []), r]);
  return {
    totals: { [widgetId]: cur, all: cur },
    prev: prev ? { [widgetId]: prev, all: prev } : null,
    daily: days(start).map((date) => {
      const rs = byDay.get(date) ?? [];
      return {
        date,
        conversations: rs.length,
        addToCart: rs.reduce((s, r) => s + r.carted.size, 0),
        cartValue: rs.reduce((s, r) => s + r.cartValue, 0),
      };
    }),
  };
}

function lastPicks(r: Read) {
  return (
    [...r.turns].reverse().find((t) => t.message.picks.length)?.message.picks ??
    []
  );
}

function homeRow(r: Read, widget: Widget): HomeConversation {
  return {
    id: r.c.id,
    widgetId: widget.id,
    widgetName: widget.name,
    accent: widget.accent,
    logo: widget.logo,
    city: placeOf(r.profile) || "an unknown city",
    intent: r.title,
    outcome: r.outcome,
    carted: r.cartValue,
    startedAt: r.startedAt,
    picks: lastPicks(r)
      .slice(0, 3)
      .map((p) => ({ id: p.id, name: p.name, image: p.image })),
  };
}

/** Distinct shoppers who built a taste profile, with their conversations. */
function shoppersOf(reads: Read[]) {
  const by = new Map<string, { profile: Profile; reads: Read[] }>();
  for (const r of reads) {
    if (!r.profile) continue;
    const s = by.get(r.profile.id) ?? { profile: r.profile, reads: [] };
    s.reads.push(r);
    by.set(r.profile.id, s);
  }
  return [...by.values()];
}

function gapsOf(reads: Read[], now: number) {
  const by = new Map<
    string,
    { label: string; quote: string; conversationId: string; count: number; month: number; groups: Map<string, number> }
  >();
  for (const r of reads)
    for (const u of r.unmet) {
      const key = u.label.toLowerCase();
      const cur = by.get(key) ?? {
        label: u.label,
        quote: u.text,
        conversationId: r.c.id,
        count: 0,
        month: 0,
        groups: new Map<string, number>(),
      };
      cur.count++;
      if (u.at >= now - 30 * DAY) cur.month++;
      if (r.group) bump(cur.groups, r.group);
      by.set(key, cur);
    }
  return [...by.values()].sort((a, b) => b.count - a.count);
}

export function liveOverview(
  widget: Widget,
  data: LiveData | null,
  now: number,
): WidgetOverviewData {
  const { styles, reads } = data
    ? readAll(data)
    : { styles: styleBook([]), reads: [] as Read[] };
  const visits = new Map((data?.visits ?? []).map((v) => [v.day, v.visitors]));
  const ranges = Object.fromEntries(
    RANGES.map((span) => [span, rangeOf(reads, visits, span, now, widget.id)]),
  ) as Record<OverviewRange, ConciergeRangeData>;

  const shoppers = shoppersOf(reads);
  const byGroup = new Map<string, { count: number; style: string }>();
  for (const s of shoppers) {
    const style = topStyle(s.profile);
    if (!style) continue;
    const label = styles.label(style);
    const cur = byGroup.get(label) ?? { count: 0, style };
    cur.count++;
    byGroup.set(label, cur);
  }
  const profiled = [...byGroup.values()].reduce((s, g) => s + g.count, 0);
  const groups = [...byGroup.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([label, g]) => ({
      label,
      summary: styles.description(g.style),
      share: g.count / profiled,
      style: label,
    }));

  const stats = new Map<
    string,
    { pick: Pick; shown: number; clicked: number; carted: number; drivers: Map<string, number> }
  >();
  for (const r of reads)
    for (const [id, pick] of r.shown) {
      const cur = stats.get(id) ?? {
        pick,
        shown: 0,
        clicked: 0,
        carted: 0,
        drivers: new Map<string, number>(),
      };
      cur.shown++;
      if (r.opened.has(id)) cur.clicked++;
      if (r.carted.has(id)) cur.carted++;
      for (const s of pick.matched.styles) bump(cur.drivers, s);
      stats.set(id, cur);
    }
  const products: OverviewProduct[] = [...stats.values()]
    .sort(
      (a, b) =>
        b.carted - a.carted || b.clicked - a.clicked || b.shown - a.shown,
    )
    .slice(0, 5)
    .map((s) => {
      const driver = top(s.drivers, 1)[0];
      return {
        id: s.pick.id,
        name: s.pick.name,
        detail: s.pick.subcategory,
        price: s.pick.price,
        image: s.pick.image,
        shown: s.shown,
        clicked: s.clicked,
        carted: s.carted,
        matchedOn: driver ? styles.label(driver) : null,
      };
    });

  const gaps: OverviewGap[] = gapsOf(reads, now)
    .slice(0, 3)
    .map((g) => ({
      gap: g.label,
      quote: g.quote,
      conversationId: g.conversationId,
      perMonth: Math.max(1, g.month),
    }));

  return {
    widget: {
      id: widget.id,
      name: widget.name,
      domain: widget.domain,
      accent: widget.accent,
      logo: widget.logo,
      status: widget.status,
      vertical: widget.vertical,
    },
    ranges,
    sample: profiled,
    products,
    groups,
    gaps,
    noMatch: reads.length
      ? reads.filter((r) => r.unmet.length).length / reads.length
      : 0,
    recent: reads.slice(0, 6).map((r) => homeRow(r, widget)),
    now,
  };
}

/* Conversations --------------------------------------------------------------- */

export function liveSummaries(data: LiveData | null): ConversationSummary[] {
  if (!data) return [];
  return readAll(data).reads.map((r) => ({
    id: r.c.id,
    startedAt: r.startedAt,
    city: placeOf(r.profile),
    region: "",
    opener: r.opener,
    intent: r.title,
    outcome: r.outcome,
    entities: r.profile?.entities.map((e) => e.name) ?? [],
    thumbs: (r.turns.find((t) => t.message.picks.length)?.message.picks ?? [])
      .slice(0, 3)
      .map((p) => p.image),
  }));
}

function pickView(
  p: Pick,
  turn: Turn,
  r: Read,
  styles: Styles,
): PickView {
  const fits = p.matched.styles.map(styles.label);
  const materials = [
    ...new Set(p.matched.materials.length ? p.matched.materials : p.materials),
  ].slice(0, 2);
  const color = p.colors[0];
  const ask = turn.message.ask;
  const why = [
    p.reason && { label: "What it told them", value: p.reason },
    fits.length && { label: "Fits their taste", value: list(fits) },
    materials.length && {
      label: "Materials",
      value: `${cap(list(materials))}${color ? `, in ${color}` : ""}`,
    },
    turn.request &&
      p.intent !== null && {
        label: "Their request",
        value:
          p.intent >= 0.5
            ? `Answers it (${p.subcategory.toLowerCase()})`
            : `Goes with it (${p.subcategory.toLowerCase()})`,
      },
    ask?.budget && {
      label: "Budget",
      value: `$${p.price}, ${p.price <= ask.budget ? "inside" : "over"} their $${ask.budget}`,
    },
  ].filter((x): x is { label: string; value: string } => !!x);
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: p.price,
    image: p.image,
    status: r.carted.has(p.id) ? "carted" : r.opened.has(p.id) ? "opened" : null,
    match: p.fit,
    why,
  };
}

/** "/fold/p/asche-kette-curb-chain" as a merchant would say it. */
function pageName(path: string | null) {
  if (!path) return "Unknown";
  if (path.startsWith("/embed")) return "Concierge preview";
  return path.length > 40 ? `${path.slice(0, 39)}…` : path;
}

export function liveDetail(found: LiveConversation): ConversationDetail {
  const styles = styleBook(found.styles);
  const r = read(found.conversation, found.profile, styles);
  const c = r.c;
  const profile = r.profile;

  // The chat in order, with what the shopper did with the picks woven in.
  type Timed = { at: number; line: LineView };
  const timed: Timed[] = [];
  if (profile)
    timed.push({
      at: Math.min(profile.createdAt, c.createdAt),
      line: {
        kind: "event",
        id: `${c.id}-taste`,
        at: iso(Math.min(profile.createdAt, c.createdAt)),
        event: "taste",
        text: profile.answers.length
          ? `Answered the taste questions: ${list(profile.answers.map((a) => a.choice))}`
          : "Built a taste profile",
      },
    });
  for (const m of c.messages) {
    if (m.role === "shopper" && m.text.trim())
      timed.push({
        at: m.at,
        line: { kind: "shopper", id: `${c.id}-${m.at}`, at: iso(m.at), text: m.text },
      });
  }
  for (const t of r.turns) {
    if (!t.message.text.trim() && !t.message.picks.length) continue;
    timed.push({
      at: t.message.at,
      line: {
        kind: "concierge",
        id: `${c.id}-${t.message.at}`,
        at: iso(t.message.at),
        text: t.message.text,
        picks: t.message.picks.map((p) => pickView(p, t, r, styles)),
      },
    });
  }
  for (const e of c.events) {
    if (e.type === "open" || !e.productId) continue;
    const pick = r.shown.get(e.productId);
    if (!pick) continue;
    timed.push({
      at: e.at,
      line: {
        kind: "event",
        id: `${c.id}-${e.type}-${e.productId}`,
        at: iso(e.at),
        event: e.type === "cart" ? "carted" : "opened",
        text:
          e.type === "cart"
            ? `Added ${pick.name} to their cart`
            : `Opened ${pick.name}`,
      },
    });
  }
  const lines = timed.sort((a, b) => a.at - b.at).map((t) => t.line);
  if (r.outcome === "no_match")
    lines.push({
      kind: "end",
      id: `${c.id}-end`,
      at: iso(c.updatedAt),
      text: `Asked for something you don't sell: ${r.unmet[r.unmet.length - 1].label.toLowerCase()}`,
    });
  else if (!r.turns.length)
    lines.push({
      kind: "end",
      id: `${c.id}-end`,
      at: iso(c.updatedAt),
      text: "Opened the concierge and left before it answered",
    });

  const messages = c.messages.filter((m) => m.role === "shopper").length;
  const last = Math.max(c.updatedAt, ...c.messages.map((m) => m.at));
  const minutes = Math.max(1, Math.round((last - c.createdAt) / 60_000));
  const style = topStyle(profile);
  return {
    id: c.id,
    title: r.title,
    outcome: r.outcome,
    carted: r.cartValue,
    city: placeOf(profile),
    startedAt: r.startedAt,
    taste: {
      group: style ? styles.label(style) : "No taste profile",
      summary: profile?.summary
        ? aboutThem(profile.summary)
        : profile
          ? styles.description(style ?? "")
          : "Skipped the taste questions, so picks followed what they asked for and the page they were on.",
      loves: (profile?.styles ?? [])
        .filter((s) => s.weight >= 0.5)
        .map((s) => styles.label(s.id)),
      picked: (profile?.answers ?? []).map((a) => ({
        choice: a.choice,
        question: a.question,
      })),
      mentioned: (profile?.entities ?? [])
        .filter((e) => e.source === "chat")
        .map((e) => e.name),
    },
    visit: [
      { label: "Started on", value: pageName(c.messages[0]?.page ?? null) },
      {
        label: "Messages",
        value: `${messages} from the shopper`,
      },
      { label: "Time in chat", value: `${minutes} min` },
      {
        label: "Visitor",
        value: found.returning ? "Returning" : "First visit",
      },
    ],
    lines,
  };
}

/* Taste insights -------------------------------------------------------------- */

const overlaps = (values: string[], against: string[]) =>
  values.filter((v) =>
    against.some((a) => {
      const x = v.toLowerCase();
      const y = a.toLowerCase();
      return x.includes(y) || y.includes(x);
    }),
  ).length;

type Product = LiveData["catalog"][number];

/** How well a product fits one shopper: their styles first, then materials and colours. */
function fit(p: Product, profile: Profile) {
  const weight = new Map(profile.styles.map((s) => [s.id, s.weight]));
  const style = Math.max(0, ...p.styles.map((s) => weight.get(s) ?? 0));
  const traits = [...p.materials, ...p.colors];
  const detail = traits.length
    ? overlaps(traits, [...profile.materials, ...profile.palette]) / traits.length
    : 0;
  return style * 0.75 + detail * 0.25;
}

export function liveTaste(data: LiveData | null, now: number): TasteInsightsData | null {
  if (!data) return null;
  const { styles, reads } = readAll(data);
  const shoppers = shoppersOf(reads).filter((s) => topStyle(s.profile));
  const n = shoppers.length;
  if (!n) return null;
  const groupOf = (p: Profile) => styles.label(topStyle(p)!);
  const allCarted = reads.reduce((s, r) => s + r.carted.size, 0) || 1;

  /* Groups ----------------------------------------------------------------- */

  const byGroup = new Map<string, typeof shoppers>();
  for (const s of shoppers)
    byGroup.set(groupOf(s.profile), [...(byGroup.get(groupOf(s.profile)) ?? []), s]);
  const groups: InsightGroup[] = [...byGroup.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, members]) => {
      const rs = members.flatMap((m) => m.reads);
      const styleWeight = new Map<string, number>();
      const entities = new Map<string, { name: string; kind: string; n: number }>();
      const kinds = new Map<string, number>();
      const picks = new Map<string, number>();
      const pickInfo = new Map<string, Pick>();
      for (const m of members) {
        for (const s of m.profile.styles)
          if (s.weight >= 0.5) bump(styleWeight, s.id, s.weight);
        for (const e of m.profile.entities) {
          const cur = entities.get(e.name) ?? {
            name: e.name,
            kind: ENTITY_KIND[e.type] ?? "",
            n: 0,
          };
          cur.n++;
          entities.set(e.name, cur);
        }
      }
      const cartedPrices: number[] = [];
      const shownPrices: number[] = [];
      for (const r of rs) {
        for (const k of r.asked) bump(kinds, k);
        for (const [id, p] of r.shown) {
          pickInfo.set(id, p);
          shownPrices.push(p.price);
          bump(picks, id, r.carted.has(id) ? 3 : r.opened.has(id) ? 2 : 1);
          if (r.carted.has(id)) cartedPrices.push(p.price);
        }
      }
      const prices = cartedPrices.length ? cartedPrices : shownPrices;
      const style = topStyle(members[0].profile)!;
      return {
        label,
        summary: styles.description(style),
        count: members.length,
        share: members.length / n,
        cartShare: rs.reduce((s, r) => s + r.carted.size, 0) / allCarted,
        avgItem: prices.reduce((s, x) => s + x, 0) / (prices.length || 1),
        styles: top(styleWeight, 2).map(styles.label),
        into: [...entities.values()]
          .sort((a, b) => b.n - a.n)
          .slice(0, 3)
          .map(({ name, kind }) => ({ name, kind })),
        comesFor: top(kinds, 2),
        picks: top(picks, 3).map((id) => {
          const p = pickInfo.get(id)!;
          return { id, name: p.name, image: p.image };
        }),
      };
    });

  /* Styles: shopper demand against catalog share --------------------------- */

  const demandBy = new Map<string, number>();
  let demandAll = 0;
  for (const s of shoppers)
    for (const st of s.profile.styles) {
      bump(demandBy, st.id, st.weight);
      demandAll += st.weight;
    }
  const catalog = data.catalog;
  const insightStyles: InsightStyle[] = styleCoverage({
    store: { styles: data.styles },
    products: catalog.map((p) => ({ attributes: { style: p.styles } })),
  })
    .map((c) => {
      const demand = demandAll ? (demandBy.get(c.id) ?? 0) / demandAll : 0;
      const gap = demand - c.share;
      return {
        id: c.id,
        label: c.label,
        demand,
        supply: c.share,
        products: c.count,
        verdict: (gap > SLACK
          ? "more"
          : gap < -SLACK
            ? "less"
            : "balanced") as InsightStyle["verdict"],
      };
    })
    .sort((a, b) => b.demand - a.demand);

  /* What to add next ------------------------------------------------------- */

  const requestIdeas: InsightIdea[] = gapsOf(reads, now).map((g) => ({
    kind: "request",
    title: g.label,
    groups: top(g.groups, 2),
    perMonth: Math.max(1, g.month),
    quote: g.quote,
    conversationId: g.conversationId,
  }));
  const styleIdeas: InsightIdea[] = insightStyles
    .filter((s) => s.verdict === "more")
    .sort((a, b) => b.demand - b.supply - (a.demand - a.supply))
    .slice(0, 3)
    .map((s) => {
      const fans = shoppers.filter((m) =>
        m.profile.styles.some((x) => x.id === s.id && x.weight >= SUITS),
      );
      const kinds = new Map<string, number>();
      for (const m of fans)
        for (const r of m.reads) for (const k of r.asked) bump(kinds, k);
      const inStyle = catalog.filter((p) => p.styles.includes(s.id));
      const best = [...kinds.entries()]
        .map(([kind, asks]) => ({
          kind,
          asks,
          stock: inStyle.filter((p) => p.subcategory === kind).length,
        }))
        .sort((a, b) => b.asks / (1 + b.stock) - a.asks / (1 + a.stock))[0];
      const group = top(
        fans.reduce((m, f) => (bump(m, groupOf(f.profile)), m), new Map<string, number>()),
        1,
      )[0];
      return {
        kind: "style",
        title: best
          ? `More ${s.label} ${best.kind.toLowerCase()}`
          : `More ${s.label} pieces`,
        group: group ?? null,
        asks: best?.asks ?? 0,
        stock: best?.stock ?? s.products,
        demand: s.demand,
        supply: s.supply,
      };
    });

  /* Products that suit the most shoppers ----------------------------------- */

  const perKind = new Map<string, number>();
  const products: InsightProduct[] = catalog
    .filter((p) => p.image)
    .map((p) => {
      const fits = shoppers.map((s) => ({ s, fit: fit(p, s.profile) }));
      const suited = fits.filter((f) => f.fit >= SUITS);
      const groupsSuited = new Map<string, number>();
      for (const f of suited) bump(groupsSuited, groupOf(f.s.profile));
      return {
        p,
        reach: suited.length / n,
        mean: fits.reduce((s, f) => s + f.fit, 0) / n,
        groups: top(groupsSuited, 3),
      };
    })
    .filter((x) => x.reach > 0)
    .sort((a, b) => b.reach - a.reach || b.mean - a.mean)
    .filter((x) => {
      const seen = perKind.get(x.p.subcategory) ?? 0;
      perKind.set(x.p.subcategory, seen + 1);
      return seen < 2;
    })
    .slice(0, 6)
    .map(({ p, reach, groups }) => ({
      id: p.id,
      name: p.name,
      image: p.image,
      price: p.price,
      detail: p.subcategory,
      reach,
      groups,
    }));

  /* Where they are --------------------------------------------------------- */

  const byCity = new Map<string, typeof shoppers>();
  for (const s of shoppers) {
    const city = s.profile.city;
    if (city && cityCoords(city))
      byCity.set(city, [...(byCity.get(city) ?? []), s]);
  }
  const places: InsightPlace[] = [...byCity.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([city, members]) => {
      const [lat, lon] = cityCoords(city)!;
      const counts = new Map<string, number>();
      for (const m of members) bump(counts, groupOf(m.profile));
      return {
        city,
        region: "",
        lat,
        lon,
        shoppers: members.length,
        byGroup: Object.fromEntries(counts),
      };
    });

  const firsts = shoppers.flatMap((s) => s.reads.map((r) => r.c.createdAt));
  return {
    shoppers: n,
    since: iso(Math.min(...firsts)),
    groups,
    styles: insightStyles,
    ideas: [...requestIdeas, ...styleIdeas].slice(0, 4),
    products,
    places,
  };
}
