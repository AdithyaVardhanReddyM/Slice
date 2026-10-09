"use client";

import { useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { Chip, Input, Segmented, Textarea } from "@/components/console/form";
import { Panel } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import {
  REGION_OPTIONS,
  VOICE_OPTIONS,
  type PriceTier,
  type StoreProfileDraft,
} from "@/lib/mock/setup";
import { FormRow, Spinner } from "./atoms";

const MAX_VOICE = 3;
const DESCRIPTION_LIMIT = 600;

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export function StoreStep({
  domain,
  draft,
  prefilled,
}: {
  domain: string;
  /** What "draft from your site" produces. */
  draft: StoreProfileDraft;
  /** Show the saved profile (step already done) rather than an empty form. */
  prefilled: boolean;
}) {
  const [description, setDescription] = useState(
    prefilled ? draft.description : "",
  );
  const [sells, setSells] = useState<string[]>(prefilled ? draft.sells : []);
  const [audience, setAudience] = useState(prefilled ? draft.audience : "");
  const [price, setPrice] = useState<PriceTier>(draft.price);
  const [priceNote, setPriceNote] = useState(prefilled ? draft.priceNote : "");
  const [voice, setVoice] = useState<string[]>(prefilled ? draft.voice : []);
  const [regions, setRegions] = useState<string[]>(
    prefilled ? draft.regions : [],
  );

  const [phase, setPhase] = useState<"idle" | "reading" | "done">("idle");
  const [pagesShown, setPagesShown] = useState(0);
  /** Bumped on each draft so drafted fields remount fresh. */
  const [version, setVersion] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const hasContent = description.length > 0;

  function runDraft() {
    timers.current.forEach(clearTimeout);
    setPhase("reading");
    setPagesShown(0);
    const pages = draft.pagesRead.length;
    timers.current = [
      ...draft.pagesRead.map((_, i) =>
        setTimeout(() => setPagesShown(i + 1), 280 * (i + 1)),
      ),
      setTimeout(
        () => {
          setDescription(draft.description);
          setSells(draft.sells);
          setAudience(draft.audience);
          setPrice(draft.price);
          setPriceNote(draft.priceNote);
          setVoice(draft.voice);
          setRegions(draft.regions);
          setVersion((v) => v + 1);
          setPhase("done");
        },
        280 * (pages + 1) + 200,
      ),
    ];
  }

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-wrap items-center gap-4 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Globe className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="text-sm font-medium">Draft from your site</div>
            <p className="text-sm text-muted-foreground">
              Slice reads your homepage, about page and a sample of product
              pages on {domain}, then fills this in. You review every field.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={runDraft}
            disabled={phase === "reading"}
          >
            {phase === "reading" ? (
              <>
                <Spinner /> Reading {domain}…
              </>
            ) : hasContent ? (
              "Redraft from site"
            ) : (
              "Draft from your site"
            )}
          </Button>
        </div>
        {phase !== "idle" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            {draft.pagesRead.slice(0, pagesShown).map((p) => (
              <span key={p} className="flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" />
                {p}
              </span>
            ))}
            {phase === "reading" && pagesShown < draft.pagesRead.length && (
              <span className="flex items-center gap-1.5">
                <Spinner className="size-3.5" /> Fetching
              </span>
            )}
            {phase === "done" && (
              <span className="ml-auto text-foreground">
                Drafted from 14 pages. Edit anything that reads wrong.
              </span>
            )}
          </div>
        )}
      </Panel>

      <Panel className="divide-y">
        <FormRow
          title="Store description"
          description="Slice reads this to understand what you sell and who for. Plain language beats marketing copy."
        >
          <div key={`d${version}`} className="space-y-2">
            <Textarea
              value={description}
              onChange={(e) =>
                setDescription(e.target.value.slice(0, DESCRIPTION_LIMIT))
              }
              placeholder="What you sell, where it comes from, what makes it yours."
              className="min-h-28"
            />
            <div className="num text-right text-xs text-muted-foreground">
              {description.length} / {DESCRIPTION_LIMIT}
            </div>
          </div>
        </FormRow>

        <FormRow
          title="What you sell"
          description="Top-level categories. The concierge won't stray outside them."
          aside={`${sells.length} selected`}
        >
          <div key={`s${version}`} className="flex flex-wrap gap-2">
            {draft.sellOptions.map((o) => (
              <Chip
                key={o}
                selected={sells.includes(o)}
                onClick={() => setSells(toggle(sells, o))}
              >
                {o}
              </Chip>
            ))}
          </div>
        </FormRow>

        <FormRow
          title="Audience"
          description="Who buys from you, in a sentence or two."
        >
          <div key={`a${version}`}>
            <Textarea
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Age range, what they care about, what they already know."
              className="min-h-20"
            />
          </div>
        </FormRow>

        <FormRow
          title="Price positioning"
          description="Helps the concierge judge what “affordable” or “a treat” means here."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              size="md"
              value={price}
              onChange={setPrice}
              options={[
                { value: "budget", label: "Budget" },
                { value: "mid", label: "Mid" },
                { value: "premium", label: "Premium" },
              ]}
            />
            <Input
              key={`p${version}`}
              value={priceNote}
              onChange={(e) => setPriceNote(e.target.value)}
              placeholder="Typical range, e.g. $24–$48"
              className="max-w-56"
              aria-label="Typical price range"
            />
          </div>
        </FormRow>

        <FormRow
          title="Brand voice"
          description="Pick up to three. You can fine-tune wording in the Concierge step."
          aside={
            <span
              className={
                voice.length >= MAX_VOICE ? "text-foreground" : undefined
              }
            >
              {voice.length} of {MAX_VOICE}
            </span>
          }
        >
          <div key={`v${version}`} className="flex flex-wrap gap-2">
            {VOICE_OPTIONS.map((o) => {
              const on = voice.includes(o);
              const blocked = !on && voice.length >= MAX_VOICE;
              return (
                <Chip
                  key={o}
                  selected={on}
                  onClick={() => !blocked && setVoice(toggle(voice, o))}
                  className={
                    blocked
                      ? "cursor-not-allowed opacity-50 hover:bg-background"
                      : undefined
                  }
                >
                  {o}
                </Chip>
              );
            })}
          </div>
        </FormRow>

        <FormRow
          title="Regions served"
          description="Where you ship. Shoppers elsewhere are told up front instead of being shown picks they can't buy."
        >
          <div key={`r${version}`} className="flex flex-wrap gap-2">
            {REGION_OPTIONS.map((o) => (
              <Chip
                key={o}
                selected={regions.includes(o)}
                onClick={() => setRegions(toggle(regions, o))}
              >
                {o}
              </Chip>
            ))}
          </div>
        </FormRow>
      </Panel>
    </div>
  );
}
