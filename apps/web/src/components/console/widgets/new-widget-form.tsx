"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Mountain,
  Shapes,
  Shirt,
  Sofa,
  SprayCan,
  Wine,
} from "lucide-react";
import type { ComponentType } from "react";
import { Field, Input, Select } from "@/components/console/form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CURRENCIES,
  MARKETS,
  VERTICALS,
  type VerticalId,
} from "@/lib/mock/setup";
import {
  AdornedInput,
  ChoiceCard,
  ChoiceCardGroup,
  FieldGroup,
  Spinner,
} from "../setup/atoms";

const verticalIcons: Record<
  VerticalId,
  ComponentType<{ className?: string }>
> = {
  home: Sofa,
  fashion: Shirt,
  beauty: SprayCan,
  food: Wine,
  books: BookOpen,
  outdoor: Mountain,
  other: Shapes,
};

const HOST = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** Accepts "ostro.wine", "https://ostro.wine/", "www.ostro.wine/shop" and keeps the host. */
function normalizeHost(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function NewWidgetForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [vertical, setVertical] = useState<VerticalId | null>(null);
  const [market, setMarket] = useState("US");
  const [currency, setCurrency] = useState("USD");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [urlBlurred, setUrlBlurred] = useState(false);

  const host = normalizeHost(url);
  const hostValid = HOST.test(host);
  const canSubmit =
    name.trim().length > 1 && hostValid && vertical !== null && !submitting;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    // Mock: this will create the widget in Convex (name, host, vertical, market,
    // currency), mint a pk_test key, and route to the new widget's setup.
    setTimeout(() => router.push("/dashboard/ostro/setup"), 700);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Store details</CardTitle>
          <CardDescription>
            You can change all of this later in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Widget name"
              hint="For your team. Shoppers see the concierge's name."
            >
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ostro Wine Club"
                maxLength={48}
              />
            </Field>
            <Field
              label="Store URL"
              hint={
                urlBlurred && url && !hostValid ? (
                  <span className="text-destructive">
                    Enter a domain like ostro.wine
                  </span>
                ) : (
                  "Where the widget will run. You can add more domains later."
                )
              }
            >
              <AdornedInput
                prefix="https://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => {
                  setUrlBlurred(true);
                  if (url) setUrl(normalizeHost(url));
                }}
                placeholder="ostro.wine"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                aria-invalid={urlBlurred && !!url && !hostValid}
              />
            </Field>
          </div>

          <FieldGroup
            label="What kind of store is it?"
            hint="Sets sensible defaults for taste domains and catalog fields. Nothing is locked in."
          >
            <ChoiceCardGroup
              aria-label="Store type"
              value={vertical}
              onValueChange={setVertical}
              className="grid-cols-2 sm:grid-cols-3"
            >
              {VERTICALS.map((v) => {
                const Icon = verticalIcons[v.id];
                return (
                  <ChoiceCard
                    key={v.id}
                    value={v.id}
                    icon={<Icon className="size-4" />}
                    title={v.label}
                    description={v.examples}
                  />
                );
              })}
            </ChoiceCardGroup>
          </FieldGroup>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field
              label="Primary market"
              hint="Questionnaire options are localized to each shopper's city. This is the fallback."
            >
              <Select
                value={market}
                onChange={(e) => {
                  setMarket(e.target.value);
                  if (!currencyTouched) {
                    const m = MARKETS.find((x) => x.code === e.target.value);
                    if (m) setCurrency(m.currency);
                  }
                }}
              >
                {MARKETS.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency">
              <Select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setCurrencyTouched(true);
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardContent>

        <CardFooter className="justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Starts in test mode with a pk_test_ key. Nothing reaches shoppers
            until you go live.
          </p>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Spinner /> Creating…
              </>
            ) : (
              <>
                Create widget <ArrowRight data-icon="inline-end" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
