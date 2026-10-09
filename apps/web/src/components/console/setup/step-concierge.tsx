"use client";

import { useState } from "react";
import {
  Field,
  Input,
  Segmented,
  SettingRow,
  Switch,
  Textarea,
} from "@/components/console/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ConciergeDefaults, SampleProduct } from "@/lib/mock/setup";
import { AdornedInput, FieldGroup, PreviewFrame, TokenInput } from "./atoms";
import { WidgetPanelMock } from "./widget-mock";

export interface ConciergeConfig {
  name: string;
  greeting: string;
  recs: number;
}

const GREETING_LIMIT = 160;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ConciergeStep({
  config,
  onChange,
  defaults,
  voice,
  accent,
  samples,
}: {
  config: ConciergeConfig;
  onChange: (patch: Partial<ConciergeConfig>) => void;
  defaults: ConciergeDefaults;
  voice: string[];
  accent: string;
  samples: SampleProduct[];
}) {
  const [persona, setPersona] = useState(defaults.persona);
  const [guards, setGuards] = useState({
    inStockOnly: true,
    crossCategory: true,
    mentionPrice: true,
    handoff: true,
  });
  const [stretch, setStretch] = useState("15");
  const [email, setEmail] = useState(defaults.handoffEmail);
  const [avoid, setAvoid] = useState(defaults.avoid);

  const emailBad = guards.handoff && email.length > 0 && !EMAIL.test(email);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>What shoppers see first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Field
              label="Concierge name"
              hint="Short and human. Shown in the panel header."
            >
              <Input
                value={config.name}
                onChange={(e) => onChange({ name: e.target.value })}
                maxLength={24}
                className="max-w-xs"
              />
            </Field>
            <Field
              label="Greeting"
              hint={
                <span className="num block text-right">
                  {config.greeting.length} / {GREETING_LIMIT}
                </span>
              }
            >
              <Textarea
                value={config.greeting}
                onChange={(e) =>
                  onChange({
                    greeting: e.target.value.slice(0, GREETING_LIMIT),
                  })
                }
                className="min-h-16"
              />
            </Field>
            <Field
              label="Voice and persona"
              hint={`Written as instructions to the concierge. Starts from your brand voice: ${voice.join(", ") || "not set"}.`}
            >
              <Textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className="min-h-28"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingRow
              className="py-0"
              title="Picks per reply"
              description="Fewer picks read as more confident. Three is a good default on mobile."
            >
              <Segmented
                size="md"
                value={String(config.recs)}
                onChange={(v) => onChange({ recs: Number(v) })}
                options={["1", "2", "3", "4", "5"].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guardrails</CardTitle>
            <CardDescription>
              Rules the concierge won&apos;t break, whatever the shopper asks.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow
              className="pt-0"
              title="Never recommend out-of-stock items"
              description="Checked against inventory at answer time, including variants."
            >
              <Switch
                checked={guards.inStockOnly}
                onCheckedChange={(v) =>
                  setGuards({ ...guards, inStockOnly: v })
                }
                aria-label="Never recommend out-of-stock items"
              />
            </SettingRow>
            <SettingRow
              title="Budget stretch limit"
              description="How far above a stated budget a pick may go. Over-budget picks are always flagged as such."
            >
              <AdornedInput
                value={stretch}
                onChange={(e) =>
                  setStretch(e.target.value.replace(/[^\d]/g, "").slice(0, 2))
                }
                suffix="%"
                inputMode="numeric"
                aria-label="Budget stretch limit"
                className="w-20"
                inputClassName="num text-right"
              />
            </SettingRow>
            <SettingRow
              title="Allow cross-category pairings"
              description="Suggest things that go together, like a carafe with a bottle or a lamp with a chair."
            >
              <Switch
                checked={guards.crossCategory}
                onCheckedChange={(v) =>
                  setGuards({ ...guards, crossCategory: v })
                }
                aria-label="Allow cross-category pairings"
              />
            </SettingRow>
            <SettingRow
              title="Mention price in replies"
              description="Off: prices appear on product cards only."
            >
              <Switch
                checked={guards.mentionPrice}
                onCheckedChange={(v) =>
                  setGuards({ ...guards, mentionPrice: v })
                }
                aria-label="Mention price in replies"
              />
            </SettingRow>
            <div className="space-y-3 pt-4">
              <SettingRow
                className="py-0"
                title="Hand off to email when stuck"
                description="After two misses, offer to pass the conversation to your team with the shopper's consent."
              >
                <Switch
                  checked={guards.handoff}
                  onCheckedChange={(v) => setGuards({ ...guards, handoff: v })}
                  aria-label="Hand off to email when stuck"
                />
              </SettingRow>
              {guards.handoff && (
                <div className="max-w-sm space-y-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="Hand-off email"
                    aria-invalid={emailBad}
                    placeholder="team@yourstore.com"
                  />
                  {emailBad && (
                    <p className="text-xs text-destructive">
                      Enter a valid email address
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Topics to avoid</CardTitle>
            <CardDescription>
              The concierge politely declines these.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup
              label="Topics"
              hint="Press Enter to add. Legal and safety topics are blocked for every store regardless."
            >
              <TokenInput
                values={avoid}
                onChange={setAvoid}
                placeholder="Add a topic"
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <PreviewFrame
        title="Shopper preview"
        caption="Sample exchange. Real replies are grounded in the shopper's taste profile and your live catalog."
      >
        <WidgetPanelMock
          className="mx-auto w-full max-w-72"
          accent={accent}
          name={config.name}
          greeting={config.greeting}
          ask={defaults.ask}
          replyLead={defaults.replyLead}
          samples={samples}
          recs={config.recs}
        />
      </PreviewFrame>
    </div>
  );
}
