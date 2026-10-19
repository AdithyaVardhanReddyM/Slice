"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Globe, Image as ImageIcon, Lightbulb, Settings2, SquareDashedMousePointer, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { briefOf, type Audience, type Build, type BrandItem, type Page, type Variant } from "@/lib/pages/types";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
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
import { AudienceStrip, DeviceToggle, PreviewFrame, type Device } from "./preview";
import { PublishDialog } from "./publish-dialog";
import { PageSettingsSheet, type PageSettings } from "./settings-sheet";
import { useStartPage } from "./start-page";
import { usePagesModel } from "@/lib/pages/models";
import { isHtmlDoc } from "@slice/backend/convex/pagesTypes";
import { useBuilder } from "./use-builder";
import { ModeSwitch, VisualEditor, type EditorMode } from "./visual/visual-editor";
import { flash, useElementPicker } from "./visual/picker";

interface PageBundle {
  page: Page;
  variants: Variant[];
  audiences: Audience[];
}

/** The page's one version: `defaultVariantId`, else the only row. */
const versionOf = (page: Page, variants: Variant[]) => variants.find((v) => v._id === page.defaultVariantId) ?? variants[0] ?? null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** /dashboard/pages/[brand]/[page]: keyed by the slug so opening another page starts a fresh editor. */
export function PageBuilder() {
  const { page } = useParams<{ page: string }>();
  return <PageEditor key={page} />;
}

/**
 * The editor for one page: the chat on the left, the page's single version on
 * the right. A page is built for its audiences (combined) or for everyone; when
 * the merchant asks for a page for another audience, the agent hands off and a
 * new page is planned, created and opened here.
 */
function PageEditor() {
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
  const version = useMemo(() => (page && bundle ? versionOf(page, bundle.variants) : null), [page, bundle]);
  const pageAudiences = useMemo(
    () => (page?.audienceIds ?? []).map((id) => brandAudiences.find((a) => a._id === id) ?? bundle?.audiences.find((a) => a._id === id)).filter((a): a is Audience => !!a),
    [page, brandAudiences, bundle],
  );
  const updateSettings = useMutation(api.pages.updateSettings);
  const upload = useAttachmentUpload();
  const startPage = useStartPage(brand);

  const [device, setDevice] = useState<Device>("desktop");
  const [side, setSide] = useState<"images" | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<EditorMode>("chat");
  // "Select an element": the preview picks an element for the composer instead of being a page.
  const [picking, setPicking] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const composer = useRef<ComposerHandle>(null);

  // The wait loop reads the latest page and audiences, not the ones it started with.
  const latest = useRef({ page, audiences: brandAudiences });
  useEffect(() => {
    latest.current = { page, audiences: brandAudiences };
  }, [page, brandAudiences]);

  /** A page for just-created audiences waits until Qloo has compiled them. */
  const waitFor = useCallback(async (_variantId: string, status: (text: string) => void, stopped: () => boolean) => {
    const deadline = Date.now() + 5 * 60_000;
    while (!stopped() && Date.now() < deadline) {
      const ids = latest.current.page?.audienceIds ?? [];
      const auds = ids.map((id) => latest.current.audiences.find((x) => x._id === id));
      const failed = auds.find((a) => a?.status === "failed");
      if (failed) throw new Error(`Could not read the ${failed.name} audience from Qloo${failed.error ? `: ${failed.error}` : ""}.`);
      const pending = auds.filter((a) => a?.status !== "ready");
      if (pending.length === 0) return true;
      const a = pending.find((x) => x);
      status(a ? `Reading the ${a.name} audience from Qloo${a.progress?.label ? `: ${a.progress.label}` : ""}` : "Waiting for the audience");
      await sleep(700);
    }
    return false;
  }, []);

  const [model, setModel] = usePagesModel();
  const items = useMemo(() => ((briefOf(brand)?.items ?? []) as BrandItem[]), [brand]);

  /** The agent asked for a page for another audience: plan it, create it, open it (it builds there). */
  const onNewPage = useCallback(
    async ({ request, audienceIds }: { request: string; audienceIds: string[] }, status: (text: string) => void) => {
      const current = latest.current.page;
      const { slug } = await startPage({
        text: request,
        audienceIds,
        model,
        source: current ? { id: current._id as Id<"pages">, brief: current.brief } : undefined,
        onStatus: status,
        onPlan: (title) => status(`Setting up ${title}`),
      });
      status("Opening the new page");
      router.push(`/dashboard/pages/${brand.slug}/${slug}?generate=1`);
    },
    [startPage, router, brand.slug, model],
  );

  const builder = useBuilder({ pageId: (page?._id ?? "") as Page["_id"], build, waitFor, model, onNewPage });

  const sectionNames = useMemo(() => new Map(isHtmlDoc(version?.doc) ? version.doc.sections.map((s) => [s.id, s.label] as [string, string]) : []), [version]);
  // Picking needs the page on screen, not the build canvas.
  const canPick = !!version?.doc && !builder.busy && mode === "chat";
  useElementPicker({
    frame,
    frameKey: `${version?._id}-${version?.version}-${builder.docVersion}`,
    active: picking && canPick,
    names: sectionNames,
    onPick: (picked, el) => {
      flash(el);
      setPicking(false);
      composer.current?.addElement(picked);
    },
    onCancel: () => setPicking(false),
  });

  // A freshly created page lands here with ?generate=1: build it once (after its audiences compile).
  const kicked = useRef(false);
  useEffect(() => {
    if (kicked.current || params.get("generate") !== "1" || !page || !version) return;
    kicked.current = true;
    router.replace(`/dashboard/pages/${brand.slug}/${page.slug}`);
    if (!version.doc) void builder.generateAll([version._id]);
  }, [params, page, version, router, brand.slug, builder]);

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

  /** Every message edits this page; the agent starts a new page when it asks for another audience. */
  function send({ text, mentions, attachments, elements }: ComposerValue) {
    if (!version) return;
    setPicking(false);
    void builder.send(version._id, text, attachments, mentions.map((a) => ({ id: a._id, name: a.name })), elements);
  }

  // Hand editing needs a page written as HTML, and no builder turn running on it.
  const editBlocked = !version?.doc ? "Build the page first" : !isHtmlDoc(version.doc) ? "Rebuild this page to edit it by hand" : builder.busy ? "The builder is working on the page" : null;

  if (mode === "edit" && version && isHtmlDoc(version.doc)) {
    return <VisualEditor key={version._id} brand={brand} page={page} version={version} onExit={() => setMode("chat")} />;
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

  return (
    <EditorLayout
      topbar={
        <EditorTopbar
          brand={brand}
          title={page.title}
          badge={<StatusBadge status={page.status} />}
          center={<ModeSwitch mode="chat" onChange={setMode} editDisabled={editBlocked} />}
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
          audiences={brandAudiences}
          items={items}
          onAnswer={({ text }) => version && void builder.send(version._id, text)}
          empty={<ChatWelcome brand={brand} audiences={brandAudiences} onPick={(parts) => composer.current?.set(parts)} />}
          composer={
            <PromptComposer
              ref={composer}
              brandSlug={brand.slug}
              audiences={brandAudiences}
              placeholder="Ask for a change, or a page for another audience…"
              busy={builder.busy}
              onStop={builder.stop}
              model={model}
              onModelChange={setModel}
              onUpload={upload}
              disabled={!version}
              onPickElement={() => setPicking((p) => !p)}
              picking={picking && canPick}
              pickBlocked={!version?.doc ? "Available once the page is built" : builder.busy ? "Available when the builder is done" : null}
              onSubmit={(v) => void send(v)}
            />
          }
        />
      }
      canvas={
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AudienceStrip audiences={pageAudiences} working={!!builder.live && builder.live.status !== null && !builder.live.handoff} />
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/dashboard/pages/${brand.slug}/${page.slug}/insights`} />}>
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
                brand={brand}
                pageSlug={page.slug}
                variant={version}
                device={device}
                reloadKey={builder.docVersion}
                className="min-h-0"
                live={builder.live && !builder.live.handoff ? builder.live : null}
                onBuild={() => version && void builder.generate(version._id)}
                busy={builder.busy}
                overlay={
                  picking && canPick ? (
                    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
                      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background/95 py-1 pr-1 pl-3 text-xs shadow-md backdrop-blur">
                        <SquareDashedMousePointer className="size-3.5 text-blue-700" />
                        <span>Click an element to add it to your message</span>
                        <Button size="xs" variant="ghost" onClick={() => setPicking(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null
                }
              />
              {side && (
                <div className="scrollbar-thin min-h-0 overflow-y-auto overscroll-contain rounded-xl border bg-background p-4 shadow-xs">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">Swap an image</h2>
                    <Button variant="ghost" size="icon-xs" aria-label="Close panel" onClick={() => setSide(null)}>
                      <X />
                    </Button>
                  </div>
                  {version && !version.doc && <p className="mb-3 text-xs text-muted-foreground">Build the page first.</p>}
                  <ImageTool
                    brandId={brand._id}
                    variant={version}
                    defaultMode={page.brief.imageMode}
                    disabled={builder.busy}
                    onApply={(msg) => version && void builder.send(version._id, msg)}
                  />
                </div>
              )}
            </div>
          </div>
          <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} brandSlug={brand.slug} page={page} version={version} audiences={pageAudiences} />
          <PageSettingsSheet
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            brandSlug={brand.slug}
            pageId={page._id}
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
