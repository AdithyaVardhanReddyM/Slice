"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  Chip,
  Segmented,
  Select,
  SettingRow,
  Switch,
} from "@/components/console/form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  PREVIEW_CITIES,
  TASTE_DOMAINS,
  TASTE_OPTIONS,
  type PreviewCity,
  type TasteDomain,
} from "@/lib/mock/setup";
import { FieldGroup, Notice, PreviewFrame } from "./atoms";
import { onAccent } from "./color";

export interface TasteConfig {
  domains: TasteDomain[];
  questions: 3 | 4 | 5;
  localize: boolean;
}

const domainMeta = new Map(TASTE_DOMAINS.map((d) => [d.id, d]));

export function TasteStep({
  config,
  onChange,
  accent,
  conciergeName,
}: {
  config: TasteConfig;
  onChange: (patch: Partial<TasteConfig>) => void;
  accent: string;
  conciergeName: string;
}) {
  const { domains, questions, localize } = config;
  const [freeText, setFreeText] = useState(true);
  const [signals, setSignals] = useState({
    questionnaire: true,
    chat: true,
    page: true,
    city: true,
  });
  const [city, setCity] = useState<PreviewCity>("austin");
  const [q, setQ] = useState(0);

  const toggleDomain = (id: TasteDomain) =>
    onChange({
      domains: domains.includes(id)
        ? domains.filter((d) => d !== id)
        : [...domains, id],
    });

  const count = domains.length;
  const advice =
    count === 0
      ? {
          tone: "bad",
          text: "Pick at least one domain, or shoppers go straight to chat.",
        }
      : count < 3
        ? {
            tone: "warn",
            text: "Fewer than three gives Qloo little to work with. Picks get generic.",
          }
        : count > 4
          ? {
              tone: "warn",
              text: "Completion drops noticeably after four. Consider trimming.",
            }
          : null;

  const cityOn = localize && signals.city;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Questionnaire</CardTitle>
            <CardDescription>
              Shown when a shopper opens the concierge.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FieldGroup
              label="Taste domains"
              aside={
                <span className="num">{count} selected · 3–4 recommended</span>
              }
              hint="Order matters: shoppers see questions in the order you pick them."
            >
              <div className="flex flex-wrap gap-2">
                {TASTE_DOMAINS.map((d) => {
                  const pos = domains.indexOf(d.id);
                  return (
                    <Chip
                      key={d.id}
                      selected={pos >= 0}
                      onClick={() => toggleDomain(d.id)}
                      className={pos >= 0 ? "pl-1.5" : undefined}
                    >
                      {pos >= 0 && (
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                          {pos + 1}
                        </span>
                      )}
                      {d.label}
                    </Chip>
                  );
                })}
              </div>
            </FieldGroup>

            {advice && (
              <Notice
                tone={advice.tone === "bad" ? "bad" : "warn"}
                icon={<TriangleAlert />}
              >
                {advice.text}
              </Notice>
            )}

            {count > 0 && (
              <ol className="divide-y rounded-lg border">
                {domains.map((id, i) => {
                  const d = domainMeta.get(id)!;
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 px-3 py-2 text-sm"
                    >
                      <span className="w-4 text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {d.question}
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        {d.entity}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Number of questions</div>
                <p className="text-sm text-muted-foreground">
                  {questions > count && count > 0
                    ? `${questions - count} more than domains: extra questions go deeper on ${domainMeta.get(domains[0])!.label.toLowerCase()}.`
                    : "Every question is skippable."}
                </p>
              </div>
              <Segmented
                size="md"
                value={String(questions) as "3" | "4" | "5"}
                onChange={(v) =>
                  onChange({ questions: Number(v) as 3 | 4 | 5 })
                }
                options={[
                  { value: "3", label: "3" },
                  { value: "4", label: "4" },
                  { value: "5", label: "5" },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Answer options</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow
              className="pt-0"
              title="Localize options to the shopper's city"
              description={
                <>
                  Options come from Qloo insights for the shopper&apos;s city,
                  so Austin shoppers see Austin-popular artists and restaurants.
                  Off: one global list for everyone.
                </>
              }
            >
              <Switch
                checked={localize}
                onCheckedChange={(v) => onChange({ localize: v })}
                aria-label="Localize options"
              />
            </SettingRow>
            <SettingRow
              className="pb-0"
              title="Allow free-text answers"
              description="Adds a “Something else” field. Slice resolves what they type to a Qloo entity."
            >
              <Switch
                checked={freeText}
                onCheckedChange={setFreeText}
                aria-label="Allow free text"
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signal sources</CardTitle>
            <CardDescription>
              What Slice may use to build a taste profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {(
                [
                  [
                    "questionnaire",
                    "Questionnaire answers",
                    "The core signal. Turning this off skips the questionnaire entirely.",
                  ],
                  [
                    "chat",
                    "Mentions in chat",
                    "“I’ve been rewatching Twin Peaks” resolves to the show and its taste tags.",
                  ],
                  [
                    "page",
                    "Product page context",
                    "The product or collection the shopper opened the concierge from.",
                  ],
                  [
                    "city",
                    "Approximate city from IP",
                    "City-level only, used to localize options. Needed for localization.",
                  ],
                ] as const
              ).map(([key, title, description]) => (
                <SettingRow
                  key={key}
                  title={title}
                  description={description}
                  className="first:pt-0"
                >
                  <Switch
                    checked={signals[key]}
                    onCheckedChange={(v) =>
                      setSignals({ ...signals, [key]: v })
                    }
                    aria-label={title}
                  />
                </SettingRow>
              ))}
            </div>
            {localize && !signals.city && (
              <Notice tone="warn" icon={<Info />} className="mt-2">
                Without approximate city, localized options fall back to your
                primary market.
              </Notice>
            )}
          </CardContent>
          <CardFooter className="items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>
              No names, emails or purchase history, ever. Location never goes
              below city level and profiles are tied to an anonymous session ID
              that expires after 30 days.
            </span>
          </CardFooter>
        </Card>
      </div>

      <TastePreview
        domains={domains}
        questions={questions}
        city={city}
        onCity={setCity}
        localized={cityOn}
        freeText={freeText}
        accent={accent}
        conciergeName={conciergeName}
        index={q}
        onIndex={setQ}
      />
    </div>
  );
}

function TastePreview({
  domains,
  questions,
  city,
  onCity,
  localized,
  freeText,
  accent,
  conciergeName,
  index,
  onIndex,
}: {
  domains: TasteDomain[];
  questions: number;
  city: PreviewCity;
  onCity: (c: PreviewCity) => void;
  localized: boolean;
  freeText: boolean;
  accent: string;
  conciergeName: string;
  index: number;
  onIndex: (i: number) => void;
}) {
  const [picked, setPicked] = useState<Record<number, string>>({});
  const total = domains.length ? questions : 0;
  const i = Math.min(index, Math.max(0, total - 1));
  const domain = domains.length ? domains[i % domains.length] : null;
  const meta = domain ? domainMeta.get(domain)! : null;
  const options = domain
    ? TASTE_OPTIONS[domain][localized ? city : "global"]
    : [];
  const deeper = domain && i >= domains.length;
  const fg = onAccent(accent);
  const cityLabel = PREVIEW_CITIES.find((c) => c.id === city)!.label;

  return (
    <PreviewFrame
      title="Shopper preview"
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">As a shopper in</span>
          <Select
            aria-label="Preview city"
            value={city}
            onChange={(e) => onCity(e.target.value as PreviewCity)}
            disabled={!localized}
            className="w-32"
          >
            {PREVIEW_CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      }
      caption={
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0">
            {meta
              ? `Options from Qloo insights for ${meta.entity}. ${
                  localized
                    ? `Localized to ${cityLabel}.`
                    : "Global list, no location filter."
                }`
              : null}
          </p>
          {total > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous question"
                onClick={() => onIndex(Math.max(0, i - 1))}
                disabled={i === 0}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next question"
                onClick={() => onIndex(Math.min(total - 1, i + 1))}
                disabled={i >= total - 1}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      }
    >
      <div className="mx-auto w-full max-w-72 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex items-center gap-2.5 px-4 pt-4">
          <span
            className="flex size-7 items-center justify-center rounded-full text-xs font-semibold"
            style={{ background: accent, color: fg }}
          >
            {conciergeName.charAt(0) || "C"}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold text-stone-900">
              {conciergeName || "Concierge"}
            </div>
            <div className="num text-xs text-stone-500">
              {total ? `Question ${i + 1} of ${total}` : "No questions"}
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-1 px-4">
          {Array.from({ length: total }, (_, k) => (
            <span
              key={k}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: k <= i ? accent : "#ece8dd" }}
            />
          ))}
        </div>

        {meta ? (
          <div key={`${domain}-${i}-${localized ? city : "g"}`} className="p-4">
            <p className="text-base leading-snug font-semibold text-stone-900">
              {deeper
                ? `And one more ${meta.label.toLowerCase()} pick?`
                : meta.question}
            </p>
            <p className="mt-1 text-xs text-stone-500">Pick one, or skip.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {options.map((o) => {
                const on = picked[i] === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setPicked({ ...picked, [i]: o })}
                    className="h-8 rounded-full border px-3 text-xs font-medium transition-colors"
                    style={
                      on
                        ? {
                            background: accent,
                            borderColor: accent,
                            color: fg,
                          }
                        : { borderColor: "#d6cfbd", color: "#17150f" }
                    }
                  >
                    {o}
                  </button>
                );
              })}
            </div>
            {freeText && (
              <input
                placeholder="Something else…"
                className="mt-2.5 h-8 w-full rounded-full border border-stone-200 bg-stone-50 px-3 text-xs text-stone-900 outline-none placeholder:text-stone-400"
              />
            )}
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onIndex(Math.min(total - 1, i + 1))}
                className="text-xs font-medium text-stone-500 hover:text-stone-900"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => onIndex(i + 1 < total ? i + 1 : 0)}
                className="h-8 rounded-full px-4 text-xs font-semibold"
                style={{ background: accent, color: fg }}
              >
                {i + 1 < total ? "Next" : "See picks"}
              </button>
            </div>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-xs text-stone-500">
            Pick a taste domain to preview the questionnaire.
          </p>
        )}
      </div>
    </PreviewFrame>
  );
}
