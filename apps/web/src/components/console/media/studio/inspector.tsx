"use client";

// The Design panel: what is selected, and every setting it has. Nothing
// selected shows the creative (background, sizes, layers); a layer shows its
// box, type settings and video timing; a shot or a sound track shows its
// generation buttons with what each would cost.

import { useMutation } from "convex/react";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowUp,
  Bold,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Italic,
  Lock,
  QrCode,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { FORMATS, FORMAT_KEYS, newId, type Anim, type FormatPreset, type Layer, type MediaDoc, type TextLayer } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Select } from "@/components/console/form";
import { useStudio } from "./context";
import { ColorPick, ImagePreview, Num, Row, Section, Seg, SmallButton, Toggle } from "./controls";
import { layerLabel } from "./layers";
import { AudioPanel, ShotPanel } from "./shot-panel";

const TYPE_ICON: Record<Layer["type"], ReactNode> = {
  text: <Type />,
  image: <ImageIcon />,
  logo: <Sparkles />,
  shape: <Shapes />,
  qr: <QrCode />,
};

export function Inspector() {
  const { selection, doc } = useStudio();
  if (!doc) return <p className="p-4 text-sm text-muted-foreground">Pick a creative.</p>;
  if (selection.kind === "clip") return <ShotPanel key={selection.id} id={selection.id} />;
  if (selection.kind === "audio") return <AudioPanel key={selection.id} id={selection.id} />;
  if (selection.kind === "layers") {
    const layers = doc.layers.filter((l) => selection.ids.includes(l.id));
    if (layers.length === 1) return <LayerPanel key={layers[0].id} layer={layers[0]} />;
    if (layers.length > 1) return <MultiPanel layers={layers} />;
  }
  return <CreativePanel />;
}

/* Edits ------------------------------------------------------------------------ */

export function useLayerEdits() {
  const { editor, select } = useStudio();
  const patch = (id: string, p: Partial<Layer>, opts?: { history?: boolean }) => editor.update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...p } as Layer) : l)) }), opts);
  const remove = (ids: string[]) => {
    editor.update((d) => ({ ...d, layers: d.layers.filter((l) => !ids.includes(l.id)) }));
    select({ kind: "none" });
  };
  const duplicate = (ids: string[]) => {
    const copies: string[] = [];
    editor.update((d) => {
      const layers = [...d.layers];
      for (const id of ids) {
        const i = layers.findIndex((l) => l.id === id);
        if (i < 0) continue;
        const copy = { ...layers[i], id: newId("l"), x: layers[i].x + 24, y: layers[i].y + 24, locked: undefined } as Layer;
        copies.push(copy.id);
        layers.splice(i + 1, 0, copy);
      }
      return { ...d, layers };
    });
    select({ kind: "layers", ids: copies });
  };
  /** +1 brings forward, -1 sends back, "top" / "bottom" all the way. */
  const order = (id: string, dir: 1 | -1 | "top" | "bottom") =>
    editor.update((d) => {
      const layers = [...d.layers];
      const i = layers.findIndex((l) => l.id === id);
      if (i < 0) return d;
      const [l] = layers.splice(i, 1);
      const j = dir === "top" ? layers.length : dir === "bottom" ? 0 : Math.max(0, Math.min(layers.length, i + dir));
      layers.splice(j, 0, l);
      return { ...d, layers };
    });
  return { patch, remove, duplicate, order, checkpoint: editor.checkpoint };
}

/* Creative --------------------------------------------------------------------- */

function CreativePanel() {
  const { creative, creatives, doc, kit, editor, selection, select, campaign } = useStudio();
  const resize = useMutation(api.media.resize);
  const duplicate = useMutation(api.media.duplicate);
  const removeCreative = useMutation(api.media.removeCreative);
  const { patch, order } = useLayerEdits();
  const [busy, setBusy] = useState<string | null>(null);
  if (!creative || !doc) return null;
  const spec = FORMATS[doc.format];
  const have = new Set(creatives.filter((c) => c.audienceKey === creative.audienceKey).map((c) => c.format));
  const missing = FORMAT_KEYS.filter((f) => !have.has(f) && (doc.kind === "poster" || FORMATS[f].video));
  const audience = (campaign.audiences as { id: string; name: string }[]).find((a) => a.id === creative.audienceKey);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await editor.flush();
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <Section title="Creative">
        <p className="text-sm font-medium">{creative.name}</p>
        <p className="text-xs text-muted-foreground">
          {spec.label} · {doc.w}×{doc.h} · {doc.kind === "video" ? "Video" : "Poster"}
          {audience ? ` · ${audience.name}` : ""}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <SmallButton disabled={!!busy} onClick={() => void run("dup", () => duplicate({ id: creative._id }))}>
            <Copy /> Duplicate
          </SmallButton>
          <SmallButton
            tone="danger"
            disabled={!!busy}
            onClick={() => {
              if (window.confirm(`Delete “${creative.name}”? Its history goes too.`)) void run("del", () => removeCreative({ id: creative._id }));
            }}
          >
            <Trash2 /> Delete
          </SmallButton>
        </div>
      </Section>
      <Section title="Background">
        <ColorPick value={doc.background} kit={kit} onChange={(v) => editor.update((d) => ({ ...d, background: v ?? kit?.colors.background ?? "#ffffff" }))} />
      </Section>
      {missing.length > 0 && (
        <Section title="Other sizes" aside={<span className="text-[11px] text-muted-foreground">Free: layout only</span>}>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((f: FormatPreset) => (
              <SmallButton key={f} disabled={!!busy} onClick={() => void run(f, () => resize({ id: creative._id, formats: [f] }))} title={FORMATS[f].hint}>
                + {FORMATS[f].label}
              </SmallButton>
            ))}
          </div>
          {doc.kind === "video" && <p className="text-[11px] leading-4 text-muted-foreground">Shots are cropped around their focal point. Regenerate the ones that matter in the new shape.</p>}
        </Section>
      )}
      <Section title="Layers" aside={<span className="text-[11px] text-muted-foreground">Top first</span>}>
        <ul className="-mx-1.5 space-y-0.5">
          {[...doc.layers].reverse().map((l) => {
            const active = selection.kind === "layers" && selection.ids.includes(l.id);
            return (
              <li key={l.id} className={cn("group flex h-8 items-center gap-2 rounded-md px-1.5 text-xs", active ? "bg-sky-50 text-sky-900" : "hover:bg-neutral-100")}>
                <button type="button" onClick={() => select({ kind: "layers", ids: [l.id] })} className={cn("flex min-w-0 flex-1 items-center gap-2 text-left [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground", l.hidden && "opacity-50")}>
                  {TYPE_ICON[l.type]}
                  <span className="truncate">{layerLabel(l)}</span>
                </button>
                <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 [&_button]:flex [&_button]:size-6 [&_button]:items-center [&_button]:justify-center [&_button]:rounded [&_button:hover]:bg-black/5 [&_svg]:size-3.5">
                  <button type="button" title="Forward" onClick={() => order(l.id, 1)}>
                    <ArrowUp />
                  </button>
                  <button type="button" title="Back" onClick={() => order(l.id, -1)}>
                    <ArrowDown />
                  </button>
                </span>
                <span className={cn("flex items-center [&_button]:flex [&_button]:size-6 [&_button]:items-center [&_button]:justify-center [&_button]:rounded [&_button:hover]:bg-black/5 [&_svg]:size-3.5", !l.hidden && !l.locked && "opacity-0 group-hover:opacity-100")}>
                  <button type="button" title={l.locked ? "Unlock" : "Lock"} onClick={() => patch(l.id, { locked: l.locked ? undefined : true })}>
                    {l.locked ? <Lock /> : <Unlock />}
                  </button>
                  <button type="button" title={l.hidden ? "Show" : "Hide"} onClick={() => patch(l.id, { hidden: l.hidden ? undefined : true })}>
                    {l.hidden ? <EyeOff /> : <Eye />}
                  </button>
                </span>
              </li>
            );
          })}
          {doc.layers.length === 0 && <li className="px-1.5 py-2 text-xs text-muted-foreground">No layers yet. Add text from the toolbar or drop a picture from the library.</li>}
        </ul>
      </Section>
    </div>
  );
}

/* One layer ---------------------------------------------------------------------- */

function LayerPanel({ layer: l }: { layer: Layer }) {
  const { doc, kit, ask } = useStudio();
  const { patch, remove, duplicate, order } = useLayerEdits();
  const set = (p: Partial<Layer>) => patch(l.id, p);
  if (!doc) return null;
  return (
    <div>
      <Section
        title={
          <span className="flex items-center gap-1.5 text-foreground [&_svg]:size-3.5">
            {TYPE_ICON[l.type]} {layerLabel(l)}
          </span>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          <SmallButton onClick={() => ask({ id: l.id, label: layerLabel(l), type: l.type, text: l.type === "text" ? l.text : layerLabel(l) })}>
            <Sparkles /> Ask AI
          </SmallButton>
          <SmallButton onClick={() => duplicate([l.id])} title="Duplicate (⌘D)">
            <Copy />
          </SmallButton>
          <SmallButton onClick={() => order(l.id, "top")} title="Bring to front">
            <ArrowUp />
          </SmallButton>
          <SmallButton onClick={() => order(l.id, "bottom")} title="Send to back">
            <ArrowDown />
          </SmallButton>
          <SmallButton onClick={() => set({ locked: l.locked ? undefined : true })} title={l.locked ? "Unlock" : "Lock"}>
            {l.locked ? <Lock /> : <Unlock />}
          </SmallButton>
          <SmallButton tone="danger" onClick={() => remove([l.id])} title="Delete (⌫)">
            <Trash2 />
          </SmallButton>
        </div>
      </Section>
      {l.type === "text" && <TextSettings l={l} set={set} />}
      {l.type === "image" && (
        <Section title="Photo">
          <ImagePreview src={l.src} focal={l.focal} onFocal={(focal) => set({ focal })} />
          <Row label="Fit">
            <Seg value={l.fit ?? "cover"} onChange={(fit) => set({ fit })} options={[{ value: "cover", label: "Fill" }, { value: "contain", label: "Fit" }]} />
          </Row>
          <Row label="Corners">
            <Num value={l.radius ?? 0} min={0} max={2000} onChange={(radius) => set({ radius: radius || undefined })} suffix="px" />
            <Toggle on={l.shadow} onChange={(shadow) => set({ shadow: shadow || undefined })}>
              Shadow
            </Toggle>
          </Row>
          <Row label="Role">
            <Select value={l.role ?? "photo"} onChange={(e) => set({ role: e.target.value as "photo" })} className="h-7 text-xs">
              <option value="photo">Photo</option>
              <option value="product">Product</option>
              <option value="background">Background</option>
            </Select>
          </Row>
          <p className="text-[11px] text-muted-foreground">Click the picture to set what stays in view when it crops.</p>
        </Section>
      )}
      {l.type === "logo" && (
        <Section title="Logo">
          {l.src ? <ImagePreview src={l.src} contain /> : <p className="text-xs text-muted-foreground">No logo image: the wordmark shows.</p>}
          <Row label="Wordmark">
            <input value={l.text ?? ""} onChange={(e) => set({ text: e.target.value || undefined })} className="h-7 w-full rounded-md bg-neutral-100/80 px-2 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-sky-500" />
          </Row>
          <Row label="Colour">
            <ColorPick value={l.color} kit={kit} none onChange={(color) => set({ color })} />
          </Row>
        </Section>
      )}
      {l.type === "shape" && (
        <Section title="Shape">
          <Row label="Fill">
            <ColorPick value={l.fill} kit={kit} onChange={(fill) => set({ fill: fill ?? "#000000" })} />
          </Row>
          <Row label="Corners">
            <Num value={l.radius ?? 0} min={0} max={2000} onChange={(radius) => set({ radius: radius || undefined })} suffix="px" />
            <SmallButton onClick={() => set({ radius: 9999 })}>Round</SmallButton>
          </Row>
        </Section>
      )}
      {l.type === "qr" && (
        <Section title="QR code">
          <Row label="Link">
            <UrlInput value={l.url} onChange={(url) => set({ url })} />
          </Row>
          <Row label="Colour">
            <ColorPick value={l.color} kit={kit} onChange={(color) => set({ color })} />
          </Row>
          <Row label="Behind">
            <ColorPick value={l.bg} kit={kit} onChange={(bg) => set({ bg })} />
          </Row>
          <p className="text-[11px] text-muted-foreground">Keep strong contrast so phones can scan it.</p>
        </Section>
      )}
      <Section title="Position">
        <div className="grid grid-cols-2 gap-1.5">
          <Num label="X" value={l.x} onChange={(x) => set({ x })} />
          <Num label="Y" value={l.y} onChange={(y) => set({ y })} />
          <Num label="W" value={l.w} min={1} onChange={(w) => set({ w })} />
          <Num label="H" value={l.h} min={1} onChange={(h) => set({ h })} />
          <Num label="↻" value={l.rotation ?? 0} min={-360} max={360} suffix="°" onChange={(rotation) => set({ rotation: rotation || undefined })} />
          <Num label="α" value={Math.round((l.opacity ?? 1) * 100)} min={0} max={100} suffix="%" onChange={(o) => set({ opacity: o >= 100 ? undefined : o / 100 })} />
        </div>
        <AlignButtons layers={[l]} doc={doc} />
      </Section>
      {doc.kind === "video" && <TimingSection l={l} set={set} doc={doc} />}
    </div>
  );
}

function TextSettings({ l, set }: { l: TextLayer; set: (p: Partial<TextLayer>) => void }) {
  const { kit } = useStudio();
  const { patch, checkpoint } = useLayerEdits();
  return (
    <>
      <Section title="Text">
        <textarea
          value={l.text}
          onFocus={checkpoint}
          onChange={(e) => patch(l.id, { text: e.target.value }, { history: false })}
          rows={Math.min(6, Math.max(2, l.text.split("\n").length))}
          className="w-full resize-none rounded-md bg-neutral-100/80 px-2 py-1.5 text-sm leading-5 outline-none focus:bg-white focus:ring-1 focus:ring-sky-500"
        />
        <Row label="Font">
          <Seg
            value={l.font ?? "body"}
            onChange={(font) => set({ font })}
            options={[
              { value: "heading", label: <span className="truncate">{kit?.fonts.heading.family ?? "Heading"}</span> },
              { value: "body", label: <span className="truncate">{kit?.fonts.body.family ?? "Body"}</span> },
            ]}
          />
        </Row>
        <Row label="Size">
          <Num value={l.size} min={6} max={600} onChange={(size) => set({ size })} suffix="px" />
          <Select value={String(l.weight ?? 400)} onChange={(e) => set({ weight: Number(e.target.value) })} className="h-7 w-24 text-xs">
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Style">
          <Seg
            value={l.align ?? "left"}
            onChange={(align) => set({ align })}
            options={[
              { value: "left", label: <AlignLeft className="size-3.5" />, title: "Left" },
              { value: "center", label: <AlignCenter className="size-3.5" />, title: "Centre" },
              { value: "right", label: <AlignRight className="size-3.5" />, title: "Right" },
            ]}
          />
          <Toggle on={l.uppercase} onChange={(uppercase) => set({ uppercase: uppercase || undefined })} title="Capitals">
            Aa
          </Toggle>
          <Toggle on={l.italic} onChange={(italic) => set({ italic: italic || undefined })} title="Italic">
            <Italic className="size-3.5" />
          </Toggle>
          <Toggle on={(l.weight ?? 400) >= 600} onChange={(b) => set({ weight: b ? 700 : 400 })} title="Bold">
            <Bold className="size-3.5" />
          </Toggle>
        </Row>
        <Row label="Vertical">
          <Seg
            value={l.valign ?? "top"}
            onChange={(valign) => set({ valign })}
            options={[
              { value: "top", label: "Top" },
              { value: "middle", label: "Middle" },
              { value: "bottom", label: "Bottom" },
            ]}
          />
        </Row>
        <Row label="Spacing">
          <Num label="Line" value={l.lineHeight ?? 1.15} min={0.6} max={3} step={0.05} onChange={(lineHeight) => set({ lineHeight })} />
          <Num label="Letter" value={l.tracking ?? 0} min={-0.2} max={1} step={0.01} onChange={(tracking) => set({ tracking: tracking || undefined })} />
        </Row>
        <Row label="Colour">
          <ColorPick value={l.color} kit={kit} onChange={(color) => set({ color: color ?? "#111111" })} />
        </Row>
        <Row label="Shadow">
          <Toggle on={l.shadow} onChange={(shadow) => set({ shadow: shadow || undefined })}>
            {l.shadow ? "On" : "Off"}
          </Toggle>
        </Row>
        <Row label="Role">
          <Select value={l.role ?? "body"} onChange={(e) => set({ role: e.target.value as TextLayer["role"] })} className="h-7 text-xs">
            {["headline", "subhead", "body", "cta", "price", "label", "caption"].map((r) => (
              <option key={r} value={r}>
                {r === "cta" ? "Call to action" : r[0].toUpperCase() + r.slice(1)}
              </option>
            ))}
          </Select>
        </Row>
      </Section>
      <Section title="Box behind">
        <ColorPick value={l.bg} kit={kit} none onChange={(bg) => set({ bg })} />
        {l.bg && (
          <div className="grid grid-cols-3 gap-1.5">
            <Num label="↔" value={l.padX ?? 0} min={0} max={400} onChange={(padX) => set({ padX })} />
            <Num label="↕" value={l.padY ?? 0} min={0} max={400} onChange={(padY) => set({ padY })} />
            <Num label="◜" value={l.radius ?? 0} min={0} max={2000} onChange={(radius) => set({ radius })} />
          </div>
        )}
      </Section>
    </>
  );
}

const ANIMS: { value: Anim; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "rise", label: "Rise" },
  { value: "slide", label: "Slide" },
];

function TimingSection({ l, set, doc }: { l: Layer; set: (p: Partial<Layer>) => void; doc: MediaDoc }) {
  const total = (doc.video ?? []).reduce((s, c) => s + Math.max(0, c.out - c.in), 0);
  return (
    <Section title="On screen" aside={<span className="text-[11px] text-muted-foreground">of {total.toFixed(1)} s</span>}>
      <div className="grid grid-cols-2 gap-1.5">
        <Num label="From" value={l.start ?? 0} min={0} max={total} step={0.1} suffix="s" onChange={(start) => set({ start: start > 0 ? start : undefined })} />
        <Num label="To" value={l.end ?? total} min={0} max={total} step={0.1} suffix="s" onChange={(end) => set({ end: end >= total - 0.05 ? undefined : end })} />
      </div>
      <Row label="Enter">
        <Seg value={l.anim === "pop" || l.anim === "wipe" ? "fade" : (l.anim ?? "none")} onChange={(anim) => set({ anim: anim === "none" ? undefined : anim })} options={ANIMS} />
      </Row>
    </Section>
  );
}

function AlignButtons({ layers, doc }: { layers: Layer[]; doc: MediaDoc }) {
  const { editor } = useStudio();
  const ids = new Set(layers.map((l) => l.id));
  // One layer aligns to the frame; several align to their shared box.
  const one = layers.length === 1;
  const box = one ? { x: 0, y: 0, r: doc.w, b: doc.h } : { x: Math.min(...layers.map((l) => l.x)), y: Math.min(...layers.map((l) => l.y)), r: Math.max(...layers.map((l) => l.x + l.w)), b: Math.max(...layers.map((l) => l.y + l.h)) };
  const align = (fn: (l: Layer) => Partial<Layer>) => editor.update((d) => ({ ...d, layers: d.layers.map((l) => (ids.has(l.id) && !l.locked ? ({ ...l, ...fn(l) } as Layer) : l)) }));
  const btn = "flex h-7 flex-1 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 [&_svg]:size-3.5";
  return (
    <div className="flex gap-0.5 rounded-md bg-neutral-100/60 p-0.5">
      <button type="button" className={btn} title="Left" onClick={() => align(() => ({ x: box.x }))}>
        <AlignHorizontalJustifyStart />
      </button>
      <button type="button" className={btn} title="Centre" onClick={() => align((l) => ({ x: Math.round((box.x + box.r - l.w) / 2) }))}>
        <AlignHorizontalJustifyCenter />
      </button>
      <button type="button" className={btn} title="Right" onClick={() => align((l) => ({ x: box.r - l.w }))}>
        <AlignHorizontalJustifyEnd />
      </button>
      <button type="button" className={btn} title="Top" onClick={() => align(() => ({ y: box.y }))}>
        <AlignVerticalJustifyStart />
      </button>
      <button type="button" className={btn} title="Middle" onClick={() => align((l) => ({ y: Math.round((box.y + box.b - l.h) / 2) }))}>
        <AlignVerticalJustifyCenter />
      </button>
      <button type="button" className={btn} title="Bottom" onClick={() => align((l) => ({ y: box.b - l.h }))}>
        <AlignVerticalJustifyEnd />
      </button>
    </div>
  );
}

function MultiPanel({ layers }: { layers: Layer[] }) {
  const { doc, ask } = useStudio();
  const { remove, duplicate } = useLayerEdits();
  if (!doc) return null;
  const ids = layers.map((l) => l.id);
  return (
    <div>
      <Section title={`${layers.length} layers`}>
        <AlignButtons layers={layers} doc={doc} />
        <div className="flex flex-wrap gap-1.5">
          <SmallButton onClick={() => ask({ id: ids.join(","), label: `${layers.length} layers`, type: "group", text: layers.map(layerLabel).join(" · ") })}>
            <Sparkles /> Ask AI
          </SmallButton>
          <SmallButton onClick={() => duplicate(ids)}>
            <Copy /> Duplicate
          </SmallButton>
          <SmallButton tone="danger" onClick={() => remove(ids)}>
            <Trash2 /> Delete
          </SmallButton>
        </div>
      </Section>
    </div>
  );
}

/* Bits --------------------------------------------------------------------------- */

function UrlInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const bad = draft !== null && !/^https?:\/\/\S+$/i.test(draft.trim());
  return (
    <input
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && !bad) onChange(draft.trim());
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn("h-7 w-full rounded-md bg-neutral-100/80 px-2 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-sky-500", bad && "ring-1 ring-destructive")}
    />
  );
}
