"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Settings2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { usePagesModel } from "@/lib/pages/models";
import type { Audience } from "@/lib/pages/types";
import { Button } from "@/components/ui/button";
import { useBrand } from "../brand-context";
import { BuilderChat } from "./chat";
import { useAttachmentUpload } from "./attachments";
import { PromptComposer, type ComposerHandle, type ComposerValue } from "./composer";
import { CanvasPlaceholder, ChatWelcome, EditorLayout, EditorTopbar } from "./editor-shell";
import { PageSettingsSheet, type PageSettings } from "./settings-sheet";
import { useStartPage } from "./start-page";
import type { LiveTurn } from "./use-builder";

/**
 * /dashboard/pages/[brand]/new: an empty editor. The first prompt is planned
 * by the agent (title, slug, goal, offer, CTA, items and who the page is for,
 * including new audiences described in words), the page is created, and the
 * builder takes over on the page's own route to build it.
 */
export function NewPageBuilder() {
  const brand = useBrand();
  const router = useRouter();
  const audiences = (useQuery(api.pagesAudiences.list, { brandId: brand._id }) ?? []) as Audience[];
  const startPage = useStartPage(brand);
  const composer = useRef<ComposerHandle>(null);
  const [settings, setSettings] = useState<Partial<PageSettings>>({ imageMode: "pexels" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [turn, setTurn] = useState<LiveTurn | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [model, setModel] = usePagesModel();

  const status = (text: string) => setTurn((t) => (t ? { ...t, status: text } : t));

  const upload = useAttachmentUpload();
  async function start({ text, mentions, attachments }: ComposerValue) {
    setTurn({ variantId: "", kind: "edit", status: "Reading your brief", spans: [], steps: [], text: "", error: null, prompt: text });
    try {
      const { slug } = await startPage({
        text,
        audienceIds: mentions.map((a) => a._id),
        attachments,
        settings,
        model,
        onStatus: status,
        onPlan: (pageTitle, spans) => {
          setTitle(pageTitle);
          setTurn((t) => (t ? { ...t, spans } : t));
        },
      });
      status("Starting the builder");
      router.replace(`/dashboard/pages/${brand.slug}/${slug}?generate=1`);
    } catch (err) {
      setTurn((t) => (t ? { ...t, status: null, error: String((err as Error).message ?? err).replace(/^Error: /, "") } : t));
    }
  }

  const busy = !!turn && turn.status !== null;

  return (
    <EditorLayout
      topbar={
        <EditorTopbar
          brand={brand}
          title={title ?? (settings.title?.trim() || "New page")}
          actions={
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 data-icon="inline-start" /> Settings
            </Button>
          }
        />
      }
      chat={
        <BuilderChat
          build={null}
          live={turn}
          audiences={audiences}
          empty={<ChatWelcome brand={brand} audiences={audiences} onPick={(parts) => composer.current?.set(parts)} />}
          composer={
            <PromptComposer
              ref={composer}
              autoFocus
              brandSlug={brand.slug}
              audiences={audiences}
              placeholder="Describe the page you want…"
              disabled={busy}
              model={model}
              onModelChange={setModel}
              onUpload={upload}
              onSubmit={(v) => void start(v)}
            />
          }
        />
      }
      canvas={
        <>
          <CanvasPlaceholder brand={brand} status={turn?.status} title={title ?? undefined} />
          <PageSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} brandSlug={brand.slug} initial={settings} draft onSave={(v) => setSettings(v)} />
        </>
      }
    />
  );
}
