"use client";

// A campaign's workspace: the infinite canvas with everything made for it, the
// toolbar, the prompt bar, the sidebar (chat and assets) and the focus editors. The prompt
// bar starts big at the bottom of the canvas; once a conversation is going it
// glides into the sidebar and the chat continues above it. Closing the
// sidebar sends it back.

import { useMutation, useQuery } from "convex/react";
import { Loader2, MessagesSquare, PanelLeftClose } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { AUDIO_NODE, boardWidth, type MediaKit } from "@slice/backend/convex/mediaTypes";
import { postJson } from "@/lib/pages/stream";
import { usePagesModel } from "@/lib/pages/models";
import { useMediaUpload } from "@/lib/media/upload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppSurface } from "@/components/console/pages/builder/editor-shell";
import { FocusEditor } from "../focus/focus";
import { PromptBar, type PromptBarHandle } from "../prompt/prompt-bar";
import { usePromptPicks } from "../prompt/options";
import { AssetsPanel, MEDIA_DRAG, measureImage, type DragItem } from "../sidebar/assets";
import { ChatThread } from "../sidebar/chat";
import { KitFonts } from "../stage";
import { Board, type BoardHandle, type Viewport } from "./board";
import { EmptyHero, TopBar, ZoomControl } from "./chrome";
import { CanvasContext, type CanvasEnv, type CanvasTool, type ChatMessage, type SidebarTab } from "./context";
import { bounds, buildNodes, keyOf, openSpot, refOf, type BoardNode, type CampaignData, type NodeKey } from "./model";
import { NodeToolbar } from "./node-toolbar";
import { NodeView } from "./nodes";
import { CanvasToolbar, TOOLBAR_ROOM } from "./toolbar";
import { mediaAction, useMediaAgent } from "./use-media-agent";

const SIDEBAR_W = 400;

export function MediaCanvasRoute() {
  const { campaign } = useParams<{ campaign: string }>();
  return <MediaCanvas key={campaign} campaignId={campaign as Id<"mediaCampaigns">} />;
}

function MediaCanvas({ campaignId }: { campaignId: Id<"mediaCampaigns"> }) {
  useAppSurface();
  const data = useQuery(api.media.get, { id: campaignId });
  if (data === undefined)
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#f6f5f3]">
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
  return <Workspace campaignId={campaignId} data={data as CampaignData} />;
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']");

async function saveFile(url: string, name: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav" };

function Workspace({ campaignId, data }: { campaignId: Id<"mediaCampaigns">; data: CampaignData }) {
  const { campaign, brand, creatives, assets, jobs } = data;
  const messages = data.messages as ChatMessage[];
  const kit = (campaign.kit ?? brand?.kit) as MediaKit | undefined;
  const nodes = useMemo(() => buildNodes({ creatives, assets, jobs }), [creatives, assets, jobs]);

  const [selected, setSelected] = useState<NodeKey[]>([]);
  const select = useCallback((keys: NodeKey[]) => setSelected(keys), []);
  const live = selected.filter((k) => nodes.some((n) => n.key === k));
  const [focus, setFocus] = useState<NodeKey | null>(null);
  const [sidebar, setSidebarState] = useState<{ open: boolean; tab: SidebarTab }>({ open: messages.length > 0, tab: "chat" });
  const setSidebar = useCallback((s: { open: boolean; tab?: SidebarTab }) => setSidebarState((cur) => ({ open: s.open, tab: s.tab ?? cur.tab })), []);
  const [audienceId, setAudienceId] = useState("all");
  const [pending, setPending] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string; at: number } | null>(null);
  const [confirm, setConfirm] = useState<NodeKey[] | null>(null);
  const [playing, setPlaying] = useState<NodeKey | null>(null);
  const [zoom, setZoom] = useState(campaign.viewport?.zoom ?? 1);
  const [tool, setTool] = useState<CanvasTool>("select");
  const board = useRef<BoardHandle>(null);
  const bar = useRef<PromptBarHandle>(null);
  const area = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [areaW, setAreaW] = useState(0);
  const [dockH, setDockH] = useState(120);
  const [model] = usePagesModel();
  const [picks] = usePromptPicks();
  const agent = useMediaAgent({ campaignId, history: messages.map((m) => ({ role: m.role, text: m.text })), model });

  const moveNodes = useMutation(api.media.moveNodes).withOptimisticUpdate((store, { id, nodes: moved }) => {
    const cur = store.getQuery(api.media.get, { id });
    if (!cur) return;
    const at = new Map(moved.map((m) => [m.id, m]));
    const place = <T extends { _id: string; board?: { x: number; y: number; w: number } }>(row: T): T => {
      const m = at.get(row._id);
      return m && row.board ? { ...row, board: { x: m.x, y: m.y, w: m.w ?? row.board.w } } : m ? { ...row, board: { x: m.x, y: m.y, w: m.w ?? 320 } } : row;
    };
    store.setQuery(api.media.get, { id }, { ...cur, creatives: cur.creatives.map(place), assets: cur.assets.map(place), jobs: cur.jobs.map(place) });
  });
  const placeAsset = useMutation(api.media.placeAsset);
  const addAsset = useMutation(api.media.addAsset);
  const removeCreative = useMutation(api.media.removeCreative);
  const dismissJob = useMutation(api.media.dismissJob);
  const setViewport = useMutation(api.media.setViewport);
  const upload = useMediaUpload(campaignId);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const read = () => setAreaW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = dock.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDockH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.tone === "bad" ? 8000 : 3500);
    return () => clearTimeout(t);
  }, [notice]);
  const notify = useCallback((text: string, tone: "ok" | "bad" = "ok") => setNotice({ text, tone, at: Date.now() }), []);

  const docked = sidebar.open;
  // Wholly in view, clear of the sidebar, the toolbar and the prompt bar.
  const inView = useCallback(
    (n: Pick<BoardNode, "x" | "y" | "w" | "h">) => {
      const v = board.current?.viewport();
      const el = area.current;
      if (!v || !el) return true;
      return n.x * v.zoom + v.x >= (docked ? SIDEBAR_W : 0) + TOOLBAR_ROOM && (n.x + n.w) * v.zoom + v.x <= el.clientWidth && n.y * v.zoom + v.y >= 0 && (n.y + n.h) * v.zoom + v.y <= el.clientHeight - (docked ? 0 : dockH + 24);
    },
    [docked, dockH],
  );

  const act: CanvasEnv["act"] = useCallback(
    async (action, args, label) => {
      setPending((p) => [...p, label]);
      try {
        const r = await mediaAction(campaignId, action, args);
        if (!r.ok) {
          notify(r.error ?? "That did not work", "bad");
          return false;
        }
        notify(r.estimate ? `Started, about ${r.estimate < 1 ? `$${r.estimate.toFixed(2)}` : `$${r.estimate.toFixed(2)}`}. It appears on the canvas when ready.` : "Done");
        return true;
      } finally {
        setPending((p) => {
          const i = p.indexOf(label);
          return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
        });
      }
    },
    [campaignId, notify],
  );

  const openChat = () => setSidebar({ open: true, tab: "chat" });

  const sendPrompt: CanvasEnv["sendPrompt"] = (text, overrides) => {
    const refs = nodes.filter((n) => live.includes(n.key) && n.ref.kind !== "job").map((n) => ({ kind: n.ref.kind as "creative" | "asset", id: n.ref.id }));
    void agent.prompt(text, [], { output: overrides?.output ?? picks.output, imageModel: picks.imageModel, videoModel: picks.videoModel, musicModel: picks.musicModel, aspect: picks.aspect, count: 1, audienceId, check: picks.check }, refs);
    openChat();
  };

  const remove: CanvasEnv["remove"] = (keys) => {
    const list = nodes.filter((n) => keys.includes(n.key));
    if (list.some((n) => n.ref.kind === "creative")) {
      setConfirm(keys);
      return;
    }
    for (const n of list) {
      if (n.ref.kind === "asset") void placeAsset({ id: n.ref.id as Id<"mediaAssets">, board: null });
      if (n.ref.kind === "job") void dismissJob({ id: n.ref.id as Id<"mediaJobs"> });
    }
    setSelected([]);
    if (list.some((n) => n.ref.kind === "asset")) notify("Taken off the canvas. It stays in Assets.");
  };

  const confirmRemove = () => {
    for (const n of nodes.filter((x) => confirm?.includes(x.key))) {
      if (n.ref.kind === "creative") void removeCreative({ id: n.ref.id as Id<"mediaCreatives"> });
      if (n.ref.kind === "asset") void placeAsset({ id: n.ref.id as Id<"mediaAssets">, board: null });
      if (n.ref.kind === "job") void dismissJob({ id: n.ref.id as Id<"mediaJobs"> });
    }
    setSelected([]);
    setConfirm(null);
  };

  const download: CanvasEnv["download"] = async (node) => {
    const base = node.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "slice-media";
    if (node.asset) return saveFile(node.asset.url, `${base}.${EXT[node.asset.mime ?? ""] ?? (node.kind === "clip" ? "mp4" : node.kind === "audio" ? "mp3" : "png")}`);
    const c = node.creative;
    if (!c) return;
    const fresh = c.export && c.export.version === c.version ? c.export : null;
    if (fresh) return saveFile(fresh.url, `${base}.${EXT[fresh.mime] ?? "png"}`);
    notify(node.kind === "video" ? "Rendering the MP4. It downloads when it is ready." : "Rendering. It downloads in a moment.");
    try {
      const r = await postJson<{ ok: boolean; url?: string; mime?: string; error?: string }>("/api/media/export", { campaignId, creativeId: c._id });
      if (!r.ok || !r.url) notify(r.error ?? "Export failed", "bad");
      else await saveFile(r.url, `${base}.${EXT[r.mime ?? ""] ?? "png"}`);
    } catch (err) {
      notify((err as Error).message, "bad");
    }
  };

  // Files from the computer (dropped, or picked in the toolbar) join the library
  // and land side by side, the first aimed at `at` (else the middle of the
  // view), each in the nearest free spot; then they are selected.
  const placeFiles: CanvasEnv["placeFiles"] = async (files, at) => {
    if (!files.length) return;
    const c = at ?? board.current?.center() ?? { x: 0, y: 0 };
    const taken: Pick<BoardNode, "x" | "y" | "w" | "h">[] = [...nodes];
    const placed: NodeKey[] = [];
    const spots: Pick<BoardNode, "x" | "y" | "w" | "h">[] = [];
    let left: number | null = null;
    setPending((p) => [...p, "upload"]);
    try {
      for (const f of files.slice(0, 12)) {
        try {
          const up = await upload(f);
          if (!up.assetId) continue;
          const w = up.kind === "audio" ? AUDIO_NODE.w : boardWidth(up.w ?? 1, up.h ?? 1);
          const h = up.kind === "audio" ? AUDIO_NODE.h : (w * (up.h ?? 1)) / (up.w ?? 1);
          const spot = openSpot(taken, { w, h }, { x: left ?? c.x - w / 2, y: c.y - h / 2 });
          await placeAsset({ id: up.assetId, board: { ...spot, w } });
          taken.push({ ...spot, w, h });
          spots.push({ ...spot, w, h });
          placed.push(keyOf({ kind: "asset", id: up.assetId }));
          left = spot.x + w + 40;
        } catch (err) {
          notify((err as Error).message, "bad");
        }
      }
    } finally {
      setPending((p) => {
        const i = p.indexOf("upload");
        return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
      });
    }
    if (placed.length) setSelected(placed);
    // The nearest free spot can be out of view: glide to the new files.
    const box = bounds(spots);
    if (box && !spots.every(inView)) board.current?.fitBox(box, { maxZoom: board.current.viewport().zoom });
  };

  const env: CanvasEnv = {
    campaignId,
    campaign,
    brand,
    kit,
    creatives,
    assets,
    jobs,
    messages,
    nodes,
    selected: live,
    select,
    focus,
    openFocus: (k) => {
      setPlaying(null);
      setFocus(k);
    },
    closeFocus: () => setFocus(null),
    agent,
    board,
    tool,
    setTool,
    sidebar,
    setSidebar,
    audienceId,
    setAudienceId,
    act,
    pending,
    notify,
    compose: (text) => {
      bar.current?.set(text);
    },
    focusPrompt: () => bar.current?.focus(),
    placeFiles,
    sendPrompt,
    remove,
    download,
  };

  // Canvas keys (the focus editors have their own).
  useEffect(() => {
    if (focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if ((e.key === "Delete" || e.key === "Backspace") && live.length) {
        e.preventDefault();
        remove(live);
      } else if (e.key === "Escape") setSelected([]);
      else if (e.key === "Enter" && live.length === 1) {
        e.preventDefault();
        setFocus(live[0]);
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(nodes.map((n) => n.key));
      } else if (e.shiftKey && e.code === "Digit1") board.current?.fit(undefined, { maxZoom: 1.5 });
      else if (e.shiftKey && e.code === "Digit2" && live.length) board.current?.fit(live, { maxZoom: 2 });
      else if (mod && e.key === "0") {
        e.preventDefault();
        board.current?.zoomTo(1);
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        board.current?.zoomBy(1.25);
      } else if (mod && e.key === "-") {
        e.preventDefault();
        board.current?.zoomBy(0.8);
      } else if (e.key === "/") {
        e.preventDefault();
        bar.current?.focus();
      } else if (!mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "v") setTool("select");
      else if (!mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "h") setTool("hand");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Remember where the canvas was looking (quietly, after the view settles).
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onViewport = useCallback(
    (v: Viewport) => {
      setZoom(v.zoom);
      if (viewTimer.current) clearTimeout(viewTimer.current);
      viewTimer.current = setTimeout(() => void setViewport({ id: campaignId, viewport: v }).catch(() => {}), 900);
    },
    [campaignId, setViewport],
  );

  // New things land where they belong; if one lands off screen, glide to it.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = new Set(nodes.map((n) => n.key));
    if (known.current) {
      const fresh = nodes.filter((n) => !known.current!.has(n.key) && n.ref.kind !== "asset");
      if (fresh.length && board.current && !fresh.every(inView)) board.current.fit(fresh.map((n) => n.key), { maxZoom: board.current.viewport().zoom });
    }
    known.current = keys;
  }, [nodes, inView]);

  const onDrop = async (e: DragEvent, at: { x: number; y: number }) => {
    const raw = e.dataTransfer?.getData(MEDIA_DRAG);
    if (raw) {
      const item = JSON.parse(raw) as DragItem;
      const w = item.kind === "audio" ? AUDIO_NODE.w : boardWidth(item.w ?? 1, item.h ?? 1);
      const h = item.kind === "audio" ? AUDIO_NODE.h : (w * (item.h ?? 1)) / (item.w ?? 1);
      const spot = { ...openSpot(nodes.filter((n) => n.ref.id !== item.assetId), { w, h }, { x: at.x - w / 2, y: at.y - h / 2 }), w };
      if (item.assetId) await placeAsset({ id: item.assetId as Id<"mediaAssets">, board: spot });
      else {
        const existing = assets.find((a) => a.url === item.url);
        if (existing) await placeAsset({ id: existing._id, board: spot });
        else {
          const dims = await measureImage(item.url);
          await addAsset({ campaignId, asset: { url: item.url, kind: "image", source: item.source ?? "brand", name: item.name, ...dims }, board: { ...spot, w: boardWidth(dims.w ?? 1, dims.h ?? 1) } });
        }
      }
      return;
    }
    await placeFiles(Array.from(e.dataTransfer?.files ?? []), at);
  };

  const barW = docked ? SIDEBAR_W - 24 : Math.min(780, Math.max(320, areaW - 48));
  const barLeft = docked ? 12 : (areaW - barW) / 2;
  const empty = nodes.length === 0 && messages.length === 0 && !agent.busy;
  const focusNode = focus ? nodes.find((n) => n.key === focus) : undefined;

  return (
    <CanvasContext.Provider value={env}>
      <KitFonts kit={kit} />
      <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-white">
        <TopBar />
        <div ref={area} className="relative min-h-0 flex-1" style={{ ["--dock-h" as string]: `${dockH}px` }}>
          <Board
            ref={board}
            nodes={nodes}
            selected={live}
            onSelect={select}
            onOpen={(n) => n.kind !== "pending" && env.openFocus(n.key)}
            onMove={(moves) => void moveNodes({ id: campaignId, nodes: moves.map((m) => ({ kind: m.node.ref.kind, id: m.node.ref.id, x: m.x, y: m.y, w: m.node.w })) })}
            onDrop={(e, at) => void onDrop(e, at)}
            onViewport={onViewport}
            initial={campaign.viewport ?? null}
            tool={tool}
            inset={{ left: (docked ? SIDEBAR_W : 0) + TOOLBAR_ROOM, bottom: docked ? 0 : dockH + 32, top: 0 }}
            renderNode={(n, ctx) => <NodeView node={n} kit={kit} zoom={ctx.zoom} hovered={ctx.hovered} playing={playing === n.key} onPlay={(on) => setPlaying(on ? n.key : null)} />}
            overlay={({ rect, dragging }) => (rect && !dragging && !focus ? <NodeToolbar rect={rect} /> : null)}
          />

          {empty && <EmptyHero bottom={dockH + 40} />}

          {/* The sidebar: chat and assets. */}
          <aside
            data-board-ui
            className={cn("absolute inset-y-0 left-0 z-20 flex flex-col border-r border-black/[0.06] bg-white transition-transform duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]", !sidebar.open && "-translate-x-full")}
            style={{ width: SIDEBAR_W }}
            aria-hidden={!sidebar.open}
          >
            <div className="flex h-12 shrink-0 items-center gap-1 border-b border-black/[0.06] px-2.5">
              <div className="flex rounded-lg bg-neutral-100 p-0.5">
                {(["chat", "assets"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setSidebar({ open: true, tab: t })} className={cn("flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-neutral-600", sidebar.tab === t && "bg-white text-neutral-950 shadow-sm")}>
                    {t === "chat" ? "Chat" : "Assets"}
                    {t === "chat" && agent.busy && <Loader2 className="size-3 animate-spin" />}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setSidebar({ open: false })} aria-label="Hide the panel" title="Hide the panel" className="ml-auto flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
                <PanelLeftClose className="size-4" />
              </button>
            </div>
            {sidebar.tab === "chat" ? <ChatThread /> : <AssetsPanel />}
          </aside>

          <CanvasToolbar left={(docked ? SIDEBAR_W : 0) + 12} />

          {!sidebar.open && messages.length > 0 && (
            <button
              type="button"
              data-board-ui
              onClick={openChat}
              className="absolute top-3 left-3 z-20 flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-[13px] font-medium text-neutral-700 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_20px_-10px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.07] hover:text-neutral-950"
            >
              <MessagesSquare className="size-4" /> Chat
              {agent.busy && <Loader2 className="size-3.5 animate-spin text-neutral-400" />}
            </button>
          )}

          {/* The prompt bar: centred at the bottom, or docked at the foot of the sidebar. */}
          <div
            ref={dock}
            data-board-ui
            className="absolute z-30 transition-[left,width,bottom] duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]"
            style={{ left: barLeft, width: barW, bottom: docked ? 12 : 24, visibility: areaW ? "visible" : "hidden" }}
          >
            <PromptBar ref={bar} docked={docked} onSent={() => !sidebar.open && setSidebar({ open: true, tab: "chat" })} />
          </div>

          <div className="absolute right-4 bottom-4 z-20">
            <ZoomControl zoom={zoom} />
          </div>

          {notice && (
            <div key={notice.at} role="status" className={cn("absolute top-3 left-1/2 z-40 max-w-md -translate-x-1/2 rounded-xl px-3.5 py-2 text-sm shadow-lg", notice.tone === "bad" ? "bg-red-600 text-white" : "bg-neutral-900 text-white")}>
              {notice.text}
            </div>
          )}
        </div>
      </div>

      {focusNode && <FocusEditor node={focusNode} onClose={() => setFocus(null)} />}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {confirm && confirm.length > 1 ? `${confirm.length} items` : "this"}?</DialogTitle>
            <DialogDescription>Posters and videos are deleted with their history. Images, clips and music are only taken off the canvas and stay in Assets.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CanvasContext.Provider>
  );
}

export { refOf };
