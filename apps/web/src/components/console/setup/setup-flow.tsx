"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  CircleDashed,
  FlaskConical,
  Rocket,
} from "lucide-react";
import { Badge, Panel } from "@/components/console/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fmt } from "@/lib/format";
import { NOW } from "@/lib/mock/random";
import {
  SETUP_STEPS,
  TASTE_DOMAINS,
  type CatalogPreview,
  type ConciergeDefaults,
  type StoreProfileDraft,
  type TasteDomain,
} from "@/lib/mock/setup";
import type { CatalogSourceKind, SetupStep, Widget } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import { InstallStep } from "../install/install-view";
import { useMyWidget } from "../use-my-widget";
import { AppearanceStep, type AppearanceConfig } from "./step-appearance";
import { CatalogStep } from "./step-catalog";
import { ConciergeStep, type ConciergeConfig } from "./step-concierge";
import { StoreStep } from "./step-store";
import { TasteStep, type TasteConfig } from "./step-taste";

const STEP_COPY: Record<SetupStep, { title: string; description: string }> = {
  store: {
    title: "Store profile",
    description:
      "Tell Slice what you sell and who for. It shapes how the concierge talks and which taste signals matter most.",
  },
  catalog: {
    title: "Connect your catalog",
    description:
      "Slice matches taste against your descriptions and style attributes. The more complete they are, the sharper the picks.",
  },
  taste: {
    title: "Taste signals",
    description:
      "Choose what the questionnaire asks. Answers resolve to Qloo entities, then to taste tags that Slice maps onto your catalog.",
  },
  concierge: {
    title: "Concierge",
    description:
      "How it introduces itself, how it talks, and the rules it won't break.",
  },
  appearance: {
    title: "Appearance",
    description: "How the launcher and panel look on your storefront.",
  },
  install: {
    title: "Install",
    description: "Add one script to your widget, then confirm it's loading.",
  },
};

const domainLabel = new Map(TASTE_DOMAINS.map((d) => [d.id, d.label]));

export function SetupFlow({
  widget,
  profile,
  catalog,
  concierge: conciergeDefaults,
  domains: domainDefaults,
  origin,
  catalogSource,
}: {
  widget: Widget;
  /** The store platform picked when the widget was created, opened in the Catalog step. */
  catalogSource?: CatalogSourceKind | null;
  profile: StoreProfileDraft;
  catalog: CatalogPreview;
  concierge: ConciergeDefaults;
  domains: TasteDomain[];
  /** This app's origin, which serves slice.js. */
  origin: string;
}) {
  const [completed, setCompleted] = useState<SetupStep[]>(
    widget.completedSteps,
  );
  const [index, setIndex] = useState(() => {
    const i = SETUP_STEPS.findIndex(
      (s) => !widget.completedSteps.includes(s.id),
    );
    return i < 0 ? 0 : i;
  });
  const [phase, setPhase] = useState<"steps" | "review" | "live">("steps");

  const [catalogConnected, setCatalogConnected] = useState(
    widget.catalog.source !== null,
  );
  // The account's own copy of this widget, which a store connection is saved under.
  const mine = useMyWidget(widget.storeKey ?? widget.id);
  const [verified, setVerified] = useState(false);
  const [taste, setTaste] = useState<TasteConfig>({
    domains: domainDefaults,
    questions: Math.min(5, Math.max(3, domainDefaults.length)) as 3 | 4 | 5,
    localize: true,
  });
  const [concierge, setConcierge] = useState<ConciergeConfig>({
    name: conciergeDefaults.name,
    greeting: conciergeDefaults.greeting,
    recs: 3,
  });
  const [look, setLook] = useState<AppearanceConfig>({
    accent: widget.accent,
    position: "right",
  });

  const step = SETUP_STEPS[index];
  const isLast = index === SETUP_STEPS.length - 1;
  const done = new Set(completed);

  /** Steps that can't be marked done until something real happens. */
  const blocked: Partial<Record<SetupStep, string>> = {
    ...(catalogConnected ? {} : { catalog: "Connect a catalog source" }),
    ...(verified ? {} : { install: "Verify the installation" }),
  };
  const canComplete = !blocked[step.id];

  function go(next: number) {
    setIndex(next);
    setPhase("steps");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function advance() {
    if (canComplete && !done.has(step.id))
      setCompleted([...completed, step.id]);
    if (isLast) {
      setPhase("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      go(index + 1);
    }
  }

  // The install step flips this when slice.js first loads on an allowed site.
  function markVerified() {
    setVerified(true);
    setCompleted((c) => (c.includes("install") ? c : [...c, "install"]));
  }

  const tasteDomains = taste.domains.map((d) => domainLabel.get(d)).join(", ");
  const summaries: Record<SetupStep, string> = {
    store: `${widget.vertical} at ${profile.price === "mid" ? "mid-range" : profile.price} prices${profile.voice.length ? `, in a ${profile.voice.join(", ")} voice` : ""}`,
    catalog: catalogConnected
      ? `${fmt.int(catalog.rows)} products from ${catalog.label}`
      : "Not connected",
    taste: `${taste.questions}${taste.localize ? " localized" : ""} questions ${tasteDomains ? `on ${tasteDomains}` : "with no domains"}`,
    concierge: `${concierge.name || "Unnamed"}, ${concierge.recs} ${concierge.recs === 1 ? "pick" : "picks"} per reply`,
    appearance: `${look.accent.toUpperCase()}, bottom ${look.position}`,
    install: verified ? "Live on your store" : "Not detected yet",
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-7xl flex-1 items-start gap-6 px-6 py-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden space-y-6 lg:sticky lg:top-20 lg:block">
          <div className="space-y-2 px-2">
            <div className="truncate text-sm font-medium">{widget.name}</div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Setup progress</span>
              <span className="num">
                {done.size} of {SETUP_STEPS.length}
              </span>
            </div>
            <Progress
              value={(done.size / SETUP_STEPS.length) * 100}
              aria-label="Setup progress"
            />
          </div>

          <nav aria-label="Setup steps">
            <ol className="space-y-1">
              {SETUP_STEPS.map((s, i) => {
                const isDone = done.has(s.id);
                const isCurrent = phase === "steps" && i === index;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-current={isCurrent ? "step" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                        isCurrent && "bg-muted",
                      )}
                    >
                      <StepMarker
                        number={i + 1}
                        state={isCurrent ? "current" : isDone ? "done" : "todo"}
                      />
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block truncate text-sm",
                            isCurrent
                              ? "font-medium text-foreground"
                              : isDone
                                ? "text-foreground"
                                : "text-muted-foreground",
                          )}
                        >
                          {s.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {isDone && !isCurrent ? "Done" : s.summary}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="size-4 text-muted-foreground" /> Not
                live yet
              </CardTitle>
              <CardDescription className="text-xs">
                Try it on localhost as you go. Shoppers see nothing until the
                script is on your site and you go live.
              </CardDescription>
            </CardHeader>
          </Card>
        </aside>

        <div className="min-w-0">
          {phase === "steps" ? (
            <>
              <div
                key={step.id}
                className="flex flex-wrap items-start justify-between gap-4 pb-6"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Step {index + 1} of {SETUP_STEPS.length}, about{" "}
                    {step.estimate}
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {STEP_COPY[step.id].title}
                  </h1>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    {STEP_COPY[step.id].description}
                  </p>
                </div>
                {done.has(step.id) && (
                  <Badge tone="ok">
                    <Check /> Done
                  </Badge>
                )}
              </div>

              <div hidden={step.id !== "store"}>
                <StoreStep
                  domain={widget.domain}
                  draft={profile}
                  prefilled={widget.completedSteps.includes("store")}
                />
              </div>
              <div hidden={step.id !== "catalog"}>
                <CatalogStep
                  widgetId={widget.id}
                  widgetKey={mine?.key}
                  domain={widget.domain}
                  preview={catalog}
                  initialSource={catalogSource ?? widget.catalog.source}
                  onConnected={setCatalogConnected}
                />
              </div>
              <div hidden={step.id !== "taste"}>
                <TasteStep
                  config={taste}
                  onChange={(p) => setTaste({ ...taste, ...p })}
                  accent={look.accent}
                  conciergeName={concierge.name}
                />
              </div>
              <div hidden={step.id !== "concierge"}>
                <ConciergeStep
                  config={concierge}
                  onChange={(p) => setConcierge({ ...concierge, ...p })}
                  defaults={conciergeDefaults}
                  voice={profile.voice}
                  accent={look.accent}
                  samples={catalog.samples}
                />
              </div>
              <div hidden={step.id !== "appearance"}>
                <AppearanceStep
                  config={look}
                  onChange={(p) => setLook({ ...look, ...p })}
                  widgetAccent={widget.accent}
                  domain={widget.domain}
                  conciergeName={concierge.name}
                  greeting={concierge.greeting}
                  defaults={conciergeDefaults}
                  samples={catalog.samples}
                  recs={concierge.recs}
                />
              </div>
              <div hidden={step.id !== "install"}>
                <InstallStep
                  storeKey={widget.storeKey ?? widget.id}
                  origin={origin}
                  onVerified={markVerified}
                />
              </div>
            </>
          ) : (
            <Finish
              widget={widget}
              phase={phase}
              done={done}
              summaries={summaries}
              accent={look.accent}
              onEdit={go}
              onLive={() => setPhase("live")}
            />
          )}
        </div>
      </div>

      {phase === "steps" && (
        <footer className="sticky bottom-0 z-10 rounded-b-xl border-t bg-background">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-6">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => go(index - 1)}
                disabled={index === 0}
              >
                <ArrowLeft data-icon="inline-start" /> Back
              </Button>
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <Check className="size-4" />
                Draft saved at{" "}
                <span className="num">
                  {fmt.time(new Date(NOW).toISOString())}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              {!canComplete && (
                <span className="hidden text-xs text-muted-foreground md:inline">
                  {blocked[step.id]} to complete this step
                </span>
              )}
              <Button
                variant={canComplete ? "default" : "outline"}
                onClick={advance}
              >
                {!canComplete
                  ? "Skip for now"
                  : isLast
                    ? "Review and go live"
                    : "Continue"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

function StepMarker({
  number,
  state,
}: {
  number: number;
  state: "done" | "current" | "todo";
}) {
  if (state === "done") {
    return <CircleCheck className="size-5 shrink-0 text-emerald-600" />;
  }
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium",
        state === "current"
          ? "bg-primary text-primary-foreground"
          : "border text-muted-foreground",
      )}
    >
      {number}
    </span>
  );
}

function Finish({
  widget,
  phase,
  done,
  summaries,
  accent,
  onEdit,
  onLive,
}: {
  widget: Widget;
  phase: "review" | "live";
  done: Set<SetupStep>;
  summaries: Record<SetupStep, string>;
  accent: string;
  onEdit: (index: number) => void;
  onLive: () => void;
}) {
  const remaining = SETUP_STEPS.filter((s) => !done.has(s.id));
  const alreadyLive = widget.status === "live";
  const isLive = phase === "live" || alreadyLive;

  return (
    <div className="max-w-3xl space-y-6">
      {phase === "live" ? (
        <div className="space-y-2">
          <Badge tone="ok">Live</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">
            {widget.name} is live on {widget.domain}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            The launcher now shows to shoppers. First conversations usually
            show up within the hour; you&apos;ll see each one, with the taste
            behind every pick, in Conversations.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Review</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {remaining.length === 0
              ? alreadyLive
                ? "Everything's configured"
                : `${widget.name} is ready to go live`
              : `${remaining.length} ${remaining.length === 1 ? "step" : "steps"} left before going live`}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {remaining.length === 0
              ? alreadyLive
                ? "The concierge is already live. Changes you made apply to new conversations straight away."
                : `Going live shows the launcher to shoppers on ${widget.domain}.`
              : "You can go back to any step. Everything you've done so far is saved."}
          </p>
        </div>
      )}

      <Panel>
        <ul className="divide-y">
          {SETUP_STEPS.map((s, i) => {
            const ok = done.has(s.id);
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                {ok ? (
                  <CircleCheck className="size-4 shrink-0 text-emerald-600" />
                ) : (
                  <CircleDashed className="size-4 shrink-0 text-amber-600" />
                )}
                <span className="w-32 shrink-0 text-sm font-medium">
                  {s.label}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
                  {s.id === "appearance" && (
                    <span
                      className="size-3 shrink-0 rounded-sm ring-1 ring-foreground/10"
                      style={{ background: accent }}
                    />
                  )}
                  <span className={cn("truncate", !ok && "text-amber-700")}>
                    {summaries[s.id]}
                  </span>
                </span>
                {!isLive && (
                  <Button variant="ghost" size="sm" onClick={() => onEdit(i)}>
                    {ok ? "Edit" : "Finish"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        {isLive ? (
          <>
            <Link
              href={`/dashboard/concierge/${widget.id}`}
              className={buttonVariants({ variant: "default" })}
            >
              Open overview <ArrowRight data-icon="inline-end" />
            </Link>
            <Link
              href={`/dashboard/concierge/${widget.id}/install`}
              className={buttonVariants({ variant: "outline" })}
            >
              Install details
            </Link>
          </>
        ) : (
          <>
            <Button size="lg" disabled={remaining.length > 0} onClick={onLive}>
              <Rocket data-icon="inline-start" /> Go live
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => onEdit(SETUP_STEPS.length - 1)}
            >
              Back to install
            </Button>
            {remaining.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Finish{" "}
                {remaining.map((s) => s.label.toLowerCase()).join(" and ")}{" "}
                first.
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
