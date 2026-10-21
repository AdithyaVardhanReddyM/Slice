"use client";

// A few questions before Slice makes something (slice_media ask_questions),
// answered the way Claude Code asks: a tab per question along the top, numbered
// options with a line on each, "Something else" for your own words, and one
// send at the end. Picking an option moves on to the next question. The answer
// goes back as one message, a line per question ("Music: Warm acoustic
// guitar"); once answered, the card shows what was chosen.

import { ArrowRight, Check, PenLine } from "lucide-react";
import { useState } from "react";
import type { AskQuestion } from "@/lib/pages/stream";
import { cn } from "@/lib/utils";

/** Sent when the merchant leaves every choice to Slice. */
export const SKIP_ANSWER = "Your call on all of these. Make it.";

type Pick = { options: string[]; other: string };

const valueOf = (p: Pick | undefined) => {
  const words = [...(p?.options ?? []), ...(p?.other.trim() ? [p.other.trim()] : [])];
  return words.length ? words.join(", ") : "";
};

/** The answer message: one line per question, "your call" where nothing was picked. */
export function answerText(questions: AskQuestion[], picks: Record<number, Pick>) {
  return questions.map((q, i) => `${q.header}: ${valueOf(picks[i]) || "your call"}`).join("\n");
}

/** Reads an answer message back into header → value, for the answered card. */
function readAnswer(questions: AskQuestion[], text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    const head = line.slice(0, at).trim();
    if (questions.some((q) => q.header === head)) out[head] = line.slice(at + 1).trim();
  }
  return Object.keys(out).length ? out : null;
}

export function QuestionsCard({ intro, questions, answer, onAnswer }: { intro?: string; questions: AskQuestion[]; answer?: string; onAnswer?: (text: string) => void }) {
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [writing, setWriting] = useState<number | null>(null);

  if (answer !== undefined || !onAnswer) {
    const read = answer ? readAnswer(questions, answer) : null;
    return (
      <div className="w-full">
        {intro && <p className="mb-2 text-sm leading-6">{intro}</p>}
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.07]">
          {questions.map((q) => (
            <div key={q.header} className="flex items-start gap-3 px-3 py-2">
              <span className="w-20 shrink-0 pt-px text-xs font-medium text-neutral-500">{q.header}</span>
              <span className={cn("min-w-0 flex-1 text-[13px]", read?.[q.header] ? "text-neutral-900" : "text-neutral-400")}>{read?.[q.header] ?? (answer === undefined ? "Not answered" : "Left to Slice")}</span>
              {read?.[q.header] && <Check className="mt-0.5 size-3.5 shrink-0 text-neutral-400" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const q = questions[step];
  const pick = picks[step] ?? { options: [], other: "" };
  const last = step === questions.length - 1;
  const done = (i: number) => !!valueOf(picks[i]);
  const setPick = (i: number, p: Pick) => setPicks((all) => ({ ...all, [i]: p }));
  const next = () => {
    // The next question still open, else the next one along.
    const open = questions.findIndex((_, i) => i > step && !done(i));
    setStep(open >= 0 ? open : Math.min(questions.length - 1, step + 1));
    setWriting(null);
  };
  const choose = (label: string) => {
    if (q.multi) {
      const has = pick.options.includes(label);
      setPick(step, { ...pick, options: has ? pick.options.filter((o) => o !== label) : [...pick.options, label] });
      return;
    }
    setPick(step, { options: [label], other: "" });
    setWriting(null);
    if (!last) setTimeout(next, 160);
  };
  const send = () => onAnswer(answerText(questions, picks));

  return (
    <div className="w-full">
      {intro && <p className="mb-2 text-sm leading-6">{intro}</p>}
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.08]">
        {questions.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-100 px-2 py-1.5 [scrollbar-width:none]">
            {questions.map((x, i) => (
              <button
                key={x.header}
                type="button"
                onClick={() => (setStep(i), setWriting(null))}
                className={cn("flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors", i === step ? "bg-neutral-900 text-white" : done(i) ? "text-neutral-700 hover:bg-neutral-100" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700")}
              >
                {done(i) && i !== step && <Check className="size-3" />}
                {x.header}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1 p-2">
          <p className="px-1.5 pt-1 pb-1.5 text-sm font-medium">{q.question}</p>
          {q.options.map((o, n) => {
            const on = pick.options.includes(o.label);
            return (
              <button key={o.label} type="button" onClick={() => choose(o.label)} className={cn("flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors", on ? "bg-neutral-100" : "hover:bg-neutral-50")}>
                <span className={cn("mt-px flex size-5 shrink-0 items-center justify-center text-[11px] font-semibold tabular-nums", q.multi ? "rounded-[5px]" : "rounded-full", on ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500 ring-1 ring-black/[0.06]")}>{on ? <Check className="size-3" /> : n + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-neutral-900">{o.label}</span>
                  {o.detail && <span className="block text-xs leading-4 text-neutral-500">{o.detail}</span>}
                </span>
              </button>
            );
          })}
          {writing === step || pick.other ? (
            <div className="flex items-center gap-2.5 rounded-lg bg-neutral-50 px-2 py-1.5 ring-1 ring-black/[0.08] focus-within:bg-white focus-within:ring-neutral-900/30">
              <span className="flex size-5 shrink-0 items-center justify-center text-neutral-500">
                <PenLine className="size-3.5" />
              </span>
              <input
                autoFocus={writing === step}
                value={pick.other}
                onChange={(e) => setPick(step, { options: q.multi ? pick.options : [], other: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (last) send();
                  else next();
                }}
                placeholder="Type your own answer"
                className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-neutral-400"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setWriting(step)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-800">
              <span className="flex size-5 shrink-0 items-center justify-center">
                <PenLine className="size-3.5" />
              </span>
              Something else
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-neutral-100 px-3 py-2">
          <button type="button" onClick={() => onAnswer(SKIP_ANSWER)} className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline">
            Skip, your call
          </button>
          <span className="ml-auto text-[11px] text-neutral-400 tabular-nums">{questions.length > 1 ? `${step + 1} of ${questions.length}` : ""}</span>
          {last ? (
            <button type="button" onClick={send} className="flex h-7 items-center gap-1.5 rounded-full bg-neutral-900 px-3 text-xs font-medium text-white transition-colors hover:bg-neutral-700">
              Make it <ArrowRight className="size-3.5" />
            </button>
          ) : (
            <button type="button" onClick={next} className="flex h-7 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-200">
              Next <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
