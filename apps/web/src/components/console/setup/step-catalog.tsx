"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Braces,
  Check,
  Download,
  ExternalLink,
  FileSpreadsheet,
  RefreshCw,
  Rss,
  Upload,
} from "lucide-react";
import {
  Field,
  Input,
  Segmented,
  Select,
  Switch,
} from "@/components/console/form";
import { Badge, Panel } from "@/components/console/primitives";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt } from "@/lib/format";
import {
  SLICE_FIELDS,
  type CatalogPreview,
  type SampleProduct,
  type SliceField,
} from "@/lib/mock/setup";
import type { CatalogSourceKind } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import {
  AdornedInput,
  ChoiceCard,
  ChoiceCardGroup,
  CopyButton,
  Notice,
  Spinner,
} from "./atoms";
import { CodeBlock } from "./code";
import { ShopifyLogo, WooLogo } from "./platform-logos";
import {
  useStoreConnection,
  type StoreConnection,
  type StorePlatform,
} from "./use-store-connection";

const SOURCES: {
  id: CatalogSourceKind;
  title: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    id: "shopify",
    title: "Shopify",
    description: "Approve read-only access",
    icon: <ShopifyLogo className="size-4" />,
  },
  {
    id: "woocommerce",
    title: "WooCommerce",
    description: "Read-only REST key",
    icon: <WooLogo className="size-5" />,
  },
  {
    id: "upload",
    title: "Upload a file",
    description: "CSV or JSON, up to 50 MB",
    icon: <Upload className="size-4" />,
  },
  {
    id: "feed",
    title: "Product feed",
    description: "Google Merchant XML",
    icon: <Rss className="size-4" />,
  },
  {
    id: "api",
    title: "API push",
    description: "Send products from your backend",
    icon: <Braces className="size-4" />,
  },
];

const PLATFORM_LABEL: Record<StorePlatform, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
};

export function CatalogStep({
  widgetId,
  widgetKey,
  domain,
  preview,
  initialSource,
  onConnected,
}: {
  widgetId: string;
  /** The account's widget key, which store connections are saved under. */
  widgetKey: string | undefined;
  domain: string;
  preview: CatalogPreview;
  /** Already-connected source, if any. */
  initialSource: CatalogSourceKind | null;
  onConnected: (connected: boolean) => void;
}) {
  const store = useStoreConnection(widgetKey);
  const live = store.connection;
  const [picked, setPicked] = useState<CatalogSourceKind | null>(null);
  // A store that's already connected opens on its own panel.
  const source = picked ?? live?.platform ?? initialSource;
  const [ready, setReady] = useState(initialSource === preview.source);
  const [parsing, setParsing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A synced store completes the step like an uploaded file does.
  const synced = live?.status === "connected" && (live.products ?? 0) > 0;
  useEffect(() => {
    if (synced) onConnected(true);
  }, [synced, onConnected]);

  function choose(next: CatalogSourceKind) {
    setPicked(next);
    store.clearError();
    // Mock: picking Upload stands in for dropping the merchant's file.
    if (next === "upload" && preview.source === "upload" && !ready) {
      setParsing(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setParsing(false);
        setReady(true);
        onConnected(true);
      }, 1100);
    }
  }

  const showPreview = source === preview.source && ready;

  return (
    <div className="space-y-6">
      <ChoiceCardGroup
        aria-label="Catalog source"
        value={source}
        onValueChange={choose}
        className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5"
      >
        {SOURCES.map((s) => (
          <ChoiceCard
            key={s.id}
            value={s.id}
            icon={s.icon}
            title={s.title}
            description={
              live?.platform === s.id && live.status === "connected"
                ? "Connected"
                : s.description
            }
          />
        ))}
      </ChoiceCardGroup>

      {source === null && (
        <Notice icon={<ArrowUp />} className="border-dashed bg-transparent">
          Pick where your products live. You can switch sources later without
          losing settings.
        </Notice>
      )}

      {source === "upload" && (
        <UploadPanel preview={preview} parsing={parsing} ready={showPreview} />
      )}
      {source === "shopify" && <ShopifyPanel domain={domain} store={store} />}
      {source === "woocommerce" && <WooPanel domain={domain} store={store} />}
      {source === "feed" && (
        <FeedPanel
          domain={domain}
          connected={preview.source === "feed" ? preview : null}
        />
      )}
      {source === "api" && <ApiPanel widgetId={widgetId} />}

      {showPreview && <ParsedCatalog key={preview.label} preview={preview} />}
    </div>
  );
}

/* Sources ------------------------------------------------------------------ */

function UploadPanel({
  preview,
  parsing,
  ready,
}: {
  preview: CatalogPreview;
  parsing: boolean;
  ready: boolean;
}) {
  const isJson = preview.label.endsWith(".json");
  return (
    <Panel className="flex flex-wrap items-center gap-4 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {isJson ? (
          <Braces className="size-4" />
        ) : (
          <FileSpreadsheet className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{preview.label}</span>
          {ready && <Badge tone="ok">Parsed</Badge>}
        </div>
        <div className="text-sm text-muted-foreground">
          {parsing ? (
            <span className="flex items-center gap-2">
              <Spinner /> Parsing rows and matching columns…
            </span>
          ) : (
            <span className="num">
              {fmt.int(preview.rows)} rows and {preview.columns.length} columns,
              parsed in 1.2s with no errors
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm">
          <Download data-icon="inline-start" /> Template
        </Button>
        <Button variant="outline" size="sm" disabled={parsing}>
          Replace file
        </Button>
      </div>
    </Panel>
  );
}

/* Store platforms: Shopify (through Composio) and WooCommerce (REST key). The
   agent does the work; see apps/agent/slice_catalog. */

function ShopifyPanel({
  domain,
  store,
}: {
  domain: string;
  store: StoreConnection;
}) {
  const c = store.connection?.platform === "shopify" ? store.connection : null;
  const [shop, setShop] = useState(c?.shop || domain.split(".")[0]);
  if (c && c.status !== "pending") return <ConnectedStore platform="shopify" store={store} />;
  const pending = c?.status === "pending";
  const handle = shop.trim().replace(/^https?:\/\//, "").replace(/\.myshopify\.com.*$/, "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShopifyLogo className="size-5" /> Connect Shopify
        </CardTitle>
        <CardDescription>
          Slice reads your products, variants and stock, and keeps the
          concierge in step with them. It never changes anything in your
          store.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Shop address" className="min-w-64 flex-1">
            <AdornedInput
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              suffix=".myshopify.com"
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
            />
          </Field>
          {pending ? (
            <Button variant="outline" onClick={store.reopen}>
              <Spinner /> Waiting for Shopify
            </Button>
          ) : (
            <Button
              onClick={() => store.connect("shopify", handle)}
              disabled={!handle || store.busy === "connect"}
            >
              {store.busy === "connect" ? <Spinner /> : <ExternalLink data-icon="inline-start" />}
              Connect Shopify
            </Button>
          )}
        </div>
        {pending && (
          <Notice>
            Approve Slice in the Shopify window. This page moves on by itself
            once you have.
          </Notice>
        )}
        {store.error && <Notice tone="bad">{store.error}</Notice>}
      </CardContent>
      <CardFooter>
        <AccessList
          items={[
            "Reads products and inventory only",
            "You approve it on Shopify",
            "Remove access any time",
          ]}
        />
      </CardFooter>
    </Card>
  );
}

function WooPanel({
  domain,
  store,
}: {
  domain: string;
  store: StoreConnection;
}) {
  const c = store.connection?.platform === "woocommerce" ? store.connection : null;
  const [site, setSite] = useState(c?.shop.replace(/^https?:\/\//, "") || domain);
  const [method, setMethod] = useState<"approve" | "keys">("approve");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  if (c && c.status !== "pending") return <ConnectedStore platform="woocommerce" store={store} />;
  const pending = c?.status === "pending";
  const address = site.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WooLogo className="size-6" /> Connect WooCommerce
        </CardTitle>
        <CardDescription>
          Slice reads published products, variations and stock with a
          read-only key. It never changes anything in your store.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label="Store address">
          <AdornedInput
            prefix="https://"
            value={site}
            onChange={(e) => setSite(e.target.value.replace(/^https?:\/\//, ""))}
            placeholder={domain}
            inputMode="url"
            spellCheck={false}
            disabled={pending}
          />
        </Field>

        <div className="space-y-3">
          <Segmented
            value={method}
            onChange={setMethod}
            options={[
              { value: "approve", label: "Approve in WooCommerce" },
              { value: "keys", label: "Paste a REST key" },
            ]}
          />
          {method === "approve" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <p className="max-w-md text-sm text-muted-foreground">
                Sign in to WordPress and approve read access. WooCommerce
                makes the key and sends it straight to Slice.
              </p>
              {pending ? (
                <Button variant="outline" onClick={store.reopen}>
                  <Spinner /> Waiting for WooCommerce
                </Button>
              ) : (
                <Button
                  onClick={() => store.connect("woocommerce", address)}
                  disabled={!address || store.busy === "connect"}
                >
                  {store.busy === "connect" ? <Spinner /> : <ExternalLink data-icon="inline-start" />}
                  Continue to WooCommerce
                </Button>
              )}
            </div>
          ) : (
            <form
              className="space-y-3 rounded-lg border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void store.saveKeys(address, consumerKey, consumerSecret);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Consumer key">
                  <Input
                    value={consumerKey}
                    onChange={(e) => setConsumerKey(e.target.value)}
                    placeholder="ck_"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Consumer secret">
                  <Input
                    type="password"
                    value={consumerSecret}
                    onChange={(e) => setConsumerSecret(e.target.value)}
                    placeholder="cs_"
                    autoComplete="off"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-xs text-muted-foreground">
                  Make one in WooCommerce under Settings, Advanced, REST API,
                  with Read permission. Slice stores it encrypted.
                </p>
                <Button
                  type="submit"
                  disabled={
                    !address ||
                    !consumerKey.trim() ||
                    !consumerSecret.trim() ||
                    store.busy === "keys"
                  }
                >
                  {store.busy === "keys" && <Spinner />}
                  Connect
                </Button>
              </div>
            </form>
          )}
        </div>
        {pending && method === "approve" && (
          <Notice>
            Approve Slice in the WooCommerce window. This page moves on by
            itself once you have.
          </Notice>
        )}
        {store.error && <Notice tone="bad">{store.error}</Notice>}
      </CardContent>
      <CardFooter>
        <AccessList
          items={[
            "Reads products and stock only",
            "Key stored encrypted",
            "Revoke it in WooCommerce any time",
          ]}
        />
      </CardFooter>
    </Card>
  );
}

function AccessList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-1.5">
          <Check className="size-4 text-emerald-600" /> {item}
        </li>
      ))}
    </ul>
  );
}

function syncedAgo(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A connected store: what came over in the last sync, and the controls to sync again or let go. */
function ConnectedStore({
  platform,
  store,
}: {
  platform: StorePlatform;
  store: StoreConnection;
}) {
  const c = store.connection!;
  const label = PLATFORM_LABEL[platform];
  const syncing = c.status === "syncing" || store.busy === "sync";
  const Logo = platform === "shopify" ? ShopifyLogo : WooLogo;
  const shop = platform === "shopify" ? `${c.shop}.myshopify.com` : c.shop.replace(/^https?:\/\//, "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Logo className={platform === "shopify" ? "size-5" : "size-6"} /> {label}
        </CardTitle>
        <CardDescription className="truncate">{shop}</CardDescription>
        <CardAction>
          {syncing ? (
            <Badge>
              <Spinner /> Syncing
            </Badge>
          ) : c.status === "error" ? (
            <Badge tone="bad">Needs attention</Badge>
          ) : (
            <Badge tone="ok">
              <Check /> Connected
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {syncing && c.products === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Bringing your products over from {label}. Larger
            stores take a minute or two.
          </p>
        ) : (
          <dl className="grid grid-cols-3 gap-4 rounded-lg border p-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Products</dt>
              <dd className="num mt-0.5 text-sm font-semibold">
                {c.products === null ? "None yet" : fmt.int(c.products)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Last synced</dt>
              <dd className="mt-0.5 text-sm font-semibold">
                {c.lastSyncAt ? syncedAgo(c.lastSyncAt) : "Not yet"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Left out</dt>
              <dd className="num mt-0.5 text-sm font-semibold" title="Drafts and products without a price">
                {c.skipped ? fmt.int(c.skipped) : "None"}
              </dd>
            </div>
          </dl>
        )}
        {c.error && <Notice tone="bad">{c.error}</Notice>}
        {store.error && <Notice tone="bad">{store.error}</Notice>}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Changes you make in {label} reach the concierge on the next sync.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => void store.disconnect()}
            disabled={store.busy !== null}
          >
            Disconnect
          </Button>
          <Button
            variant="outline"
            onClick={() => void store.sync()}
            disabled={syncing || store.busy !== null}
          >
            <RefreshCw data-icon="inline-start" /> Sync now
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function FeedPanel({
  domain,
  connected,
}: {
  domain: string;
  connected: CatalogPreview | null;
}) {
  const [schedule, setSchedule] = useState<"1h" | "6h" | "24h">("6h");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Product feed</CardTitle>
        <CardDescription>Google Merchant Center XML or TSV.</CardDescription>
        {connected && (
          <CardAction>
            <Badge tone="ok">
              <span className="num">{fmt.int(connected.rows)}</span> items,
              fetched {connected.syncedAgo}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <Field label="Feed URL" className="min-w-72 flex-1">
          <Input
            defaultValue={connected?.label ?? ""}
            placeholder={`https://${domain}/feeds/google.xml`}
          />
        </Field>
        <div className="space-y-2">
          <span className="block text-sm font-medium">Refresh</span>
          <Segmented
            value={schedule}
            onChange={setSchedule}
            options={[
              { value: "1h", label: "Hourly" },
              { value: "6h", label: "Every 6h" },
              { value: "24h", label: "Daily" },
            ]}
          />
        </div>
        <Button variant={connected ? "outline" : "default"}>
          {connected ? "Fetch now" : "Fetch feed"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ApiPanel({ widgetId }: { widgetId: string }) {
  const code = `curl -X POST https://api.slice.so/v1/widgets/${widgetId}/products \\
  -H "Authorization: Bearer $SLICE_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d @products.json`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Push products from your backend</CardTitle>
        <CardDescription>
          Upserts by ID. Send deltas or the full set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <CodeBlock
          code={code}
          language="bash"
          title="POST /v1/widgets/:id/products"
          actions={<CopyButton value={code} />}
        />
        <p className="text-sm text-muted-foreground">
          Use a secret key from Settings, under API keys. Never ship it to the
          browser. The public pk_ key in your embed can&apos;t write products.
        </p>
      </CardContent>
    </Card>
  );
}

/* Parsed catalog: mapping, coverage, samples -------------------------------- */

function ParsedCatalog({ preview }: { preview: CatalogPreview }) {
  const [mapping, setMapping] = useState(
    () =>
      Object.fromEntries(
        preview.mapping.map((m) => [m.field, m.column]),
      ) as Record<SliceField, string | null>,
  );
  const [manual, setManual] = useState<Partial<Record<SliceField, true>>>({});
  const [infer, setInfer] = useState(true);

  const byField = new Map(preview.mapping.map((m) => [m.field, m]));
  const required = SLICE_FIELDS.filter((f) => f.required);
  const mappedRequired = required.filter((f) => mapping[f.id]).length;
  const toReview = SLICE_FIELDS.filter(
    (f) =>
      mapping[f.id] &&
      !manual[f.id] &&
      (byField.get(f.id)?.confidence ?? 1) < 0.75,
  ).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Field mapping</CardTitle>
          <CardDescription className="num">
            {mappedRequired} of {required.length} required fields mapped
            {toReview > 0 && `, ${toReview} to review`}
          </CardDescription>
          <CardAction>
            {toReview > 0 ? (
              <Badge tone="warn">{toReview} low confidence</Badge>
            ) : (
              <Badge tone="ok">Ready</Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <Table className="min-w-160">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[30%] pl-4">Slice field</TableHead>
                <TableHead className="w-[26%]">Your column</TableHead>
                <TableHead>Sample value</TableHead>
                <TableHead className="w-32 pr-4 text-right">Match</TableHead>
              </TableRow>
            </TableHeader>
            {(["Required", "Recommended"] as const).map((group) => (
              <TableBody key={group}>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableCell
                    colSpan={4}
                    className="pl-4 text-xs font-medium text-muted-foreground"
                  >
                    {group}
                  </TableCell>
                </TableRow>
                {SLICE_FIELDS.filter(
                  (f) => f.required === (group === "Required"),
                ).map((f) => {
                  const row = byField.get(f.id);
                  const column = mapping[f.id];
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="pl-4">
                        <div className="font-medium">{f.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.help}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          aria-label={`Source column for ${f.id}`}
                          value={column ?? ""}
                          onChange={(e) => {
                            setMapping({
                              ...mapping,
                              [f.id]: e.target.value || null,
                            });
                            setManual({ ...manual, [f.id]: true });
                          }}
                          className={cn(!column && "text-muted-foreground")}
                        >
                          <option value="">Not mapped</option>
                          {preview.columns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell className="max-w-0">
                        <span className="block truncate text-muted-foreground">
                          {column && column === row?.column
                            ? row.sample
                            : column
                              ? "—"
                              : ""}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <MatchPill
                          required={f.required}
                          mapped={!!column}
                          manual={!!manual[f.id]}
                          confidence={row?.confidence ?? 0}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            ))}
          </Table>
        </CardContent>
        {preview.unmapped.length > 0 && (
          <CardFooter>
            <p className="text-sm text-muted-foreground">
              Kept as extra attributes the concierge can search:{" "}
              {preview.unmapped.join(", ")}
            </p>
          </CardFooter>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attribute coverage</CardTitle>
          <CardDescription>
            Share of {fmt.int(preview.rows)} products with a usable value.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
          {preview.coverage.map((c) => (
            <CoverageRow
              key={c.field}
              field={c.field}
              value={c.value}
              projected={infer ? c.projected : undefined}
            />
          ))}
        </CardContent>
        <CardFooter className="items-start justify-between gap-6">
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm font-medium">
              Let Slice infer missing style and material from descriptions
            </div>
            <p className="max-w-lg text-sm text-muted-foreground">
              Inferred values are marked and listed for review in Catalog.
              They&apos;re used for matching only, never shown to shoppers or
              written back to your store.
            </p>
          </div>
          <Switch
            checked={infer}
            onCheckedChange={setInfer}
            aria-label="Infer missing attributes"
          />
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sample of parsed products</CardTitle>
          <CardDescription>
            {preview.samples.length} of {fmt.int(preview.rows)}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table className="min-w-160">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Style</TableHead>
                <TableHead className="pr-4">Material</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.samples.map((p) => (
                <SampleRow key={p.id} product={p} infer={infer} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MatchPill({
  required,
  mapped,
  manual,
  confidence,
}: {
  required: boolean;
  mapped: boolean;
  manual: boolean;
  confidence: number;
}) {
  if (!mapped) {
    return required ? (
      <Badge tone="bad">Required</Badge>
    ) : (
      <Badge tone="outline">Skipped</Badge>
    );
  }
  if (manual) return <Badge tone="neutral">Set by you</Badge>;
  const pct = Math.round(confidence * 100);
  const tone =
    confidence >= 0.9 ? "ok" : confidence >= 0.75 ? "neutral" : "warn";
  return (
    <Badge tone={tone} className="num">
      {pct === 100 ? "Exact" : `${pct}%`}
      {tone === "warn" && ", check it"}
    </Badge>
  );
}

function CoverageRow({
  field,
  value,
  projected,
}: {
  field: string;
  value: number;
  projected?: number;
}) {
  const low = value < 0.7;
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)_6rem] items-center gap-3">
      <span className="text-sm text-muted-foreground">{field}</span>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        {projected !== undefined && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-600/20 transition-[width] duration-500 ease-out"
            style={{ width: `${projected * 100}%` }}
          />
        )}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            low ? "bg-amber-500" : "bg-foreground/80",
          )}
          style={{ width: `${Math.max(2, value * 100)}%` }}
        />
      </div>
      <span className="num text-right text-sm">
        <span className={low ? "font-medium text-amber-700" : undefined}>
          {fmt.pct(value, 0)}
        </span>
        {projected !== undefined && (
          <span className="text-emerald-700"> → {fmt.pct(projected, 0)}</span>
        )}
      </span>
    </div>
  );
}

function AttrChips({
  values,
  inferred,
}: {
  values: string[];
  inferred?: string[];
}) {
  if (!values.length && !inferred?.length) {
    return <span className="text-xs text-muted-foreground">Missing</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <Badge key={v} tone="outline">
          {v}
        </Badge>
      ))}
      {inferred?.map((v) => (
        <Badge
          key={v}
          tone="ok"
          title="Inferred from the description"
          className="border-dashed border-emerald-300"
        >
          {v}
        </Badge>
      ))}
    </span>
  );
}

function SampleRow({
  product: p,
  infer,
}: {
  product: SampleProduct;
  infer: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="flex items-center gap-3">
          <span
            className="block size-9 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10"
            style={p.tint ? { background: p.tint } : undefined}
          >
            {p.image && (
              // Merchant-hosted product photos.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.image}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
            )}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{p.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {p.brand ? <span className="mr-3">{p.brand}</span> : null}
              {p.id}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{p.category}</TableCell>
      <TableCell className="num text-right">{fmt.money(p.price)}</TableCell>
      <TableCell>
        <AttrChips
          values={p.style}
          inferred={infer ? p.inferredStyle : undefined}
        />
      </TableCell>
      <TableCell className="pr-4">
        <AttrChips
          values={p.material}
          inferred={infer ? p.inferredMaterial : undefined}
        />
      </TableCell>
    </TableRow>
  );
}
