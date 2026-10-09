"use client";

import { useRef, useState, type FormEvent } from "react";
import { CircleCheck, CircleDashed, Eye, EyeOff, Radio, X } from "lucide-react";
import { Tab, TabList, Tabs } from "@/components/console/form";
import { Badge } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmt } from "@/lib/format";
import { NOW } from "@/lib/mock/random";
import { SCRIPT_SRC, type AllowedDomain } from "@/lib/mock/setup";
import { AdornedInput, CopyButton, Notice, Spinner } from "./atoms";
import { CodeBlock, type CodeLanguage } from "./code";

/* Snippet ------------------------------------------------------------------ */

type Platform = "html" | "shopify" | "next" | "gtm";

const PLATFORMS: {
  id: Platform;
  label: string;
  file: string;
  language: CodeLanguage;
  hint: string;
  code: (key: string) => string;
}[] = [
  {
    id: "html",
    label: "HTML",
    file: "index.html",
    language: "html",
    hint: "Paste before the closing </body> tag on every page, or once in a shared footer template.",
    code: (key) => `<script
  src="${SCRIPT_SRC}"
  data-slice-key="${key}"
  async
></script>`,
  },
  {
    id: "shopify",
    label: "Shopify theme",
    file: "layout/theme.liquid",
    language: "liquid",
    hint: "Online Store → Themes → Edit code → layout/theme.liquid, just before </body>. The page and product attributes give the concierge product-page context.",
    code: (key) => `{% comment %} Slice concierge {% endcomment %}
<script
  src="${SCRIPT_SRC}"
  data-slice-key="${key}"
  data-slice-page="{{ template.name }}"
  data-slice-product="{{ product.id }}"
  async
></script>`,
  },
  {
    id: "next",
    label: "Next.js",
    file: "app/layout.tsx",
    language: "jsx",
    hint: "Add to your root layout. next/script loads it after hydration, so it never blocks rendering.",
    code: (key) => `import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="${SCRIPT_SRC}"
          data-slice-key="${key}"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}`,
  },
  {
    id: "gtm",
    label: "Google Tag Manager",
    file: "Custom HTML tag",
    language: "html",
    hint: "Tags → New → Custom HTML. Trigger on All Pages, then submit and publish the container.",
    code: (key) => `<!-- Trigger: All Pages -->
<script>
  (function (d) {
    var s = d.createElement("script");
    s.src = "${SCRIPT_SRC}";
    s.async = true;
    s.dataset.sliceKey = "${key}";
    d.body.appendChild(s);
  })(document);
</script>`,
  },
];

export function SnippetPanel({ publicKey }: { publicKey: string }) {
  const [platform, setPlatform] = useState<Platform>("html");
  const p = PLATFORMS.find((x) => x.id === platform)!;
  const code = p.code(publicKey);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Snippet</CardTitle>
        <CardDescription>Choose where your storefront runs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          value={platform}
          onValueChange={(v) => setPlatform(v as Platform)}
        >
          <TabList>
            {PLATFORMS.map((x) => (
              <Tab key={x.id} value={x.id}>
                {x.label}
              </Tab>
            ))}
          </TabList>
        </Tabs>
        <p className="text-sm text-muted-foreground">{p.hint}</p>
        <CodeBlock
          key={platform}
          code={code}
          language={p.language}
          title={p.file}
          actions={<CopyButton value={code} label="Copy snippet" />}
        />
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          11.8 kB gzipped. Loads async and waits for the browser to go idle
          before fetching the concierge.
        </p>
      </CardFooter>
    </Card>
  );
}

/* Allowed domains ---------------------------------------------------------- */

const HOST = /^(\*\.)?(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function AllowedDomainsPanel({ initial }: { initial: AllowedDomain[] }) {
  const [domains, setDomains] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(e: FormEvent) {
    e.preventDefault();
    const host = draft
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    if (!host) return;
    if (!HOST.test(host))
      return setError("Use a hostname like shop.example.com or *.example.com");
    if (domains.some((d) => d.host === host))
      return setError("Already on the list");
    setDomains([...domains, { host, status: "pending" }]);
    setDraft("");
    setError(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allowed domains</CardTitle>
        <CardDescription>
          The widget only loads on these origins.
        </CardDescription>
        <CardAction>
          <Badge tone="outline" className="num">
            {domains.length}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-lg border">
          {domains.map((d) => (
            <li key={d.host} className="flex h-12 items-center gap-2 pr-2 pl-3">
              <span className="min-w-0 flex-1 truncate text-sm">{d.host}</span>
              {d.primary && <Badge tone="outline">Primary</Badge>}
              {d.status === "verified" ? (
                <Badge tone="ok">Verified</Badge>
              ) : (
                <Badge tone="warn">Awaiting first ping</Badge>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${d.host}`}
                disabled={d.primary}
                onClick={() =>
                  setDomains(domains.filter((x) => x.host !== d.host))
                }
                className={d.primary ? "invisible" : undefined}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="space-y-2">
          <div className="flex gap-2">
            <AdornedInput
              prefix="https://"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              placeholder="staging.yourstore.com"
              aria-label="Add domain"
              aria-invalid={!!error}
              spellCheck={false}
            />
            <Button type="submit" variant="outline" disabled={!draft.trim()}>
              Add domain
            </Button>
          </div>
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Use *. for subdomains. localhost always works with test keys.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/* Verify ------------------------------------------------------------------- */

export interface LastSeen {
  ago: string;
  host: string;
  version: string;
  page: string;
}

export function VerifyPanel({
  domain,
  lastSeen,
  onVerified,
}: {
  domain: string;
  /** Live widgets: the most recent ping. */
  lastSeen?: LastSeen;
  onVerified?: () => void;
}) {
  const [state, setState] = useState<"idle" | "listening" | "detected">(
    lastSeen ? "detected" : "idle",
  );
  const [fresh, setFresh] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function listen() {
    setState("listening");
    if (timer.current) clearTimeout(timer.current);
    // Mock: the real check subscribes to the widget's first-ping event in Convex.
    timer.current = setTimeout(() => {
      setState("detected");
      setFresh(true);
      onVerified?.();
    }, 2500);
  }

  const detectedAt = fmt.clock(new Date(NOW + 128_000).toISOString());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Installation status</CardTitle>
      </CardHeader>
      <CardContent>
        {state === "idle" && (
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CircleDashed className="size-4 text-muted-foreground" />
              Not detected yet
            </div>
            <p className="text-sm text-muted-foreground">
              Add the snippet, then open {domain} in another tab. We&apos;ll
              catch the first page load.
            </p>
            <Button onClick={listen}>
              <Radio data-icon="inline-start" /> Verify installation
            </Button>
          </div>
        )}

        {state === "listening" && (
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Spinner className="text-muted-foreground" />
              Listening for the first ping…
            </div>
            <p className="text-sm text-muted-foreground">
              Load any page on {domain}. This usually takes a few seconds.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (timer.current) clearTimeout(timer.current);
                setState(lastSeen ? "detected" : "idle");
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {state === "detected" && (
          <div className="space-y-3">
            <Notice tone="ok" icon={<CircleCheck />}>
              <div className="font-medium">
                {fresh || !lastSeen ? (
                  <>
                    Detected on {domain} at{" "}
                    <span className="num">{detectedAt}</span>
                  </>
                ) : (
                  <>
                    Last seen {lastSeen.ago} on {lastSeen.host}
                  </>
                )}
              </div>
              <div className="truncate text-xs">
                slice.js {lastSeen?.version ?? "v1.4.2"} ·{" "}
                {lastSeen?.page ?? "/"}
              </div>
            </Notice>
            <Button variant="outline" size="sm" onClick={listen}>
              Check again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* Public key --------------------------------------------------------------- */

export function PublicKeyPanel({ publicKey }: { publicKey: string }) {
  const [shown, setShown] = useState(false);
  const [prefix, rest] = [publicKey.slice(0, 12), publicKey.slice(12)];
  const masked = `${prefix}${"•".repeat(Math.max(0, rest.length - 2))}${rest.slice(-2)}`;
  const live = publicKey.startsWith("pk_live");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public key</CardTitle>
        <CardAction>
          <Badge tone={live ? "ok" : "neutral"}>{live ? "Live" : "Test"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 min-w-0 flex-1 items-center truncate rounded-lg border bg-muted/50 px-2.5 text-sm">
            {shown ? publicKey : masked}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShown(!shown)}
            aria-label={shown ? "Hide key" : "Reveal key"}
          >
            {shown ? <EyeOff /> : <Eye />}
          </Button>
          <CopyButton value={publicKey} size="default" />
        </div>
        <p className="text-sm text-muted-foreground">
          Safe to ship in your page. It can only open conversations from allowed
          domains and can&apos;t read or change your catalog.
        </p>
      </CardContent>
    </Card>
  );
}

/* Setup step --------------------------------------------------------------- */

export function InstallStep({
  publicKey,
  domain,
  domains,
  lastSeen,
  onVerified,
}: {
  publicKey: string;
  domain: string;
  domains: AllowedDomain[];
  lastSeen?: LastSeen;
  onVerified: () => void;
}) {
  return (
    <div className="space-y-6">
      <SnippetPanel publicKey={publicKey} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <VerifyPanel
          domain={domain}
          lastSeen={lastSeen}
          onVerified={onVerified}
        />
        <AllowedDomainsPanel initial={domains} />
      </div>
    </div>
  );
}
