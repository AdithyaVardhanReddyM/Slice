"use client";

import { useMutation } from "convex/react";
import QRCode from "qrcode";
import { Download, ExternalLink, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { downloadText } from "@/lib/pages/csv";
import type { Audience, Page, Variant } from "@/lib/pages/types";
import { publicPageUrl } from "@/lib/pages/urls";
import { CopyButton, Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint, SectionLabel } from "../shared";
import { AudienceStrip } from "./preview";

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

export function PublishDialog({
  open,
  onOpenChange,
  brandSlug,
  page,
  version,
  audiences,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brandSlug: string;
  page: Page;
  /** The page's one version. */
  version: Variant | null;
  /** Who the page is built for (none: everyone). */
  audiences: Audience[];
}) {
  const publish = useMutation(api.pages.publish);
  const unpublish = useMutation(api.pages.unpublish);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = publicPageUrl(brandSlug, page.slug);
  const qrUrl = publicPageUrl(brandSlug, page.slug, { utm_source: "qr", utm_medium: "ooh" });
  const published = page.status === "published";
  const ready = version?.status === "ready" && !!version.doc;

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
              ? "Live on the brand's subdomain. Share the link with the people it was built for: in ads, emails or on print."
              : ready
                ? "The page is ready. Publishing puts it live at the link below."
                : "Build the page before publishing it."}
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
              <Button size="sm" variant={published ? "outline" : "default"} onClick={toggle} disabled={busy || (!published && !ready)}>
                {busy && <Spinner data-icon="inline-start" />}
                {published ? "Unpublish" : "Publish now"}
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-6 sm:grid-cols-[1fr_12rem]">
            <section className="space-y-2">
              <SectionLabel>Built for</SectionLabel>
              <AudienceStrip audiences={audiences} />
              <Hint>
                {audiences.length
                  ? "Every visitor to this link sees the page written for this audience. For another audience, ask the builder for a new page."
                  : "Written for everyone, from the brand's own taste read. For a specific audience, ask the builder for a new page."}
              </Hint>
            </section>
            <section className="space-y-2">
              <SectionLabel>QR for print</SectionLabel>
              <QrCode value={qrUrl} className="w-full" />
              <Hint>Tagged utm_source=qr, so scans show up as a source in Analytics.</Hint>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
