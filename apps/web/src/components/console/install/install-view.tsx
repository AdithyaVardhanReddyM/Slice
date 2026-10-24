"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { ArrowUpRight, ChevronDown, X } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { isLocalHost, normalizeHost } from "@slice/backend/convex/widgetHosts";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { PillTabs, Tile, TileHeader } from "@/components/console/home/ui";
import { ConsolePage } from "@/components/console/shell-ui";
import { WidgetGlyph } from "@/components/console/sidebar";
import { AdornedInput, CopyButton } from "@/components/console/setup/atoms";
import { CodeBlock, type CodeLanguage } from "@/components/console/setup/code";
import type { Widget } from "@/lib/mock/types";

type Status = FunctionReturnType<typeof api.widgetInstall.status>;
type Ping = NonNullable<Status>["pings"][number];

/* Time and size ------------------------------------------------------------ */

function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function since(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

/** The size of the script the snippet loads, measured from the served file. */
function useScriptSize(src: string) {
  const [size, setSize] = useState<{ raw: number; gzip: number } | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) return;
      const bytes = await res.arrayBuffer();
      const gzip = await new Response(
        new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
      ).arrayBuffer();
      if (live) setSize({ raw: bytes.byteLength, gzip: gzip.byteLength });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [src]);
  return size;
}

/* Snippet ------------------------------------------------------------------ */

type Platform = "html" | "shopify" | "next" | "gtm";

const PLATFORMS: {
  id: Platform;
  label: string;
  file: string;
  language: CodeLanguage;
  hint: string;
  code: (src: string, key: string) => string;
}[] = [
  {
    id: "html",
    label: "HTML",
    file: "Every page",
    language: "html",
    hint: "Paste before the closing </body> tag, or once in a shared footer.",
    code: (src, key) =>
      `<script src="${src}" data-slice-key="${key}" async></script>`,
  },
  {
    id: "shopify",
    label: "Shopify",
    file: "layout/theme.liquid",
    language: "liquid",
    hint: "Online Store, Themes, Edit code, then layout/theme.liquid just before </body>. Product details come from your theme's structured data, so nothing else is needed.",
    code: (src, key) =>
      `{% comment %} Slice concierge {% endcomment %}\n<script src="${src}" data-slice-key="${key}" async></script>`,
  },
  {
    id: "next",
    label: "Next.js",
    file: "app/layout.tsx",
    language: "jsx",
    hint: "Add to your root layout. next/script loads it after the page is interactive.",
    code: (src, key) => `import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script src="${src}" data-slice-key="${key}" strategy="afterInteractive" />
      </body>
    </html>
  );
}`,
  },
  {
    id: "gtm",
    label: "Tag Manager",
    file: "Custom HTML tag",
    language: "html",
    hint: "Tags, New, Custom HTML, triggered on All Pages. Then submit and publish the container.",
    code: (src, key) => `<script>
  (function (d) {
    var s = d.createElement("script");
    s.src = "${src}";
    s.async = true;
    s.dataset.sliceKey = "${key}";
    d.body.appendChild(s);
  })(document);
</script>`,
  },
];

const CART_EVENT = `// After a product is added to the cart:
window.dispatchEvent(
  new CustomEvent("slice:track", { detail: { type: "cart", id: productId } })
);`;

function SnippetCard({
  src,
  storeKey,
  className,
}: {
  src: string;
  storeKey: string;
  className?: string;
}) {
  const [platform, setPlatform] = useState<Platform>("html");
  const [cart, setCart] = useState(false);
  const p = PLATFORMS.find((x) => x.id === platform)!;
  const code = p.code(src, storeKey);
  return (
    <Tile delay={120} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Add the snippet"
        hint="One line on every page of your store"
      />
      <div className="space-y-4 p-6 pt-4">
        <PillTabs
          label="Platform"
          size="sm"
          value={platform}
          onChange={setPlatform}
          options={PLATFORMS.map((x) => ({ value: x.id, label: x.label }))}
        />
        <p className="text-sm text-muted-foreground">{p.hint}</p>
        <CodeBlock
          key={platform}
          code={code}
          language={p.language}
          title={p.file}
          actions={<CopyButton value={code} label="Copy" />}
        />
        <div className="border-t border-black/[0.05] pt-4">
          <button
            type="button"
            onClick={() => setCart((c) => !c)}
            aria-expanded={cart}
            className="flex items-center gap-1 text-sm font-medium text-neutral-700 hover:text-neutral-950"
          >
            Optional: tell the concierge about cart adds
            <ChevronDown
              className={cn("size-4 transition-transform", cart && "rotate-180")}
            />
          </button>
          {cart && (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                Cart adds count toward your Overview and help the concierge
                learn the shopper&apos;s taste. Use your own product ID, the
                same one as in your catalog.
              </p>
              <CodeBlock
                code={CART_EVENT}
                language="jsx"
                title="Your add-to-cart handler"
                actions={<CopyButton value={CART_EVENT} label="Copy" />}
              />
            </div>
          )}
        </div>
      </div>
    </Tile>
  );
}

/* Where it's running ------------------------------------------------------- */

function PingRow({
  ping,
  now,
  onAllow,
}: {
  ping: Ping;
  now: number;
  onAllow?: () => void;
}) {
  const local = isLocalHost(ping.host);
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          ping.allowed ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-neutral-950">
          {ping.host}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {since(ping.lastSeenAt, now)} on {ping.page}
        </span>
      </span>
      {local ? (
        <span className="text-xs text-muted-foreground">Local testing</span>
      ) : ping.allowed ? (
        <span className="text-xs text-emerald-700">Allowed</span>
      ) : (
        <Button size="sm" variant="outline" onClick={onAllow}>
          Allow
        </Button>
      )}
    </li>
  );
}

function StatusCard({
  status,
  onAllow,
  className,
}: {
  status: Status | undefined;
  onAllow: (host: string) => void;
  className?: string;
}) {
  const now = useNow();
  const pings = status?.pings ?? [];
  const blocked = pings.filter((p) => !p.allowed);
  return (
    <Tile delay={60} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Where it's running"
        hint="Every site slice.js has loaded on, updated live"
      />
      {status === undefined ? (
        <div className="space-y-3 p-6">
          <div className="h-10 animate-pulse rounded-xl bg-neutral-100" />
          <div className="h-10 animate-pulse rounded-xl bg-neutral-100" />
        </div>
      ) : pings.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center p-6">
          <p className="text-[15px] font-medium text-neutral-950">
            Not installed yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the snippet and open any page on your store. This updates on
            its own the moment it loads.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-black/[0.05] px-6 pt-2">
            {pings.slice(0, 6).map((p) => (
              <PingRow
                key={p.host}
                ping={p}
                now={now}
                onAllow={() => onAllow(p.host)}
              />
            ))}
          </ul>
          {blocked.length > 0 && (
            <p className="mx-6 mb-6 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              The concierge stays hidden on sites that aren&apos;t allowed.
              Allow them if they&apos;re yours.
            </p>
          )}
        </>
      )}
    </Tile>
  );
}

/* Allowed domains ---------------------------------------------------------- */

function DomainsCard({
  storeKey,
  status,
  className,
}: {
  storeKey: string;
  status: Status | undefined;
  className?: string;
}) {
  const add = useMutation(api.widgetInstall.addDomain);
  const remove = useMutation(api.widgetInstall.removeDomain);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const domains = status?.domains ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const host = normalizeHost(draft);
    if (!host) {
      setError("Use a hostname like shop.example.com or *.example.com");
      return;
    }
    try {
      await add({ key: storeKey, host });
      setDraft("");
      setError(null);
    } catch (err) {
      setError(
        err instanceof ConvexError
          ? String(err.data)
          : "Couldn't add that domain",
      );
    }
  }

  return (
    <Tile delay={180} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Allowed domains"
        hint={
          domains.length
            ? "The concierge only opens on these sites. localhost always works for testing."
            : "Right now the concierge opens on any site. Add your store's domain to keep it to your sites."
        }
      />
      <div className="space-y-4 p-6 pt-4">
        {domains.length > 0 && (
          <ul className="divide-y divide-black/[0.05] rounded-2xl ring-1 ring-black/[0.06]">
            {domains.map((host) => (
              <li key={host} className="flex h-11 items-center gap-2 pr-2 pl-4">
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">
                  {host}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${host}`}
                  onClick={() => remove({ key: storeKey, host })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-2">
            <AdornedInput
              prefix="https://"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              placeholder="yourstore.com"
              aria-label="Add a domain"
              aria-invalid={!!error}
              spellCheck={false}
            />
            <Button type="submit" variant="outline" disabled={!draft.trim()}>
              Add
            </Button>
          </div>
          <p
            className={cn(
              "text-xs",
              error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {error ?? "Use *.yourstore.com to include every subdomain."}
          </p>
        </form>
      </div>
    </Tile>
  );
}

/* Details ------------------------------------------------------------------ */

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function DetailsCard({
  origin,
  src,
  className,
}: {
  origin: string;
  src: string;
  className?: string;
}) {
  const size = useScriptSize(src);
  const csp = `script-src ${origin};\nconnect-src ${origin};\nframe-src ${origin};`;
  return (
    <Tile delay={240} className={cn("flex flex-col", className)}>
      <TileHeader title="About the script" />
      <dl className="space-y-3 p-6 pt-4">
        <Detail label="Size">
          {size ? (
            <>
              <span className="num">{kb(size.gzip)}</span> gzipped{" "}
              <span className="text-muted-foreground">
                (<span className="num">{kb(size.raw)}</span>)
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Measuring…</span>
          )}
        </Detail>
        <Detail label="Loading">
          Async, so it never blocks your page. The concierge itself only loads
          when a shopper opens it.
        </Detail>
        <Detail label="Storage">
          No cookies. A profile ID in localStorage and the chat in
          sessionStorage, on your domain.
        </Detail>
      </dl>
      <div className="mt-auto space-y-3 border-t border-black/[0.05] p-6">
        <p className="text-sm text-muted-foreground">
          If your site sends a Content Security Policy, allow Slice:
        </p>
        <CodeBlock
          code={csp}
          language="text"
          actions={<CopyButton value={csp} label="Copy" />}
        />
      </div>
    </Tile>
  );
}

/* Page --------------------------------------------------------------------- */

/** The Install page: the snippet, where it's running, and which sites may run it. */
export function InstallView({
  widget,
  storeKey,
  origin,
}: {
  widget: Pick<Widget, "name" | "domain" | "accent" | "logo">;
  storeKey: string;
  origin: string;
}) {
  const status = useQuery(api.widgetInstall.status, { key: storeKey });
  const add = useMutation(api.widgetInstall.addDomain);
  const now = useNow();
  const src = `${origin}/slice.js`;
  const latest = status?.pings.find((p) => p.allowed);

  return (
    <ConsolePage>
      <header className="home-rise flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <WidgetGlyph
              name={widget.name}
              accent={widget.accent}
              logo={widget.logo}
            />
            {status === undefined ? (
              <span>Checking…</span>
            ) : latest ? (
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                Live, last seen {since(latest.lastSeenAt, now)} on{" "}
                {latest.host}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-neutral-300" />
                Not installed yet
              </span>
            )}
          </div>
          <h1 className="mt-3 text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-neutral-950 sm:text-[44px]">
            Install
          </h1>
          <p className="mt-2.5 text-[15px] text-muted-foreground">
            Add one line to {widget.domain} and the concierge appears.
          </p>
        </div>
        <Link
          href={`/embed/concierge?key=${encodeURIComponent(storeKey)}`}
          target="_blank"
          className={buttonVariants({ variant: "outline" })}
        >
          Preview the concierge <ArrowUpRight />
        </Link>
      </header>

      <div className="mt-10 grid gap-5 lg:grid-cols-12">
        <SnippetCard
          src={src}
          storeKey={storeKey}
          className="lg:col-span-7"
        />
        <StatusCard
          status={status}
          onAllow={(host) => add({ key: storeKey, host })}
          className="lg:col-span-5"
        />
        <DomainsCard
          storeKey={storeKey}
          status={status}
          className="lg:col-span-7"
        />
        <DetailsCard origin={origin} src={src} className="lg:col-span-5" />
      </div>
    </ConsolePage>
  );
}

/** The setup flow's last step: the snippet and live detection, nothing else. */
export function InstallStep({
  storeKey,
  origin,
  onVerified,
}: {
  storeKey: string;
  origin: string;
  onVerified: () => void;
}) {
  const status = useQuery(api.widgetInstall.status, { key: storeKey });
  const add = useMutation(api.widgetInstall.addDomain);
  const live = !!status?.pings.some((p) => p.allowed);
  useEffect(() => {
    if (live) onVerified();
  }, [live, onVerified]);
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <SnippetCard
        src={`${origin}/slice.js`}
        storeKey={storeKey}
        className="lg:col-span-7"
      />
      <StatusCard
        status={status}
        onAllow={(host) => add({ key: storeKey, host })}
        className="lg:col-span-5"
      />
    </div>
  );
}
