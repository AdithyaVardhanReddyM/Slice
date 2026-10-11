"use client";

import { Check, Image as ImageIcon, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/pages/stream";
import { IMAGE_MODES, docOf, type ImageRef, type Section, type Variant } from "@/lib/pages/types";
import { Field, Input, Select, Tab, TabList, TabPanel, Tabs, Textarea } from "@/components/console/form";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Hint, Thumb } from "../shared";

interface Slot {
  sectionId: string;
  label: string;
  current?: ImageRef;
  /** Which image within the section: "image", "images[2]", "items[1].image". */
  path: string;
}

function slotsOf(sections: Section[]): Slot[] {
  const out: Slot[] = [];
  for (const s of sections) {
    const name = "headline" in s && s.headline ? s.headline : s.id;
    switch (s.type) {
      case "hero":
      case "split":
      case "story":
      case "offer":
        out.push({ sectionId: s.id, label: `${s.type} · ${name}`, current: s.image, path: "image" });
        break;
      case "gallery":
        s.images.forEach((img, i) => out.push({ sectionId: s.id, label: `gallery · image ${i + 1}`, current: img, path: `images[${i}]` }));
        break;
      case "grid":
        s.items.forEach((it, i) => out.push({ sectionId: s.id, label: `grid · ${it.title}`, current: it.image, path: `items[${i}].image` }));
        break;
      case "locations":
        s.places.forEach((p, i) => out.push({ sectionId: s.id, label: `locations · ${p.name}`, current: p.image, path: `places[${i}].image` }));
        break;
      default:
        break;
    }
  }
  return out;
}

/** Builds the structured edit message the agent's patch_section tool understands. */
export function imageEditMessage(slot: Slot, img: { src: string; alt?: string; credit?: string; source?: string; prompt?: string }) {
  const where = slot.path === "image" ? `the image of section ${slot.sectionId}` : `${slot.path} of section ${slot.sectionId}`;
  const bits = [`Replace ${where} with ${img.src}`];
  if (img.alt) bits.push(`(alt: ${img.alt})`);
  const meta = [img.source ? `source: ${img.source}` : null, img.credit ? `credit: ${img.credit}` : null, img.prompt ? `prompt: ${img.prompt}` : null].filter(Boolean);
  if (meta.length) bits.push(`[${meta.join("; ")}]`);
  return bits.join(" ") + ". Keep everything else unchanged.";
}

export function ImageTool({
  brandId,
  variant,
  defaultMode,
  onApply,
  disabled,
}: {
  brandId: string;
  variant: Variant | null;
  defaultMode: string;
  onApply: (message: string) => void;
  disabled?: boolean;
}) {
  const doc = docOf(variant);
  const slots = useMemo(() => (doc ? slotsOf(doc.sections) : []), [doc]);
  const [slotKey, setSlotKey] = useState("");
  const slot = slots.find((s) => `${s.sectionId}:${s.path}` === slotKey) ?? slots[0] ?? null;
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(defaultMode === "pexels" ? "nano-banana-2" : defaultMode);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [results, setResults] = useState<ImageRef[]>([]);
  const [picked, setPicked] = useState<ImageRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const { images } = await postJson<{ images: ImageRef[] }>("/api/pages/image", { brand_id: brandId, query, model: "pexels" });
      setResults(images ?? []);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const { images } = await postJson<{ images: ImageRef[] }>("/api/pages/image", { brand_id: brandId, prompt, model, aspect: "16:9" });
      setResults(images ?? []);
      if (images?.[0]) setPicked(images[0]);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  function apply(img: { src: string; alt?: string; credit?: string; source?: string; prompt?: string }) {
    if (!slot) return;
    onApply(imageEditMessage(slot, img));
  }

  if (!doc) return <Hint>Generate this version first; then you can swap any of its images.</Hint>;
  if (slots.length === 0) return <Hint>This version has no image slots.</Hint>;

  return (
    <div className="space-y-4 text-sm">
      <Field label="Which image">
        <Select value={slot ? `${slot.sectionId}:${slot.path}` : ""} onChange={(e) => setSlotKey(e.target.value)}>
          {slots.map((s) => (
            <option key={`${s.sectionId}:${s.path}`} value={`${s.sectionId}:${s.path}`}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      {slot?.current && (
        <div className="flex items-center gap-3 rounded-lg border p-2">
          <Thumb src={slot.current.src} className="h-12 w-20" />
          <div className="min-w-0 text-xs text-muted-foreground">
            <div className="truncate">{slot.current.alt || "No alt text"}</div>
            <div className="truncate">
              {slot.current.source}
              {slot.current.credit ? ` · ${slot.current.credit}` : ""}
            </div>
          </div>
        </div>
      )}
      <Tabs defaultValue="pexels" onValueChange={() => setResults([])}>
        <TabList className="mb-4">
          <Tab value="pexels">Search Pexels</Tab>
          <Tab value="generate">Generate</Tab>
          <Tab value="url">Paste URL</Tab>
        </TabList>
        <TabPanel value="pexels" className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void search();
            }}
          >
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="pour-over coffee, morning light" />
            <Button type="submit" variant="outline" disabled={busy || !query.trim()}>
              {busy ? <Spinner /> : <Search />}
            </Button>
          </form>
        </TabPanel>
        <TabPanel value="generate" className="space-y-3">
          <Field label="Describe the image">
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A ceramic cup of coffee on a sunlit wooden counter, warm natural light, shallow depth of field" />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Model" className="flex-1">
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                {IMAGE_MODES.filter((m) => m.value !== "pexels").map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={generate} disabled={busy || !prompt.trim()}>
              {busy ? <Spinner data-icon="inline-start" /> : <ImageIcon data-icon="inline-start" />}
              Generate
            </Button>
          </div>
        </TabPanel>
        <TabPanel value="url" className="space-y-3">
          <Field label="Image URL" hint="Any public image. The agent stores a copy on upload-by-URL when the source allows it.">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/photo.jpg" />
          </Field>
          <Field label="Alt text" optional>
            <Input value={alt} onChange={(e) => setAlt(e.target.value)} />
          </Field>
          {url && <Thumb src={url} className="h-32 w-full" />}
          <Button onClick={() => apply({ src: url.trim(), alt: alt.trim() || undefined, source: "upload" })} disabled={disabled || !/^https?:\/\//i.test(url.trim())}>
            Use this image
          </Button>
        </TabPanel>
      </Tabs>
      {error && <p className="text-destructive">{error}</p>}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {results.map((img, i) => {
              const on = picked?.src === img.src;
              return (
                <button
                  key={`${img.src}-${i}`}
                  type="button"
                  onClick={() => setPicked(img)}
                  aria-pressed={on}
                  className={cn("relative overflow-hidden rounded-lg ring-1 ring-foreground/10 transition-shadow", on && "ring-2 ring-foreground")}
                >
                  <Thumb src={img.src} alt={img.alt} className="aspect-[4/3] w-full" rounded="rounded-none" />
                  {on && (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                      <Check className="size-3" />
                    </span>
                  )}
                  {img.credit && <span className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1.5 py-0.5 text-left text-[10px] text-white">{img.credit}</span>}
                </button>
              );
            })}
          </div>
          <Button onClick={() => picked && apply(picked)} disabled={disabled || !picked} className="w-full">
            Use the selected image
          </Button>
        </div>
      )}
    </div>
  );
}
