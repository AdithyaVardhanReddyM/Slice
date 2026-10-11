"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Fingerprint, Globe, Image as ImageIcon, PanelRightClose, PanelRightOpen, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { Audience, Build, Page, Variant } from "@/lib/pages/types";
import { Segmented } from "@/components/console/form";
import { PageSkeleton } from "@/components/console/primitives";
import { Spinner } from "@/components/console/setup/atoms";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageAnalytics } from "../analytics/page-analytics";
import { useBrand } from "../brand-context";
import { StatusBadge } from "../shared";
import { BuilderChat } from "./chat";
import { ImageTool } from "./image-tool";
import { DeviceToggle, PreviewFrame, VariantTabs, type Device } from "./preview";
import { PublishDialog } from "./publish-dialog";
import { useBuilder } from "./use-builder";
import { WhyPanel } from "./why-panel";

interface PageBundle {
  page: Page;
  variants: Variant[];
  audiences: Audience[];
}

/** Default first, then audience versions in the page's audience order. */
function orderVariants(page: Page, variants: Variant[]) {
  const def = variants.find((v) => v._id === page.defaultVariantId) ?? variants.find((v) => !v.audienceId);
  const rest = variants
    .filter((v) => v !== def)
    .sort((a, b) => page.audienceIds.indexOf(a.audienceId!) - page.audienceIds.indexOf(b.audienceId!));
  return def ? [def, ...rest] : rest;
}

export function PageBuilder() {
  const brand = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const { page: pageSlug } = useParams<{ page: string }>();
  // bySlug strips traces for the renderer; resolve the id from the brand's list, then read the full page.
  const list = useQuery(api.pages.list, { brandId: brand._id }) as Page[] | undefined;
  const listed = list?.find((p) => p.slug === pageSlug);
  const bundle = useQuery(api.pages.get, listed ? { id: listed._id } : "skip") as PageBundle | null | undefined;
  const page = bundle?.page ?? null;
  const build = useQuery(api.pages.build, page ? { pageId: page._id } : "skip") as Build | null | undefined;
  const variants = useMemo(() => (page && bundle ? orderVariants(page, bundle.variants) : []), [page, bundle]);
  const audiences = bundle?.audiences ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [side, setSide] = useState<"why" | "images" | null>("why");
  const [publishOpen, setPublishOpen] = useState(false);
  const tab = params.get("tab") === "analytics" ? "analytics" : "build";
  const frame = useRef<HTMLIFrameElement>(null);

  // Follow the version being built so the merchant sees it appear.
  const builder = useBuilder({ pageId: (page?._id ?? "") as Page["_id"], build, onStart: setActiveId });
  const active = variants.find((v) => v._id === activeId) ?? variants[0] ?? null;

  // A freshly created page lands here with ?generate=1: kick off every version once.
  const kicked = useRef(false);
  useEffect(() => {
    if (kicked.current || params.get("generate") !== "1" || !page || variants.length === 0) return;
    kicked.current = true;
    router.replace(`/dashboard/pages/${brand.slug}/${page.slug}`);
    if (variants.every((v) => !v.doc)) void builder.generateAll(variants.map((v) => v._id));
  }, [params, page, variants, router, brand.slug, builder]);

  const setTab = (t: "build" | "analytics") => router.replace(`/dashboard/pages/${brand.slug}/${pageSlug}${t === "analytics" ? "?tab=analytics" : ""}`);

  if (list === undefined || (listed && bundle === undefined)) return <PageSkeleton />;
  if (!listed || bundle === null || !page) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-lg font-semibold">No page called “{pageSlug}”</h1>
        <Link href={`/dashboard/pages/${brand.slug}/pages`} className={buttonVariants({ variant: "outline" })}>
          All pages
        </Link>
      </div>
    );
  }

  const scrollPreviewTo = (sectionId: string) => {
    frame.current?.contentWindow?.postMessage({ type: "pg:scrollTo", sectionId }, "*");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-base font-semibold">{page.title}</h1>
          <StatusBadge status={page.status} />
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "build", label: "Build" },
              { value: "analytics", label: "Analytics" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {builder.busy ? (
            <Button variant="outline" size="sm" onClick={builder.stop}>
              <Spinner data-icon="inline-start" />
              {builder.queue.length > 0 ? `${builder.queue.length} more queued · Stop` : "Stop"}
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => void builder.generateAll(variants.map((v) => v._id))} disabled={variants.length === 0}>
                <Play data-icon="inline-start" /> Generate all versions
              </Button>
              <Button variant="outline" size="sm" onClick={() => active && void builder.generate(active._id)} disabled={!active}>
                <RotateCcw data-icon="inline-start" /> Regenerate this version
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => setPublishOpen(true)}>
            <Globe data-icon="inline-start" /> {page.status === "published" ? "Published" : "Publish"}
          </Button>
        </div>
      </div>

      {tab === "analytics" ? (
        <PageAnalytics page={page} variants={variants} audiences={audiences} />
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
          <aside className="flex min-h-[24rem] flex-col border-b lg:border-r lg:border-b-0">
            <BuilderChat
              build={build}
              live={builder.live}
              variants={variants}
              activeVariant={active}
              onSend={(text) => active && void builder.send(active._id, text)}
              onStop={builder.stop}
              disabled={builder.busy}
            />
          </aside>
          <section className="flex min-h-[32rem] min-w-0 flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <VariantTabs variants={variants} activeId={active?._id ?? null} onSelect={setActiveId} liveId={builder.live?.variantId} queued={builder.queue} />
              <div className="flex items-center gap-2">
                <DeviceToggle value={device} onChange={setDevice} />
                <Button variant={side === "why" ? "secondary" : "outline"} size="sm" onClick={() => setSide(side === "why" ? null : "why")}>
                  <Fingerprint data-icon="inline-start" /> Why this version
                </Button>
                <Button variant={side === "images" ? "secondary" : "outline"} size="sm" onClick={() => setSide(side === "images" ? null : "images")}>
                  <ImageIcon data-icon="inline-start" /> Images
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={side ? "Hide side panel" : "Show side panel"} onClick={() => setSide(side ? null : "why")}>
                  {side ? <PanelRightClose /> : <PanelRightOpen />}
                </Button>
              </div>
            </div>
            <div className={cn("grid min-h-0 flex-1 gap-3", side && "xl:grid-cols-[minmax(0,1fr)_22rem]")}>
              <PreviewFrame
                ref={frame}
                brandSlug={brand.slug}
                pageSlug={page.slug}
                variant={active}
                device={device}
                reloadKey={builder.docVersion}
                className="min-h-[28rem]"
              />
              {side && (
                <div className="scrollbar-thin max-h-[calc(100dvh-14rem)] overflow-y-auto rounded-xl border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-medium">{side === "why" ? `Why the ${active?.name ?? ""} version` : "Swap an image"}</h2>
                    {side === "images" && active?.status !== "ready" && <span className="text-xs text-muted-foreground">Needs a generated version</span>}
                  </div>
                  {side === "why" ? (
                    <WhyPanel variant={active} onPick={scrollPreviewTo} />
                  ) : (
                    <ImageTool
                      brandId={brand._id}
                      variant={active}
                      defaultMode={page.brief.imageMode}
                      disabled={builder.busy}
                      onApply={(msg) => active && void builder.send(active._id, msg)}
                    />
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} brandSlug={brand.slug} page={page} variants={variants} audiences={audiences} />
    </div>
  );
}
