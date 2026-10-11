/* eslint-disable @next/next/no-img-element */
"use client";

// Slim three-question taste quiz above the hero. Shown only when nothing else
// resolved the visitor (resolvedBy "default"), the page has a quiz, and no
// audience cookie exists. Each option votes for audiences; the winner is
// written to the cookie as `audienceId:quiz` and the route re-resolves.

import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { QuizConfig } from "@slice/backend/convex/pagesTypes";
import { setAudienceCookie } from "./cookie-sync";
import { pushEvent } from "./tracking-context";

function skipKey(pageId: string) {
  return `pg_quiz_skip_${pageId}`;
}

function subscribeNoop() {
  return () => {};
}

export function QuizBar({
  pageId,
  quiz,
  audienceIds,
  prompt = "Three quick taps and this page tunes itself to you.",
}: {
  pageId: string;
  quiz: QuizConfig;
  /** Audiences that actually have a variant on this page; votes for others are ignored. */
  audienceIds: string[];
  prompt?: string;
}) {
  const router = useRouter();
  const skipped = useSyncExternalStore(
    subscribeNoop,
    () => {
      try {
        return sessionStorage.getItem(skipKey(pageId)) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [step, setStep] = useState(0);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [state, setState] = useState<"asking" | "done" | "hidden">("asking");

  const questions = quiz.questions.filter((q) => q.options.length > 0).slice(0, 3);
  const allowed = new Set(audienceIds);

  const hide = useCallback(() => {
    setState("hidden");
    try {
      sessionStorage.setItem(skipKey(pageId), "1");
    } catch {}
  }, [pageId]);

  if (skipped || state === "hidden" || questions.length === 0) return null;

  const q = questions[step];

  function finish(tally: Record<string, number>) {
    let winner: string | null = null;
    let best = 0;
    for (const [id, n] of Object.entries(tally)) {
      if (!allowed.has(id)) continue;
      if (n > best) {
        best = n;
        winner = id;
      }
    }
    if (!winner) {
      hide();
      return;
    }
    setAudienceCookie(pageId, winner, "quiz");
    try {
      sessionStorage.setItem(skipKey(pageId), "1");
    } catch {}
    setState("done");
    setTimeout(() => router.refresh(), 350);
  }

  function answer(option: QuizConfig["questions"][number]["options"][number]) {
    pushEvent({ type: "quiz_answer", label: option.label, data: { question: q.id, answer: option.label } });
    const tally = { ...votes };
    for (const [id, n] of Object.entries(option.votes ?? {})) tally[id] = (tally[id] ?? 0) + n;
    setVotes(tally);
    if (step + 1 >= questions.length) finish(tally);
    else setStep(step + 1);
  }

  return (
    <div className="pg-quiz" data-section="quiz" role="region" aria-label="Taste quiz">
      <div className="pg-container pg-quiz-inner">
        {state === "done" ? (
          <span className="pg-quiz-done">Thanks. Tuning the page for you.</span>
        ) : (
          <>
            <div className="pg-quiz-prompt">
              <span className="pg-quiz-dots" aria-label={`Question ${step + 1} of ${questions.length}`}>
                {questions.map((_, i) => (
                  <i key={i} className={i <= step ? "on" : undefined} />
                ))}
              </span>
              <span>{step === 0 && prompt ? `${prompt} ${q.prompt}` : q.prompt}</span>
            </div>
            <div className="pg-quiz-options">
              {q.options.slice(0, 5).map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={`pg-quiz-opt${o.image ? "" : " pg-quiz-opt-text"}`}
                  onClick={() => answer(o)}
                  data-cta={`quiz:${q.id}:${o.label}`}
                >
                  {o.image ? <img src={o.image} alt="" /> : null}
                  {o.label}
                </button>
              ))}
            </div>
            <button type="button" className="pg-quiz-skip" onClick={hide}>
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
