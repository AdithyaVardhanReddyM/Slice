"use client";

// The bar over the page that changes with what is selected, as in Canva: for
// text its font, size, colour, weight, case, alignment and spacing; for a
// picture fill or fit, focal point, corners and shadow; for a shape its fill;
// for a logo its wordmark; for a QR code its link; and for anything its order,
// alignment, exact position, opacity, lock and delete (and, in a video, when
// it is on screen). A selected shot or sound track gets its own bar
// (shot-bar.tsx). With nothing selected it sets the page background. The
// editors' right side is Slice (item-agent.tsx), so every manual setting
// lives here.

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
  BringToFront,
  ChevronDown,
  Copy,
  Italic,
  Lock,
  Minus,
  Plus,
  SendToBack,
  Trash2,
  Unlock,
} from "lucide-react";
import { useState } from "react";
import { FORMATS, type Anim, type Layer, type MediaDoc, type TextLayer } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { useStudio } from "./context";
import { BarSep as Sep, ColorPick, ctl, ImagePreview, Num, Pop, Row, Seg, Swatch } from "./controls";
import { useLayerEdits } from "./edits";
import { AudioBar, ShotBar } from "./shot-bar";

function TextControls({ l }: { l: TextLayer }) {
  const { kit } = useStudio();
  const { patch } = useLayerEdits();
  const set = (p: Partial<TextLayer>) => patch(l.id, p);
  const family = l.font === "body" ? kit?.fonts.body.family : kit?.fonts.heading.family;
  return (
    <>
      <Pop trigger={<span className="flex w-36 items-center justify-between gap-1 truncate"><span className="truncate" style={{ fontFamily: family }}>{family ?? (l.font === "body" ? "Body" : "Heading")}</span><ChevronDown className="size-3.5 text-neutral-400" /></span>} title="Font">
        {(["heading", "body"] as const).map((f) => {
          const fam = f === "heading" ? kit?.fonts.heading.family : kit?.fonts.body.family;
          return (
            <button key={f} type="button" onClick={() => set({ font: f })} className={cn("flex items-center justify-between rounded-md px-2 py-2 text-left hover:bg-neutral-100", (l.font ?? "body") === f && "bg-neutral-100")}>
              <span className="text-lg" style={{ fontFamily: fam }}>
                {fam ?? f}
              </span>
              <span className="text-xs text-muted-foreground">{f === "heading" ? "Headings" : "Body"}</span>
            </button>
          );
        })}
        <p className="text-[11px] text-muted-foreground">The brand&apos;s two typefaces. Change them in its guidelines.</p>
      </Pop>
      <div className="flex shrink-0 items-center rounded-md ring-1 ring-black/[0.08]">
        <button type="button" className={cn(ctl, "h-7 rounded-r-none px-1.5")} onClick={() => set({ size: Math.max(6, Math.round(l.size * 0.92)) })} aria-label="Smaller">
          <Minus className="!size-3.5" />
        </button>
        <Num value={l.size} min={6} max={600} onChange={(size) => set({ size })} className="h-7 w-12 flex-none rounded-none bg-transparent px-1 text-center [&_input]:text-center" />
        <button type="button" className={cn(ctl, "h-7 rounded-l-none px-1.5")} onClick={() => set({ size: Math.min(600, Math.round(l.size * 1.08) + 1) })} aria-label="Bigger">
          <Plus className="!size-3.5" />
        </button>
      </div>
      <Pop trigger={<span className="flex flex-col items-center gap-0.5"><span className="text-[15px] leading-4 font-semibold text-neutral-800">A</span><span className="h-1 w-4 rounded-sm ring-1 ring-black/15" style={{ background: l.color }} /></span>} title="Text colour">
        <ColorPick value={l.color} kit={kit} onChange={(color) => set({ color: color ?? "#111111" })} />
      </Pop>
      <Sep />
      <button type="button" className={cn(ctl, "w-8 font-bold")} aria-pressed={(l.weight ?? 400) >= 600} onClick={() => set({ weight: (l.weight ?? 400) >= 600 ? 400 : 700 })} title="Bold">
        B
      </button>
      <button type="button" className={cn(ctl, "w-8")} aria-pressed={!!l.italic} onClick={() => set({ italic: l.italic ? undefined : true })} title="Italic">
        <Italic />
      </button>
      <button type="button" className={cn(ctl, "w-8 text-xs font-semibold")} aria-pressed={!!l.uppercase} onClick={() => set({ uppercase: l.uppercase ? undefined : true })} title="Capitals">
        aA
      </button>
      <button
        type="button"
        className={cn(ctl, "w-8")}
        title="Alignment"
        onClick={() => set({ align: l.align === "left" ? "center" : l.align === "center" ? "right" : "left" })}
      >
        {l.align === "center" ? <AlignCenter /> : l.align === "right" ? <AlignRight /> : <AlignLeft />}
      </button>
      <Pop trigger={<span className="text-xs font-medium">Spacing</span>} title="Spacing">
        <Row label="Line">
          <input type="range" min={0.6} max={2.4} step={0.05} value={l.lineHeight ?? 1.1} onChange={(e) => set({ lineHeight: Number(e.target.value) })} className="w-full accent-neutral-900" />
          <span className="w-9 text-right text-xs tabular-nums">{(l.lineHeight ?? 1.1).toFixed(2)}</span>
        </Row>
        <Row label="Letters">
          <input type="range" min={-0.1} max={0.5} step={0.01} value={l.tracking ?? 0} onChange={(e) => set({ tracking: Number(e.target.value) || undefined })} className="w-full accent-neutral-900" />
          <span className="w-9 text-right text-xs tabular-nums">{(l.tracking ?? 0).toFixed(2)}</span>
        </Row>
        <Row label="Vertical">
          <Seg value={l.valign ?? "top"} onChange={(valign) => set({ valign })} options={[{ value: "top", label: "Top" }, { value: "middle", label: "Mid" }, { value: "bottom", label: "End" }]} />
        </Row>
      </Pop>
      <Pop trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><Swatch value={l.bg} /> Box</span>} title="Box behind the text">
        <ColorPick value={l.bg} kit={kit} none onChange={(bg) => set({ bg })} />
        {l.bg && (
          <div className="grid grid-cols-3 gap-1.5">
            <Num label="↔" value={l.padX ?? 0} min={0} max={400} onChange={(padX) => set({ padX })} />
            <Num label="↕" value={l.padY ?? 0} min={0} max={400} onChange={(padY) => set({ padY })} />
            <Num label="◜" value={l.radius ?? 0} min={0} max={2000} onChange={(radius) => set({ radius })} />
          </div>
        )}
      </Pop>
      <button type="button" className={cn(ctl, "text-xs font-medium")} aria-pressed={!!l.shadow} onClick={() => set({ shadow: l.shadow ? undefined : true })} title="Shadow (helps text read over pictures)">
        Shadow
      </button>
    </>
  );
}

function LayerControls({ l }: { l: Layer }) {
  const { kit } = useStudio();
  const { patch } = useLayerEdits();
  const set = (p: Partial<Layer>) => patch(l.id, p);
  if (l.type === "text") return <TextControls l={l} />;
  if (l.type === "image")
    return (
      <>
        <Seg value={l.fit ?? "cover"} onChange={(fit) => set({ fit } as Partial<Layer>)} options={[{ value: "cover", label: "Fill" }, { value: "contain", label: "Fit" }]} className="w-32 flex-none" />
        <Pop trigger={<span className="text-xs font-medium">Focus</span>} title="What stays in view when it crops">
          <ImagePreview src={l.src} focal={l.focal} onFocal={(focal) => set({ focal } as Partial<Layer>)} />
          <p className="text-[11px] text-muted-foreground">Click the picture to set the point that stays in view.</p>
        </Pop>
        <Pop trigger={<span className="text-xs font-medium">Corners</span>} title="Corners">
          <Num value={l.radius ?? 0} min={0} max={2000} onChange={(radius) => set({ radius: radius || undefined } as Partial<Layer>)} suffix="px" />
          <button type="button" onClick={() => set({ radius: 9999 } as Partial<Layer>)} className="rounded-md bg-neutral-100 px-2 py-1 text-xs hover:bg-neutral-200">
            Round
          </button>
        </Pop>
        <button type="button" className={cn(ctl, "text-xs font-medium")} aria-pressed={!!l.shadow} onClick={() => set({ shadow: l.shadow ? undefined : true } as Partial<Layer>)}>
          Shadow
        </button>
      </>
    );
  if (l.type === "shape")
    return (
      <>
        <Pop trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><Swatch value={l.fill.includes("gradient") ? undefined : l.fill} /> Fill</span>} title="Fill">
          <ColorPick value={l.fill} kit={kit} onChange={(fill) => set({ fill: fill ?? "#000000" } as Partial<Layer>)} />
        </Pop>
        <Pop trigger={<span className="text-xs font-medium">Corners</span>} title="Corners">
          <Num value={l.radius ?? 0} min={0} max={2000} onChange={(radius) => set({ radius: radius || undefined } as Partial<Layer>)} suffix="px" />
          <button type="button" onClick={() => set({ radius: 9999 } as Partial<Layer>)} className="rounded-md bg-neutral-100 px-2 py-1 text-xs hover:bg-neutral-200">
            Round
          </button>
        </Pop>
      </>
    );
  if (l.type === "logo")
    return (
      <>
        <Pop trigger={<span className="text-xs font-medium">Wordmark</span>} title="Wordmark">
          <input value={l.text ?? ""} onChange={(e) => set({ text: e.target.value || undefined } as Partial<Layer>)} placeholder="The brand's name" className="h-8 w-full rounded-md bg-neutral-100/80 px-2 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-sky-500" />
          <p className="text-[11px] text-muted-foreground">{l.src ? "Shown only when there is no logo image." : "No logo image, so the wordmark shows in the heading font."}</p>
        </Pop>
        <Pop trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><Swatch value={l.color} /> Colour</span>} title="Wordmark colour">
          <ColorPick value={l.color} kit={kit} none onChange={(color) => set({ color } as Partial<Layer>)} />
          <p className="text-[11px] text-muted-foreground">Only the text wordmark takes a colour; logo images keep theirs.</p>
        </Pop>
      </>
    );
  if (l.type === "qr")
    return (
      <>
        <Pop trigger={<span className="text-xs font-medium">Link</span>} title="Where it opens">
          <UrlInput value={l.url} onChange={(url) => set({ url } as Partial<Layer>)} />
          <p className="text-[11px] text-muted-foreground">Keep strong contrast so phones can scan it.</p>
        </Pop>
        <Pop trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><Swatch value={l.color} /> Code</span>} title="Code colour">
          <ColorPick value={l.color} kit={kit} onChange={(color) => set({ color } as Partial<Layer>)} />
        </Pop>
        <Pop trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><Swatch value={l.bg} /> Behind</span>} title="Behind the code">
          <ColorPick value={l.bg} kit={kit} onChange={(bg) => set({ bg } as Partial<Layer>)} />
        </Pop>
      </>
    );
  return null;
}

function Arrange({ layers }: { layers: Layer[] }) {
  const { doc, editor } = useStudio();
  const { order, patch } = useLayerEdits();
  const ids = new Set(layers.map((l) => l.id));
  const one = layers.length === 1;
  const box = one ? { x: 0, y: 0, r: doc.w, b: doc.h } : { x: Math.min(...layers.map((l) => l.x)), y: Math.min(...layers.map((l) => l.y)), r: Math.max(...layers.map((l) => l.x + l.w)), b: Math.max(...layers.map((l) => l.y + l.h)) };
  const align = (fn: (l: Layer) => Partial<Layer>) => editor.update((d) => ({ ...d, layers: d.layers.map((l) => (ids.has(l.id) && !l.locked ? ({ ...l, ...fn(l) } as Layer) : l)) }));
  const b = "flex h-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 [&_svg]:size-4";
  const opacity = Math.round((layers[0].opacity ?? 1) * 100);
  return (
    <Pop trigger={<span className="text-xs font-medium">Position</span>} title={one ? "Position on the page" : "Align to each other"} className="w-72">
      {one && (
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => order(layers[0].id, "top")} className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-neutral-100 text-xs hover:bg-neutral-200">
            <BringToFront className="size-3.5" /> To front
          </button>
          <button type="button" onClick={() => order(layers[0].id, "bottom")} className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-neutral-100 text-xs hover:bg-neutral-200">
            <SendToBack className="size-3.5" /> To back
          </button>
        </div>
      )}
      <div className="grid grid-cols-6 gap-0.5 rounded-md bg-neutral-50 p-0.5">
        <button type="button" className={b} title="Left" onClick={() => align(() => ({ x: box.x }))}>
          <AlignHorizontalJustifyStart />
        </button>
        <button type="button" className={b} title="Centre" onClick={() => align((l) => ({ x: Math.round((box.x + box.r - l.w) / 2) }))}>
          <AlignHorizontalJustifyCenter />
        </button>
        <button type="button" className={b} title="Right" onClick={() => align((l) => ({ x: box.r - l.w }))}>
          <AlignHorizontalJustifyEnd />
        </button>
        <button type="button" className={b} title="Top" onClick={() => align(() => ({ y: box.y }))}>
          <AlignVerticalJustifyStart />
        </button>
        <button type="button" className={b} title="Middle" onClick={() => align((l) => ({ y: Math.round((box.y + box.b - l.h) / 2) }))}>
          <AlignVerticalJustifyCenter />
        </button>
        <button type="button" className={b} title="Bottom" onClick={() => align((l) => ({ y: box.b - l.h }))}>
          <AlignVerticalJustifyEnd />
        </button>
      </div>
      {one && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <Num label="X" value={layers[0].x} onChange={(x) => patch(layers[0].id, { x })} />
            <Num label="Y" value={layers[0].y} onChange={(y) => patch(layers[0].id, { y })} />
            <Num label="W" value={layers[0].w} min={1} onChange={(w) => patch(layers[0].id, { w })} />
            <Num label="H" value={layers[0].h} min={1} onChange={(h) => patch(layers[0].id, { h })} />
            <Num label="Turn" value={layers[0].rotation ?? 0} min={-360} max={360} suffix="°" onChange={(rotation) => patch(layers[0].id, { rotation: rotation || undefined })} className="col-span-2" />
          </div>
          <Row label="Opacity">
            <input type="range" min={0} max={100} value={opacity} onChange={(e) => patch(layers[0].id, { opacity: Number(e.target.value) >= 100 ? undefined : Number(e.target.value) / 100 })} className="w-full accent-neutral-900" />
            <span className="w-9 text-right text-xs tabular-nums">{opacity}%</span>
          </Row>
        </>
      )}
    </Pop>
  );
}

const ANIMS: { value: Anim; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "rise", label: "Rise" },
  { value: "slide", label: "Slide" },
];

/** When a layer is on screen in a video, and how it comes in. */
function Timing({ l, doc }: { l: Layer; doc: MediaDoc }) {
  const { patch } = useLayerEdits();
  const set = (p: Partial<Layer>) => patch(l.id, p);
  const total = (doc.video ?? []).reduce((s, c) => s + Math.max(0, c.out - c.in), 0);
  return (
    <Pop trigger={<span className="text-xs font-medium">Timing</span>} title={`On screen, of ${total.toFixed(1)} s`}>
      <div className="grid grid-cols-2 gap-1.5">
        <Num label="From" value={l.start ?? 0} min={0} max={total} step={0.1} suffix="s" onChange={(start) => set({ start: start > 0 ? start : undefined })} />
        <Num label="To" value={l.end ?? total} min={0} max={total} step={0.1} suffix="s" onChange={(end) => set({ end: end >= total - 0.05 ? undefined : end })} />
      </div>
      <Row label="Enter">
        <Seg value={l.anim === "pop" || l.anim === "wipe" ? "fade" : (l.anim ?? "none")} onChange={(anim) => set({ anim: anim === "none" ? undefined : anim })} options={ANIMS} />
      </Row>
      <p className="text-[11px] text-muted-foreground">Or pull its ends on the timeline.</p>
    </Pop>
  );
}

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
      placeholder="https://"
      className={cn("h-8 w-full rounded-md bg-neutral-100/80 px-2 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-sky-500", bad && "ring-1 ring-destructive")}
    />
  );
}

export function ContextBar() {
  const { doc, kit, editor, selection } = useStudio();
  const { remove, duplicate, patch } = useLayerEdits();
  const layers = selection.kind === "layers" ? doc.layers.filter((l) => selection.ids.includes(l.id)) : [];
  const one = layers.length === 1 ? layers[0] : null;
  const video = doc.kind === "video";
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-black/[0.06] bg-white px-3 [scrollbar-width:none]">
      {selection.kind === "clip" ? (
        <ShotBar key={selection.id} id={selection.id} />
      ) : selection.kind === "audio" ? (
        <AudioBar key={selection.id} id={selection.id} />
      ) : layers.length === 0 ? (
        <>
          <span className="pr-2 text-[13px] font-medium text-neutral-500">
            {FORMATS[doc.format].label}, {doc.w}×{doc.h}
          </span>
          <Sep />
          <Pop trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><Swatch value={doc.background.includes("gradient") ? undefined : doc.background} /> Background</span>} title="Page background">
            <ColorPick value={doc.background} kit={kit} onChange={(v) => editor.update((d) => ({ ...d, background: v ?? kit?.colors.background ?? "#ffffff" }))} />
          </Pop>
          <span className="ml-auto truncate pl-3 text-xs text-neutral-400">{video ? "Select a shot, a layer or a track to change it" : "Double-click text to edit it, or drag pictures in from the left"}</span>
        </>
      ) : (
        <>
          {one && <LayerControls l={one} />}
          {!one && <span className="pr-1 text-[13px] font-medium text-neutral-500">{layers.length} layers</span>}
          <Sep />
          <Arrange layers={layers} />
          {video && one && <Timing l={one} doc={doc} />}
          <span className="ml-auto" />
          <button type="button" className={cn(ctl, "w-8")} title="Duplicate (⌘D)" onClick={() => duplicate(layers.map((l) => l.id))}>
            <Copy />
          </button>
          {one && (
            <button type="button" className={cn(ctl, "w-8")} title={one.locked ? "Unlock" : "Lock"} onClick={() => patch(one.id, { locked: one.locked ? undefined : true })}>
              {one.locked ? <Lock /> : <Unlock />}
            </button>
          )}
          <button type="button" className={cn(ctl, "w-8 hover:bg-red-50 hover:text-red-600")} title="Delete (⌫)" onClick={() => remove(layers.map((l) => l.id))}>
            <Trash2 />
          </button>
        </>
      )}
    </div>
  );
}
