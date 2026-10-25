"use client";

import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  FileSpreadsheet,
  Mountain,
  Shapes,
  Shirt,
  Sofa,
  SprayCan,
  Wine,
} from "lucide-react";
import { Chip, Field, Input, Select } from "@/components/console/form";
import { Initial } from "@/components/console/home/ui";
import { PageHeader } from "@/components/console/primitives";
import { restoreWidget } from "@/app/(app)/dashboard/concierge/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { nameFromUrl } from "@/lib/pages/urls";
import {
  CURRENCIES,
  MARKETS,
  SETUP_STEPS,
  VERTICALS,
  type VerticalId,
} from "@/lib/mock/setup";
import type { SetupStep } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import {
  AdornedInput,
  ChoiceCard,
  ChoiceCardGroup,
  FieldGroup,
  Notice,
  Spinner,
} from "../setup/atoms";
import { ShopifyLogo, WooLogo } from "../setup/platform-logos";

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

type Platform = "shopify" | "woocommerce" | "other";

const PLATFORMS: {
  id: Platform;
  title: string;
  description: string;
  icon: ReactNode;
  next: string;
}[] = [
  {
    id: "shopify",
    title: "Shopify",
    description: "Sign in and approve",
    icon: <ShopifyLogo className="size-4" />,
    next: "In the Catalog step you approve read-only access on Shopify, and your products come over in about a minute.",
  },
  {
    id: "woocommerce",
    title: "WooCommerce",
    description: "Approve a read-only key",
    icon: <WooLogo className="size-5" />,
    next: "In the Catalog step you approve a read-only key in WooCommerce (or paste one), and your products come over in about a minute.",
  },
  {
    id: "other",
    title: "Something else",
    description: "A file, feed or API",
    icon: <FileSpreadsheet className="size-4" />,
    next: "In the Catalog step you upload a CSV, point Slice at a Google Merchant feed, or send products from your backend.",
  },
];

const CATALOG_NEXT: Record<Platform, string> = {
  shopify: "Approve read-only access in Shopify. Products sync on their own.",
  woocommerce: "Approve a read-only key in WooCommerce, or paste one.",
  other: "Upload a file, or point Slice at a feed or your API.",
};

const NEXT_STEPS: Record<SetupStep, string> = {
  store: "Slice drafts a profile from your site. You edit it.",
  catalog: "Connect Shopify, WooCommerce, a file or a feed.",
  taste: "Choose what the questionnaire asks: music, film, travel and more.",
  concierge: "Name it, set its voice and the rules it keeps.",
  appearance: "Match the launcher and panel to your brand.",
  install: "Add one script tag. Slice confirms when it's live.",
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

/** "acme-goods.com" → "Acme Goods": a starting point the merchant can overwrite. */
function guessName(host: string) {
  return nameFromUrl(host)
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function NewWidgetFlow() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [urlBlurred, setUrlBlurred] = useState(false);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [vertical, setVertical] = useState<VerticalId | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [market, setMarket] = useState("US");
  const [currency, setCurrency] = useState("USD");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const host = normalizeHost(url);
  const hostValid = HOST.test(host);
  // The name follows the website until the merchant types their own.
  const shownName = nameTouched ? name : hostValid ? guessName(host) : "";
  const missing = [
    !hostValid && "the website",
    shownName.trim().length < 2 && "a name",
    !vertical && "what it sells",
    !platform && "where your products live",
  ].filter(Boolean) as string[];
  const canSubmit = missing.length === 0 && !submitting;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    // Mock: this will create the widget in Convex (name, host, vertical,
    // market, currency, platform) and route to the new widget's setup, which
    // opens on the Catalog step with the platform picked here.
    const source =
      platform === "shopify" || platform === "woocommerce" ? `?source=${platform}` : "";
    restoreWidget("ostro").then(() =>
      setTimeout(() => router.push(`/dashboard/concierge/ostro/setup${source}`), 400),
    );
  }

  return (
    <>
      <PageHeader
        title="New widget"
        description="A widget puts a taste concierge on one storefront. Tell Slice about the store and where its products live; setup takes about ten minutes after this."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={onSubmit} noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Your store</CardTitle>
              <CardDescription>
                You can change all of this later in Settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Website"
                  hint={
                    urlBlurred && url && !hostValid ? (
                      <span className="text-destructive">
                        Enter a domain like ostro.wine
                      </span>
                    ) : (
                      "Where the concierge runs. You can add more domains later."
                    )
                  }
                >
                  <AdornedInput
                    autoFocus
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
                <Field
                  label="Store name"
                  hint="Shoppers see it at the top of the concierge."
                >
                  <Input
                    value={shownName}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameTouched(true);
                    }}
                    placeholder="Ostro Wine Club"
                    maxLength={48}
                  />
                </Field>
              </div>

              <FieldGroup
                label="What it sells"
                hint="Sets sensible defaults for the taste questions and catalog fields. Nothing is locked in."
              >
                <div
                  role="radiogroup"
                  aria-label="What the store sells"
                  className="flex flex-wrap gap-2"
                >
                  {VERTICALS.map((v) => {
                    const Icon = verticalIcons[v.id];
                    return (
                      <Chip
                        key={v.id}
                        selected={vertical === v.id}
                        onClick={() => setVertical(v.id)}
                        className="h-9"
                      >
                        <Icon className="size-4 opacity-70" /> {v.label}
                      </Chip>
                    );
                  })}
                </div>
              </FieldGroup>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <Field
                  label="Main market"
                  hint="Taste questions adapt to each shopper's city; this is the fallback."
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

            <CardContent className="space-y-4 border-t pt-6">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Where your products live</h3>
                <p className="text-sm text-muted-foreground">
                  The concierge only recommends what&apos;s in your catalog, so
                  Slice keeps a copy in sync. It never changes your store.
                </p>
              </div>
              <ChoiceCardGroup
                aria-label="Where your products live"
                value={platform}
                onValueChange={setPlatform}
                className="grid-cols-1 sm:grid-cols-3"
              >
                {PLATFORMS.map((p) => (
                  <ChoiceCard
                    key={p.id}
                    value={p.id}
                    icon={p.icon}
                    title={p.title}
                    description={p.description}
                  />
                ))}
              </ChoiceCardGroup>
              {platform && (
                <Notice>{PLATFORMS.find((p) => p.id === platform)?.next}</Notice>
              )}
            </CardContent>

            <CardFooter className="justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                {missing.length
                  ? `Add ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")} to continue.`
                  : "Nothing shows on your site until you add the script in the last step."}
              </p>
              <Button type="submit" size="lg" disabled={!canSubmit}>
                {submitting ? (
                  <>
                    <Spinner /> Creating
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

        <div className="space-y-6 lg:sticky lg:top-20">
          <WidgetPreview name={shownName} host={hostValid ? host : ""} platform={platform} />
          <NextSteps platform={platform} />
        </div>
      </div>
    </>
  );
}

/** The widget card art with the store's name in the concierge header, as it's typed. */
function WidgetPreview({
  name,
  host,
  platform,
}: {
  name: string;
  host: string;
  platform: Platform | null;
}) {
  const source = PLATFORMS.find((p) => p.id === platform);
  return (
    <Card className="overflow-hidden pt-0">
      <div className="@container relative aspect-[477/305] overflow-hidden border-b bg-muted">
        <Image
          src="/illustrations/widget-card.svg"
          alt=""
          fill
          priority
          sizes="352px"
          className="object-cover"
        />
        {/* Chat header: x 170–306, y 19–41 of the 477×305 art (as on the widget cards). */}
        <span
          className="absolute flex items-center gap-[1.6cqw] bg-white text-[2.5cqw] leading-none font-medium text-neutral-900"
          style={{ left: "35.65%", width: "28.52%", top: "6.22%", height: "7.21%" }}
        >
          <Initial
            name={name || "Y"}
            color="#ea580c"
            className="size-[3.8cqw] rounded-[0.8cqw] text-[2cqw]"
          />
          <span className={cn("truncate", !name && "text-neutral-400")}>
            {name || "Your store"}
          </span>
        </span>
      </div>
      <CardHeader>
        <CardTitle>How shoppers see it</CardTitle>
        <CardDescription>
          A launcher on your site opens the concierge: a few taste questions,
          then picks from your own catalog.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y rounded-lg border text-sm">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-muted-foreground">Runs on</dt>
            <dd className={cn("truncate font-medium", !host && "font-normal text-muted-foreground")}>
              {host || "Set from the website"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-muted-foreground">Products from</dt>
            <dd className={cn("flex items-center gap-1.5 font-medium", !source && "font-normal text-muted-foreground")}>
              {source ? (
                <>
                  <span className="flex size-4 items-center justify-center [&_svg]:size-4">
                    {source.icon}
                  </span>
                  {source.id === "other" ? "File, feed or API" : source.title}
                </>
              ) : (
                "Choose a platform"
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function NextSteps({ platform }: { platform: Platform | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What happens next</CardTitle>
        <CardDescription>
          Six short steps. Progress saves as you go.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol>
          {SETUP_STEPS.map((s, i) => (
            <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < SETUP_STEPS.length - 1 && (
                <span className="absolute top-7 bottom-1 left-3 w-px bg-border" aria-hidden />
              )}
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.estimate}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {s.id === "catalog" && platform ? CATALOG_NEXT[platform] : NEXT_STEPS[s.id]}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
