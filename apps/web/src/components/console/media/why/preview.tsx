"use client";
/* eslint-disable @next/next/no-img-element -- pictures come from Convex storage and Qloo, sized by their boxes */

// The piece itself on the Why modal's left: numbered marks on each choice, and
// a spotlight on what the merchant is pointing at (a choice, or every choice
// that carries a trait), with the colours measured in it underneath.

import { useEffect, useRef, useState } from "react";
import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import type { MediaDoc, MediaKit, WhyChoice, WhySwatch } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScaledStage, useFitScale } from "../stage";

export interface WhySubject {
  kind: "poster" | "video" | "image" | "clip";
  id: string;
  name: string;
  creative?: Doc<"mediaCreatives">;
  asset?: Doc<"mediaAssets">;
}

/** Marks that would sit on top of each other are moved apart, down first. */
function spread(choices: WhyChoice[]) {
  const placed: { x: number; y: number }[] = [];
  return choices.map((c) => {
    if (!c.at) return null;
    const at = { ...c.at };
    for (let i = 0; i < 6 && placed.some((p) => Math.abs(p.x - at.x) < 0.07 && Math.abs(p.y - at.y) < 0.05); i++) at.y = at.y > 0.85 ? at.y - 0.06 : at.y + 0.06;
    placed.push(at);
    return at;
  });
}

function Marks({ choices, lit, onLit }: { choices: WhyChoice[]; lit: string[]; onLit: (id: string | null) => void }) {
  const boxes = choices.filter((c) => c.box && lit.includes(c.id));
  const spots = spread(choices);
  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className={cn("absolute inset-0 size-full transition-opacity duration-200", boxes.length ? "opacity-100" : "opacity-0")} viewBox="0 0 1 1" preserveAspectRatio="none">
        <defs>
          <mask id="why-spot">
            <rect width="1" height="1" fill="white" />
            {boxes.map((c) => (
              <rect key={c.id} x={c.box!.x} y={c.box!.y} width={c.box!.w} height={c.box!.h} fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="1" height="1" fill="rgba(12,10,9,0.5)" mask="url(#why-spot)" />
        {boxes.map((c) => (
          <rect key={c.id} x={c.box!.x} y={c.box!.y} width={c.box!.w} height={c.box!.h} fill="none" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {choices.map((c, i) =>
        spots[i] ? (
          <span key={c.id} className="pointer-events-auto absolute" style={{ left: `${spots[i]!.x * 100}%`, top: `${spots[i]!.y * 100}%` }} onMouseEnter={() => onLit(c.id)} onMouseLeave={() => onLit(null)}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className={cn("flex size-7 -translate-x-1/2 -translate-y-1/2 cursor-default items-center justify-center rounded-full text-[12px] font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-2 ring-white transition-transform", lit.includes(c.id) ? "scale-110 bg-orange-600 text-white" : "bg-white text-neutral-900")}>
                    {i + 1}
                  </span>
                }
              />
              <TooltipContent>{c.title}</TooltipContent>
            </Tooltip>
          </span>
        ) : null,
      )}
    </div>
  );
}

function FittedImage({ src, w: knownW, h: knownH, children }: { src: string; w?: number; h?: number; children?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  // Older files were saved without their size: read it from the picture.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (knownW && knownH) return;
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src, knownW, knownH]);
  const w = knownW && knownH ? knownW : (natural?.w ?? 0);
  const h = knownW && knownH ? knownH : (natural?.h ?? 0);
  const scale = useFitScale(box, w || 1, h || 1);
  return (
    <div ref={box} className="relative size-full">
      {scale > 0 && w > 0 && (
        <div className="absolute top-1/2 left-1/2 overflow-hidden rounded-lg shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]" style={{ width: w * scale, height: h * scale, translate: "-50% -50%" }}>
          <img src={src} alt="" className="size-full object-cover" draggable={false} />
          {children}
        </div>
      )}
    </div>
  );
}

export function WhyPreview({ subject, kit, choices, lit, onLit }: { subject: WhySubject; kit: MediaKit | undefined; choices: WhyChoice[]; lit: string[]; onLit: (id: string | null) => void }) {
  const marks = <Marks choices={choices} lit={lit} onLit={onLit} />;
  if (subject.creative) {
    const doc = subject.creative.doc as MediaDoc;
    return (
      <ScaledStage doc={doc} kit={kit} stillOnly={doc.kind === "video"} frameAt={doc.kind === "video" ? 1.5 : undefined} settled={doc.kind !== "video"} className="size-full overflow-visible [&>div]:overflow-hidden [&>div]:rounded-lg [&>div]:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]">
        {doc.kind === "video" ? null : marks}
      </ScaledStage>
    );
  }
  const a = subject.asset!;
  if (subject.kind === "clip") {
    return (
      <div className="flex size-full items-center justify-center">
        <video src={a.url} className="max-h-full max-w-full rounded-lg shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]" muted loop autoPlay playsInline />
      </div>
    );
  }
  return (
    <FittedImage src={a.url} w={a.w} h={a.h}>
      {marks}
    </FittedImage>
  );
}

export function Palette({ palette }: { palette: WhySwatch[] }) {
  const total = palette.reduce((s, p) => s + p.share, 0) || 1;
  return (
    <div>
      <p className="mb-2 text-[12px] text-neutral-500">Colours in it, by how much of the frame they fill</p>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {palette.map((p) => (
          <Tooltip key={p.hex}>
            <TooltipTrigger render={<span className="h-full first:rounded-l-full last:rounded-r-full" style={{ flexGrow: p.share / total, background: p.hex }} />} />
            <TooltipContent>
              {p.name}, {Math.round(p.share * 100)}% of the frame{p.kit ? ", a brand colour" : ""}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
        {palette.map((p) => (
          <li key={p.hex} className="flex min-w-0 items-center gap-2 text-[12px]">
            <span className="size-2.5 shrink-0 rounded-[3px] ring-1 ring-black/10" style={{ background: p.hex }} />
            <span className="truncate text-neutral-700">{p.name}</span>
            {p.kit && <span className="shrink-0 text-neutral-400">brand colour</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
