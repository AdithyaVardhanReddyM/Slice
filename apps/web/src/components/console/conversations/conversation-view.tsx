"use client";

import { useState } from "react";
import {
  Download,
  Flag,
  Monitor,
  ShoppingBag,
  Smartphone,
  Tablet,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type {
  Conversation,
  Message,
  Recommendation,
  TurnTrace,
} from "@/lib/mock/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SliceMark } from "../logo";
import { KeyValue, OutcomeBadge } from "../primitives";
import { Segmented } from "../form";
import type { ProductLite } from "./data";
import { WhyDialog } from "./lineage";
import { Waterfall } from "./waterfall";

type Why = { rec: Recommendation; traceId: string } | null;

const TYPE_LABEL: Record<string, string> = {
  artist: "Artist",
  movie: "Film",
  tv_show: "TV show",
  book: "Book",
  person: "Person",
  place: "Destination",
  brand: "Brand",
  podcast: "Podcast",
};

export function ConversationView({
  conversation: c,
  products,
  conciergeName,
}: {
  conversation: Conversation;
  products: Record<string, ProductLite>;
  conciergeName: string;
}) {
  const [tab, setTab] = useState<"taste" | "trace" | "session">("taste");
  const [traceId, setTraceId] = useState(c.traces[0]?.id ?? "");
  const [why, setWhy] = useState<Why>(null);
  const trace = c.traces.find((t) => t.id === traceId) ?? c.traces[0];
  const whyTrace = why
    ? (c.traces.find((t) => t.id === why.traceId) ?? null)
    : null;
  const askFor = (traceMessageId?: string) => {
    const idx = c.messages.findIndex((m) => m.id === traceMessageId);
    return (
      [...c.messages.slice(0, idx)].reverse().find((m) => m.role === "shopper")
        ?.text ?? ""
    );
  };

  const openTrace = (id: string) => {
    setTraceId(id);
    setTab("trace");
  };

  const DeviceIcon = {
    mobile: Smartphone,
    desktop: Monitor,
    tablet: Tablet,
  }[c.shopper.device];

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* Transcript */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b px-6 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">
                {c.shopper.city}, {c.shopper.region}
              </h2>
              <OutcomeBadge outcome={c.outcome} />
              {c.revenue > 0 && (
                <span className="text-sm font-medium text-emerald-700 tabular-nums">
                  {fmt.money(c.revenue)}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 capitalize">
                <DeviceIcon className="size-3.5" /> {c.shopper.device}
              </span>
              <span>
                {fmt.dateLong(c.startedAt)}, {fmt.time(c.startedAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3.5" /> {fmt.duration(c.durationSec)}
              </span>
              <span>Started on {c.shopper.entryPage}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm">
              <Flag /> Flag
            </Button>
            <Button variant="outline" size="sm">
              <Download /> Export
            </Button>
          </div>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto">
          <ol className="mx-auto max-w-3xl space-y-6 px-6 py-6">
            {c.messages.map((m) => (
              <li key={m.id}>
                <MessageRow
                  message={m}
                  conversation={c}
                  products={products}
                  conciergeName={conciergeName}
                  onTrace={openTrace}
                  onWhy={(rec) =>
                    m.traceId && setWhy({ rec, traceId: m.traceId })
                  }
                />
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Inspector */}
      <aside className="flex w-[400px] shrink-0 flex-col border-l">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b p-3">
            <TabsList className="w-full">
              <TabsTrigger value="taste">Taste profile</TabsTrigger>
              <TabsTrigger value="trace">Trace</TabsTrigger>
              <TabsTrigger value="session">Session</TabsTrigger>
            </TabsList>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            <TabsContent value="taste" className="space-y-6 p-4">
              <TasteInspector c={c} />
            </TabsContent>
            <TabsContent value="trace" className="space-y-6 p-4">
              {trace && (
                <>
                  {c.traces.length > 1 && (
                    <Segmented
                      value={trace.id}
                      onChange={setTraceId}
                      className="w-full [&>button]:flex-1"
                      options={c.traces.map((t, i) => ({
                        value: t.id,
                        label: `Reply ${i + 1}`,
                      }))}
                    />
                  )}
                  <TraceSummary trace={trace} />
                  <Section title="What the shopper asked for">
                    <div className="space-y-2 rounded-lg border p-3">
                      <p className="text-sm font-medium">
                        {trace.intent.summary}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {trace.intent.category.map((x) => (
                          <Badge key={x} variant="outline">
                            {x}
                          </Badge>
                        ))}
                        {trace.intent.budget && (
                          <Badge variant="outline">
                            Up to ${trace.intent.budget}
                          </Badge>
                        )}
                        {trace.intent.room && (
                          <Badge variant="outline" className="capitalize">
                            {trace.intent.room}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Section>
                  <Section title="Steps">
                    <Waterfall
                      spans={trace.spans}
                      totalMs={trace.totalMs}
                      compact
                    />
                  </Section>
                  <Section title="Catalog narrowing">
                    <Funnel
                      steps={[
                        ["In catalog", trace.retrieval.catalogSize],
                        ["After filters", trace.retrieval.filtered],
                        ["Sent to ranker", trace.retrieval.candidates.length],
                        [
                          "Shown",
                          trace.retrieval.candidates.filter((x) => x.kept)
                            .length,
                        ],
                      ]}
                    />
                  </Section>
                </>
              )}
            </TabsContent>
            <TabsContent value="session" className="space-y-6 p-4">
              <Section title="Shopper">
                <KeyValue
                  rows={[
                    ["Shopper ID", c.shopper.anonId],
                    ["Location", `${c.shopper.city}, ${c.shopper.region}`],
                    [
                      "Device",
                      <span key="d" className="capitalize">
                        {c.shopper.device}
                      </span>,
                    ],
                    ["Entry page", c.shopper.entryPage],
                    ["Referrer", c.shopper.referrer],
                    [
                      "Visitor",
                      c.shopper.returning ? "Returning" : "First visit",
                    ],
                    ["Taste profile", c.persona],
                  ]}
                />
              </Section>
              <Separator />
              <Section title="Outcome">
                <KeyValue
                  rows={[
                    ["Result", <OutcomeBadge key="o" outcome={c.outcome} />],
                    ["Revenue", c.revenue ? fmt.money(c.revenue) : "None"],
                    ["Duration", fmt.duration(c.durationSec)],
                    [
                      "Messages",
                      String(
                        c.messages.filter((m) => m.role === "shopper").length,
                      ),
                    ],
                    ...(c.gap
                      ? ([["Catalog gap", c.gap]] as [string, string][])
                      : []),
                  ]}
                />
              </Section>
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                Slice stores no names, emails or browsing history. Shoppers are
                anonymous and location is kept at city level.
              </p>
            </TabsContent>
          </div>
        </Tabs>
      </aside>

      <WhyDialog
        open={!!why}
        onOpenChange={(o) => !o && setWhy(null)}
        rec={why?.rec ?? null}
        product={why ? products[why.rec.productId] : null}
        trace={whyTrace}
        profile={c.profile}
        ask={askFor(whyTrace?.messageId)}
        products={products}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

/* Transcript rows ---------------------------------------------------------- */

function MessageRow({
  message: m,
  conversation: c,
  products,
  conciergeName,
  onTrace,
  onWhy,
}: {
  message: Message;
  conversation: Conversation;
  products: Record<string, ProductLite>;
  conciergeName: string;
  onTrace: (id: string) => void;
  onWhy: (rec: Recommendation) => void;
}) {
  if (m.role === "system") {
    const isQuiz = m.text.startsWith("Taste questionnaire");
    const isEnd = m.id.endsWith("_m9");
    const converted =
      isEnd && (c.outcome === "purchased" || c.outcome === "added_to_cart");

    if (isQuiz) {
      return (
        <Card size="sm">
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Taste questions</span>
              <span className="text-xs text-muted-foreground">
                {fmt.clock(m.at)}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {c.profile.answers.map((a) => (
                <div key={a.question} className="space-y-2">
                  <p className="text-sm text-muted-foreground">{a.question}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {a.options.map((o) => (
                      <Badge
                        key={o}
                        variant={o === a.choice ? "default" : "outline"}
                        className={cn(
                          o !== a.choice && "text-muted-foreground",
                        )}
                      >
                        {o}
                      </Badge>
                    ))}
                  </div>
                  {a.freeText && (
                    <p className="text-sm">Also wrote: “{a.freeText}”</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground",
            converted && "font-medium text-emerald-700",
            isEnd && c.outcome === "no_match" && "font-medium text-amber-700",
          )}
        >
          {converted && <ShoppingBag className="size-3.5" />}
          {m.text} · {fmt.clock(m.at)}
        </span>
        <Separator className="flex-1" />
      </div>
    );
  }

  if (m.role === "shopper") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {m.text}
        </div>
        <span className="text-xs text-muted-foreground">
          Shopper · {fmt.clock(m.at)}
        </span>
      </div>
    );
  }

  const trace = m.traceId
    ? c.traces.find((t) => t.id === m.traceId)
    : undefined;
  return (
    <div className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
        <SliceMark className="h-3" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{conciergeName}</span>
          <span className="text-xs text-muted-foreground">
            {fmt.clock(m.at)}
          </span>
          {trace && (
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto text-muted-foreground"
              onClick={() => onTrace(trace.id)}
            >
              <Timer /> {fmt.ms(trace.totalMs)} · view trace
            </Button>
          )}
        </div>
        <div className="rounded-2xl rounded-tl-md bg-muted px-4 py-2.5 text-sm">
          {m.text}
        </div>
        {m.recs && (
          <div className="grid grid-cols-3 gap-3">
            {m.recs.map((r) => (
              <RecCard
                key={r.productId}
                rec={r}
                product={products[r.productId]}
                onWhy={() => onWhy(r)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecCard({
  rec,
  product: p,
  onWhy,
}: {
  rec: Recommendation;
  product: ProductLite;
  onWhy: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      {p.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.image}
          alt=""
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="aspect-[4/3] w-full bg-muted" />
      )}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
        <div className="text-sm text-muted-foreground tabular-nums">
          {p.brand && `${p.brand} · `}
          {fmt.money(p.price)}
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          {rec.addedToCart ? (
            <Badge
              className="bg-emerald-50 text-emerald-700"
              variant="secondary"
            >
              Added to cart
            </Badge>
          ) : rec.clicked ? (
            <Badge variant="secondary">Opened</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              Match {Math.round(rec.score * 100)}%
            </span>
          )}
          <Button variant="outline" size="xs" onClick={onWhy}>
            Why this?
          </Button>
        </div>
      </div>
    </div>
  );
}

/* Inspector sections ------------------------------------------------------- */

function TasteInspector({ c }: { c: Conversation }) {
  const p = c.profile;
  return (
    <>
      <div className="rounded-lg border p-3">
        <p className="text-sm text-muted-foreground">Taste profile</p>
        <p className="text-base font-semibold">{c.persona}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Built from {p.answers.length} answers
          {p.entities.some((e) => e.source === "chat")
            ? " and one mention in chat"
            : ""}
          , looked up in Qloo and matched to the catalog&apos;s styles.
        </p>
      </div>

      <Section title="Qloo entities">
        <div className="divide-y rounded-lg border">
          {p.entities.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{e.name}</div>
                <div className="text-xs text-muted-foreground">
                  {TYPE_LABEL[e.type]}
                </div>
              </div>
              <Badge variant="outline">
                {e.source === "chat" ? "From chat" : "From questions"}
              </Badge>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Taste tags from Qloo">
        <ScoreList
          items={p.tags.map((t) => ({ label: t.name, value: t.weight }))}
          color="var(--color-span-qloo)"
        />
      </Section>

      <Section title="Matched catalog styles">
        <ScoreList
          items={p.styles.map((s) => ({ label: s.label, value: s.score }))}
          color="var(--color-span-slice)"
        />
      </Section>

      <Section title="Colors and materials">
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([...p.palette, ...p.materials])].map((x) => (
            <Badge key={x} variant="secondary">
              {x}
            </Badge>
          ))}
        </div>
      </Section>
    </>
  );
}

function ScoreList({
  items,
  color,
}: {
  items: { label: string; value: number }[];
  color: string;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li
          key={it.label}
          className="grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm"
        >
          <span className="truncate capitalize">{it.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{ width: `${it.value * 100}%`, background: color }}
            />
          </span>
          <span className="text-right text-muted-foreground tabular-nums">
            {Math.round(it.value * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function TraceSummary({ trace }: { trace: TurnTrace }) {
  const qloo = trace.spans.filter((s) => s.kind === "qloo");
  const hits = qloo.filter((s) => s.cache === "hit").length;
  const tokens = trace.spans.reduce(
    (a, s) => a + (s.tokens ? s.tokens.input + s.tokens.output : 0),
    0,
  );
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        ["Response time", fmt.ms(trace.totalMs)],
        [
          "Qloo calls",
          qloo.length ? `${qloo.length} (${hits} cached)` : "None",
        ],
        ["LLM tokens", fmt.int(tokens)],
      ].map(([k, v]) => (
        <div key={k} className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{k}</div>
          <div className="mt-0.5 truncate text-sm font-semibold tabular-nums">
            {v}
          </div>
        </div>
      ))}
    </div>
  );
}

function Funnel({ steps }: { steps: [string, number][] }) {
  const max = steps[0][1];
  return (
    <ul className="space-y-2.5">
      {steps.map(([label, n]) => (
        <li
          key={label}
          className="grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm"
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, (n / max) * 100)}%` }}
            />
          </span>
          <span className="text-right tabular-nums">{n}</span>
        </li>
      ))}
    </ul>
  );
}
