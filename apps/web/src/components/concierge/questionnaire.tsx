"use client";

import { useAction } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";
import { ArrowLeft, ArrowRight, Check, Info, Loader2, MapPin, Plus, ShieldCheck, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Answer, EntityRef, Question, Span } from "./types";
import { Button, Chip, SliceMark, typeLabel } from "./ui";
import { WorldMap, type MapPinPoint } from "./world-map";

const CITIES: Required<MapPinPoint>[] = [
  { name: "New York City", lat: 40.71, lon: -74.01 },
  { name: "Los Angeles", lat: 34.05, lon: -118.24 },
  { name: "London", lat: 51.51, lon: -0.13 },
  { name: "Paris", lat: 48.86, lon: 2.35 },
  { name: "Berlin", lat: 52.52, lon: 13.4 },
  { name: "Tokyo", lat: 35.68, lon: 139.69 },
  { name: "Toronto", lat: 43.65, lon: -79.38 },
  { name: "Sydney", lat: -33.87, lon: 151.21 },
];

const AGES = [
  ["24_and_younger", "Under 25"],
  ["25_to_29", "25–29"],
  ["30_to_34", "30–34"],
  ["35_to_44", "35–44"],
  ["45_to_54", "45–54"],
  ["55_and_older", "55+"],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Did this Qloo entity come from the typed text? Loose on purpose: "wes anderson films" still matches "Wes Anderson". */
const matchesExtra = (e: EntityRef, text: string) =>
  e.name.toLowerCase() === text.toLowerCase() || text.toLowerCase().includes(e.name.toLowerCase());

export interface QuestionnaireResult {
  city: string;
  age?: string;
  gender?: string;
  answers: Answer[];
  entities: EntityRef[];
  freeText: string[];
}

type Step = { kind: "city" } | { kind: "about" } | { kind: "question"; q: Question } | { kind: "extra" };

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
  const locate = useAction(api.taste.locate);

  const [city, setCity] = useState<string>("");
  const [customCity, setCustomCity] = useState("");
  const [pin, setPin] = useState<MapPinPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [age, setAge] = useState<string | undefined>();
  const [gender, setGender] = useState<string | undefined>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0); // 0 = city, 1 = about you, 2..n+1 = questions, n+2 = extra
  const [chosen, setChosen] = useState<Record<string, EntityRef | null>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [extraInput, setExtraInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedExtra, setResolvedExtra] = useState<EntityRef[]>([]);
  const followUpDone = useRef(false);

  const steps: Step[] = [
    { kind: "city" },
    { kind: "about" },
    ...questions.map((q) => ({ kind: "question", q }) as Step),
    { kind: "extra" },
  ];
  const step = steps[Math.min(index, steps.length - 1)];
  const total = steps.length;

  // A preset city carries its own coordinates; a typed one is geocoded through
  // Qloo while the questions load, so the map still travels there.
  async function startCity(name: string, point?: MapPinPoint) {
    setCity(name);
    setLoading(`Asking Qloo what ${name} is into`);
    setError(null);
    if (point) {
      setPin(point);
    } else {
      setPin(null);
      setLocating(true);
      locate({ query: name })
        .then((hit) => hit && setPin(hit))
        .catch(() => {})
        .finally(() => setLocating(false));
    }
    try {
      // Hold for the map's travel even when Qloo answers from cache.
      const [res] = await Promise.all([getQuestionnaire({ city: name }), sleep(900)]);
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
    if (!followUpDone.current && next === questions.length + 2 && answered.length >= 2) {
      followUpDone.current = true;
      setLoading("One more, picked from your answers");
      // Places in the home city pull the trips next door, so only cultural picks go in.
      const signals = answered.filter((e) => !/urn:entity:place/.test(e.type));
      getFollowUp({
        city,
        home: pin ? { lat: pin.lat, lon: pin.lon } : undefined,
        entityIds: (signals.length >= 2 ? signals : answered).map((e) => e.id),
      })
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

  function removeExtra(text: string) {
    setExtra((x) => x.filter((t) => t !== text));
    setResolvedExtra((r) => r.filter((e) => !matchesExtra(e, text)));
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
      <div className="scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-6 pt-4">
        {/* Back, progress and count sit on the page itself, no header bar. */}
        <div className="mb-5 flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={index === 0 ? onCancel : () => setIndex((i) => Math.max(0, i - 1))}
            aria-label="Back"
            title="Back"
            className="orb"
          >
            <ArrowLeft className="size-[18px]" />
          </button>
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
          <span className="w-8 text-right text-[12px] tabular-nums text-[var(--mute)]">
            {Math.min(index + 1, total)}/{total}
          </span>
        </div>

        {loading && step.kind !== "city" && (
          <div className="flex items-center gap-2 py-16 text-[13.5px] text-[var(--ink-2)]">
            <Loader2 className="size-4 animate-spin text-[var(--tang)]" />
            {loading}…
          </div>
        )}
        {error && step.kind !== "city" && (
          <p className="rounded-xl bg-[var(--qloo-soft)] p-3 text-[13px] text-[var(--qloo)]">
            Couldn&apos;t reach the taste graph. {error}
          </p>
        )}

        {step.kind === "city" && (
          <div className="flex flex-1 flex-col">
            <WorldMap pin={pin} locating={locating} className="rise min-h-[150px] flex-1" />
            <h2 className="rise mt-5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
              Where are you shopping from?
            </h2>
            <p className="rise mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
              Taste is local. Qloo tunes the next questions to what people in your city actually
              love.
            </p>
            <div className="rise mt-4 flex flex-wrap gap-1.5">
              {CITIES.map((c) => (
                <Toggle key={c.name} on={city === c.name} disabled={!!loading} onClick={() => startCity(c.name, c)}>
                  {c.name}
                </Toggle>
              ))}
            </div>
            <form
              className="rise mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (customCity.trim()) startCity(customCity.trim());
              }}
            >
              <input
                value={customCity}
                onChange={(e) => setCustomCity(e.target.value)}
                placeholder="Somewhere else…"
                disabled={!!loading}
                className="h-10 flex-1 rounded-full border border-[var(--line)] bg-white px-4 text-[13.5px] disabled:opacity-60"
              />
              <Button type="submit" variant="secondary" size="md" disabled={!customCity.trim() || !!loading}>
                Go
              </Button>
            </form>
            {loading && (
              <p className="mt-4 flex items-center gap-2 text-[13px] text-[var(--ink-2)]">
                <Loader2 className="size-4 animate-spin text-[var(--tang)]" />
                {loading}…
              </p>
            )}
            {error && (
              <p className="mt-4 rounded-xl bg-[var(--qloo-soft)] p-3 text-[13px] text-[var(--qloo)]">
                Couldn&apos;t reach the taste graph. {error}
              </p>
            )}
          </div>
        )}

        {!loading && step.kind === "about" && (
          <div className="flex flex-1 flex-col">
            <h2 className="rise text-[22px] font-semibold leading-tight tracking-[-0.02em]">
              Two quick things, if you don&apos;t mind.
            </h2>
            <p className="rise mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
              Qloo&apos;s taste graph reads the same signals differently by age group, and{" "}
              {storeName} is split by department. Both are optional, neither is tied to you, and
              you can skip straight past.
            </p>

            <section className="rise mt-6">
              <p className="text-[14px] font-semibold">Your age group</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--mute)]">
                A 25-year-old and a 55-year-old can love the same band and dress nothing alike.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {AGES.map(([v, label]) => (
                  <Toggle key={v} on={age === v} onClick={() => setAge(age === v ? undefined : v)} className="h-11">
                    {label}
                  </Toggle>
                ))}
              </div>
            </section>

            <section className="rise mt-6">
              <p className="text-[14px] font-semibold">What do you shop for?</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--mute)]">
                So the picks come from the right rail.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ["female", "Women's"],
                  ["male", "Men's"],
                ].map(([v, label]) => (
                  <Toggle key={v} on={gender === v} onClick={() => setGender(gender === v ? undefined : v)} className="h-11">
                    {label}
                  </Toggle>
                ))}
              </div>
            </section>

            <p className="rise mt-auto flex items-start gap-2 pt-8 text-[12.5px] leading-snug text-[var(--mute)]">
              <ShieldCheck className="mt-px size-4 shrink-0 text-[var(--ink-2)]" />
              Neither answer is stored with anything that identifies you. They only shift which of
              Qloo&apos;s signals get weight.
            </p>
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
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">Anything else you love?</h2>
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
                const hit = resolvedExtra.find((e) => matchesExtra(e, t));
                return (
                  <Chip
                    key={t}
                    tone={hit ? "qloo" : "neutral"}
                    className="h-7 pr-1 text-[12.5px]"
                    title={hit ? `Qloo: ${hit.name} (${typeLabel(hit.type)})` : "Will be resolved when building"}
                  >
                    {hit ? <Check className="size-3" /> : null}
                    {hit ? hit.name : t}
                    <button
                      type="button"
                      onClick={() => removeExtra(t)}
                      aria-label={`Remove ${hit ? hit.name : t}`}
                      className="ml-0.5 grid size-5 cursor-pointer place-items-center rounded-full opacity-70 transition-opacity hover:bg-black/10 hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
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
        <div className="flex items-center gap-2 px-3 pb-3 pt-2">
          {step.kind === "about" ? (
            <>
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setAge(undefined);
                  setGender(undefined);
                  advance();
                }}
              >
                Skip
              </Button>
              <Button variant="ink" size="md" className="flex-1" onClick={advance}>
                Continue <ArrowRight className="size-4" />
              </Button>
            </>
          ) : step.kind === "question" ? (
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

function Toggle({
  on,
  onClick,
  disabled,
  className,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:cursor-default disabled:opacity-60",
        on ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-white hover:border-[var(--ink)]",
        className,
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
  const [why, setWhy] = useState(false);
  // Posters are 2:3, so films, shows and books get portrait tiles; people and places stay square.
  const portrait = q.options.some((o) => /movie|tv_show|book/.test(o.type));
  // Destinations have no artwork but do have coordinates: show them on the map instead.
  const geo = q.options.filter((o): o is EntityRef & { lat: number; lon: number } => o.lat !== undefined && o.lon !== undefined);
  const mapMode = geo.length >= 3 && !q.options.some((o) => o.image);
  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{q.prompt}</h2>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">{q.hint}</p>
        </div>
        <button
          type="button"
          aria-label="Why these options?"
          aria-expanded={why}
          onClick={() => setWhy((w) => !w)}
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full transition-colors",
            why ? "bg-[var(--ink)] text-white" : "text-[var(--mute)] hover:bg-[var(--cream)] hover:text-[var(--ink)]",
          )}
        >
          <Info className="size-[18px]" />
        </button>
      </div>
      {why && (
        <p className="rise mt-2 rounded-xl bg-[var(--cream)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          These come from Qloo&apos;s taste graph, ranked by how strongly people there gravitate
          to them rather than by global fame. One pick here tells it more than a generic favorite
          would, and it is only used to shape your picks in this store.
        </p>
      )}

      {mapMode && (
        <WorldMap
          className="rise mt-4 h-[190px]"
          pins={geo.map((o) => ({ name: o.name, lat: o.lat, lon: o.lon }))}
          pin={chosen?.lat !== undefined && chosen?.lon !== undefined ? { name: chosen.name, lat: chosen.lat, lon: chosen.lon } : null}
        />
      )}
      {mapMode && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {q.options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={chosen?.id === o.id}
              onClick={() => onChoose(o)}
              className="option rise cursor-pointer"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--sun-soft)] text-[var(--ink)]">
                <MapPin className="size-4" />
              </span>
              <span className="min-w-0 pr-5">
                <span className="line-clamp-1 text-[13.5px] font-medium leading-tight">{o.name}</span>
                {o.subtitle && (
                  <span className="mt-0.5 line-clamp-1 text-[11.5px] leading-snug text-[var(--mute)]">{o.subtitle}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Posters run tall, so that grid is inset a little to keep the tiles modest. */}
      <div className={cn("mt-4 grid grid-cols-3", portrait ? "gap-3 px-4" : "gap-2", mapMode && "hidden")}>
        {q.options.map((o) => {
          const on = chosen?.id === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChoose(o)}
              className={cn(
                "rise group flex cursor-pointer flex-col rounded-xl p-1.5 text-left transition-[background,transform] hover:-translate-y-0.5",
                on ? "bg-[var(--sun-soft)]" : "hover:bg-[var(--cream-2)]",
              )}
            >
              <span
                className={cn(
                  "relative block w-full overflow-hidden bg-[var(--cream-2)] transition-shadow group-hover:shadow-[0_8px_20px_rgb(23_21_15/0.18)]",
                  portrait ? "aspect-[2/3] rounded-[3px]" : "aspect-square rounded-lg",
                )}
              >
                {o.image ? (
                  // Faces sit in the top of a photo, so crop people from the top; posters stay centered.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.image}
                    alt=""
                    className={cn("size-full object-cover", portrait ? "object-center" : "object-top")}
                    loading="lazy"
                  />
                ) : null}
                {on && (
                  <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-[var(--ink)] text-white shadow-sm">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="mt-2 line-clamp-2 px-0.5 text-[13px] font-medium leading-tight">{o.name}</span>
              {o.subtitle && (
                <span className="mt-0.5 line-clamp-1 px-0.5 text-[11px] leading-snug text-[var(--mute)]">
                  {o.subtitle}
                </span>
              )}
            </button>
          );
        })}
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
