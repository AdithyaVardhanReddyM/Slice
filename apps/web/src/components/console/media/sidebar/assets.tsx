"use client";

// The brand's media and the campaign's library, ready to bring onto the
// canvas: drag a tile onto it, or press + to place it after the last thing
// made. Uploads join the library; the brand's logo, products and photos come
// from its guidelines.

import { useMutation } from "convex/react";
import { Check, Film, Loader2, Music, Plus, Upload } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import type { MediaKit, MediaProduct } from "@slice/backend/convex/mediaTypes";
import { useMediaUpload } from "@/lib/media/upload";
import { cn } from "@/lib/utils";
import { useCanvas } from "../canvas/context";

/** What a tile carries when dragged: a library file by id, or a brand picture by URL. Poster editors read url/w/h. */
export const MEDIA_DRAG = "application/x-slice-media";
export type DragItem = { assetId?: string; url: string; kind: "image" | "video" | "audio"; name?: string; w?: number; h?: number; source?: string };

interface Tile {
  key: string;
  item: DragItem;
  label: string;
  onCanvas?: boolean;
  asset?: Doc<"mediaAssets">;
}

function TileView({ t, onAdd }: { t: Tile; onAdd: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(MEDIA_DRAG, JSON.stringify(t.item));
        e.dataTransfer.effectAllowed = "copy";
      }}
      title={t.label}
      className="group relative aspect-square cursor-grab overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-black/[0.05] active:cursor-grabbing"
    >
      {t.item.kind === "image" ? (
        // Files live on Convex storage and brand hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.item.url} alt="" draggable={false} loading="lazy" className={cn("size-full", t.key === "logo" ? "bg-white object-contain p-3" : "object-cover")} />
      ) : t.item.kind === "video" ? (
        <video src={t.item.url} muted preload="metadata" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 bg-neutral-900 p-2 text-white">
          <Music className="size-5" />
          <span className="line-clamp-2 text-center text-[10px] leading-3 text-white/80">{t.label}</span>
        </div>
      )}
      {t.item.kind === "video" && (
        <span className="absolute bottom-1 left-1 flex items-center rounded bg-black/60 px-1 py-px text-[10px] text-white">
          <Film className="size-2.5" />
        </span>
      )}
      {t.onCanvas ? (
        <span title="On the canvas" className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-white/90 text-emerald-600 shadow-sm">
          <Check className="size-3" />
        </span>
      ) : (
        <button
          type="button"
          aria-label="Add to the canvas"
          onClick={async () => {
            setBusy(true);
            try {
              await onAdd();
            } finally {
              setBusy(false);
            }
          }}
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-white text-neutral-800 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-neutral-50 focus-visible:opacity-100"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3.5" />}
        </button>
      )}
    </div>
  );
}

function Group({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Width and height of a picture, read in the browser (brand photos come without them). */
export function measureImage(url: string): Promise<{ w?: number; h?: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({});
    img.src = url;
    setTimeout(() => resolve({}), 4000);
  });
}

export function AssetsPanel() {
  const { campaignId, brand, assets, campaign, notify } = useCanvas();
  const upload = useMediaUpload(campaignId);
  const addAsset = useMutation(api.media.addAsset);
  const placeAsset = useMutation(api.media.placeAsset);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);

  const kit = (brand?.kit ?? campaign.kit) as MediaKit | undefined;
  const products = ((brand?.products ?? campaign.products) as MediaProduct[]).filter((p) => p.image);
  const library = assets.filter((a) => a.source !== "export");
  const libraryUrls = new Set(library.map((a) => a.url));

  const brandTiles: Tile[] = [
    ...(kit?.logo?.src ? [{ key: "logo", item: { url: kit.logo.src, kind: "image" as const, name: "Logo", source: "brand" }, label: "Logo" }] : []),
    ...products.map((p) => ({ key: `p:${p.id}`, item: { url: p.image!, kind: "image" as const, name: p.name, source: "product" }, label: p.name })),
    ...(brand?.images ?? []).filter((u) => !products.some((p) => p.image === u)).map((u, i) => ({ key: `i:${u}`, item: { url: u, kind: "image" as const, name: `Photo ${i + 1}`, source: "brand" }, label: "Brand photo" })),
  ].map((t) => ({ ...t, onCanvas: library.some((a) => a.url === t.item.url && a.board) }));

  const toTile = (a: Doc<"mediaAssets">): Tile => ({ key: a._id, asset: a, onCanvas: !!a.board, label: a.name || a.prompt?.slice(0, 60) || a.kind, item: { assetId: a._id, url: a.url, kind: a.kind as DragItem["kind"], name: a.name, w: a.w, h: a.h } });
  const uploads = library.filter((a) => a.source === "upload" || a.source === "product" || a.source === "photo" || a.source === "logo" || a.source === "clip" || a.source === "music").map(toTile);
  const generated = library.filter((a) => a.source === "generated").map(toTile);

  const place = async (t: Tile) => {
    if (t.asset) {
      await placeAsset({ id: t.asset._id });
      return;
    }
    const existing = library.find((a) => a.url === t.item.url);
    if (existing) {
      await placeAsset({ id: existing._id });
      return;
    }
    const dims = await measureImage(t.item.url);
    await addAsset({ campaignId, asset: { url: t.item.url, kind: "image", source: t.item.source ?? "brand", name: t.item.name, ...dims }, place: true });
  };

  const files = async (list: FileList | null) => {
    if (!list?.length) return;
    await Promise.all(
      Array.from(list).map(async (f) => {
        setUploading((n) => n + 1);
        try {
          await upload(f);
        } catch (err) {
          notify((err as Error).message, "bad");
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  };

  return (
    <div
      className={cn("scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pt-4 pb-[calc(var(--dock-h,120px)+20px)]", over && "bg-blue-50/40")}
      data-board-scroll
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        void files(e.dataTransfer.files);
      }}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 px-3 py-4 text-sm text-muted-foreground transition-colors hover:border-neutral-400 hover:bg-neutral-50 hover:text-foreground"
      >
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {uploading ? `Uploading ${uploading}` : "Upload photos, clips or music"}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        hidden
        onChange={(e) => {
          const el = e.currentTarget;
          void files(el.files).then(() => (el.value = ""));
        }}
      />

      {brandTiles.length > 0 && (
        <Group title={brand ? `${brand.name}` : "Brand"} aside={<span className="text-[11px] text-muted-foreground">{brandTiles.length}</span>}>
          <div className="grid grid-cols-3 gap-2">
            {brandTiles.map((t) => (
              <TileView key={t.key} t={t} onAdd={() => place(t)} />
            ))}
          </div>
        </Group>
      )}
      {uploads.length > 0 && (
        <Group title="Uploads" aside={<span className="text-[11px] text-muted-foreground">{uploads.length}</span>}>
          <div className="grid grid-cols-3 gap-2">
            {uploads.map((t) => (
              <TileView key={t.key} t={t} onAdd={() => place(t)} />
            ))}
          </div>
        </Group>
      )}
      {generated.length > 0 && (
        <Group title="Generated" aside={<span className="text-[11px] text-muted-foreground">{generated.length}</span>}>
          <div className="grid grid-cols-3 gap-2">
            {generated.map((t) => (
              <TileView key={t.key} t={t} onAdd={() => place(t)} />
            ))}
          </div>
        </Group>
      )}
      {!brandTiles.length && !uploads.length && !generated.length && <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet. Upload your own photos and clips, or add a brand with products and photos.</p>}
      <p className="text-[11px] leading-4 text-muted-foreground">
        Drag onto the canvas, or onto a poster while editing it. {libraryUrls.size > 0 && "A tick means it is already on the canvas."}
      </p>
    </div>
  );
}
