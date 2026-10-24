"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Check, CircleCheck } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch, Textarea } from "@/components/console/form";
import { Tile, TileHeader } from "@/components/console/home/ui";
import { ConsolePage } from "@/components/console/shell-ui";
import { WidgetGlyph } from "@/components/console/sidebar";
import type { Widget } from "@/lib/mock/types";

/** Rules the concierge's agent follows on every reply. Not settings: they can't be turned off. */
const RULES = [
  "Recommends by the shopper's taste, never by what's popular or trending.",
  "Only picks products that are in stock and within a budget the shopper names.",
  "Never makes up products, prices, stock or sizes. Everything comes from your catalog.",
  "Stays on shopping in your store and never names another store.",
];

type Profile = { name: string; tagline: string; description: string };

function ProfileForm({
  storeKey,
  saved,
  className,
}: {
  storeKey: string;
  saved: Profile;
  className?: string;
}) {
  const update = useMutation(api.storeSettings.updateProfile);
  const [form, setForm] = useState(saved);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const dirty =
    form.name !== saved.name ||
    form.tagline !== saved.tagline ||
    form.description !== saved.description;
  const set = (key: keyof Profile, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setState("idle");
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("saving");
    try {
      await update({
        key: storeKey,
        name: form.name,
        tagline: form.tagline,
        description: form.description,
      });
      setState("saved");
    } catch (err) {
      setState("idle");
      setError(
        err instanceof ConvexError ? String(err.data) : "Couldn't save that",
      );
    }
  }

  return (
    <Tile delay={120} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Store profile"
        hint="How the concierge introduces your store, and what it reads before every conversation"
      />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 p-6 pt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint="Shown at the top of the concierge.">
            <Input
              value={form.name}
              maxLength={60}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Tagline" hint="Shown under the name.">
            <Input
              value={form.tagline}
              maxLength={120}
              onChange={(e) => set("tagline", e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="About the store"
          hint={
            <span className="num">
              {form.description.length} / 1,200. Write it the way you&apos;d
              brief a new shop assistant.
            </span>
          }
        >
          <Textarea
            value={form.description}
            maxLength={1200}
            onChange={(e) => set("description", e.target.value)}
            className="min-h-32"
          />
        </Field>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.05] pt-4">
          <p
            className={cn(
              "text-xs",
              error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {error ??
              "Replacing your catalog file resets these to the file's values."}
          </p>
          <div className="flex items-center gap-2">
            {state === "saved" && !dirty && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-700">
                <Check className="size-4" /> Saved
              </span>
            )}
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setForm(saved);
                  setError(null);
                }}
              >
                Discard
              </Button>
            )}
            <Button type="submit" disabled={!dirty || state === "saving"}>
              {state === "saving" ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </Tile>
  );
}

/** Settings that change what shoppers get: whether the concierge is on, and how it presents the store. */
export function SettingsView({
  widget,
  storeKey,
}: {
  widget: Pick<Widget, "name" | "domain" | "accent" | "logo">;
  storeKey: string;
}) {
  const settings = useQuery(api.storeSettings.get, { key: storeKey });
  const setPaused = useMutation(api.storeSettings.setPaused);

  return (
    <ConsolePage>
      <header className="home-rise">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <WidgetGlyph
            name={widget.name}
            accent={widget.accent}
            logo={widget.logo}
          />
          {settings === undefined ? (
            <span>Checking…</span>
          ) : settings === null ? (
            <span>No catalog connected</span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2 rounded-full",
                  settings.paused ? "bg-amber-500" : "bg-emerald-500",
                )}
              />
              {settings.paused ? "Concierge paused" : "Concierge on"}
            </span>
          )}
        </div>
        <h1 className="mt-3 text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-neutral-950 sm:text-[44px]">
          Settings
        </h1>
        <p className="mt-2.5 text-[15px] text-muted-foreground">
          Whether shoppers on {widget.domain} see the concierge, and how it
          presents your store.
        </p>
      </header>

      {settings === null ? (
        <Tile className="mt-10 p-10 text-center">
          <p className="text-[15px] font-medium text-neutral-950">
            Connect a catalog first
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Settings apply once the concierge has a store to work with.
          </p>
        </Tile>
      ) : (
        <div className="mt-10 grid gap-5 lg:grid-cols-12">
          <Tile delay={60} className="lg:col-span-12">
            <div className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold tracking-tight text-neutral-950">
                  Show the concierge on your store
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {settings?.paused
                    ? "Paused. Shoppers don't see the launcher, and a concierge that's open closes. Conversations and settings are kept."
                    : "On. Shoppers can open the concierge on every page with the snippet."}
                </p>
              </div>
              <Switch
                checked={settings ? !settings.paused : false}
                disabled={!settings}
                onCheckedChange={(on) =>
                  setPaused({ key: storeKey, paused: !on })
                }
                aria-label="Show the concierge"
              />
            </div>
          </Tile>

          {settings ? (
            <ProfileForm
              key={storeKey}
              storeKey={storeKey}
              saved={settings}
              className="lg:col-span-7"
            />
          ) : (
            <Tile className="h-80 animate-pulse lg:col-span-7" />
          )}

          <Tile delay={180} className="flex flex-col lg:col-span-5">
            <TileHeader
              title="Always on"
              hint="Rules the concierge follows on every reply"
            />
            <ul className="space-y-3 p-6 pt-5">
              {RULES.map((rule) => (
                <li key={rule} className="flex gap-2.5 text-sm text-neutral-800">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {rule}
                </li>
              ))}
            </ul>
          </Tile>
        </div>
      )}
    </ConsolePage>
  );
}
