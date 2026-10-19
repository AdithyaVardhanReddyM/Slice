"use client";

// The editors' left panels: Elements (text styles, shapes, logo, QR code),
// Media (the brand's pictures and the library, click or drag onto the page),
// Layers (reorder by dragging, hide, lock, rename) and History (every saved
// version, restorable).

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import { Circle, Eye, EyeOff, GripVertical, Image as ImageIcon, Loader2, Lock, Minus, QrCode, RotateCcw, Shapes, Square, Stamp, Type, Unlock, Upload } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { docDuration, fontStack, newId, type Layer, type MediaBrief, type MediaProduct } from "@slice/backend/convex/mediaTypes";
import { useMediaUpload } from "@/lib/media/upload";
import { cn } from "@/lib/utils";
import { MEDIA_DRAG, type DragItem } from "../sidebar/assets";
import { FixedStage } from "../stage";
import { useStudio } from "./context";
import { layerLabel, newLayer, type NewLayerKind } from "./layers";

export function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <h2 className="text-sm font-semibold">{children}</h2>
      {aside}
    </div>
  );
}

/* Elements ---------------------------------------------------------------------- */

export function ElementsPanel({ onAdded }: { onAdded?: (id: string) => void }) {
  const { doc, kit, campaign, editor, select } = useStudio();
  const [missingLink, setMissingLink] = useState(false);
  const add = (kind: NewLayerKind) => {
    const l = newLayer(kind, doc, kit, campaign.brief as MediaBrief | undefined);
    if (!l) {
      setMissingLink(true);
      return;
    }
    editor.update((d) => ({ ...d, layers: [...d.layers, l] }));
    select({ kind: "layers", ids: [l.id] });
    onAdded?.(l.id);
  };
  const heading = fontStack(kit?.fonts.heading);
  const body = fontStack(kit?.fonts.body);
  const tile = "flex w-full items-center rounded-lg bg-neutral-50 px-3 text-left ring-1 ring-black/[0.05] transition-colors hover:bg-neutral-100";
  return (
    <div className="space-y-5 pb-6">
      <PanelTitle>Text</PanelTitle>
      <div className="-mt-3 space-y-2 px-4">
        <button type="button" onClick={() => add("headline")} className={cn(tile, "h-14 text-2xl font-bold")} style={{ fontFamily: heading }}>
          Add a heading
        </button>
        <button type="button" onClick={() => add("subhead")} className={cn(tile, "h-11 text-base font-medium")} style={{ fontFamily: body }}>
          Add a subheading
        </button>
        <button type="button" onClick={() => add("body")} className={cn(tile, "h-10 text-sm")} style={{ fontFamily: body }}>
          Add body text
        </button>
        <button type="button" onClick={() => add("cta")} className={cn(tile, "h-12 justify-center")}>
          <span className="rounded-full px-4 py-1.5 text-sm font-semibold" style={{ background: kit?.colors.primary ?? "#111", color: kit?.colors.primaryForeground ?? "#fff", fontFamily: body }}>
            {(campaign.brief as MediaBrief | undefined)?.cta || "Shop now"}
          </span>
        </button>
      </div>
      <PanelTitle>Graphics</PanelTitle>
      <div className="-mt-3 grid grid-cols-3 gap-2 px-4">
        {(
          [
            ["shape", "Rectangle", <Square key="s" />],
            ["circle", "Circle", <Circle key="c" />],
            ["line", "Line", <Minus key="l" />],
            ["logo", "Logo", <Stamp key="g" />],
            ["qr", "QR code", <QrCode key="q" />],
          ] as const
        ).map(([kind, label, icon]) => (
          <button key={kind} type="button" onClick={() => add(kind)} className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg bg-neutral-50 text-xs text-neutral-600 ring-1 ring-black/[0.05] hover:bg-neutral-100 hover:text-neutral-950 [&_svg]:size-5">
            {icon}
            {label}
          </button>
        ))}
      </div>
      {missingLink && <p className="mx-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">A QR code needs a link: add the brand&apos;s website in its guidelines.</p>}
      <PanelTitle>Colours</PanelTitle>
      <div className="-mt-3 flex flex-wrap gap-1.5 px-4">
        {[...new Map(Object.entries(kit?.colors ?? {}).map(([k, c]) => [c.toLowerCase(), [k, c] as const])).values()].map(([k, c]) => (
          <button key={k} type="button" title={`Page background: ${k}`} onClick={() => editor.update((d) => ({ ...d, background: c }))} className={cn("size-8 rounded-lg ring-1 ring-black/10", doc.background === c && "ring-2 ring-blue-500 ring-offset-1")} style={{ background: c }} />
        ))}
      </div>
      <p className="-mt-3 px-4 text-[11px] text-muted-foreground">Click a colour to set the page background.</p>
    </div>
  );
}

/* Media ---------------------------------------------------------------------------- */

export function MediaPanel({ accept = ["image"], onPick }: { accept?: ("image" | "video" | "audio")[]; onPick?: (item: DragItem) => void }) {
  const { assets, campaign, campaignId, doc, editor, select, kit } = useStudio();
  const upload = useMediaUpload(campaignId);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const products = (campaign.products as MediaProduct[]).filter((p) => p.image);
  const seen = new Set<string>();
  const items: (DragItem & { key: string; label: string })[] = [];
  const push = (it: DragItem & { key: string; label: string }) => {
    if (seen.has(it.url) || !accept.includes(it.kind)) return;
    seen.add(it.url);
    items.push(it);
  };
  if (kit?.logo?.src) push({ key: "logo", url: kit.logo.src, kind: "image", label: "Logo", name: "Logo" });
  for (const p of products) push({ key: `p:${p.id}`, url: p.image!, kind: "image", label: p.name, name: p.name });
  for (const a of assets) if (a.source !== "export") push({ key: a._id, assetId: a._id, url: a.url, kind: a.kind as DragItem["kind"], w: a.w, h: a.h, label: a.name || a.prompt?.slice(0, 50) || a.kind, name: a.name });

  const addImage = (it: DragItem) => {
    if (onPick) return onPick(it);
    const w = Math.round(doc.w * 0.5);
    const h = it.w && it.h ? Math.round((w * it.h) / it.w) : w;
    const l: Layer = { id: newId("l"), type: "image", src: it.url, x: Math.round((doc.w - w) / 2), y: Math.round((doc.h - h) / 2), w, h, fit: "cover", role: "photo" };
    editor.update((d) => ({ ...d, layers: [...d.layers, l] }));
    select({ kind: "layers", ids: [l.id] });
  };

  return (
    <div className="pb-6">
      <PanelTitle aside={<span className="text-[11px] text-muted-foreground">{items.length}</span>}>Media</PanelTitle>
      <div className="space-y-3 px-4">
        <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 py-3 text-sm text-muted-foreground hover:border-neutral-400 hover:text-foreground">
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload
        </button>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept={accept.map((k) => `${k}/*`).join(",")}
          onChange={async (e) => {
            const el = e.currentTarget;
            const files = Array.from(el.files ?? []);
            setUploading((n) => n + files.length);
            await Promise.all(files.map((f) => upload(f).finally(() => setUploading((n) => n - 1))));
            el.value = "";
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              draggable
              title={it.label}
              onDragStart={(e) => {
                e.dataTransfer.setData(MEDIA_DRAG, JSON.stringify(it));
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addImage(it)}
              className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-black/[0.05] hover:ring-blue-500"
            >
              {it.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
              ) : it.kind === "video" ? (
                <video src={it.url} muted preload="metadata" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center bg-neutral-900 p-2 text-center text-[11px] leading-4 text-white/80">{it.label}</span>
              )}
            </button>
          ))}
        </div>
        {items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Upload photos, or add products to the brand.</p>}
        <p className="text-[11px] leading-4 text-muted-foreground">Click to add, or drag onto the page.</p>
      </div>
    </div>
  );
}

/* Layers --------------------------------------------------------------------------- */

const TYPE_ICON: Record<Layer["type"], ReactNode> = { text: <Type />, image: <ImageIcon />, logo: <Stamp />, shape: <Shapes />, qr: <QrCode /> };

function LayerRow({ l, active, onClick }: { l: Layer; active: boolean; onClick: () => void }) {
  const { editor } = useStudio();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: l.id });
  const [name, setName] = useState<string | null>(null);
  const patch = (p: Partial<Layer>) => editor.update((d) => ({ ...d, layers: d.layers.map((x) => (x.id === l.id ? ({ ...x, ...p } as Layer) : x)) }));
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onClick}
      className={cn("group flex h-9 items-center gap-2 rounded-lg px-1.5 text-[13px] select-none", active ? "bg-blue-600/10 text-blue-900" : "hover:bg-neutral-100", isDragging && "z-10 bg-white shadow-md ring-1 ring-black/10")}
    >
      <button ref={setActivatorNodeRef} type="button" aria-label="Drag to reorder" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="flex h-6 w-4 cursor-grab items-center justify-center text-neutral-400 active:cursor-grabbing">
        <GripVertical className="size-3.5" />
      </button>
      <span className={cn("shrink-0 [&_svg]:size-3.5", active ? "text-blue-700" : "text-neutral-500", l.hidden && "opacity-40")}>{TYPE_ICON[l.type]}</span>
      {name !== null ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => {
            patch({ name: name.trim() || undefined });
            setName(null);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(null);
          }}
          className="h-6 min-w-0 flex-1 rounded bg-white px-1 text-[13px] ring-1 ring-blue-500 outline-none"
        />
      ) : (
        <span onDoubleClick={() => setName(l.name ?? layerLabel(l))} className={cn("min-w-0 flex-1 truncate", l.hidden && "opacity-50")} title="Double-click to rename">
          {layerLabel(l)}
        </span>
      )}
      <span className={cn("flex items-center [&_button]:flex [&_button]:size-6 [&_button]:items-center [&_button]:justify-center [&_button]:rounded [&_button:hover]:bg-black/5 [&_svg]:size-3.5", !l.hidden && !l.locked && "opacity-0 group-hover:opacity-100")}>
        <button type="button" title={l.locked ? "Unlock" : "Lock"} onClick={(e) => (e.stopPropagation(), patch({ locked: l.locked ? undefined : true }))}>
          {l.locked ? <Lock /> : <Unlock />}
        </button>
        <button type="button" title={l.hidden ? "Show" : "Hide"} onClick={(e) => (e.stopPropagation(), patch({ hidden: l.hidden ? undefined : true }))}>
          {l.hidden ? <EyeOff /> : <Eye />}
        </button>
      </span>
    </li>
  );
}

export function LayersPanel() {
  const { doc, editor, selection, select } = useStudio();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const top = [...doc.layers].reverse();
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const order = top.map((l) => l.id);
    const from = order.indexOf(String(e.active.id));
    const to = order.indexOf(String(e.over.id));
    order.splice(to, 0, order.splice(from, 1)[0]);
    const byId = new Map(doc.layers.map((l) => [l.id, l]));
    editor.update((d) => ({ ...d, layers: [...order].reverse().map((id) => byId.get(id)!).filter(Boolean) }));
  };
  return (
    <div className="pb-6">
      <PanelTitle aside={<span className="text-[11px] text-muted-foreground">Top first</span>}>Layers</PanelTitle>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={top.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-0.5 px-2">
            {top.map((l) => (
              <LayerRow key={l.id} l={l} active={selection.kind === "layers" && selection.ids.includes(l.id)} onClick={() => select({ kind: "layers", ids: [l.id] })} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {doc.layers.length === 0 && <p className="px-4 py-6 text-center text-xs text-muted-foreground">No layers yet. Add text or a picture.</p>}
    </div>
  );
}

/* History -------------------------------------------------------------------------- */

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function HistoryPanel() {
  const { creative, kit, editor } = useStudio();
  const versions = useQuery(api.media.versions, { creativeId: creative._id });
  const restore = useMutation(api.media.restore);
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <div className="pb-6">
      <PanelTitle>History</PanelTitle>
      {!versions ? (
        <Loader2 className="mx-4 size-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="space-y-1 px-2">
          {versions.map((v) => {
            const current = v.version === creative.version;
            return (
              <li key={v._id} className="group flex items-center gap-3 rounded-lg p-1.5 hover:bg-neutral-50">
                <div className="shrink-0 overflow-hidden rounded ring-1 ring-black/[0.06]">
                  <FixedStage doc={v.doc} kit={kit} width={40} stillOnly {...(v.doc.kind === "video" ? { frameAt: Math.min(1.6, docDuration(v.doc) * 0.2) } : { settled: true })} showPending={false} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{v.note || (v.by === "agent" ? "Slice edited" : "Your edits")}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {v.by === "agent" ? "Slice" : "You"} · {ago(v.createdAt)}
                  </p>
                </div>
                {current ? (
                  <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">Now</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    title="Restore this version"
                    onClick={async () => {
                      setBusy(v.version);
                      try {
                        await editor.flush();
                        await restore({ id: creative._id, version: v.version });
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="flex size-7 items-center justify-center rounded-md text-neutral-500 opacity-0 group-hover:opacity-100 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    {busy === v.version ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

