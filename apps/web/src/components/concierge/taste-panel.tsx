"use client";

import { Plus, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { StoreInfo, TasteProfile } from "./types";
import { Bar, Button, Chip, typeLabel } from "./ui";
import { Trace } from "./trace";

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
  const [showTrace, setShowTrace] = useState(false);
  const styleLabel = (id: string) => store?.styles.find((s) => s.id === id)?.label ?? id;
  const brief = profile.brief;
  const byType = new Map<string, TasteProfile["tags"]>();
  for (const t of profile.tags) {
    const key = t.type.split(":")[2] ?? "tag";
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(t);
  }
  const inStore = profile.brands.filter((b) => b.inStore);
  const open = profile.brands.filter((b) => !b.inStore).slice(0, 8);
  const entityName = (id: string) => profile.entities.find((e) => e.id === id)?.name ?? "";
  const demo = profile.demographics;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <div className="flex-1">
          <p className="text-[15px] font-semibold">Your taste</p>
          <p className="text-[12px] text-[var(--mute)]">
            {profile.entities.length} signals{profile.city ? ` · ${profile.city}` : ""} · read by Qloo
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </header>

      <div className="scroll flex-1 overflow-y-auto px-4 pb-8">
        {/* Signals */}
        <Section title="What you told me">
          <div className="flex flex-wrap gap-1.5">
            {profile.entities.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] py-0.5 pl-0.5 pr-2.5 text-[12.5px]"
                title={`${typeLabel(e.type)} · ${e.source.replace("_", " ")}`}
              >
                <span className="size-5 overflow-hidden rounded-full bg-[var(--cream-2)]">
                  {e.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.image} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                {e.name}
                <span className="text-[var(--mute)]">{typeLabel(e.type)}</span>
              </span>
            ))}
          </div>
          <form
            className="mt-2.5 flex gap-2"
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
              className="h-9 flex-1 rounded-full border border-[var(--line)] bg-white px-3.5 text-[13px]"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={!input.trim()} aria-label="Add">
              <Plus className="size-4" />
            </Button>
          </form>
        </Section>

        {/* Brief */}
        <Section title={`In ${store?.name ?? "this store"}'s words`} tone="llm">
          {brief ? (
            <>
              <p className="text-[13.5px] leading-relaxed">{brief.summary}</p>
              <ul className="mt-3 space-y-2.5">
                {brief.styles.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className="font-medium">{styleLabel(s.id)}</span>
                      <span className="tabular-nums text-[var(--mute)]">{Math.round(s.weight * 100)}</span>
                    </div>
                    <div className="mt-1">
                      <Bar value={s.weight} tone="sun" />
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-[var(--ink-2)]">{s.because}</p>
                  </li>
                ))}
              </ul>
              {(brief.palette.length > 0 || brief.materials.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {brief.palette.map((c) => (
                    <Chip key={`p-${c}`} tone="neutral">
                      {c}
                    </Chip>
                  ))}
                  {brief.materials.map((m) => (
                    <Chip key={`m-${m}`} tone="sun">
                      {m}
                    </Chip>
                  ))}
                </div>
              )}
              {brief.avoid.length > 0 && (
                <p className="mt-2 text-[12px] text-[var(--mute)]">Probably not you: {brief.avoid.join(", ")}.</p>
              )}
            </>
          ) : (
            <>
              <p className="text-[13px] text-[var(--ink-2)]">
                The concierge writes this on your first conversation. For now, a first pass from matching Qloo&apos;s
                words to the store&apos;s styles:
              </p>
              <ul className="mt-3 space-y-2">
                {profile.hints.styles.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className="font-medium">{styleLabel(s.id)}</span>
                      <span className="text-[var(--mute)]">{s.from.slice(0, 3).join(", ")}</span>
                    </div>
                    <div className="mt-1">
                      <Bar value={s.score} tone="sun" />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        {/* Brands */}
        <Section title="Brand affinities" tone="qloo" hint="Brands Qloo links to your signals. Starred ones are on these shelves.">
          {inStore.length > 0 && (
            <ul className="mb-3 space-y-2">
              {inStore.map((b) => (
                <li key={b.id}>
                  <div className="flex items-baseline justify-between text-[12.5px]">
                    <span className="font-medium">★ {b.name}</span>
                    <span className="tabular-nums text-[var(--mute)]">{Math.round(b.affinity * 100)}</span>
                  </div>
                  <div className="mt-1">
                    <Bar value={b.affinity} tone="qloo" />
                  </div>
                  {b.explain.length > 0 && (
                    <p className="mt-1 text-[11.5px] text-[var(--mute)]">
                      from{" "}
                      {b.explain
                        .filter((x) => entityName(x.entityId))
                        .sort((a, c) => c.score - a.score)
                        .slice(0, 3)
                        .map((x) => `${entityName(x.entityId)} ${Math.round(x.score * 100)}%`)
                        .join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1">
            {open.map((b) => (
              <Chip key={b.id} tone="qloo" title={[...b.personalStyle, ...b.lifestyle].slice(0, 5).join(" · ")}>
                {b.name}
                {b.personalStyle[0] ? <span className="opacity-70">· {b.personalStyle[0].toLowerCase()}</span> : null}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Tags */}
        <Section title="What Qloo read into it" tone="qloo">
          <div className="space-y-2.5">
            {TAG_GROUPS.filter(([k]) => byType.has(k)).map(([k, label]) => (
              <div key={k}>
                <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-[var(--mute)]">{label}</p>
                <div className="flex flex-wrap gap-1">
                  {byType
                    .get(k)!
                    .slice(0, 7)
                    .map((t) => (
                      <Chip key={t.id} tone="neutral" title={`affinity ${Math.round(t.affinity * 100)}`}>
                        {t.name.toLowerCase()}
                      </Chip>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Demographics */}
        {demo && (
          <Section title="Who else shares these signals" tone="qloo" hint="Qloo's audience skew, relative to everyone.">
            <div className="grid grid-cols-6 gap-1">
              {Object.entries(AGE_LABEL).map(([k, label]) => {
                const v = demo.age[k] ?? 0;
                return (
                  <div key={k} className="text-center">
                    <div className="mx-auto flex h-12 w-5 items-end rounded-sm bg-[var(--line-2)]">
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
            <p className="mt-2 text-[12px] text-[var(--ink-2)]">
              {Object.entries(demo.gender)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 1)
                .map(([g, v]) => (v > 0.05 ? `Skews ${g === "male" ? "men" : "women"} ${Math.round(v * 100)}%.` : "Even across genders."))}
            </p>
          </Section>
        )}

        <Section title="How this profile was built">
          {showTrace ? (
            <Trace spans={profile.trace} />
          ) : (
            <button type="button" className="text-[12.5px] underline underline-offset-2" onClick={() => setShowTrace(true)}>
              Show the {profile.trace.length} steps
            </button>
          )}
        </Section>

        <div className="mt-6">
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="size-3.5" /> Start over with new answers
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  tone,
  hint,
  children,
}: {
  title: string;
  tone?: "qloo" | "llm";
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--line)] py-4 last:border-0">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
        {tone && (
          <i className="inline-block size-1.5 rounded-full" style={{ background: tone === "qloo" ? "var(--qloo)" : "var(--llm)" }} />
        )}
        {title}
      </h3>
      {hint && <p className="mt-0.5 text-[12px] text-[var(--mute)]">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}
