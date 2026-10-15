"use client";

// Choosing a picture for an image, a video poster, a section background or a
// quote's avatar: Pexels photos, an upload (Convex storage), the brand's own
// pictures (logo and item images), posters exported from Media, or a link.

import { useQuery } from "convex/react";
import { ImageUp, Link as LinkIcon, Search } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/pages/stream";
import { errorText } from "@/lib/email/labels";
import { Spinner } from "@/components/console/setup/atoms";
import { useImageUpload } from "@/components/console/email/kit/use-upload";
import { useEditorEnv } from "./context";
import { fieldClass } from "./fields";

export interface PickedImage {
  src: string;
  alt: string;
  /** "pexels" | "upload" | "brand" | "item" */
  source: string;
  credit?: string;
}

type Tab = "photos" | "upload" | "brand" | "media" | "link";

function Tile({ src, title, selected, onClick }: { src: string; title?: string; selected?: boolean; onClick: () => void }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn("aspect-square overflow-hidden rounded-md bg-muted ring-offset-1 transition-shadow", selected ? "ring-2 ring-blue-600" : "hover:ring-1 hover:ring-foreground/30")}
    >
      {/* Pexels, Convex storage and brand hosts. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
    </button>
  );
}

export function ImagePicker({ current, onPick, query: initialQuery = "", landscape = true }: { current?: string; onPick: (img: PickedImage) => void; query?: string; landscape?: boolean }) {
  const { brand, items } = useEditorEnv();
  const upload = useImageUpload();
  const [tab, setTab] = useState<Tab>("photos");
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PickedImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const exported = useQuery(api.media.exports, tab === "media" ? {} : "skip");
  const posters = (exported ?? []).filter((x) => x.mime.startsWith("image/"));

  async function search() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      // The Pages image route searches Pexels without touching the (Pages) brand when the model is "pexels".
      const { images } = await postJson<{ images: { src: string; alt: string; credit?: string }[] }>("/api/pages/image", { brand_id: brand._id, query: q, model: "pexels", aspect: landscape ? "16:9" : undefined });
      setResults((images ?? []).map((i) => ({ src: i.src, alt: i.alt, credit: i.credit, source: "pexels" })));
      if (!images?.length) setError("No photos found. Try other words.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const src = await upload(file);
      onPick({ src, alt: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "), source: "upload" });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const kit = (brand.kit ?? undefined) as { logo?: { src: string; alt: string }; icon?: string } | undefined;
  const brandImages: PickedImage[] = [
    ...(kit?.logo?.src ? [{ src: kit.logo.src, alt: kit.logo.alt || brand.name, source: "brand" }] : []),
    ...items.filter((i) => i.image).map((i) => ({ src: i.image as string, alt: i.name, source: "item" })),
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: "photos", label: "Photos" },
    { id: "upload", label: "Upload" },
    { id: "brand", label: "Brand" },
    { id: "media", label: "Media" },
    { id: "link", label: "Link" },
  ];

  return (
    <div className="space-y-2.5">
      <div role="tablist" className="inline-flex h-7 w-full items-center rounded-md bg-muted p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("h-6 flex-1 rounded-[5px] text-xs text-muted-foreground transition-colors hover:text-foreground", tab === t.id && "bg-background font-medium text-foreground shadow-xs")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "photos" && (
        <div className="space-y-2">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Pexels: reading nook, autumn" className={fieldClass} aria-label="Search photos" />
            <button type="submit" disabled={busy || !query.trim()} aria-label="Search" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white disabled:opacity-40">
              {busy ? <Spinner className="size-3.5" /> : <Search className="size-3.5" />}
            </button>
          </form>
          {results && results.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {results.map((r) => (
                <Tile key={r.src} src={r.src} title={r.credit} selected={current === r.src} onClick={() => onPick(r)} />
              ))}
            </div>
          )}
          {!results && <p className="text-[11px] leading-4 text-muted-foreground">Free photos from Pexels, credited for you.</p>}
        </div>
      )}
      {tab === "upload" && (
        <label
          className={cn("flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground", busy && "pointer-events-none opacity-60")}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files[0]);
          }}
        >
          {busy ? <Spinner className="size-4" /> : <ImageUp className="size-5" />}
          <span>Drop an image here, or click to choose one</span>
          <span className="text-[11px]">PNG, JPG, GIF or WebP, up to 8 MB</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => (void onFile(e.target.files?.[0]), (e.target.value = ""))} />
        </label>
      )}
      {tab === "brand" &&
        (brandImages.length ? (
          <div className="grid grid-cols-4 gap-1.5">
            {brandImages.map((r) => (
              <Tile key={r.src} src={r.src} title={r.alt} selected={current === r.src} onClick={() => onPick(r)} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">The brand has no pictures yet. Add items with images in the brand kit.</p>
        ))}
      {tab === "media" &&
        (exported === undefined ? (
          <Spinner className="size-4" />
        ) : posters.length ? (
          <div className="grid grid-cols-4 gap-1.5">
            {posters.map((r) => (
              <Tile key={r.url} src={r.url} title={`${r.name} · ${r.campaign}`} selected={current === r.url} onClick={() => onPick({ src: r.url, alt: r.name, source: "media" })} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Posters you export from Media show here.</p>
        ))}
      {tab === "link" && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const src = link.trim();
            if (/^https?:\/\//i.test(src)) onPick({ src, alt: "", source: "link" });
            else setError("Paste a link that starts with https://");
          }}
        >
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={fieldClass} aria-label="Image link" />
          <button type="submit" aria-label="Use this image" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white">
            <LinkIcon className="size-3.5" />
          </button>
        </form>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
