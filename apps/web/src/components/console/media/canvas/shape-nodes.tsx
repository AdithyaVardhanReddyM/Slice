"use client";

// How the merchant's shapes look on the canvas: a frame (a coloured area; the
// board draws its name above it), an arrow, text that grows with its words,
// and a sticky note whose words shrink to fit it. Text and notes are typed in
// place: while one is being edited a textarea sits exactly over its words
// (same box, same font), so nothing jumps when typing starts or stops.

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useCanvas } from "./context";
import type { BoardNode } from "./model";
import { ARROW_STROKE, FRAME_COLORS, INK_COLORS, STICKY_COLORS, arrowHead, stickyFont, swatch } from "./shapes";

export function ShapeView({ node, zoom, lit }: { node: BoardNode; zoom: number; lit: boolean }) {
  switch (node.kind) {
    case "frame":
      return <FrameShape node={node} />;
    case "arrow":
      return <ArrowShape node={node} zoom={zoom} lit={lit} />;
    case "text":
      return <TextShape node={node} />;
    default:
      return <StickyShape node={node} />;
  }
}

function FrameShape({ node }: { node: BoardNode }) {
  return <div className="size-full rounded-[6px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.08]" style={{ background: swatch(FRAME_COLORS, node.shape?.color).value }} />;
}

function ArrowShape({ node, zoom, lit }: { node: BoardNode; zoom: number; lit: boolean }) {
  const s = node.shape!;
  if (!node.line) return null;
  const l = { x1: node.line.x1 - node.x, y1: node.line.y1 - node.y, x2: node.line.x2 - node.x, y2: node.line.y2 - node.y };
  const d = `M${l.x1},${l.y1} L${l.x2},${l.y2}`;
  const ink = swatch(INK_COLORS, s.color).value;
  return (
    <svg aria-hidden className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
      {lit && <path d={d} stroke="#3b82f6" strokeOpacity={0.3} strokeWidth={ARROW_STROKE + 6 / zoom} strokeLinecap="round" fill="none" />}
      <path d={d} stroke={ink} strokeWidth={ARROW_STROKE} strokeLinecap="round" strokeDasharray={s.dashed ? "10 10" : undefined} fill="none" />
      <path d={arrowHead(l, 14 + ARROW_STROKE * 2)} stroke={ink} strokeWidth={ARROW_STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Caught along the line, a little wider than it looks. */}
      <path d={d} stroke="transparent" strokeWidth={Math.max(ARROW_STROKE + 8, 16 / zoom)} strokeLinecap="round" fill="none" pointerEvents="stroke" />
    </svg>
  );
}

/** The words being typed, fresh each time typing starts. */
function useDraft(node: BoardNode) {
  const { editing } = useCanvas();
  const on = editing === node.key;
  const saved = node.shape?.text ?? "";
  const [draft, setDraft] = useState(saved);
  const [was, setWas] = useState(on);
  if (on !== was) {
    setWas(on);
    if (on) setDraft(saved);
  }
  return { on, draft, setDraft, text: on ? draft : saved };
}

/** Escape, or ⌘/Ctrl + Enter, is done typing. */
const doneKeys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    e.currentTarget.blur();
  }
};

/** The caret goes to the end when typing starts (the board keeps the press that started it from taking the focus back). */
const caretAtEnd = (el: HTMLTextAreaElement | null) => {
  if (!el || document.activeElement === el) return;
  el.focus({ preventScroll: true });
  el.setSelectionRange(el.value.length, el.value.length);
};

function TextShape({ node }: { node: BoardNode }) {
  const { commitText, measure } = useCanvas();
  const s = node.shape!;
  const { on, draft, setDraft, text } = useDraft(node);
  const box = useRef<HTMLDivElement>(null);
  const size = s.size ?? 24;
  const ink = swatch(INK_COLORS, s.color).value;

  // Its box is its words: the board's outline, hit area and arrows follow it as it grows.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => measure(node.key, { w: el.offsetWidth, h: el.offsetHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.key, measure]);

  return (
    <div ref={box} className="absolute top-0 left-0 w-max px-1 font-medium whitespace-pre" style={{ fontSize: size, lineHeight: 1.25, color: ink }}>
      {/* A trailing newline needs a character to take its line; room for the caret while typing. */}
      <span className={cn(on && "invisible")}>{text + (!text || text.endsWith("\n") ? "​" : "") + (on ? " " : "")}</span>
      {on && (
        <textarea
          ref={caretAtEnd}
          data-board-ui
          aria-label="Text"
          value={draft}
          rows={1}
          wrap="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={doneKeys}
          onBlur={() => commitText(node, draft)}
          className="absolute inset-0 resize-none overflow-hidden bg-transparent px-1 whitespace-pre outline-none"
          style={{ caretColor: ink }}
        />
      )}
    </div>
  );
}

function StickyShape({ node }: { node: BoardNode }) {
  const { commitText } = useCanvas();
  const s = node.shape!;
  const { on, draft, setDraft, text } = useDraft(node);
  const box = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const pad = Math.round(node.w * 0.08);
  const base = stickyFont(node.w);
  const [font, setFont] = useState(base);

  // The words start at the note's size and shrink until they fit it.
  useLayoutEffect(() => {
    const b = box.current;
    const t = words.current;
    if (!b || !t) return;
    const room = b.clientHeight - pad * 2;
    let f = base;
    t.style.fontSize = `${f}px`;
    while (f > 8 && t.offsetHeight > room) {
      f = Math.max(8, f * 0.92);
      t.style.fontSize = `${f}px`;
    }
    setFont(f);
  }, [text, base, pad, node.w, node.h]);

  return (
    <div className="size-full rounded-[3px] shadow-[0_1px_1px_rgba(0,0,0,0.06),0_10px_22px_-12px_rgba(0,0,0,0.4)]" style={{ background: swatch(STICKY_COLORS, s.color).value }}>
      <div ref={box} className="relative size-full overflow-hidden text-neutral-900" style={{ padding: pad }}>
        <div ref={words} className={cn("font-medium break-words whitespace-pre-wrap", on && "invisible")} style={{ fontSize: font, lineHeight: 1.3 }}>
          {text + (text.endsWith("\n") ? "​" : "")}
        </div>
        {on && (
          <textarea
            ref={caretAtEnd}
            data-board-ui
            aria-label="Sticky note"
            placeholder="Write something"
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={doneKeys}
            onBlur={() => commitText(node, draft)}
            className="absolute resize-none overflow-hidden bg-transparent font-medium break-words whitespace-pre-wrap outline-none placeholder:text-neutral-900/35"
            style={{ inset: pad, fontSize: font, lineHeight: 1.3 }}
          />
        )}
      </div>
    </div>
  );
}
