"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Globe, Image as ImageIcon, Lightbulb, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { Audience, Build, Page, Variant } from "@/lib/pages/types";
import { PageSkeleton } from "@/components/console/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useBrand } from "../brand-context";
import { StatusBadge } from "../shared";
import { BuilderChat } from "./chat";
import { useAttachmentUpload } from "./attachments";
import { PromptComposer, type ComposerHandle, type ComposerValue } from "./composer";
import { ChatWelcome, EditorLayout, EditorTopbar } from "./editor-shell";
import { ImageTool } from "./image-tool";
import { DeviceToggle, PreviewFrame, VariantTabs, versionLabel, type Device } from "./preview";
import { PublishDialog } from "./publish-dialog";
import { PageSettingsSheet, type PageSettings } from "./settings-sheet";
import { usePagesModel } from "@/lib/pages/models";
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
  const rest = variants.filter((v) => v !== def).sort((a, b) => page.audienceIds.indexOf(a.audienceId!) - page.audienceIds.indexOf(b.audienceId!));
  return def ? [def, ...rest] : rest;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PageBuilder() {
  const brand = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const { page: pageSlug } = useParams<{ page: string }>();
  // bySlug strips traces for the renderer; resolve the id from the brand's list, then read the full page.
  const list = useQuery(api.pages.list, { brandId: brand._id }) as Page[] | undefined;
  // Keep following the page while a slug change travels from Convex to the URL.
  const [followId, setFollowId] = useState<string | null>(null);
  const listed = list?.find((p) => p.slug === pageSlug) ?? (followId ? list?.find((p) => p._id === followId) : undefined);
  const bundle = useQuery(api.pages.get, listed ? { id: listed._id } : "skip") as PageBundle | null | undefined;
  const page = bundle?.page ?? null;
  const build = useQuery(api.pages.build, page ? { pageId: page._id } : "skip") as Build | null | undefined;
  const audienceList = useQuery(api.pagesAudiences.list, { brandId: brand._id }) as Audience[] | undefined;
  const brandAudiences = useMemo(() => audienceList ?? [], [audienceList]);
  const variants = useMemo(() => (page && bundle ? orderVariants(page, bundle.variants) : []), [page, bundle]);
  const setAudiences = useMutation(api.pages.setAudiences);
  const updateSettings = useMutation(api.pages.updateSettings);
  const upload = useAttachmentUpload();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [side, setSide] = useState<"insights" | "images" | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const composer = useRef<ComposerHandle>(null);

  // The wait loop reads the latest variants and audiences, not the ones it started with.
  const latest = useRef({ variants, audiences: brandAudiences });
  useEffect(() => {
    latest.current = { variants, audiences: brandAudiences };
  }, [variants, brandAudiences]);

  /** A version for a just-created audience waits until Qloo has compiled it. */
  const waitFor = useCallback(async (variantId: string, status: (text: string) => void, stopped: () => boolean) => {
    const deadline = Date.now() + 5 * 60_000;
    while (!stopped() && Date.now() < deadline) {
      const v = latest.current.variants.find((x) => x._id === variantId);
      const a = v?.audienceId ? latest.current.audiences.find((x) => x._id === v.audienceId) : undefined;
      if (v && !v.audienceId) return true;
      if (a?.status === "ready") return true;
      if (a?.status === "failed") throw new Error(`Could not read the ${a.name} audience from Qloo${a.error ? `: ${a.error}` : ""}. Its version was skipped.`);
      if (a) status(`Reading the ${a.name} audience from Qloo${a.progress?.label ? ` · ${a.progress.label}` : ""}`);
      await sleep(700);
    }
    return false;
  }, []);

  // Follow the version being built so the merchant sees it appear.
  const [model, setModel] = usePagesModel();
  const builder = useBuilder({ pageId: (page?._id ?? "") as Page["_id"], build, onStart: setActiveId, waitFor, model });
  const active = variants.find((v) => v._id === activeId) ?? variants[0] ?? null;

  // A freshly created page lands here with ?generate=1: kick off every version once.
  const kicked = useRef(false);
  useEffect(() => {
    if (kicked.current || params.get("generate") !== "1" || !page || variants.length === 0) return;
    kicked.current = true;
    router.replace(`/dashboard/pages/${brand.slug}/${page.slug}`);
    if (variants.every((v) => !v.doc)) void builder.generateAll(variants.map((v) => v._id));
  }, [params, page, variants, router, brand.slug, builder]);

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

  /**
   * An @audience already on the page targets its version; one that is not yet
   * on the page gets a new version, built with this message as the brief.
   */
  async function send({ text, mentions, attachments }: ComposerValue) {
    if (!page) return;
    const fresh = mentions.filter((a) => !page.audienceIds.includes(a._id));
    if (fresh.length) {
      const created = await setAudiences({
        id: page._id,
        audienceIds: [...page.audienceIds, ...fresh.map((a) => a._id)],
      });
      void builder.generateAll(created, text, attachments);
      return;
    }
    const targets = mentions.map((a) => variants.find((v) => v.audienceId === a._id)).filter((v): v is Variant => !!v);
    const ids = targets.length ? targets.map((v) => v._id) : active ? [active._id] : [];
    if (ids.length) void builder.send(ids, text, attachments);
  }

  async function saveSettings(v: Partial<PageSettings>) {
    if (!page) return;
    setFollowId(page._id);
    const { slug } = await updateSettings({
      id: page._id,
      title: v.title,
      slug: v.slug,
      goal: v.goal,
      offer: v.offer ?? "",
      cta: v.ctaLabel && v.ctaHref ? { label: v.ctaLabel, href: v.ctaHref } : undefined,
      imageMode: v.imageMode,
    });
    if (slug !== page.slug) router.replace(`/dashboard/pages/${brand.slug}/${slug}`);
  }

  const label = active ? versionLabel(active) : null;

  return (
    <EditorLayout
      topbar={
        <EditorTopbar
          brand={brand}
          title={page.title}
          badge={<StatusBadge status={page.status} />}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 data-icon="inline-start" /> Settings
              </Button>
              <Button size="sm" onClick={() => setPublishOpen(true)}>
                <Globe data-icon="inline-start" /> {page.status === "published" ? "Published" : "Publish"}
              </Button>
            </>
          }
        />
      }
      chat={
        <BuilderChat
          build={build}
          live={builder.live}
          variants={variants}
          audiences={brandAudiences}
          empty={<ChatWelcome brand={brand} audiences={brandAudiences} onPick={(parts) => composer.current?.set(parts)} />}
          composer={
            <PromptComposer
              ref={composer}
              brandSlug={brand.slug}
              audiences={brandAudiences}
              placeholder={label ? `Ask for a change to the ${label} version…` : "Ask for a change…"}
              hint={builder.queue.length > 0 ? `${builder.queue.length} more version${builder.queue.length === 1 ? "" : "s"} queued` : null}
              busy={builder.busy}
              onStop={builder.stop}
              model={model}
              onModelChange={setModel}
              onUpload={upload}
              disabled={variants.length === 0}
              onSubmit={(v) => void send(v)}
            />
          }
        />
      }
      canvas={
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <VariantTabs
                variants={variants}
                activeId={active?._id ?? null}
                onSelect={setActiveId}
                liveId={builder.live?.variantId}
                queued={builder.queue}
                audiences={brandAudiences}
              />
              <div className="flex items-center gap-1">
                <Button variant={side === "insights" ? "secondary" : "ghost"} size="sm" onClick={() => setSide(side === "insights" ? null : "insights")}>
                  <Lightbulb data-icon="inline-start" /> Insights
                </Button>
                <Button variant={side === "images" ? "secondary" : "ghost"} size="sm" onClick={() => setSide(side === "images" ? null : "images")}>
                  <ImageIcon data-icon="inline-start" /> Images
                </Button>
                <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
                <DeviceToggle value={device} onChange={setDevice} />
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
                className="min-h-0"
                building={builder.live?.variantId === active?._id ? builder.live?.status : null}
                onBuild={() => active && void builder.generate(active._id)}
                busy={builder.busy}
              />
              {side && (
                <div className="scrollbar-thin min-h-0 overflow-y-auto overscroll-contain rounded-xl border bg-background p-4 shadow-xs">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">{side === "insights" ? `What shaped the ${label ?? ""} version` : "Swap an image"}</h2>
                    <Button variant="ghost" size="icon-xs" aria-label="Close panel" onClick={() => setSide(null)}>
                      <X />
                    </Button>
                  </div>
                  {side === "insights" ? (
                    <WhyPanel variant={active} onPick={scrollPreviewTo} />
                  ) : (
                    <>
                      {active && !active.doc && <p className="mb-3 text-xs text-muted-foreground">Build this version first.</p>}
                      <ImageTool
                        brandId={brand._id}
                        variant={active}
                        defaultMode={page.brief.imageMode}
                        disabled={builder.busy}
                        onApply={(msg) => active && void builder.send(active._id, msg)}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} brandSlug={brand.slug} page={page} variants={variants} audiences={bundle?.audiences ?? []} />
          <PageSettingsSheet
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            brandSlug={brand.slug}
            initial={{
              title: page.title,
              slug: page.slug,
              goal: page.brief.goal,
              offer: page.brief.offer ?? "",
              ctaLabel: page.brief.cta.label,
              ctaHref: page.brief.cta.href,
              imageMode: page.brief.imageMode,
            }}
            onSave={saveSettings}
          />
        </>
      }
    />
  );
}
