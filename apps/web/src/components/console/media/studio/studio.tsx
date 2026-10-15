"use client";

// The Media studio: every creative in a campaign, edited by hand or by asking.
// Left, the creatives, library, reasons, history and jobs; centre, the canvas
// (WYSIWYG with the export renderer) and, for video, the timeline; right, the
// inspector for what is selected and the chat. Studio buttons call the models
// directly with an estimate on each, so only chat turns use the LLM.

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Download, Film, Image as ImageIcon, Loader2, QrCode, Redo2, RectangleHorizontal, Sparkles, SquareMousePointer, Type, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import { TIERS, docDuration, isTier, newId, type MediaBrief, type MediaDoc, type MediaKit } from "@slice/backend/convex/mediaTypes";
import { usd } from "@/lib/media/kit";
import { usePagesModel } from "@/lib/pages/models";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, Meter } from "@/components/console/primitives";
import { CopyButton } from "@/components/console/setup/atoms";
import { Tab, TabList, TabPanel, Tabs } from "@/components/console/form";
import { useAppSurface } from "@/components/console/pages/builder/editor-shell";
import type { ChatComposerHandle } from "@/components/console/email/editor/chat-composer";
import { postJson } from "@/lib/pages/stream";
import { KitFonts, usePlayback } from "../stage";
import { EditCanvas } from "./canvas";
import { MediaChat } from "./chat";
import { StudioContext, useStudio, type ChatMessage, type Selection, type StudioEnv } from "./context";
import { committed } from "./costs";
import { Inspector } from "./inspector";
import { newLayer, type NewLayerKind } from "./layers";
import { CreativesTab, HistoryTab, JobsTab, LibraryTab, WhyTab } from "./rail";
import { Timeline } from "./timeline";
import { useCreativeDoc } from "./use-doc";
import { mediaAction, useMediaAgent } from "./use-media-agent";

export function MediaStudioRoute() {
  const { campaign } = useParams<{ campaign: string }>();
  return <MediaStudio key={campaign} campaignId={campaign as Id<"mediaCampaigns">} />;
}

function MediaStudio({ campaignId }: { campaignId: Id<"mediaCampaigns"> }) {
  useAppSurface();
  const data = useQuery(api.media.get, { id: campaignId });
  if (data === undefined)
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (data === null)
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-canvas text-center">
        <h1 className="text-lg font-semibold">This campaign is gone</h1>
        <p className="max-w-sm text-sm text-muted-foreground">It may have been deleted, or the link is wrong.</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/media" />}>
          All campaigns
        </Button>
      </div>
    );
  return <Workspace campaignId={campaignId} data={data} />;
}

type Data = { campaign: Doc<"mediaCampaigns">; creatives: Doc<"mediaCreatives">[]; assets: Doc<"mediaAssets">[]; jobs: Doc<"mediaJobs">[]; messages: unknown[] };

const removeOnce = (list: string[], label: string) => {
  const i = list.indexOf(label);
  return i < 0 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
};

const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true']");

function Workspace({ campaignId, data }: { campaignId: Id<"mediaCampaigns">; data: Data }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { campaign, creatives, assets, jobs } = data;
  const messages = data.messages as ChatMessage[];
  const kit = campaign.kit as MediaKit | undefined;

  const [creativeId, setCreativeId] = useState<Id<"mediaCreatives"> | null>(null);
  const creative = creatives.find((c) => c._id === creativeId) ?? creatives[0] ?? null;
  const editor = useCreativeDoc(creative);
  const doc = editor.doc;
  const playback = usePlayback(doc?.kind === "video" ? docDuration(doc) : 0);
  const [selection, select] = useState<Selection>({ kind: "none" });
  const [muted, setMuted] = useState(false);
  const autostart = params.get("generate") === "1";
  const [right, setRight] = useState<"design" | "chat">(autostart && !creatives.length ? "chat" : "design");
  const [pending, setPending] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const composer = useRef<ChatComposerHandle | null>(null);
  const [model] = usePagesModel();
  const agent = useMediaAgent({ campaignId, history: messages.map((m) => ({ role: m.role, text: m.text })), model, beforeTurn: editor.flush });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.tone === "bad" ? 9000 : 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // From the wizard: make the first round of creatives once. Deferred a tick so
  // StrictMode's mount/unmount/mount (which aborts the agent's request) cannot
  // cancel it.
  const started = useRef(false);
  useEffect(() => {
    if (!autostart || started.current) return;
    const t = setTimeout(() => {
      started.current = true;
      router.replace(pathname);
      if (!creatives.length) void agent.generate();
    }, 0);
    return () => clearTimeout(t);
  }, [autostart, creatives.length, agent, pathname, router]);

  const setCreative = (id: Id<"mediaCreatives">) => {
    if (id === creative?._id) return;
    void editor.flush();
    setCreativeId(id);
    select({ kind: "none" });
    playback.pause();
    playback.seek(0);
  };

  const act: StudioEnv["act"] = async (action, args, label) => {
    setPending((p) => [...p, label]);
    try {
      await editor.flush();
      const r = await mediaAction(campaignId, action, args);
      if (!r.ok) {
        setNotice({ tone: "bad", text: r.error ?? "That did not work" });
        return false;
      }
      setNotice({ tone: "ok", text: r.estimate ? `Started. About ${usd(r.estimate)}; it lands on the canvas when ready.` : "Done" });
      return true;
    } finally {
      setPending((p) => removeOnce(p, label));
    }
  };

  const ask: StudioEnv["ask"] = (block) => {
    setRight("chat");
    composer.current?.addBlock(block);
    requestAnimationFrame(() => composer.current?.focus());
  };

  const selectedLayers = selection.kind === "layers" && doc ? selection.ids.filter((id) => doc.layers.some((l) => l.id === id)) : [];

  // Keyboard: delete, nudge, duplicate, undo/redo, play.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || !doc) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        editor.redo();
        return;
      }
      if (e.key === "Escape") {
        select({ kind: "none" });
        return;
      }
      if (e.key === " " && doc.kind === "video") {
        e.preventDefault();
        playback.toggle();
        return;
      }
      const ids = new Set(selectedLayers.filter((id) => !doc.layers.find((l) => l.id === id)?.locked));
      if ((e.key === "Delete" || e.key === "Backspace") && selection.kind !== "none") {
        e.preventDefault();
        if (ids.size) editor.update((d) => ({ ...d, layers: d.layers.filter((l) => !ids.has(l.id)) }));
        else if (selection.kind === "clip") editor.update((d) => ({ ...d, video: (d.video ?? []).filter((c) => c.id !== selection.id) }));
        else if (selection.kind === "audio") editor.update((d) => ({ ...d, audio: (d.audio ?? []).filter((a) => a.id !== selection.id) }));
        select({ kind: "none" });
        return;
      }
      if (!ids.size) return;
      if (mod && key === "d") {
        e.preventDefault();
        const copies = doc.layers.filter((l) => ids.has(l.id)).map((l) => ({ ...l, id: newId("l"), x: l.x + 24, y: l.y + 24 }));
        editor.update((d) => ({ ...d, layers: [...d.layers, ...copies] }));
        select({ kind: "layers", ids: copies.map((l) => l.id) });
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (delta) {
        e.preventDefault();
        editor.update((d) => ({ ...d, layers: d.layers.map((l) => (ids.has(l.id) ? { ...l, x: l.x + delta[0], y: l.y + delta[1] } : l)) }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const env: StudioEnv = {
    campaignId,
    campaign,
    kit,
    creatives,
    assets,
    jobs,
    messages,
    creative,
    setCreative,
    doc,
    editor,
    selection,
    select,
    playback,
    agent,
    composer,
    act,
    pending,
    ask,
  };

  const add = (kind: NewLayerKind) => {
    if (!doc) return;
    const l = newLayer(kind, doc, kit, campaign.brief as MediaBrief | undefined);
    if (!l) {
      setNotice({ tone: "bad", text: "Add a link to the brief first; the QR code points there." });
      return;
    }
    editor.update((d) => ({ ...d, layers: [...d.layers, l] }));
    select({ kind: "layers", ids: [l.id] });
  };

  return (
    <StudioContext.Provider value={env}>
      <KitFonts kit={kit} />
      <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-white">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-72 shrink-0 flex-col border-r">
            <Tabs defaultValue="creatives" className="flex min-h-0 flex-1 flex-col gap-0">
              <TabList className="shrink-0 px-2">
                <Tab value="creatives">Creatives</Tab>
                <Tab value="library">Library</Tab>
                <Tab value="why">Why</Tab>
                <Tab value="history">History</Tab>
                <Tab value="jobs">Jobs</Tab>
              </TabList>
              <TabPanel value="creatives" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                <CreativesTab />
              </TabPanel>
              <TabPanel value="library" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                <LibraryTab />
              </TabPanel>
              <TabPanel value="why" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                <WhyTab />
              </TabPanel>
              <TabPanel value="history" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                <HistoryTab />
              </TabPanel>
              <TabPanel value="jobs" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                <JobsTab />
              </TabPanel>
            </Tabs>
          </aside>

          <main className="relative flex min-w-0 flex-1 flex-col bg-neutral-100">
            {doc && creative ? (
              <>
                <div className="flex h-11 shrink-0 items-center gap-1 border-b bg-white px-3">
                  <ToolButton label="Headline" onClick={() => add("headline")}>
                    <Type />
                  </ToolButton>
                  <ToolButton label="Text" onClick={() => add("body")}>
                    <Type className="scale-75" />
                  </ToolButton>
                  <ToolButton label="Button" onClick={() => add("cta")}>
                    <SquareMousePointer />
                  </ToolButton>
                  <ToolButton label="Shape" onClick={() => add("shape")}>
                    <RectangleHorizontal />
                  </ToolButton>
                  <ToolButton label="Logo" onClick={() => add("logo")}>
                    <ImageIcon />
                  </ToolButton>
                  <ToolButton label="QR code" onClick={() => add("qr")}>
                    <QrCode />
                  </ToolButton>
                  <span className="mx-1.5 h-5 w-px bg-border" />
                  <ToolButton label="Undo" onClick={editor.undo} disabled={!editor.canUndo}>
                    <Undo2 />
                  </ToolButton>
                  <ToolButton label="Redo" onClick={editor.redo} disabled={!editor.canRedo}>
                    <Redo2 />
                  </ToolButton>
                  <span className="ml-auto text-xs text-muted-foreground">{editor.error ? <span className="text-destructive">Not saved: {editor.error}</span> : editor.saving || editor.dirty ? "Saving…" : `Saved · v${creative.version}`}</span>
                </div>
                <div className="relative min-h-0 flex-1">
                  <EditCanvas
                    doc={doc}
                    kit={kit}
                    time={playback.time}
                    playing={playback.playing}
                    muted={muted}
                    selected={selectedLayers}
                    onSelect={(ids) => select(ids.length ? { kind: "layers", ids } : { kind: "none" })}
                    editor={editor}
                  />
                </div>
                {doc.kind === "video" && <Timeline muted={muted} onMuted={setMuted} />}
              </>
            ) : (
              <EmptyCanvas />
            )}
            {notice && (
              <div className={cn("absolute bottom-4 left-1/2 z-30 max-w-md -translate-x-1/2 rounded-lg px-3.5 py-2 text-sm shadow-lg", notice.tone === "bad" ? "bg-destructive text-white" : "bg-neutral-900 text-white")} role="status">
                {notice.text}
              </div>
            )}
          </main>

          <aside className="flex w-[360px] shrink-0 flex-col border-l">
            <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
              {(["design", "chat"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setRight(t)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground", right === t && "bg-neutral-100 text-foreground")}>
                  {t === "design" ? "Design" : "AI Chat"}
                  {t === "chat" && agent.busy && <Loader2 className="ml-1.5 inline size-3 animate-spin" />}
                </button>
              ))}
            </div>
            <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto", right !== "design" && "hidden")}>
              <Inspector />
            </div>
            <div className={cn("min-h-0 flex-1", right !== "chat" && "hidden")}>
              <MediaChat />
            </div>
          </aside>
        </div>
      </div>
    </StudioContext.Provider>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:size-4">
      {children}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function EmptyCanvas() {
  const { agent, campaign } = useStudio();
  const tier = isTier(campaign.tier) ? TIERS[campaign.tier] : TIERS.smart;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm">{campaign.kind === "poster" ? <ImageIcon className="size-5" /> : <Film className="size-5" />}</div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{agent.busy ? "Making your creatives" : "No creatives yet"}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {agent.busy ? "Follow along in the chat. Posters appear here first; video shots land as they finish." : `Slice reads each audience's taste with Qloo, then designs every format. ${tier.label} tier, up to ${usd(campaign.budget)}.`}
        </p>
      </div>
      {!agent.busy && (
        <Button onClick={() => void agent.generate()}>
          <Sparkles /> Generate creatives
        </Button>
      )}
    </div>
  );
}

/* Top bar ------------------------------------------------------------------------- */

function TopBar() {
  const { campaign, jobs, creative, editor, agent, campaignId } = useStudio();
  const update = useMutation(api.media.update);
  const [name, setName] = useState(campaign.name);
  const [seen, setSeen] = useState(campaign.name);
  const [focused, setFocused] = useState(false);
  if (!focused && seen !== campaign.name) {
    setSeen(campaign.name);
    setName(campaign.name);
  }
  const running = committed(jobs);
  const used = campaign.spend + running;
  const ratio = campaign.budget > 0 ? Math.min(1, used / campaign.budget) : 0;
  const [budget, setBudget] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const fresh = creative?.export && creative.export.version === creative.version ? creative.export : null;

  const commitBudget = () => {
    const n = Number(budget);
    if (budget !== null && Number.isFinite(n) && n > 0) void update({ id: campaignId, budget: n });
    setBudget(null);
  };

  const exportNow = async () => {
    if (!creative) return;
    setExporting(true);
    setExportError(null);
    try {
      await editor.flush();
      const r = await postJson<{ ok: boolean; error?: string }>("/api/media/export", { campaignId, creativeId: creative._id });
      if (!r.ok) setExportError(r.error ?? "Export failed");
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b px-3">
      <Button variant="ghost" size="sm" className="gap-1.5 text-neutral-600" nativeButton={false} render={<Link href="/dashboard/media" />}>
        <ArrowLeft /> Media
      </Button>
      <input
        value={name}
        aria-label="Campaign name"
        onChange={(e) => setName(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          const n = name.trim();
          if (!n) setName(campaign.name);
          else if (n !== campaign.name) void update({ id: campaignId, name: n });
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="min-w-0 max-w-64 rounded-md px-2 py-1 text-sm font-semibold outline-none hover:bg-neutral-50 focus:ring-1 focus:ring-sky-500"
      />
      <select
        aria-label="Cost tier"
        value={campaign.tier}
        onChange={(e) => void update({ id: campaignId, tier: e.target.value })}
        title={isTier(campaign.tier) ? TIERS[campaign.tier].blurb : undefined}
        className="h-7 rounded-md bg-neutral-100 px-2 text-xs font-medium outline-none"
      >
        {(Object.keys(TIERS) as (keyof typeof TIERS)[]).map((t) => (
          <option key={t} value={t}>
            {TIERS[t].label}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex w-48 flex-col gap-1" title={running ? `${usd(running)} on jobs still running` : undefined}>
          <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {usd(used)} {running > 0 && <span>({usd(running)} running)</span>}
            </span>
            {budget === null ? (
              <button type="button" onClick={() => setBudget(String(campaign.budget))} className="tabular-nums hover:text-foreground" title="Change the budget cap">
                of {usd(campaign.budget)}
              </button>
            ) : (
              <input
                autoFocus
                type="number"
                min={0.5}
                max={500}
                step={0.5}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                onBlur={commitBudget}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitBudget();
                  if (e.key === "Escape") setBudget(null);
                }}
                className="w-16 rounded bg-neutral-100 px-1 text-right outline-none"
              />
            )}
          </div>
          <Meter value={ratio} tone={ratio > 0.9 ? "warn" : "ink"} />
        </div>
        <Button variant="outline" size="sm" disabled={agent.busy} onClick={() => void agent.generate()}>
          {agent.busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate
        </Button>
        {fresh && (
          <>
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={fresh.url} target="_blank" rel="noopener noreferrer" />}>
              <Download /> Download
            </Button>
            <CopyButton value={fresh.url} label="Copy link" />
          </>
        )}
        <Button size="sm" disabled={!creative || exporting || creative.status === "rendering"} onClick={() => void exportNow()} title={exportError ?? undefined}>
          {exporting || creative?.status === "rendering" ? <Loader2 className="animate-spin" /> : null}
          {fresh ? "Export again" : (creative?.doc as MediaDoc | undefined)?.kind === "video" ? "Export MP4" : "Export"}
        </Button>
        {exportError && <Badge tone="bad">{exportError.slice(0, 60)}</Badge>}
      </div>
    </header>
  );
}
