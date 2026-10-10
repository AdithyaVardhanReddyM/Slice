"use client";

import { useAction } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";
import { ArrowLeft, ArrowRight, Check, Loader2, MapPin, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Answer, EntityRef, Question, Span } from "./types";
import { Button, Chip, SliceMark, typeLabel } from "./ui";

const CITIES = ["New York City", "Los Angeles", "London", "Paris", "Berlin", "Tokyo", "Toronto", "Sydney"];

export interface QuestionnaireResult {
  city: string;
  age?: string;
  gender?: string;
  answers: Answer[];
  entities: EntityRef[];
  freeText: string[];
}

type Step = { kind: "city" } | { kind: "question"; q: Question } | { kind: "extra" };

export function Questionnaire({
  storeName,
  onDone,
  onCancel,
  onTrace,
}: {
  storeName: string;
  onDone: (r: QuestionnaireResult) => void;
  onCancel: () => void;
  onTrace: (spans: Span[]) => void;
}) {
  const getQuestionnaire = useAction(api.taste.questionnaire);
  const getFollowUp = useAction(api.taste.followUp);
  const resolve = useAction(api.taste.resolve);

  const [city, setCity] = useState<string>("");
  const [customCity, setCustomCity] = useState("");
  const [age, setAge] = useState<string | undefined>();
  const [gender, setGender] = useState<string | undefined>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0); // 0 = city, 1..n = questions, n+1 = extra
  const [chosen, setChosen] = useState<Record<string, EntityRef | null>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [extraInput, setExtraInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedExtra, setResolvedExtra] = useState<EntityRef[]>([]);
  const followUpDone = useRef(false);

  const steps: Step[] = [
    { kind: "city" },
    ...questions.map((q) => ({ kind: "question", q }) as Step),
    { kind: "extra" },
  ];
  const step = steps[Math.min(index, steps.length - 1)];
  const total = steps.length;

  async function startCity(name: string) {
    setCity(name);
    setLoading(`Asking Qloo what ${name} is into`);
    setError(null);
    try {
      const res = await getQuestionnaire({ city: name });
      onTrace(res.trace);
      setQuestions(res.questions);
      setIndex(1);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(null);
    }
  }

  // Leaving the last fixed question: ask Qloo for one adaptive question from the answers so far.
  function advance() {
    const next = index + 1;
    const answered = Object.values(chosen).filter((e): e is EntityRef => !!e);
    if (!followUpDone.current && next === questions.length + 1 && answered.length >= 2) {
      followUpDone.current = true;
      setLoading("One more, picked from your answers");
      getFollowUp({ city, entityIds: answered.map((e) => e.id) })
        .then((res) => {
          onTrace(res.trace);
          if (res.question) setQuestions((qs) => [...qs, res.question!]);
        })
        .catch(() => {})
        .finally(() => setLoading(null));
    }
    setIndex(next);
  }

  async function addExtra() {
    const text = extraInput.trim();
    if (!text) return;
    setExtraInput("");
    setExtra((x) => [...x, text]);
    setResolving(true);
    try {
      const res = await resolve({ query: text });
      onTrace(res.trace);
      if (res.entity) setResolvedExtra((r) => [...r, res.entity!]);
    } finally {
      setResolving(false);
    }
  }

  function finish() {
    const answers: Answer[] = [];
    const entities: EntityRef[] = [];
    for (const q of questions) {
      const pick = chosen[q.id];
      const typed = custom[q.id]?.trim();
      if (pick) {
        answers.push({ domain: q.domain, question: q.prompt, choice: pick.name, entityId: pick.id });
        entities.push({ ...pick, source: "questionnaire" });
      } else if (typed) {
        answers.push({ domain: q.domain, question: q.prompt, choice: typed });
      }
    }
    const typedOnly = questions.map((q) => (!chosen[q.id] && custom[q.id]?.trim()) || "").filter(Boolean);
    const unresolved = extra.filter((t) => !resolvedExtra.some((e) => e.name.toLowerCase() === t.toLowerCase()));
    onDone({
      city,
      age,
      gender,
      answers,
      entities: [...entities, ...resolvedExtra],
      freeText: [...typedOnly, ...unresolved],
    });
  }

  const answeredCount = Object.values(chosen).filter(Boolean).length + Object.values(custom).filter((c) => c.trim()).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <Button variant="ghost" size="sm" onClick={index === 0 ? onCancel : () => setIndex((i) => Math.max(0, i - 1))} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex flex-1 items-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i < index ? "bg-[var(--ink)]" : i === index ? "bg-[var(--tang)]" : "bg-[var(--line)]",
              )}
            />
          ))}
        </div>
        <span className="w-10 text-right text-[12px] tabular-nums text-[var(--mute)]">
          {Math.min(index + 1, total)}/{total}
        </span>
      </header>

      <div className="scroll flex-1 overflow-y-auto px-5 pb-6 pt-5">
        {loading && (
          <div className="flex items-center gap-2 py-16 text-[13.5px] text-[var(--ink-2)]">
            <Loader2 className="size-4 animate-spin text-[var(--tang)]" />
            {loading}…
          </div>
        )}
        {error && (
          <p className="rounded-xl bg-[var(--qloo-soft)] p-3 text-[13px] text-[var(--qloo)]">
            Couldn&apos;t reach the taste graph. {error}
          </p>
        )}

        {!loading && step.kind === "city" && (
          <div>
            <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-[var(--mute)]">
              <MapPin className="size-3.5" /> First
            </p>
            <h2 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">Where are you shopping from?</h2>
            <p className="mt-1.5 text-[13px] text-[var(--ink-2)]">
              Qloo tunes the next questions to what people in your city actually love.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {CITIES.map((c) => (
                <button key={c} className="option rise" onClick={() => startCity(c)}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--cream-2)] text-[13px] font-semibold">
                    {c.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="text-[13.5px] font-medium">{c}</span>
                </button>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (customCity.trim()) startCity(customCity.trim());
              }}
            >
              <input
                value={customCity}
                onChange={(e) => setCustomCity(e.target.value)}
                placeholder="Somewhere else…"
                className="h-10 flex-1 rounded-full border border-[var(--line)] bg-white px-4 text-[13.5px]"
              />
              <Button type="submit" variant="secondary" size="md" disabled={!customCity.trim()}>
                Go
              </Button>
            </form>

            <div className="mt-7 border-t border-[var(--line)] pt-5">
              <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--mute)]">Optional</p>
              <p className="mt-1 text-[13px] text-[var(--ink-2)]">Helps Qloo weigh the signals. Skip if you like.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  ["24_and_younger", "Under 25"],
                  ["25_to_29", "25–29"],
                  ["30_to_34", "30–34"],
                  ["35_to_44", "35–44"],
                  ["45_to_54", "45–54"],
                  ["55_and_older", "55+"],
                ].map(([v, label]) => (
                  <Toggle key={v} on={age === v} onClick={() => setAge(age === v ? undefined : v)}>
                    {label}
                  </Toggle>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  ["female", "Women's"],
                  ["male", "Men's"],
                ].map(([v, label]) => (
                  <Toggle key={v} on={gender === v} onClick={() => setGender(gender === v ? undefined : v)}>
                    {label}
                  </Toggle>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && step.kind === "question" && (
          <QuestionView
            key={step.q.id}
            q={step.q}
            chosen={chosen[step.q.id] ?? null}
            custom={custom[step.q.id] ?? ""}
            onChoose={(e) => setChosen((c) => ({ ...c, [step.q.id]: c[step.q.id]?.id === e.id ? null : e }))}
            onCustom={(t) => setCustom((c) => ({ ...c, [step.q.id]: t }))}
          />
        )}

        {!loading && step.kind === "extra" && (
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--mute)]">Last one</p>
            <h2 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">Anything else you love?</h2>
            <p className="mt-1.5 text-[13px] text-[var(--ink-2)]">
              A designer, a brand, a director, a city, a dish. Anything Qloo might know. Or skip.
            </p>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addExtra();
              }}
            >
              <input
                value={extraInput}
                onChange={(e) => setExtraInput(e.target.value)}
                placeholder="Wes Anderson, Aesop, Lisbon…"
                className="h-10 flex-1 rounded-full border border-[var(--line)] bg-white px-4 text-[13.5px]"
              />
              <Button type="submit" variant="secondary" size="md" disabled={!extraInput.trim()} aria-label="Add">
                <Plus className="size-4" />
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {extra.map((t) => {
                const hit = resolvedExtra.find((e) => e.name.toLowerCase() === t.toLowerCase() || t.toLowerCase().includes(e.name.toLowerCase()));
                return (
                  <Chip key={t} tone={hit ? "qloo" : "neutral"} title={hit ? `Qloo: ${hit.name} (${typeLabel(hit.type)})` : "Will be resolved when building"}>
                    {hit ? <Check className="size-3" /> : null}
                    {hit ? hit.name : t}
                  </Chip>
                );
              })}
              {resolving && <Loader2 className="size-4 animate-spin text-[var(--mute)]" />}
            </div>

            <div className="mt-8 rounded-2xl bg-[var(--cream)] p-4">
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
                <SliceMark size={14} /> What happens next
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
                Your {answeredCount + extra.length} signals go to Qloo, which returns the aesthetic
                and cultural tags they share, brand affinities, and who else shares them. I then
                translate that into {storeName}&apos;s own styles. You&apos;ll see each step.
              </p>
            </div>
          </div>
        )}
      </div>

      {!loading && step.kind !== "city" && (
        <div className="flex items-center gap-2 border-t border-[var(--line)] p-3">
          {step.kind === "question" ? (
            <>
              <Button variant="ghost" size="md" onClick={advance}>
                Skip
              </Button>
              <Button
                variant="ink"
                size="md"
                className="flex-1"
                disabled={!chosen[step.q.id] && !custom[step.q.id]?.trim()}
                onClick={advance}
              >
                Next <ArrowRight className="size-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={answeredCount + extra.length === 0 || resolving}
              onClick={finish}
            >
              Build my taste profile <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
        on ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-white hover:border-[var(--ink)]",
      )}
    >
      {children}
    </button>
  );
}

function QuestionView({
  q,
  chosen,
  custom,
  onChoose,
  onCustom,
}: {
  q: Question;
  chosen: EntityRef | null;
  custom: string;
  onChoose: (e: EntityRef) => void;
  onCustom: (t: string) => void;
}) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--mute)]">{q.domain}</p>
      <h2 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{q.prompt}</h2>
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[var(--ink-2)]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--qloo)]" />
        {q.hint}, via Qloo
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {q.options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="option rise"
            aria-pressed={chosen?.id === o.id}
            onClick={() => onChoose(o)}
          >
            <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-[var(--cream-2)]">
              {o.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.image} alt="" className="size-full object-cover" loading="lazy" />
              ) : null}
            </span>
            <span className="min-w-0 pr-4">
              <span className="line-clamp-2 text-[13.5px] font-medium leading-tight">{o.name}</span>
              {o.subtitle && (
                <span className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[var(--mute)]">{o.subtitle}</span>
              )}
            </span>
          </button>
        ))}
      </div>
      <input
        value={custom}
        onChange={(e) => onCustom(e.target.value)}
        placeholder="Something else…"
        className="mt-3 h-10 w-full rounded-full border border-[var(--line)] bg-white px-4 text-[13.5px]"
      />
    </div>
  );
}
