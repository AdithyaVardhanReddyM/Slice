"use client";

// The Media stage: draws a MediaDoc (poster or video at a time t) at its real
// pixel size, scaled to fit its box. The studio canvas, the thumbnails, the
// player and the /render/media export page all use it, so what the merchant
// sees is what gets exported. Text shrinks to fit its box once the kit's
// fonts have loaded, the same in every place.

import QRCode from "qrcode";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { clipLength, docDuration, fontStack, fontsHrefs, layerVisibleAt, timeline, type AudioClip, type Clip, type ImageLayer, type KenBurns, type Layer, type LogoLayer, type MediaDoc, type MediaKit, type QrLayer, type TextLayer } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { GenField, seedOf } from "./gen-field";

/* Fonts and fitting ------------------------------------------------------------ */

/** The kit's Google Fonts, hoisted into <head> once per URL. */
export function KitFonts({ kit }: { kit: Pick<MediaKit, "fonts"> | undefined }) {
  return (
    <>
      {fontsHrefs(kit).map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="media-fonts" />
      ))}
    </>
  );
}

/** Bumps when web fonts finish loading, so text can be fitted again. */
function useFontsVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    const bump = () => setV((x) => x + 1);
    void fonts.ready.then(bump);
    fonts.addEventListener("loadingdone", bump);
    return () => fonts.removeEventListener("loadingdone", bump);
  }, []);
  return v;
}

/** Scale that fits a w×h frame inside the element's box. */
export function useFitScale(ref: RefObject<HTMLElement | null>, w: number, h: number, mode: "contain" | "width" = "contain") {
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      setScale(mode === "width" || !r.height ? r.width / w : Math.min(r.width / w, r.height / h));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, w, h, mode]);
  return scale;
}

/* Layers --------------------------------------------------------------------- */

interface LayerCtx {
  kit: MediaKit | undefined;
  /** Seconds into the video; undefined draws every layer in its final state. */
  t?: number;
  duration: number;
  fontsVersion: number;
  onFit?: (id: string, size: number) => void;
}

const ANIM_IN = 0.45;
const MOVE = 0.55;
const FADE_OUT = 0.3;

/** Entrance and exit of a layer on a video, as CSS. Mirrors render.py's ffmpeg overlays
 *  (alpha fade in 0.45s, rise 70px / slide 110px eased over 0.55s, fade out 0.3s), so the
 *  preview matches the export; pop and wipe export as a fade too. */
function animStyle(l: Layer, ctx: LayerCtx): CSSProperties {
  const anim = l.anim ?? "none";
  if (ctx.t === undefined || anim === "none") return {};
  const start = l.start ?? 0;
  const end = Math.min(l.end ?? ctx.duration, ctx.duration);
  const fadeIn = Math.min(1, Math.max(0, (ctx.t - start) / ANIM_IN));
  const fadeOut = end < ctx.duration - 0.05 ? Math.min(1, Math.max(0, (end - ctx.t) / FADE_OUT)) : 1;
  const move = Math.pow(1 - Math.min(1, Math.max(0, (ctx.t - start) / MOVE)), 3);
  const style: CSSProperties = { opacity: (l.opacity ?? 1) * fadeIn * fadeOut };
  if (anim === "rise") style.translate = `0 ${70 * move}px`;
  if (anim === "slide") style.translate = `${-110 * move}px 0`;
  return style;
}

function boxStyle(l: Layer): CSSProperties {
  return {
    position: "absolute",
    left: l.x,
    top: l.y,
    width: l.w,
    height: l.h,
    opacity: l.opacity ?? 1,
    ...(l.rotation ? { rotate: `${l.rotation}deg` } : {}),
  };
}

function burnTransform(kind: KenBurns | undefined, p: number): string | undefined {
  const q = Math.min(1, Math.max(0, p));
  switch (kind) {
    case "in":
      return `scale(${1 + 0.12 * q})`;
    case "out":
      return `scale(${1.12 - 0.12 * q})`;
    case "left":
      return `scale(1.12) translateX(${4 - 8 * q}%)`;
    case "right":
      return `scale(1.12) translateX(${-4 + 8 * q}%)`;
    default:
      return undefined;
  }
}

function Picture({ src, fit = "cover", focal, transform, className, style }: { src: string; fit?: "cover" | "contain"; focal?: { x: number; y: number }; transform?: string; className?: string; style?: CSSProperties }) {
  return (
    // Generated, uploaded and brand images come from many hosts and are drawn at export size.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      className={cn("size-full select-none", className)}
      style={{ objectFit: fit, objectPosition: focal ? `${focal.x * 100}% ${focal.y * 100}%` : "50% 50%", transform, transformOrigin: focal ? `${focal.x * 100}% ${focal.y * 100}%` : "50% 50%", ...style }}
    />
  );
}

function ImageView({ l }: { l: ImageLayer }) {
  return (
    <div className="size-full overflow-hidden" style={{ borderRadius: l.radius, boxShadow: l.shadow ? "0 30px 60px -20px rgba(0,0,0,0.45)" : undefined }}>
      <Picture src={l.src} fit={l.fit} focal={l.focal} />
    </div>
  );
}

/** Text that shrinks (never grows) until it fits its box. */
function FitText({ l, ctx, family, fitKey, children }: { l: Pick<TextLayer, "id" | "size" | "w" | "h" | "padX" | "padY" | "lineHeight">; ctx: LayerCtx; family: string; fitKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(l.size);
  const { onFit, fontsVersion } = ctx;
  const key = `${l.size}|${l.w}|${l.h}|${l.padX}|${l.padY}|${l.lineHeight}|${family}|${fontsVersion}|${fitKey}`;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fits = (s: number) => {
      el.style.fontSize = `${s}px`;
      return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    };
    let best = l.size;
    if (!fits(l.size)) {
      let lo = Math.max(6, l.size * 0.25);
      let hi = l.size;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      best = Math.floor(lo);
    }
    el.style.fontSize = `${best}px`;
    setSize(best);
    onFit?.(l.id, best);
    // `key` covers everything that changes the measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div ref={ref} className="size-full overflow-hidden" style={{ fontSize: size }} data-fit={size < l.size ? "shrunk" : undefined}>
      {children}
    </div>
  );
}

const VALIGN = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

function TextView({ l, ctx }: { l: TextLayer; ctx: LayerCtx }) {
  const family = fontStack(l.font === "body" ? ctx.kit?.fonts.body : ctx.kit?.fonts.heading);
  const style: CSSProperties = {
    fontFamily: family,
    fontWeight: l.weight ?? (l.font === "body" ? 400 : 600),
    color: l.color,
    textAlign: l.align ?? "left",
    lineHeight: l.lineHeight ?? (l.role === "body" || l.role === "subhead" ? 1.25 : 1.05),
    letterSpacing: l.tracking ? `${l.tracking}em` : undefined,
    textTransform: l.uppercase ? "uppercase" : undefined,
    fontStyle: l.italic ? "italic" : undefined,
    textShadow: l.shadow ? "0 2px 18px rgba(0,0,0,0.45)" : undefined,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    display: "flex",
    flexDirection: "column",
    justifyContent: VALIGN[l.valign ?? (l.bg ? "middle" : "top")],
    padding: `${l.padY ?? 0}px ${l.padX ?? 0}px`,
    background: l.bg,
    borderRadius: l.radius,
    boxSizing: "border-box",
  };
  return (
    <FitText l={l} ctx={ctx} family={family} fitKey={`${l.text}|${l.weight}|${l.uppercase}|${l.italic}|${l.tracking}|${l.font}`}>
      <div className="size-full" style={style}>
        <span>{l.text}</span>
      </div>
    </FitText>
  );
}

function LogoView({ l, ctx }: { l: LogoLayer; ctx: LayerCtx }) {
  const src = l.src ?? (l.text ? undefined : ctx.kit?.logo?.src);
  if (src) return <Picture src={src} fit="contain" />;
  const family = fontStack(ctx.kit?.fonts.heading);
  const text = l.text || ctx.kit?.wordmark || ctx.kit?.name || "";
  return (
    <FitText l={{ id: l.id, size: Math.round(l.h * 0.8), w: l.w, h: l.h }} ctx={ctx} family={family} fitKey={text}>
      <div className="flex size-full items-center justify-center text-center whitespace-nowrap" style={{ fontFamily: family, fontWeight: 700, color: l.color ?? ctx.kit?.colors.foreground ?? "#111", lineHeight: 1 }}>
        {text}
      </div>
    </FitText>
  );
}

function QrView({ l }: { l: QrLayer }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(l.url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: l.color ?? "#000000", light: l.bg ?? "#ffffff" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [l.url, l.color, l.bg]);
  // The SVG is generated locally by the qrcode library from a validated URL.
  return <div className="size-full [&>svg]:size-full" data-qr data-qr-ready={svg ? "1" : undefined} dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}

export function LayerView({ l, ctx }: { l: Layer; ctx: LayerCtx }) {
  let body: ReactNode = null;
  if (l.type === "image") body = <ImageView l={l} />;
  else if (l.type === "text") body = <TextView l={l} ctx={ctx} />;
  else if (l.type === "logo") body = <LogoView l={l} ctx={ctx} />;
  else if (l.type === "shape") body = <div className="size-full" style={{ background: l.fill, borderRadius: l.radius }} />;
  else if (l.type === "qr") body = <QrView l={l} />;
  return (
    <div data-layer={l.id} style={{ ...boxStyle(l), ...animStyle(l, ctx) }}>
      {body}
    </div>
  );
}

/* Video track ------------------------------------------------------------------ */

/** The clip under the playhead and how far into it we are. */
export function clipAt(doc: Pick<MediaDoc, "video">, t: number) {
  const tl = timeline(doc);
  const hit = tl.find((x) => t >= x.start && t < x.end) ?? tl[tl.length - 1];
  return hit ? { ...hit, local: Math.max(0, Math.min(clipLength(hit.clip), t - hit.start)), index: tl.indexOf(hit) } : null;
}

function ClipVideo({ clip, local, playing, active, muted }: { clip: Clip; local: number; playing: boolean; active: boolean; muted: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const want = clip.in + local;
    if (!active) {
      el.pause();
      if (Math.abs(el.currentTime - clip.in) > 0.05) el.currentTime = clip.in;
      return;
    }
    if (playing) {
      if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
      if (el.paused) void el.play().catch(() => {});
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - want) > 0.04) el.currentTime = want;
    }
  });
  useEffect(() => {
    if (ref.current) ref.current.volume = Math.min(1, clip.volume ?? 1);
  }, [clip.volume]);
  return (
    <video
      ref={ref}
      src={clip.src}
      poster={clip.poster}
      muted={muted || clip.muted}
      playsInline
      preload="auto"
      className="absolute inset-0 size-full"
      style={{ objectFit: "cover", objectPosition: clip.focal ? `${clip.focal.x * 100}% ${clip.focal.y * 100}%` : "50% 50%", opacity: active ? 1 : 0 }}
    />
  );
}

function AudioTrack({ a, t, playing }: { a: AudioClip; t: number; playing: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const active = t >= a.start && t < a.start + a.duration;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.min(1, a.volume);
    const want = t - a.start;
    if (!active || !playing) {
      if (!el.paused) el.pause();
      return;
    }
    if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = Math.max(0, want);
    if (el.paused) void el.play().catch(() => {});
  });
  return a.src ? <audio ref={ref} src={a.src} preload="auto" /> : null;
}

function PendingShot({ clip, label }: { clip: Clip; label: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#17130f]">
      {clip.poster && <Picture src={clip.poster} focal={clip.focal} style={{ filter: "blur(18px) saturate(0.8) brightness(0.6)", transform: "scale(1.1)", opacity: 0.8 }} />}
      {clip.status !== "failed" && <GenField tone="dark" seed={seedOf(clip.id)} level={0.8} />}
      {label && (
        <div className="absolute inset-x-0 bottom-[8%] flex justify-center">
          <span className="rounded-full bg-black/55 px-[2.4%] py-[1%] text-[clamp(10px,2.6cqw,48px)] font-medium text-white">{clip.status === "failed" ? "Shot failed" : "Generating shot"}</span>
        </div>
      )}
    </div>
  );
}

function VideoTrack({ doc, t, playing, stillOnly, muted, showPending }: { doc: MediaDoc; t: number; playing: boolean; stillOnly: boolean; muted: boolean; showPending: boolean }) {
  const at = clipAt(doc, t);
  if (!at) return null;
  const tl = timeline(doc);
  const next = tl[at.index + 1]?.clip;
  const { clip, local } = at;
  const fadeIn = clip.transition === "fade" && at.index > 0 ? Math.min(1, local / 0.35) : 1;
  const len = clipLength(clip);
  const showVideo = !stillOnly && clip.kind === "motion" && clip.src && clip.status === "ready";
  return (
    <div className="absolute inset-0" style={{ opacity: fadeIn }}>
      {clip.status !== "ready" ? (
        <PendingShot clip={clip} label={showPending} />
      ) : showVideo ? null : clip.poster || clip.src ? (
        <div className="absolute inset-0 overflow-hidden">
          {clip.poster && <Picture src={clip.poster} focal={clip.focal} transform={clip.kind === "still" ? burnTransform(clip.kenburns ?? "in", local / Math.max(0.1, len)) : undefined} />}
        </div>
      ) : null}
      {!stillOnly &&
        [clip, next]
          .filter((c): c is Clip => !!c && c.kind === "motion" && !!c.src && c.status === "ready")
          .map((c) => <ClipVideo key={c.id} clip={c} local={c === clip ? local : 0} playing={playing} active={c === clip} muted={muted} />)}
    </div>
  );
}

/* Stage ---------------------------------------------------------------------- */

export interface StageProps {
  doc: MediaDoc;
  kit: MediaKit | undefined;
  /** Seconds into a video. */
  time?: number;
  playing?: boolean;
  /** Thumbnails: posters for shots, no <video>, no animation. */
  stillOnly?: boolean;
  /** Draw only these layers, on a transparent frame (export of overlay groups). */
  only?: string[] | null;
  /** Draw layers in their final state (export frames, the poster cover of a video). */
  settled?: boolean;
  muted?: boolean;
  /** Show "Generating shot" on pending shots. */
  showPending?: boolean;
  /** Stills only, drawn as the video looks at this second (thumbnails of videos). */
  frameAt?: number;
  /** Called with each text layer's fitted size. */
  onFit?: (id: string, size: number) => void;
  /** Drawn over the frame, in frame pixels (selection boxes). */
  overlay?: ReactNode;
  className?: string;
}

/** The doc at its own pixel size; wrap it in <ScaledStage> to fit a box. */
export function Stage({ doc, kit, time = 0, playing = false, stillOnly = false, only = null, settled = false, muted = false, showPending = true, frameAt, onFit, overlay, className }: StageProps) {
  const fontsVersion = useFontsVersion();
  const duration = docDuration(doc);
  const video = doc.kind === "video";
  if (frameAt !== undefined) time = Math.min(frameAt, Math.max(0, duration - 0.05));
  const t = video && !settled && (!stillOnly || frameAt !== undefined) ? time : undefined;
  const ctx: LayerCtx = { kit, t, duration, fontsVersion, onFit };
  const layers = doc.layers.filter((l) => (only ? only.includes(l.id) : video && t !== undefined ? layerVisibleAt(l, t, duration) : !l.hidden));
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ width: doc.w, height: doc.h, background: only ? "transparent" : doc.background, containerType: "size" }}>
      {video && !only && <VideoTrack doc={doc} t={time} playing={playing} stillOnly={stillOnly} muted={muted} showPending={showPending} />}
      {video && !only && !stillOnly && (doc.audio ?? []).map((a) => <AudioTrack key={a.id} a={a} t={time} playing={playing && !muted} />)}
      {layers.map((l) => (
        <LayerView key={l.id} l={l} ctx={ctx} />
      ))}
      {overlay}
    </div>
  );
}

/** A stage scaled to its box (contain, or fit the width). */
export function ScaledStage({ className, mode = "contain", children, ...props }: StageProps & { mode?: "contain" | "width"; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const scale = useFitScale(box, props.doc.w, props.doc.h, mode);
  return (
    <div ref={box} className={cn("relative overflow-hidden", className)} style={mode === "width" ? { aspectRatio: `${props.doc.w} / ${props.doc.h}` } : undefined}>
      {scale > 0 && (
        <div className="absolute top-1/2 left-1/2" style={{ width: props.doc.w * scale, height: props.doc.h * scale, translate: "-50% -50%" }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: props.doc.w, height: props.doc.h }}>
            <Stage {...props} />
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

/** A stage drawn `width` px wide with no measuring: for places already inside a transform (the canvas). */
export function FixedStage({ width, className, ...props }: StageProps & { width: number }) {
  const scale = width / props.doc.w;
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ width, height: props.doc.h * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: props.doc.w, height: props.doc.h }}>
        <Stage {...props} />
      </div>
    </div>
  );
}

/* Playback ------------------------------------------------------------------- */

/** A clock for the player: time advances with requestAnimationFrame while playing, and loops. */
export function usePlayback(duration: number) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const last = useRef(0);
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setTime((t) => {
        const next = t + dt;
        return duration > 0 && next >= duration ? 0 : next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, duration]);
  const clamped = duration > 0 ? Math.min(time, duration) : 0;
  return {
    time: clamped,
    playing,
    play: () => setPlaying(duration > 0),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p && duration > 0),
    seek: (t: number) => setTime(Math.max(0, Math.min(duration, t))),
  };
}

export type Playback = ReturnType<typeof usePlayback>;
