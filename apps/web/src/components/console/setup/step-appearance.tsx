"use client";

import { useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { Input, Segmented } from "@/components/console/form";
import { Card, CardContent } from "@/components/ui/card";
import {
  ACCENT_SWATCHES,
  type ConciergeDefaults,
  type SampleProduct,
} from "@/lib/mock/setup";
import { cn } from "@/lib/utils";
import { AdornedInput, FieldGroup, PreviewFrame } from "./atoms";
import { contrast, isHex, onAccent } from "./color";
import { WidgetPanelMock, type WidgetTheme } from "./widget-mock";

export interface AppearanceConfig {
  accent: string;
  position: "left" | "right";
}

const CORNERS = {
  sharp: { panel: 6, launcher: 6, label: "Sharp" },
  soft: { panel: 14, launcher: 12, label: "Soft" },
  round: { panel: 22, launcher: 999, label: "Round" },
} as const;

type Corner = keyof typeof CORNERS;

export function AppearanceStep({
  config,
  onChange,
  widgetAccent,
  domain,
  conciergeName,
  greeting,
  defaults,
  samples,
  recs,
}: {
  config: AppearanceConfig;
  onChange: (patch: Partial<AppearanceConfig>) => void;
  widgetAccent: string;
  domain: string;
  conciergeName: string;
  greeting: string;
  defaults: ConciergeDefaults;
  samples: SampleProduct[];
  recs: number;
}) {
  const [hex, setHex] = useState(config.accent);
  const [corner, setCorner] = useState<Corner>("soft");
  const [label, setLabel] = useState(defaults.launcherLabel);
  const [theme, setTheme] = useState<WidgetTheme>("light");

  const swatches = [
    widgetAccent,
    ...ACCENT_SWATCHES.filter((s) => s !== widgetAccent),
  ].slice(0, 6);
  const fg = onAccent(config.accent);
  const ratio = contrast(config.accent, fg);
  const grade = ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large only" : "Fails";

  function pick(color: string) {
    setHex(color);
    onChange({ accent: color });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card>
        <CardContent className="divide-y">
          <FieldGroup label="Launcher position" className="pb-4">
            <Segmented
              size="md"
              value={config.position}
              onChange={(v) => onChange({ position: v })}
              options={[
                { value: "left", label: "Bottom left" },
                { value: "right", label: "Bottom right" },
              ]}
            />
          </FieldGroup>

          <FieldGroup
            label="Accent color"
            className="py-4"
            hint={
              <span className="num">
                Text on accent: {fg === "#ffffff" ? "white" : "dark"} ·{" "}
                {ratio.toFixed(1)}:1 ·{" "}
                <span
                  className={cn(
                    "font-medium",
                    grade === "AA"
                      ? "text-emerald-700"
                      : grade === "Fails"
                        ? "text-red-700"
                        : "text-amber-700",
                  )}
                >
                  {grade}
                </span>
              </span>
            }
          >
            <div
              role="radiogroup"
              aria-label="Accent swatches"
              className="flex flex-wrap gap-2"
            >
              {swatches.map((s) => {
                const on = s.toLowerCase() === config.accent.toLowerCase();
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={s}
                    onClick={() => pick(s)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      on
                        ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                        : "ring-1 ring-foreground/10 ring-inset",
                    )}
                    style={{ background: s }}
                  >
                    {on && (
                      <Check
                        className="size-4"
                        style={{ color: onAccent(s) }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-8 shrink-0 rounded-md ring-1 ring-foreground/10 ring-inset"
                style={{ background: isHex(hex) ? hex : config.accent }}
              />
              <AdornedInput
                aria-label="Accent hex"
                prefix="Hex"
                value={hex}
                onChange={(e) => {
                  const v = e.target.value.startsWith("#")
                    ? e.target.value
                    : `#${e.target.value}`;
                  setHex(v.slice(0, 7));
                  if (isHex(v)) onChange({ accent: v });
                }}
                spellCheck={false}
                aria-invalid={!isHex(hex)}
              />
            </div>
          </FieldGroup>

          <FieldGroup label="Corner style" className="py-4">
            <Segmented
              size="md"
              value={corner}
              onChange={setCorner}
              options={(Object.keys(CORNERS) as Corner[]).map((c) => ({
                value: c,
                label: CORNERS[c].label,
              }))}
            />
          </FieldGroup>

          <FieldGroup
            label="Launcher label"
            className="py-4"
            hint="Leave empty for an icon-only launcher."
          >
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={22}
            />
          </FieldGroup>

          <FieldGroup
            label="Widget theme"
            className="pt-4"
            hint="Applies to the shopper widget only. Pick whichever sits better on your storefront."
          >
            <Segmented
              size="md"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <PreviewFrame
        title="Live preview"
        className="lg:sticky lg:top-20"
        bodyClassName="overflow-hidden p-0"
      >
        <div className="flex h-9 items-center border-b bg-background px-3">
          <span className="mx-auto flex h-6 items-center rounded-md bg-muted px-3 text-xs text-muted-foreground">
            {domain}
          </span>
        </div>
        <div className="relative h-140 overflow-hidden bg-white">
          <FakeStorefront />
          <div
            className={cn(
              "absolute bottom-20 w-68 transition-[left,right] duration-300",
              config.position === "right" ? "right-5" : "left-5",
            )}
          >
            <WidgetPanelMock
              accent={config.accent}
              theme={theme}
              radius={CORNERS[corner].panel}
              name={conciergeName}
              greeting={greeting}
              ask={defaults.ask}
              replyLead={defaults.replyLead}
              samples={samples}
              recs={Math.min(2, recs)}
            />
          </div>
          <div
            className={cn(
              "absolute bottom-5 flex h-11 items-center gap-2 text-sm font-semibold shadow-sm",
              config.position === "right" ? "right-5" : "left-5",
              label ? "pr-4 pl-3.5" : "w-11 justify-center",
            )}
            style={{
              background: config.accent,
              color: fg,
              borderRadius: CORNERS[corner].launcher,
            }}
          >
            <MessageCircle className="size-5" />
            {label}
          </div>
        </div>
      </PreviewFrame>
    </div>
  );
}

/** Grey-block storefront: enough page to judge placement and contrast, nothing more. */
function FakeStorefront() {
  return (
    <div aria-hidden className="pointer-events-none px-6 pt-5">
      <div className="flex items-center gap-6">
        <span className="h-3.5 w-20 rounded-sm bg-stone-300" />
        <span className="flex flex-1 gap-4">
          {[44, 52, 38, 48].map((w) => (
            <span
              key={w}
              className="h-2 rounded-full bg-stone-200"
              style={{ width: w }}
            />
          ))}
        </span>
        <span className="size-5 rounded-full bg-stone-200" />
      </div>
      <div className="mt-6 flex h-32 items-end rounded-md bg-stone-100 p-5">
        <span className="space-y-2">
          <span className="block h-3.5 w-48 rounded-sm bg-stone-300" />
          <span className="block h-2 w-32 rounded-full bg-stone-200" />
        </span>
      </div>
      <div className="mt-6 grid grid-cols-4 gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-2">
            <span className="block aspect-4/5 rounded-md bg-stone-100" />
            <span className="block h-2 w-4/5 rounded-full bg-stone-200" />
            <span className="block h-2 w-1/3 rounded-full bg-stone-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
