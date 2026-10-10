"use client";

import { ArrowLeft, ChevronDown, Plus, RotateCcw, UserStar } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EntityRef, StoreInfo, TasteProfile } from "./types";
import { Bar, Button, Chip, typeLabel } from "./ui";
import { Trace } from "./trace";

// The panel reads top to bottom as one story: what you told me (the
// constellation), what that says about you (the reading, with the terms it
// rests on highlighted), how that maps to this store (styles), and the threads
// the picks will follow. Everything Qloo returned in full sits folded at the end.

const TAG_GROUPS: [string, string][] = [
  ["personal_style", "Personal style"],
  ["lifestyle", "Lifestyle"],
  ["emotional_tone", "Mood"],
  ["style", "Cultural style"],
  ["audience", "Audience"],
  ["customer_identity", "Shopper identity"],
  ["core_values", "Values"],
  ["keyword", "Themes"],
];

const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "under 25",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

type Tone = "style" | "tag" | "brand";
const TONE_CLASS: Record<Tone, string> = {
  style: "bg-[var(--sun-soft)]",
  tag: "bg-[var(--qloo-soft)]",
  brand: "bg-[var(--cream-2)]",
};

export function TastePanel({
  profile,
  store,
  onClose,
  onAdd,
  onReset,
}: {
  profile: TasteProfile;
  store: StoreInfo | null;
  onClose: () => void;
  onAdd: (text: string) => void;
  onReset: () => void;
}) {
  const [input, setInput] = useState("");
  const [openStyle, setOpenStyle] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  const storeName = store?.name ?? "this store";
  const styleLabel = (id: string) => store?.styles.find((s) => s.id === id)?.label ?? id;
  const brief = profile.brief;
  const inStore = profile.brands.filter((b) => b.inStore);
  const demo = profile.demographics;

  const byType = useMemo(() => {
    const m = new Map<string, TasteProfile["tags"]>();
    for (const t of profile.tags) {
      const key = t.type.split(":")[2] ?? "tag";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return m;
  }, [profile.tags]);

  // Terms the reading can rest on, longest first so "quiet minimal" wins over "minimal".
  const terms = useMemo(() => {
    const out: { term: string; tone: Tone }[] = [];
    const styles = (brief?.styles ?? profile.hints.styles).map((s) => styleLabel(s.id));
    for (const label of styles) {
      out.push({ term: label, tone: "style" });
      for (const w of label.split(/\s+/)) if (w.length >= 5) out.push({ term: w, tone: "style" });
    }
    for (const t of profile.tags) if (t.name.length >= 4) out.push({ term: t.name, tone: "tag" });
    for (const b of profile.brands) out.push({ term: b.name, tone: "brand" });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, profile.tags, profile.brands, profile.hints.styles, store]);

  const styles = brief
    ? brief.styles.slice(0, 4).map((s) => ({ id: s.id, weight: s.weight, because: s.because }))
    : profile.hints.styles.slice(0, 4).map((s) => ({ id: s.id, weight: s.score, because: `From ${s.from.slice(0, 3).join(", ")}.` }));

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <div className="scroll flex-1 overflow-y-auto overscroll-none pb-8">
        {/* Hero: the constellation of signals on the yellow wash. */}
        <div className="sky-hero relative px-4 pb-4" style={{ paddingTop: 12 }}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} aria-label="Back to chat" title="Back to chat" className="orb">
              <ArrowLeft className="size-[18px]" />
            </button>
            <div className="min-w-0">
              <p className="text-[17px] font-semibold tracking-[-0.01em]">Your taste</p>
              <p className="truncate text-[12px] text-[var(--ink-2)]">
                {profile.entities.length} signals{profile.city ? ` from ${profile.city}` : ""}, read by Qloo
              </p>
            </div>
          </div>

          <Constellation entities={profile.entities} />

          <form
            className="mt-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim()) return;
              onAdd(input.trim());
              setInput("");
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add something you love…"
              className="h-10 flex-1 rounded-full border border-[rgb(23_21_15/0.08)] bg-white/90 px-4 text-[13px] backdrop-blur"
            />
            <Button type="submit" variant="ink" size="md" disabled={!input.trim()} aria-label="Add">
              <Plus className="size-4" />
            </Button>
          </form>
        </div>

        <div className="space-y-7 px-5 pt-5">
          {/* The reading */}
          <section>
            <Eyebrow>What this says about you</Eyebrow>
            {brief ? (
              <p className="mt-2 text-[16px] leading-[1.6] tracking-[-0.005em]">
                <Highlighted text={brief.summary} terms={terms} />
              </p>
            ) : (
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">
                The concierge writes this after your first conversation. Until then, the styles below are a
                first pass from Qloo&apos;s words.
              </p>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--mute)]">
              <Legend tone="style">{storeName}&apos;s styles</Legend>
              <Legend tone="tag">Qloo taste tags</Legend>
              <Legend tone="brand">Brands</Legend>
            </p>
          </section>

          {/* Styles in this store */}
          <section>
            <Eyebrow>How that maps to {storeName}</Eyebrow>
            <ul className="mt-2 divide-y divide-[var(--line-2)]">
              {styles.map((s) => {
                const open = openStyle === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setOpenStyle(open ? null : s.id)}
                      aria-expanded={open}
                      className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left"
                    >
                      <span className="w-[42%] shrink-0 text-[13.5px] font-medium">{styleLabel(s.id)}</span>
                      <span className="flex-1">
                        <Bar value={s.weight} tone="sun" />
                      </span>
                      <span className="w-7 text-right text-[12px] tabular-nums text-[var(--mute)]">
                        {Math.round(s.weight * 100)}
                      </span>
                      <ChevronDown
                        className={cn("size-4 shrink-0 text-[var(--mute)] transition-transform", open && "rotate-180")}
                      />
                    </button>
                    {open && (
                      <p className="rise -mt-1 pb-3 pr-7 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                        {s.because}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Threads the picks follow */}
          {(inStore.length > 0 || (brief && (brief.palette.length > 0 || brief.materials.length > 0))) && (
            <section>
              <Eyebrow>Threads your picks follow</Eyebrow>
              <div className="mt-2.5 space-y-2.5">
                {inStore.length > 0 && (
                  <Row label="Brands here">
                    {inStore.slice(0, 6).map((b) => (
                      <Chip key={b.id} tone="neutral" title={`Affinity ${Math.round(b.affinity * 100)}`}>
                        {b.name}
                      </Chip>
                    ))}
                  </Row>
                )}
                {brief && brief.palette.length > 0 && (
                  <Row label="Colors">
                    {brief.palette.slice(0, 7).map((c) => (
                      <Chip key={c} tone="neutral">
                        {c}
                      </Chip>
                    ))}
                  </Row>
                )}
                {brief && brief.materials.length > 0 && (
                  <Row label="Materials">
                    {brief.materials.slice(0, 7).map((m) => (
                      <Chip key={m} tone="sun">
                        {m}
                      </Chip>
                    ))}
                  </Row>
                )}
                {brief && brief.avoid.length > 0 && (
                  <Row label="Probably not">
                    {brief.avoid.slice(0, 5).map((a) => (
                      <Chip key={a} tone="neutral" className="opacity-70">
                        {a}
                      </Chip>
                    ))}
                  </Row>
                )}
              </div>
            </section>
          )}

          {/* Everything Qloo returned, folded. */}
          <section className="rounded-2xl bg-[var(--cream)] p-4">
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              className="flex w-full cursor-pointer items-center justify-between text-left"
            >
              <span>
                <span className="block text-[13.5px] font-semibold">Everything Qloo read</span>
                <span className="block text-[12px] text-[var(--mute)]">
                  {profile.tags.length} tags, {profile.brands.length} brands
                  {demo ? ", who else shares them" : ""}
                </span>
              </span>
              <ChevronDown className={cn("size-4 text-[var(--mute)] transition-transform", more && "rotate-180")} />
            </button>

            {more && (
              <div className="rise mt-4 space-y-4">
                {TAG_GROUPS.filter(([k]) => byType.has(k)).map(([k, label]) => (
                  <Row key={k} label={label}>
                    {byType
                      .get(k)!
                      .slice(0, 7)
                      .map((t) => (
                        <Chip key={t.id} tone="qloo" title={`Affinity ${Math.round(t.affinity * 100)}`}>
                          {t.name.toLowerCase()}
                        </Chip>
                      ))}
                  </Row>
                ))}
                {profile.brands.filter((b) => !b.inStore).length > 0 && (
                  <Row label="Brands elsewhere">
                    {profile.brands
                      .filter((b) => !b.inStore)
                      .slice(0, 8)
                      .map((b) => (
                        <Chip key={b.id} tone="neutral">
                          {b.name}
                        </Chip>
                      ))}
                  </Row>
                )}
                {demo && (
                  <div>
                    <p className="mb-1.5 text-[11.5px] font-medium text-[var(--mute)]">Who else shares these signals</p>
                    <div className="grid grid-cols-6 gap-1">
                      {Object.entries(AGE_LABEL).map(([k, label]) => {
                        const v = demo.age[k] ?? 0;
                        return (
                          <div key={k} className="text-center">
                            <div className="mx-auto flex h-10 w-4 items-end rounded-sm bg-white">
                              <i
                                className="block w-full rounded-sm"
                                style={{
                                  height: `${Math.min(100, Math.abs(v) * 100)}%`,
                                  background: v >= 0 ? "var(--qloo)" : "var(--line)",
                                }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] text-[var(--mute)]">{label}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  {showTrace ? (
                    <Trace spans={profile.trace} compact />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowTrace(true)}
                      className="cursor-pointer text-[12.5px] text-[var(--ink-2)] underline underline-offset-2"
                    >
                      Show the {profile.trace.length} steps behind this
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcw className="size-3.5" /> Start over
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Signals orbiting the store: what the shopper told us, as a picture rather than a list. */
function Constellation({ entities }: { entities: EntityRef[] }) {
  const shown = entities.slice(0, 8);
  const extra = entities.length - shown.length;
  const size = 260;
  const r = 96;
  const c = size / 2;
  const nodes = shown.map((e, i) => {
    const a = -Math.PI / 2 + (i / shown.length) * Math.PI * 2;
    return { e, x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
  return (
    <div className="relative mx-auto mt-2" style={{ width: size, height: size }}>
      <svg className="absolute inset-0" width={size} height={size} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(23 21 15 / 0.08)" strokeDasharray="2 5" />
        {nodes.map((n, i) => (
          <line key={i} x1={c} y1={c} x2={n.x} y2={n.y} stroke="rgb(23 21 15 / 0.12)" strokeWidth="1" />
        ))}
      </svg>
      <div
        className="absolute grid size-14 place-items-center rounded-full bg-white shadow-[0_1px_2px_rgb(23_21_15/0.06),0_10px_28px_rgb(23_21_15/0.12)]"
        style={{ left: c - 28, top: c - 28 }}
      >
        <UserStar className="size-6" strokeWidth={1.75} />
      </div>
      {nodes.map((n, i) => (
        <div
          key={n.e.id}
          className="rise absolute flex w-[76px] -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: n.x, top: n.y, animationDelay: `${i * 50}ms` }}
          title={`${n.e.name} · ${typeLabel(n.e.type)}`}
        >
          <span className="grid size-10 place-items-center overflow-hidden rounded-full bg-white shadow-[0_1px_2px_rgb(23_21_15/0.08),0_4px_12px_rgb(23_21_15/0.1)] ring-2 ring-white">
            {n.e.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.e.image} alt="" className="size-full object-cover object-top" />
            ) : /destination|place|locality/.test(n.e.type) ? (
              <span className="text-[18px] leading-none" aria-hidden>
                📍
              </span>
            ) : (
              <span className="text-[13px] font-semibold text-[var(--ink-2)]">{n.e.name.slice(0, 1)}</span>
            )}
          </span>
          <span className="mt-1 max-w-full truncate rounded-full bg-white/90 px-1.5 text-[11px] font-medium leading-4">
            {n.e.name}
          </span>
        </div>
      ))}
      {extra > 0 && (
        <span className="absolute bottom-0 right-0 rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-[var(--mute)]">
          +{extra} more
        </span>
      )}
    </div>
  );
}

/** The reading with the terms it rests on marked, Qloo-style. */
function Highlighted({ text, terms }: { text: string; terms: { term: string; tone: Tone }[] }) {
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  if (!sorted.length) return <>{text}</>;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b(${sorted.map((t) => escape(t.term)).join("|")})\\b`, "gi");
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const hit = sorted.find((t) => t.term.toLowerCase() === m![0].toLowerCase());
    parts.push(
      <mark key={m.index} className={cn("rounded-[4px] px-1 py-px text-inherit", TONE_CLASS[hit?.tone ?? "tag"])}>
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <h3 className="text-[13.5px] font-semibold tracking-[-0.01em]">{children}</h3>;
}

function Legend({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={cn("inline-block size-2.5 rounded-[3px]", TONE_CLASS[tone])} />
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-[84px] shrink-0 pt-0.5 text-[11.5px] font-medium text-[var(--mute)]">{label}</span>
      <div className="flex flex-1 flex-wrap gap-1">{children}</div>
    </div>
  );
}
