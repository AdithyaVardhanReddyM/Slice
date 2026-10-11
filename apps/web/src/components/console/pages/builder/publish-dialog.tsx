"use client";

import { useMutation } from "convex/react";
import QRCode from "qrcode";
import { Download, ExternalLink, Globe, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { downloadText } from "@/lib/pages/csv";
import { routingOf, type Audience, type Page, type RoutingRules, type Variant } from "@/lib/pages/types";
import { publicPageUrl } from "@/lib/pages/urls";
import { Field, Input, Select, Switch } from "@/components/console/form";
import { CopyButton, Spinner } from "@/components/console/setup/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint, SectionLabel, StatusDot } from "../shared";

const DEFAULT_ROUTING: RoutingRules = { paramKey: "a", leadKey: "g", utm: [], geo: true, quiz: true };

function QrCode({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div className={className}>
      {svg ? (
        // The SVG is generated locally from the URL by the qrcode library, not from remote content.
        <div className="[&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="size-full animate-none rounded bg-muted" />
      )}
      {svg && (
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => downloadText("qr.svg", svg, "image/svg+xml")}>
          <Download data-icon="inline-start" /> Download SVG
        </Button>
      )}
    </div>
  );
}

function UtmEditor({ page, audiences }: { page: Page; audiences: Audience[] }) {
  const setRouting = useMutation(api.pages.setRouting);
  const initial = useMemo(() => routingOf(page) ?? DEFAULT_ROUTING, [page]);
  const [rules, setRules] = useState<RoutingRules>(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(rules) !== JSON.stringify(initial);

  async function save() {
    setBusy(true);
    try {
      await setRouting({ id: page._id, routing: rules });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>
            <span className="block font-medium">Geo routing</span>
            <span className="text-xs text-muted-foreground">Match the visitor&apos;s city or country to location audiences.</span>
          </span>
          <Switch checked={rules.geo} onCheckedChange={(v) => setRules({ ...rules, geo: v })} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>
            <span className="block font-medium">Taste quiz</span>
            <span className="text-xs text-muted-foreground">Three quick questions for visitors nothing else resolved.</span>
          </span>
          <Switch checked={rules.quiz} onCheckedChange={(v) => setRules({ ...rules, quiz: v })} />
        </label>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel>UTM rules</SectionLabel>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setRules({ ...rules, utm: [...rules.utm, { param: "campaign", value: "", audienceId: audiences[0]?._id ?? "" }] })}
            disabled={audiences.length === 0}
          >
            <Plus data-icon="inline-start" /> Add rule
          </Button>
        </div>
        {rules.utm.length === 0 ? (
          <Hint>When utm_&lt;param&gt; equals a value, serve that audience&apos;s version. Useful for ad sets and email segments.</Hint>
        ) : (
          <ul className="space-y-2">
            {rules.utm.map((r, i) => (
              <li key={i} className="grid items-end gap-2 sm:grid-cols-[7rem_1fr_1fr_auto]">
                <Field label="utm_">
                  <Select value={r.param} onChange={(e) => setRules({ ...rules, utm: rules.utm.map((x, j) => (j === i ? { ...x, param: e.target.value } : x)) })}>
                    {["source", "medium", "campaign", "content", "term"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="equals">
                  <Input value={r.value} onChange={(e) => setRules({ ...rules, utm: rules.utm.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="spring-ig" />
                </Field>
                <Field label="serve">
                  <Select value={r.audienceId} onChange={(e) => setRules({ ...rules, utm: rules.utm.map((x, j) => (j === i ? { ...x, audienceId: e.target.value } : x)) })}>
                    {audiences.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button variant="ghost" size="icon-sm" aria-label="Remove rule" onClick={() => setRules({ ...rules, utm: rules.utm.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={!dirty || busy}>
          {busy && <Spinner data-icon="inline-start" />}
          Save routing
        </Button>
      </div>
    </div>
  );
}

export function PublishDialog({
  open,
  onOpenChange,
  brandSlug,
  page,
  variants,
  audiences,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brandSlug: string;
  page: Page;
  variants: Variant[];
  audiences: Audience[];
}) {
  const publish = useMutation(api.pages.publish);
  const unpublish = useMutation(api.pages.unpublish);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = publicPageUrl(brandSlug, page.slug);
  const qrUrl = publicPageUrl(brandSlug, page.slug, { utm_source: "qr", utm_medium: "ooh" });
  const published = page.status === "published";
  const readyCount = variants.filter((v) => v.status === "ready").length;
  const routing = routingOf(page) ?? DEFAULT_ROUTING;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (published) await unpublish({ id: page._id as Id<"pages"> });
      else await publish({ id: page._id as Id<"pages"> });
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle>{published ? "Published" : "Publish"}</DialogTitle>
          <DialogDescription>
            {published
              ? "Live. The router picks a version per visitor: link parameter, personal link, UTM, quiz, cookie, then location, then the default."
              : `${readyCount} of ${variants.length} versions are ready. Versions still building fall back to the default until they finish.`}
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Globe className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <div className="num truncate text-sm font-medium">{url}</div>
                <div className="text-xs text-muted-foreground">Also at /p/{brandSlug}/{page.slug} on this app.</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {published && (
                <>
                  <CopyButton value={url} label="Copy link" />
                  <Button variant="outline" size="sm" nativeButton={false} render={<a href={url} target="_blank" rel="noreferrer" />}>
                    Open <ExternalLink />
                  </Button>
                </>
              )}
              <Button size="sm" variant={published ? "outline" : "default"} onClick={toggle} disabled={busy || (!published && readyCount === 0)}>
                {busy && <Spinner data-icon="inline-start" />}
                {published ? "Unpublish" : "Publish now"}
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-6 lg:grid-cols-[1fr_12rem]">
            <section className="space-y-2">
              <SectionLabel>Links per version</SectionLabel>
              <Hint>Force a version with ?{routing.paramKey}=&lt;audience&gt;. Personal links use ?{routing.leadKey}=&lt;member&gt; from a customer cluster.</Hint>
              <ul className="divide-y rounded-lg border">
                {variants.map((v) => {
                  const aud = audiences.find((a) => a._id === v.audienceId);
                  const link = aud ? publicPageUrl(brandSlug, page.slug, { [routing.paramKey]: aud.slug }) : url;
                  return (
                    <li key={v._id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <StatusDot status={v.status} />
                      <span className="w-36 shrink-0 truncate font-medium">{v.name}</span>
                      <span className="num min-w-0 flex-1 truncate text-xs text-muted-foreground">{link}</span>
                      <CopyButton value={link} label="Copy" size="sm" />
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="space-y-2">
              <SectionLabel>QR for print</SectionLabel>
              <QrCode value={qrUrl} className="w-full" />
              <Hint>Tagged utm_source=qr, so scans show up as a source in Analytics.</Hint>
            </section>
          </div>

          <section className="space-y-3 border-t pt-5">
            <div className="flex items-center gap-2">
              <SectionLabel>Routing</SectionLabel>
              <Badge variant="outline">{routing.utm.length} UTM rule{routing.utm.length === 1 ? "" : "s"}</Badge>
            </div>
            <UtmEditor key={page.updatedAt} page={page} audiences={audiences} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
