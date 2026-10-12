"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Check, Copy, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import { Badge, EmptyState, PageSkeleton, Panel, PanelHeader, Stat } from "@/components/console/primitives";
import { Field, Input, Segmented, Switch, Textarea } from "@/components/console/form";
import { Spinner } from "@/components/console/setup/atoms";
import { LandingView } from "@/components/pages/landing";
import { Button, buttonVariants } from "@/components/ui/button";
import { errorText, startAgentJob } from "@/lib/pages/client";
import { AgeSkew, EntityChips, TagCloud, TraceList } from "./atoms";

// One page: generation progress, a live preview of each taste variant, why
// that variant exists (its Qloo anchors, tags and audience), its copy, and
// how each variant is doing with real visitors.

type Page = Doc<"pages">;
type Segment = Page["segments"][number];
type Section = Segment["sections"][number];
type Tab = "audience" | "copy" | "results" | "trace";

const SOURCE_LABEL: Record<string, string> = {
  link: "Shared link",
  quiz: "Quiz answer",
  profile: "Slice profile",
  utm: "Campaign",
  geo: "City taste",
  default: "Default",
};

export function PageEditor({ id }: { id: string }) {
  const { isLoading } = useConvexAuth();
  const valid = /^[a-z0-9]{10,64}$/.test(id);
  const data = useQuery(api.pages.get, isLoading || !valid ? "skip" : { id: id as Id<"pages"> });

  if (data === undefined && valid) return <PageSkeleton />;
  if (!data || !data.brand?.kit) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <EmptyState
          title="Page not found"
          body="It may have been deleted, or it belongs to another account."
          action={
            <Link href="/dashboard/pages" className={buttonVariants({ variant: "outline" })}>
              All pages
            </Link>
          }
        />
      </div>
    );
  }
  return <Editor page={data.page} brand={data.brand as Doc<"brands"> & { kit: NonNullable<Doc<"brands">["kit"]> }} />;
}

function Editor({ page, brand }: { page: Page; brand: Doc<"brands"> & { kit: NonNullable<Doc<"brands">["kit"]> } }) {
  const router = useRouter();
  const regenerate = useMutation(api.pages.regenerate);
  const setPublished = useMutation(api.pages.setPublished);
  const remove = useMutation(api.pages.remove);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("audience");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const segment = page.segments.find((s) => s.id === segmentId) ?? page.segments[0];
  const href = `/p/${page.slug}`;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{page.name}</h1>
          {page.status === "generating" ? (
            <Badge tone="marker">Generating</Badge>
          ) : page.status === "failed" ? (
            <Badge tone="bad">Failed</Badge>
          ) : page.published ? (
            <Badge tone="ok">Live</Badge>
          ) : (
            <Badge tone="outline">Draft</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {brand.kit.name} · {href} · {page.segments.length} variants
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={page.published}
            disabled={page.status !== "ready" && !page.published}
            onCheckedChange={(published: boolean) => run(() => setPublished({ id: page._id, published }))}
          />
          Published
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />}
          Copy link
        </Button>
        {page.published ? (
          <a href={href} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ExternalLink />
            Open
          </a>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={page.status === "generating"}
          onClick={() =>
            run(async () => {
              await regenerate({ id: page._id });
              startAgentJob("/api/pages/generate", { pageId: page._id }, setError);
            })
          }
        >
          <RotateCcw />
          Regenerate
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Delete page"
          onClick={() => {
            if (!window.confirm(`Delete "${page.name}" and its visitor stats?`)) return;
            run(async () => {
              await remove({ id: page._id });
              router.push("/dashboard/pages");
            });
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );

  if (page.status !== "ready" || !segment) {
    const failed = page.status === "failed";
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        {header}
        {error ? <p className="pb-4 text-sm text-red-600">{error}</p> : null}
        <Panel>
          <PanelHeader
            title={failed ? "Generation failed" : "Writing your page"}
            hint={failed ? page.error : `${page.progress ?? "Starting"}…`}
            actions={failed ? null : <Spinner />}
          />
          <div className="p-4">
            <TraceList spans={page.trace} />
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
      {header}
      {error ? <p className="pb-4 text-sm text-red-600">{error}</p> : null}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={segment.id}
          onChange={setSegmentId}
          options={page.segments.map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="flex flex-col">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
            <span className="flex gap-1">
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
            </span>
            <span className="truncate rounded-md bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {href}?seg={segment.id}
            </span>
          </div>
          <div className="@container max-h-[78vh] overflow-y-auto">
            <LandingView
              kit={brand.kit}
              domain={brand.domain}
              segment={segment}
              ctaUrl={page.brief.ctaUrl}
              reason={
                segment.isDefault
                  ? undefined
                  : { source: "link", detail: segment.summary, matched: segment.tags.slice(0, 3).map((t) => t.name) }
              }
            />
          </div>
        </Panel>
        <div className="space-y-4">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "audience", label: "Audience" },
              { value: "copy", label: "Copy" },
              { value: "results", label: "Results" },
              { value: "trace", label: "Trace" },
            ]}
          />
          {tab === "audience" ? (
            <AudiencePanel key={`${segment.id}-${page.updatedAt}`} page={page} segment={segment} onError={setError} />
          ) : tab === "copy" ? (
            <div className="space-y-3">
              {segment.sections.map((section) => (
                <SectionEditor
                  key={`${segment.id}-${section.id}-${page.updatedAt}`}
                  pageId={page._id}
                  segmentId={segment.id}
                  section={section}
                />
              ))}
            </div>
          ) : tab === "results" ? (
            <ResultsPanel pageId={page._id} />
          ) : (
            <Panel>
              <PanelHeader title="How this page was made" hint="Every Qloo call and model step, in order." />
              <div className="p-4">
                <TraceList spans={page.trace} />
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function AudiencePanel({
  page,
  segment,
  onError,
}: {
  page: Page;
  segment: Segment;
  onError: (message: string) => void;
}) {
  const updateSegment = useMutation(api.pages.updateSegment);
  const [name, setName] = useState(segment.name);
  const [keywords, setKeywords] = useState(segment.utmKeywords.join(", "));
  const [saving, setSaving] = useState(false);
  const dirty = name !== segment.name || keywords !== segment.utmKeywords.join(", ");
  const cities = page.cityMap.filter((c) => c.segmentId === segment.id);
  const base = `/p/${page.slug}`;

  async function save() {
    setSaving(true);
    try {
      await updateSegment({
        id: page._id,
        segmentId: segment.id,
        name,
        utmKeywords: keywords
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
      });
    } catch (err) {
      onError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={segment.isDefault ? "Everyone else" : segment.name}
        hint={segment.isDefault ? "Shown when Slice knows nothing about the visitor" : "A taste segment of your audience"}
      />
      <div className="space-y-5 p-4">
        <p className="text-sm">{segment.summary}</p>
        {segment.why ? <p className="text-xs text-muted-foreground">{segment.why}</p> : null}
        {segment.anchors.length ? (
          <div className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Qloo anchors</h3>
            <EntityChips entities={segment.anchors} max={8} />
          </div>
        ) : null}
        {segment.tags.length ? (
          <div className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Taste tags</h3>
            <TagCloud tags={segment.tags} max={14} />
          </div>
        ) : null}
        {segment.demographics ? (
          <div className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Age skew</h3>
            <AgeSkew demographics={segment.demographics} />
          </div>
        ) : null}
        <div className="space-y-3 border-t pt-4">
          <Field label="Segment name">
            <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Campaign keywords" hint="Visitors whose utm_campaign, utm_term or utm_content contains one of these see this variant.">
            <Input value={keywords} maxLength={400} onChange={(e) => setKeywords(e.target.value)} placeholder="vinyl, indie, festival" />
          </Field>
          {dirty ? (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : null}
              Save
            </Button>
          ) : null}
        </div>
        {!segment.isDefault ? (
          <div className="space-y-2 border-t pt-4">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Cities that get this variant</h3>
            {cities.length ? (
              <div className="flex flex-wrap gap-1.5">
                {cities.slice(0, 16).map((c) => (
                  <Badge key={c.city} tone="outline" title={c.matched.join(", ")}>
                    {c.city}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {page.cityMap.length ? "No mapped city leans this way yet." : "Mapping cities with Qloo…"}
              </p>
            )}
          </div>
        ) : null}
        <div className="space-y-1.5 border-t pt-4 text-xs">
          <h3 className="font-medium tracking-wide text-muted-foreground uppercase">Try it</h3>
          {[
            [`${base}?seg=${segment.id}`, "Force this variant"],
            [`${base}?utm_campaign=${encodeURIComponent(segment.utmKeywords[0] ?? "spring")}`, "As a campaign visitor"],
            [`${base}?city=${encodeURIComponent(cities[0]?.city ?? "Austin")}`, "As a visitor from a city"],
          ].map(([link, label]) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="truncate font-mono">{link.slice(base.length) || "/"}</span>
            </a>
          ))}
          {!page.published ? <p className="px-2 text-muted-foreground">Publish the page to open these.</p> : null}
        </div>
      </div>
    </Panel>
  );
}

function SectionEditor({ pageId, segmentId, section }: { pageId: Id<"pages">; segmentId: string; section: Section }) {
  const updateSection = useMutation(api.pages.updateSection);
  const [draft, setDraft] = useState(section);
  const [open, setOpen] = useState(section.kind === "hero");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(section);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateSection({ id: pageId, segmentId, section: draft });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground capitalize">{section.kind}</span>
          <span className="block truncate text-sm font-medium">{draft.heading}</span>
        </span>
        {dirty ? <Badge tone="marker">Unsaved</Badge> : null}
      </button>
      {open ? (
        <div className="space-y-3 border-t p-4">
          {draft.eyebrow !== undefined ? (
            <Field label="Eyebrow">
              <Input value={draft.eyebrow} maxLength={60} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} />
            </Field>
          ) : null}
          <Field label="Heading">
            <Input value={draft.heading} maxLength={140} onChange={(e) => setDraft({ ...draft, heading: e.target.value })} />
          </Field>
          {draft.body !== undefined ? (
            <Field label="Body">
              <Textarea rows={3} value={draft.body} maxLength={900} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
          ) : null}
          {draft.cta ? (
            <Field label="Button label">
              <Input
                value={draft.cta.label}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta!, label: e.target.value } })}
              />
            </Field>
          ) : null}
          {draft.items?.map((item, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-muted/40 p-3">
              <Input
                value={item.title}
                maxLength={120}
                aria-label={`Item ${i + 1} title`}
                onChange={(e) =>
                  setDraft({ ...draft, items: draft.items!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })
                }
              />
              {item.body !== undefined ? (
                <Textarea
                  rows={2}
                  value={item.body}
                  maxLength={500}
                  aria-label={`Item ${i + 1} text`}
                  onChange={(e) =>
                    setDraft({ ...draft, items: draft.items!.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })
                  }
                />
              ) : null}
            </div>
          ))}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {dirty ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Spinner /> : null}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(section)}>
                Discard
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function ResultsPanel({ pageId }: { pageId: Id<"pages"> }) {
  const stats = useQuery(api.pages.stats, { id: pageId });
  if (stats === undefined) return <Panel className="h-64 animate-pulse" />;
  if (!stats || !stats.total) {
    return (
      <EmptyState
        title="No visitors yet"
        body="Publish the page and share the link. Views, clicks and quiz answers show up here per variant."
      />
    );
  }
  const views = stats.segments.reduce((n, s) => n + s.views, 0);
  const visitors = stats.segments.reduce((n, s) => n + s.visitors, 0);
  const ctas = stats.segments.reduce((n, s) => n + s.ctas, 0);
  const top = (rec: Record<string, number>) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Views" value={views} />
        <Stat label="Visitors" value={visitors} />
        <Stat label="Clicks" value={ctas} />
      </div>
      <Panel>
        <PanelHeader title="By variant" hint="Conversion = visitors who clicked the button" />
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 text-left font-normal">Variant</th>
              <th className="px-2 py-2 text-right font-normal">Visitors</th>
              <th className="px-2 py-2 text-right font-normal">Clicks</th>
              <th className="px-4 py-2 text-right font-normal">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {stats.segments.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="max-w-[140px] truncate px-4 py-2">{s.name}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.visitors}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.ctas}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Math.round(s.conversion * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel>
        <PanelHeader title="Why visitors got their variant" />
        <div className="space-y-1.5 p-4 text-sm">
          {top(stats.sources).map(([source, n]) => (
            <div key={source} className="flex justify-between">
              <span>{SOURCE_LABEL[source] ?? source}</span>
              <span className="tabular-nums text-muted-foreground">{n}</span>
            </div>
          ))}
        </div>
      </Panel>
      {Object.keys(stats.cities).length ? (
        <Panel>
          <PanelHeader title="Top cities" />
          <div className="space-y-1.5 p-4 text-sm">
            {top(stats.cities).map(([city, n]) => (
              <div key={city} className="flex justify-between">
                <span>{city}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
