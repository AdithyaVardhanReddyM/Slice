"use client";

// A campaign's workspace: the infinite canvas with everything made for it, the
// toolbar, the prompt bar, the sidebar (chat and assets) and the focus editors. The prompt
// bar starts big at the bottom of the canvas; once a conversation is going it
// glides into the sidebar and the chat continues above it. Closing the
// sidebar, or switching it to Assets, sends it back.
//
// The sidebar's chat follows the selection: one item selected opens its own
// conversation (the one its editor has), a toolbar maker's spot opens its
// thread, anything else the canvas conversation. A maker button places its
// spot (a ghost, only here until its first prompt) and opens it; once sent, the
// selection follows it into the generation and then into what lands there.
//
// The merchant's own shapes (frames, arrows, text, sticky notes) are drawn
// with the toolbar's drawing tools and kept in mediaShapes; every change shows
// at once (optimistic) and is saved behind it. Selected notes and text ride
// along with a canvas prompt.

import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { ASPECTS, AUDIO_NODE, aspectSize, boardWidth, type Aspect, type MediaKit } from "@slice/backend/convex/mediaTypes";
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
import { Board, type BoardHandle, type Drawn, type Viewport } from "./board";
import { CanvasCorner, CanvasTopRight, EmptyHero, SidebarHead, ZoomControl } from "./chrome";
import { CanvasContext, SIDEBAR_W, type CanvasEnv, type CanvasTool, type ChatMessage, type ShapePatch, type SidebarTab } from "./context";
import { bounds, buildNodes, ghostNode, keyOf, layoutArrows, nodeThread, obstacles, openSpot, refOf, threadOf, type BoardNode, type CampaignData, type Ghost, type MakerKind, type NodeKey } from "./model";
import { FRAME_SIZE, STICKY_SIZE, lineBox, newSid, type End } from "./shapes";
import { NodeToolbar } from "./node-toolbar";
import { NodeView } from "./nodes";
import { CanvasToolbar, TOOLBAR_ROOM } from "./toolbar";
import { agentOf, mediaAction, useAgentPool, type CanvasNodeRef, type PromptRequest } from "./use-media-agent";

/** Room the floating controls along the top keep clear. */
const TOP_ROOM = 56;

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

/** A maker thread's id (also its conversation's key). */
const newThread = () => `new_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const MAKERS: MakerKind[] = ["image", "poster", "video"];
/** Video models make 9:16 and 16:9 only. */
const makerAspect = (kind: MakerKind, aspect: Aspect): Aspect => (kind === "video" && !ASPECTS.find((a) => a.value === aspect)?.video ? "9:16" : aspect);

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav" };

/** An arrow's end as stored (whole board units, no empty pin). */
const endOf = (e: End) => ({ x: Math.round(e.x), y: Math.round(e.y), ...(e.node ? { node: e.node } : {}) });

/** The drawing tools' keys. */
const SHAPE_KEYS: Record<string, CanvasTool> = { f: "frame", a: "arrow", t: "text", s: "sticky" };

function Workspace({ campaignId, data }: { campaignId: Id<"mediaCampaigns">; data: CampaignData }) {
  const { campaign, brand, creatives, assets, jobs } = data;
  const shapes = useMemo(() => data.shapes ?? [], [data.shapes]);
  const messages = data.messages as ChatMessage[];
  const kit = (campaign.kit ?? brand?.kit) as MediaKit | undefined;
  const built = useMemo(() => buildNodes({ creatives, assets, jobs, shapes }), [creatives, assets, jobs, shapes]);
  // Text is as big as its words: its measured box stands in for the saved one.
  const [measured, setMeasured] = useState<Record<NodeKey, { w: number; h: number }>>({});
  const measure = useCallback((key: NodeKey, size: { w: number; h: number }) => setMeasured((m) => (m[key]?.w === size.w && m[key]?.h === size.h ? m : { ...m, [key]: size })), []);
  const [editing, setEditing] = useState<NodeKey | null>(null);
  const [picks] = usePromptPicks();

  // The maker spot not yet in Convex. Until its first prompt it takes the shape the prompt bar is set to.
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [picked, setPicked] = useState<{ key: NodeKey; thread?: string }[]>([]);
  const ghostKey = ghost ? keyOf({ kind: "ghost", id: ghost.id }) : null;
  const landed = !!ghost && jobs.some((j) => j.thread === ghost.id);
  const shownGhost = useMemo<Ghost | null>(() => {
    // Gone once its spot is in Convex; an empty one only while it is selected.
    if (!ghost || landed || (!ghost.sent && !picked.some((p) => p.key === ghostKey))) return null;
    return ghost.sent || !MAKERS.includes(picks.output as MakerKind) ? ghost : { ...ghost, kind: picks.output as MakerKind, aspect: makerAspect(picks.output as MakerKind, picks.aspect) };
  }, [ghost, landed, picked, ghostKey, picks.output, picks.aspect]);
  const nodes = useMemo(() => {
    const all = shownGhost ? [...built, ghostNode(shownGhost)] : built;
    return layoutArrows(all.map((n) => (n.kind === "text" && measured[n.key] ? { ...n, ...measured[n.key] } : n)));
  }, [built, shownGhost, measured]);

  const select = useCallback((keys: NodeKey[]) => setPicked(keys.map((key) => ({ key, thread: nodeThread(nodes.find((n) => n.key === key)) }))), [nodes]);
  const setSelected = select;
  // A selected thing that is replaced (a spot by its generation, a generation by its file) stays selected through its thread.
  const live = useMemo(() => {
    const keys = new Set(nodes.map((n) => n.key));
    const out: NodeKey[] = [];
    for (const p of picked) {
      let key: NodeKey | undefined = keys.has(p.key) ? p.key : undefined;
      if (!key && p.thread) {
        const heirs = nodes.filter((n) => nodeThread(n) === p.thread);
        key = (heirs.find((n) => n.creative || n.asset) ?? heirs[0])?.key;
      }
      if (key && !out.includes(key)) out.push(key);
    }
    return out;
  }, [picked, nodes]);
  const [focus, setFocus] = useState<NodeKey | null>(null);
  const [sidebar, setSidebarState] = useState<{ open: boolean; tab: SidebarTab }>({ open: messages.length > 0, tab: "chat" });
  const setSidebar = useCallback((s: { open: boolean; tab?: SidebarTab }) => setSidebarState((cur) => ({ open: s.open, tab: s.tab ?? cur.tab })), []);
  // Who the prompts are for, remembered per campaign in this browser (the workspace only renders on the client, once the campaign has loaded).
  const audienceKey = `slice.media.audience.${campaignId}`;
  const [audienceId, setAudienceState] = useState(() => {
    try {
      const saved = window.localStorage.getItem(audienceKey);
      return saved && (campaign.audiences as { id: string }[]).some((a) => a.id === saved) ? saved : "all";
    } catch {
      return "all";
    }
  });
  const setAudienceId = useCallback(
    (id: string) => {
      setAudienceState(id);
      try {
        window.localStorage.setItem(audienceKey, id);
      } catch {
        // it is only a convenience
      }
    },
    [audienceKey],
  );
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
  const agents = useAgentPool({ campaignId, model });
  const one = live.length === 1 ? nodes.find((n) => n.key === live[0]) : undefined;
  const thread = threadOf(one, assets);
  const threadChat = useQuery(api.media.itemChat, thread.kind === "campaign" ? "skip" : { campaignId, itemId: thread.thread }) as ChatMessage[] | undefined;
  const threadMessages = thread.kind === "campaign" ? messages : (threadChat ?? []);
  const agent = agentOf(agents, thread.kind === "campaign" ? "campaign" : thread.thread, {
    history: threadMessages.map((m) => ({ role: m.role, text: m.text })),
    item: thread.kind === "item" ? thread.item : undefined,
    thread: thread.kind === "draft" ? thread.thread : undefined,
    spot: thread.kind === "draft" ? thread.spot : undefined,
  });

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
  const addShape = useMutation(api.media.addShape).withOptimisticUpdate((store, { campaignId: id, shape }) => {
    const cur = store.getQuery(api.media.get, { id });
    if (!cur) return;
    // Times come with the saved row; nothing reads them before it arrives.
    store.setQuery(api.media.get, { id }, { ...cur, shapes: [...(cur.shapes ?? []), { _id: shape.sid as Id<"mediaShapes">, _creationTime: 0, campaignId: id, ...shape, createdAt: 0, updatedAt: 0 }] });
  });
  const patchShapes = useMutation(api.media.patchShapes).withOptimisticUpdate((store, { campaignId: id, shapes: patches }) => {
    const cur = store.getQuery(api.media.get, { id });
    if (!cur?.shapes) return;
    const by = new Map(patches.map((p) => [p.sid, p]));
    store.setQuery(api.media.get, { id }, { ...cur, shapes: cur.shapes.map((x) => ({ ...x, ...by.get(x.sid) })) });
  });
  const removeShapes = useMutation(api.media.removeShapes).withOptimisticUpdate((store, { campaignId: id, sids }) => {
    const cur = store.getQuery(api.media.get, { id });
    if (!cur?.shapes) return;
    store.setQuery(api.media.get, { id }, { ...cur, shapes: cur.shapes.filter((x) => !sids.includes(x.sid)) });
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

  // The sidebar covers the canvas's left while open; the prompt bar docks in it only under Chat (on Assets it would cover the library).
  const open = sidebar.open;
  const docked = open && sidebar.tab === "chat";
  const canvasLeft = open ? SIDEBAR_W : 0;
  // Wholly in view, clear of the sidebar, the floating controls and the prompt bar.
  const inView = useCallback(
    (n: Pick<BoardNode, "x" | "y" | "w" | "h">) => {
      const v = board.current?.viewport();
      const el = area.current;
      if (!v || !el) return true;
      return n.x * v.zoom + v.x >= canvasLeft + TOOLBAR_ROOM && (n.x + n.w) * v.zoom + v.x <= el.clientWidth && n.y * v.zoom + v.y >= TOP_ROOM && (n.y + n.h) * v.zoom + v.y <= el.clientHeight - (docked ? 0 : dockH + 24);
    },
    [canvasLeft, docked, dockH],
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

  const options = (output: string, aspect: string): PromptRequest => ({ output, imageModel: picks.imageModel, videoModel: picks.videoModel, musicModel: picks.musicModel, aspect, count: output === "image" ? picks.count : 1, audienceId, check: picks.check });
  const failed = (err: Error) => notify(err.message, "bad");

  // The sidebar's conversation: an item's own agent changes it; a maker's thread makes what its spot was placed for; else the canvas chat, with the selection attached.
  const send: CanvasEnv["send"] = (text, attachments = []) => {
    if (thread.kind === "item") void agent.send(text, attachments).catch(failed);
    else if (thread.kind === "draft") {
      if (shownGhost && thread.thread === shownGhost.id) setGhost({ ...shownGhost, sent: true });
      void agent.prompt(text, attachments, options(thread.spot?.kind ?? picks.output, thread.spot?.aspect ?? picks.aspect), []).catch(failed);
    } else {
      const refs: CanvasNodeRef[] = nodes.filter((n) => live.includes(n.key) && (n.ref.kind === "creative" || n.ref.kind === "asset")).map((n) => ({ kind: n.ref.kind as "creative" | "asset", id: n.ref.id }));
      // Selected notes and text are read as notes for the prompt.
      for (const n of nodes) if (live.includes(n.key) && (n.kind === "sticky" || n.kind === "text") && n.shape?.text?.trim()) refs.push({ kind: "note", id: n.shape.sid, text: n.shape.text.trim().slice(0, 600) });
      void agent.prompt(text, attachments, options(picks.output, picks.aspect), refs).catch(failed);
    }
    setSidebar({ open: true, tab: "chat" });
  };

  // A maker's spot: in the middle of what stays in view once the sidebar is open, clear of everything else.
  const spotFor = (kind: MakerKind, aspect: Aspect, aim?: { x: number; y: number }) => {
    const s = aspectSize(aspect);
    const w = boardWidth(s.w, s.h);
    const h = (w * s.h) / s.w;
    const v = board.current?.viewport();
    const c = board.current?.center() ?? { x: 0, y: 0 };
    const at = aim ?? { x: c.x + (sidebar.open || !v ? 0 : SIDEBAR_W / 2 / v.zoom) - w / 2, y: c.y - h / 2 };
    return { ...openSpot(obstacles(built, { ...at, w, h }), { w, h }, at), w, h };
  };

  const openSpotNode = (g: Ghost) => {
    setGhost(g);
    setPicked([{ key: keyOf({ kind: "ghost", id: g.id }), thread: g.id }]);
    setSidebar({ open: true, tab: "chat" });
  };

  const make: CanvasEnv["make"] = (kind) => {
    const aspect = makerAspect(kind, picks.aspect);
    const spot = spotFor(kind, aspect);
    // An empty spot moves rather than leaving another behind.
    openSpotNode({ id: ghost && !ghost.sent && !landed ? ghost.id : newThread(), kind, aspect, x: spot.x, y: spot.y, sent: false });
    requestAnimationFrame(() => bar.current?.focus());
  };

  const makeFrom: CanvasEnv["makeFrom"] = (kind, text, from) => {
    const aspect = makerAspect(kind, picks.aspect);
    const spot = spotFor(kind, aspect, { x: from.x + from.w + 72, y: from.y });
    const id = newThread();
    openSpotNode({ id, kind, aspect, x: spot.x, y: spot.y, sent: true });
    void agents
      .run(id, { kind: "prompt", message: text, history: [], options: options(kind, aspect), nodes: from.ref.kind === "creative" || from.ref.kind === "asset" ? [{ kind: from.ref.kind, id: from.ref.id }] : [], thread: id, spot: { x: spot.x, y: spot.y, w: spot.w, aspect, kind } })
      .catch(failed);
  };

  /** Shapes go at once (they are only drawings). */
  const dropShapes = (keys: NodeKey[]) => {
    const sids = nodes.filter((n) => keys.includes(n.key) && n.shape).map((n) => n.shape!.sid);
    if (!sids.length) return;
    if (editing && keys.includes(editing)) setEditing(null);
    void removeShapes({ campaignId, sids }).catch(failed);
  };

  const remove: CanvasEnv["remove"] = (keys) => {
    if (ghostKey && keys.includes(ghostKey)) setGhost(null);
    const list = nodes.filter((n) => keys.includes(n.key) && n.ref.kind !== "ghost" && n.ref.kind !== "shape");
    if (list.some((n) => n.ref.kind === "creative")) {
      setConfirm(keys);
      return;
    }
    dropShapes(keys);
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
    if (confirm) dropShapes(confirm);
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
    const taken: Pick<BoardNode, "x" | "y" | "w" | "h">[] = obstacles(nodes, { ...c, w: 0, h: 0 });
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

  const patchShape: CanvasEnv["patchShape"] = useCallback((sid: string, patch: ShapePatch) => void patchShapes({ campaignId, shapes: [{ sid, ...patch }] }).catch((err: Error) => notify(err.message, "bad")), [patchShapes, campaignId, notify]);

  const commitText: CanvasEnv["commitText"] = (node, text) => {
    setEditing((cur) => (cur === node.key ? null : cur));
    const s = node.shape;
    if (!s) return;
    // An empty text is a text never written.
    if (node.kind === "text" && !text.trim()) {
      void removeShapes({ campaignId, sids: [s.sid] }).catch(failed);
      setSelected(live.filter((k) => k !== node.key));
      return;
    }
    if (text !== (s.text ?? "") || (node.kind === "text" && (node.w !== s.w || node.h !== s.h))) patchShape(s.sid, node.kind === "text" ? { text, w: node.w, h: node.h } : { text });
  };

  // What the drawing tools make: then back to selecting, with it selected (text and notes ready to type in).
  const onDraw = (d: Drawn) => {
    const sid = newSid();
    const key = keyOf({ kind: "shape", id: sid });
    setTool("select");
    if (d.tool === "frame") {
      const b = d.click ? { x: d.from.x, y: d.from.y, ...FRAME_SIZE } : lineBox({ x1: d.from.x, y1: d.from.y, x2: d.to.x, y2: d.to.y });
      const n = shapes.filter((x) => x.kind === "frame").length + 1;
      void addShape({ campaignId, shape: { sid, kind: "frame", x: b.x, y: b.y, w: Math.max(80, b.w), h: Math.max(60, b.h), text: `Frame ${n}`, color: "white" } }).catch(failed);
    } else if (d.tool === "arrow") {
      const to = d.click ? { x: d.from.x + 200, y: d.from.y } : d.to;
      void addShape({ campaignId, shape: { sid, kind: "arrow", ...lineBox({ x1: d.from.x, y1: d.from.y, x2: to.x, y2: to.y }), from: endOf(d.from), to: endOf(to), color: "black" } }).catch(failed);
    } else if (d.tool === "text") {
      const size = 24;
      void addShape({ campaignId, shape: { sid, kind: "text", x: d.from.x - 4, y: d.from.y - size * 0.62, w: 16, h: size * 1.25, text: "", size, color: "black" } }).catch(failed);
      setEditing(key);
    } else {
      // A new note takes the colour of the last one.
      const color = [...shapes].reverse().find((x) => x.kind === "sticky")?.color ?? "yellow";
      void addShape({ campaignId, shape: { sid, kind: "sticky", x: d.from.x - STICKY_SIZE / 2, y: d.from.y - STICKY_SIZE / 2, w: STICKY_SIZE, h: STICKY_SIZE, text: "", color } }).catch(failed);
      setEditing(key);
    }
    setPicked([{ key }]);
  };

  const editShape = (n: BoardNode) => {
    setTool("select");
    setPicked([{ key: n.key }]);
    if (n.kind !== "arrow") setEditing(n.key);
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
    agents,
    thread,
    threadMessages,
    threadLoaded: thread.kind === "campaign" || threadChat !== undefined,
    agent,
    send,
    make,
    makeFrom,
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
      setSidebar({ open: true, tab: "chat" });
      bar.current?.set(text);
    },
    focusPrompt: () => bar.current?.focus(),
    placeFiles,
    remove,
    download,
    editing,
    setEditing,
    patchShape,
    commitText,
    measure,
  };

  // Canvas keys (the focus editors have their own).
  useEffect(() => {
    if (focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const one = live.length === 1 ? nodes.find((n) => n.key === live[0]) : undefined;
      if ((e.key === "Delete" || e.key === "Backspace") && live.length) {
        e.preventDefault();
        remove(live);
      } else if (e.key === "Escape") {
        if (tool !== "select" && tool !== "hand") setTool("select");
        else setSelected([]);
      } else if (e.key === "Enter" && one) {
        e.preventDefault();
        if (one.shape) editShape(one);
        else setFocus(one.key);
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
      else if (!mod && !e.altKey && !e.shiftKey && SHAPE_KEYS[e.key.toLowerCase()]) setTool(SHAPE_KEYS[e.key.toLowerCase()]);
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
      const fresh = nodes.filter((n) => !known.current!.has(n.key) && n.ref.kind !== "asset" && n.ref.kind !== "shape");
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
      const spot = { ...openSpot(obstacles(nodes.filter((n) => n.ref.id !== item.assetId), { x: at.x - w / 2, y: at.y - h / 2, w, h }), { w, h }, { x: at.x - w / 2, y: at.y - h / 2 }), w };
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

  const barW = docked ? SIDEBAR_W - 24 : Math.min(780, Math.max(320, areaW - canvasLeft - 48));
  const barLeft = docked ? 12 : canvasLeft + (areaW - canvasLeft - barW) / 2;
  const empty = nodes.length === 0 && messages.length === 0 && !agents.busy;
  const focusNode = focus ? nodes.find((n) => n.key === focus) : undefined;

  return (
    <CanvasContext.Provider value={env}>
      <KitFonts kit={kit} />
      <div className="fixed inset-0 overflow-hidden overscroll-none bg-white">
        <div ref={area} className="relative size-full" style={{ ["--dock-h" as string]: `${dockH}px` }}>
          <Board
            ref={board}
            nodes={nodes}
            selected={live}
            onSelect={select}
            onOpen={(n) => (n.shape ? editShape(n) : n.kind !== "pending" && n.kind !== "ghost" && env.openFocus(n.key))}
            onMove={(moves) => {
              const spot = moves.find((m) => m.node.ghost);
              if (spot && ghost) setGhost({ ...ghost, x: spot.x, y: spot.y });
              // An arrow's free ends go with it; a pinned end stays with its node.
              const drawn = moves.filter((m) => m.node.shape);
              if (drawn.length)
                void patchShapes({
                  campaignId,
                  shapes: drawn.map(({ node, x, y }) => {
                    const s = node.shape!;
                    if (!s.from || !s.to) return { sid: s.sid, x, y };
                    const shift = (e: End) => endOf(e.node ? e : { x: e.x + x - node.x, y: e.y + y - node.y });
                    return { sid: s.sid, x, y, from: shift(s.from), to: shift(s.to) };
                  }),
                }).catch(failed);
              const rest = moves.filter((m) => m.node.ref.kind !== "ghost" && m.node.ref.kind !== "shape");
              if (rest.length) void moveNodes({ id: campaignId, nodes: rest.map((m) => ({ kind: m.node.ref.kind as "creative" | "asset" | "job", id: m.node.ref.id, x: m.x, y: m.y, w: m.node.w })) });
            }}
            onDrop={(e, at) => void onDrop(e, at)}
            onViewport={onViewport}
            initial={campaign.viewport ?? null}
            tool={tool}
            onDraw={onDraw}
            onResize={(n, b) => n.shape && patchShape(n.shape.sid, { x: b.x, y: b.y, w: b.w, h: b.h })}
            onArrowEnd={(n, which, end) => n.shape && patchShape(n.shape.sid, which === "from" ? { from: endOf(end) } : { to: endOf(end) })}
            onRename={(n, name) => {
              setEditing(null);
              if (n.shape && name !== null && name.trim() !== (n.shape.text ?? "")) patchShape(n.shape.sid, { text: name.trim() || "Frame" });
            }}
            editing={editing}
            inset={{ left: canvasLeft + TOOLBAR_ROOM, bottom: docked ? 0 : dockH + 32, top: TOP_ROOM }}
            renderNode={(n, ctx) => <NodeView node={n} kit={kit} zoom={ctx.zoom} hovered={ctx.hovered} selected={ctx.selected} playing={playing === n.key} onPlay={(on) => setPlaying(on ? n.key : null)} />}
            overlay={({ rect, dragging }) => (rect && !dragging && !focus ? <NodeToolbar rect={rect} /> : null)}
          />

          {empty && <EmptyHero left={canvasLeft} bottom={docked ? 0 : dockH + 40} />}

          {/* The sidebar: chat and assets. */}
          <aside
            data-board-ui
            className={cn("absolute inset-y-0 left-0 z-20 flex flex-col border-r border-black/[0.06] bg-white transition-transform duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]", !sidebar.open && "-translate-x-full")}
            style={{ width: SIDEBAR_W }}
            aria-hidden={!sidebar.open}
          >
            <SidebarHead />
            <div className="shrink-0 border-b border-black/[0.06] px-3 pb-3">
              <div className="grid grid-cols-2 rounded-lg bg-neutral-100 p-0.5">
                {(["chat", "assets"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setSidebar({ open: true, tab: t })} className={cn("flex h-7 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-neutral-600 transition-colors hover:text-neutral-950", sidebar.tab === t && "bg-white text-neutral-950 shadow-sm")}>
                    {t === "chat" ? "Chat" : "Assets"}
                    {t === "chat" && agents.busy && <Loader2 className="size-3 animate-spin" />}
                  </button>
                ))}
              </div>
            </div>
            {sidebar.tab === "chat" ? <ChatThread /> : <AssetsPanel />}
          </aside>

          <CanvasToolbar left={canvasLeft + 12} />

          {!sidebar.open && (
            <div className="absolute top-3 left-3 z-20">
              <CanvasCorner />
            </div>
          )}
          <div className="absolute top-3 right-3 z-20">
            <CanvasTopRight />
          </div>

          {/* The prompt bar: centred at the bottom of the canvas, or docked at the foot of the sidebar's chat. */}
          <div
            ref={dock}
            data-board-ui
            className="absolute z-30 transition-[left,width,bottom] duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]"
            style={{ left: barLeft, width: barW, bottom: docked ? 12 : 20, visibility: areaW ? "visible" : "hidden" }}
          >
            <PromptBar ref={bar} docked={docked} onSent={() => !docked && setSidebar({ open: true, tab: "chat" })} />
          </div>

          <div className="absolute right-3 bottom-3 z-20">
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
