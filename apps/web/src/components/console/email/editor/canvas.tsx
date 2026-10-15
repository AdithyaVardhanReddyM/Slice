"use client";

// The canvas: the email at 600 px (375 px on the phone, columns stacked) on
// its backdrop, under an inbox-style subject line. Selection, hover, drag
// handles and the floating toolbar live here; while the agent writes, the
// canvas follows it section by section and stays readable but not editable.

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AlertCircle, Eye, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { applyPersonalization, DEFAULT_HEADING_SIZE } from "@slice/backend/convex/emailDoc";
import type { EmailDoc } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { renderContextFor } from "@/lib/email/render-context";
import { kitOf } from "@/lib/email/types";
import { SenderMark } from "@/components/console/email/sender-mark";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { CanvasSection, useRevealSelection } from "./canvas-section";
import { useEditorEnv } from "./context";
import { useDrag } from "./dnd";
import { FloatingToolbar } from "./floating-toolbar";
import { isFooterSection, PHONE_WIDTH } from "./model";
import { ViewAsPicker } from "./view-as";

const lineHeight = (size: number) => (size >= 44 ? 1.08 : size >= 32 ? 1.15 : size >= 24 ? 1.22 : 1.3);

/**
 * The email's phone rules (its media query), scoped to the phone canvas: big
 * headings shrink, item grids go two-up, fluid images fill the column.
 */
function phoneCss(doc: EmailDoc): string {
  const scope = '.email-canvas[data-device="phone"]';
  const sizes = new Set<number>();
  for (const s of doc.sections)
    for (const c of s.columns)
      for (const b of c.blocks) {
        if (b.type !== "heading") continue;
        const size = b.size ?? DEFAULT_HEADING_SIZE[b.level] ?? 26;
        if (size >= 30) sizes.add(size);
      }
  const fs = [...sizes]
    .map((s) => {
      const m = Math.max(26, Math.round(s * 0.76));
      return `${scope} .fs${s}{font-size:${m}px!important;line-height:${Math.round(m * lineHeight(m))}px!important}`;
    })
    .join("");
  return `${scope} .fluid{width:100%!important;max-width:100%!important;height:auto!important}${scope} .ic{width:50%!important;max-width:50%!important}${scope} .icp{padding:0 6px 24px 6px!important}${scope} .vh{height:190px!important}${fs}`;
}

/** Subject and preview text, as an inbox shows them, edited in place. */
function InboxLine({ doc, width, readOnly }: { doc: EmailDoc; width: number; readOnly: boolean }) {
  const { editor, brand } = useEditorEnv();
  const [subject, setSubject] = useState(doc.subject);
  const [preheader, setPreheader] = useState(doc.preheader);
  const [focus, setFocus] = useState<"subject" | "preheader" | null>(null);
  const [seen, setSeen] = useState({ subject: doc.subject, preheader: doc.preheader });
  if (focus === null && (seen.subject !== doc.subject || seen.preheader !== doc.preheader)) {
    setSeen({ subject: doc.subject, preheader: doc.preheader });
    setSubject(doc.subject);
    setPreheader(doc.preheader);
  }
  const commit = () => {
    setFocus(null);
    if (subject !== doc.subject || preheader !== doc.preheader) editor.apply([{ op: "set_subject", subject, preheader }]);
  };
  const field = "w-full min-w-0 truncate rounded-md bg-transparent px-1.5 py-0.5 outline-none transition-colors hover:bg-neutral-100 focus:bg-neutral-50 focus:ring-2 focus:ring-blue-600/25 disabled:hover:bg-transparent";
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06]" style={{ width }} onClick={(e) => e.stopPropagation()}>
      <span className="mt-1">
        <SenderMark name={brand.name} mark={kitOf(brand)?.icon ?? kitOf(brand)?.logo?.src} color={kitOf(brand)?.colors.primary} size={32} />
      </span>
      <div className="min-w-0 flex-1 -space-y-0.5">
        <div className="flex items-center justify-between gap-2 px-1.5">
          <span className="truncate text-[13px] font-medium text-neutral-900">{brand.name}</span>
          <span className="shrink-0 text-xs text-neutral-400">Inbox preview</span>
        </div>
        <input
          value={subject}
          disabled={readOnly}
          placeholder="Add a subject line"
          aria-label="Subject line"
          maxLength={200}
          onFocus={() => setFocus("subject")}
          onChange={(e) => setSubject(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={cn(field, "text-sm font-semibold text-neutral-900 placeholder:font-normal placeholder:text-neutral-400")}
        />
        <input
          value={preheader}
          disabled={readOnly}
          placeholder="Add preview text, the line inboxes show after the subject"
          aria-label="Preview text"
          maxLength={300}
          onFocus={() => setFocus("preheader")}
          onChange={(e) => setPreheader(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={cn(field, "text-[13px] text-neutral-500 placeholder:text-neutral-400")}
        />
      </div>
    </div>
  );
}

/** Where the next section will appear while the agent writes. */
function WritingRow({ label }: { label: string }) {
  return (
    <div className="px-8 py-6 animate-in fade-in-0 duration-500">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-300/80 bg-neutral-50/60 px-6 py-8 font-sans">
        <div className="flex w-full max-w-xs flex-col gap-2">
          <span className="h-3 w-2/3 animate-pulse rounded-full bg-neutral-200" />
          <span className="h-2.5 w-full animate-pulse rounded-full bg-neutral-200/80" />
          <span className="h-2.5 w-5/6 animate-pulse rounded-full bg-neutral-200/80" />
        </div>
        <span className="pg-shimmer text-xs">{label}</span>
      </div>
    </div>
  );
}

/** The canvas scroller; with the hand tool on, dragging moves the email around. */
function useHandScroll(on: boolean): RefObject<HTMLDivElement | null> {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !on) return;
    let start: { x: number; y: number; left: number; top: number } | null = null;
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      el.scrollLeft = start.left - (e.clientX - start.x);
      el.scrollTop = start.top - (e.clientY - start.y);
    };
    const up = () => {
      start = null;
      el.style.cursor = "grab";
    };
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.style.cursor = "";
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [on]);
  return scroller;
}

export function Canvas() {
  const { editor, brand, itemMap, agent, previewAs, setPreviewAs, audience } = useEditorEnv();
  // With a version for each group and person, a picker over the canvas switches between them.
  const versions = audience?.kind === "versions";
  const { dragDoc } = useDrag();
  const layer = useRef<HTMLDivElement>(null);
  const base = (dragDoc ?? editor.doc) as EmailDoc;
  const doc = useMemo(() => (previewAs ? applyPersonalization(base, previewAs.personalization) : base), [base, previewAs]);
  const theme = doc.theme;
  const phone = editor.device === "phone";
  const width = phone ? PHONE_WIDTH : theme.width || 600;
  const hand = editor.tool === "hand";
  const readOnly = editor.locked || !!previewAs || hand;
  const merge = previewAs?.merge;
  const ctx = useMemo(() => renderContextFor(brand, itemMap, merge, previewAs ? "preview" : "edit"), [brand, itemMap, merge, previewAs]);
  const live = agent.live;
  const writing = agent.busy && live?.kind === "generate";

  const scroller = useHandScroll(hand);
  useRevealSelection(scroller);

  // The inspector floats over the canvas's right side; when the canvas is too narrow
  // for both, the email moves left so the inspector never covers it.
  const [roomy, setRoomy] = useState(true);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoomy(el.clientWidth >= width + 2 * 312));
    ro.observe(el);
    return () => ro.disconnect();
  }, [scroller, width]);
  const inspecting = !!editor.selection && !editor.locked && !previewAs;

  // Sections the agent just wrote fade in, and the canvas follows them down.
  const ids = doc.sections.map((s) => s.id).join(" ");
  const [prevIds, setPrevIds] = useState(ids);
  const [fresh, setFresh] = useState<string[]>([]);
  if (ids !== prevIds) {
    setPrevIds(ids);
    if (agent.busy) {
      const before = new Set(prevIds.split(" "));
      const added = doc.sections.filter((s) => !before.has(s.id)).map((s) => s.id);
      if (added.length) setFresh((f) => [...f, ...added]);
    }
  }
  useEffect(() => {
    if (!fresh.length) return;
    const last = fresh[fresh.length - 1];
    scroller.current?.querySelector<HTMLElement>(`[data-editor-section="${window.CSS.escape(last)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = setTimeout(() => setFresh([]), 900);
    return () => clearTimeout(t);
  }, [fresh, scroller]);

  const running = live?.steps.filter((s) => s.kind === "tool" && s.status === "running").pop();
  const status = running && running.kind === "tool" ? running.label : (live?.status ?? "Thinking");
  const footerAt = doc.sections.findIndex(isFooterSection);
  const css = useMemo(() => (phone ? phoneCss(doc) : ""), [phone, doc]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col transition-colors duration-500" style={{ backgroundColor: theme.colors.backdrop }}>
      {agent.busy && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full bg-neutral-900/95 py-1.5 pr-1.5 pl-3 text-sm text-white shadow-lg ring-1 ring-black/10 backdrop-blur animate-in fade-in-0 slide-in-from-top-2">
            <Spinner className="size-3.5 text-white/80" />
            <span className="truncate">{status}</span>
            <button type="button" onClick={agent.stop} className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium hover:bg-white/20">
              Stop
            </button>
          </div>
        </div>
      )}
      {versions && !agent.busy && <ViewAsPicker />}
      {previewAs && !versions && (
        <div className="absolute inset-x-0 top-3 z-40 flex justify-center px-4">
          <div className="flex max-w-full items-center gap-2.5 rounded-full bg-white py-1.5 pr-1.5 pl-3 text-sm shadow-lg ring-1 ring-black/10 animate-in fade-in-0 slide-in-from-top-2">
            <Eye className="size-4 shrink-0 text-blue-700" />
            <span className="truncate">
              Previewing <span className="font-medium">{previewAs.name}</span>&apos;s version
              {!previewAs.personalization && <span className="text-neutral-500"> · not personalised yet</span>}
              {previewAs.stale && <span className="text-neutral-500"> · written for an earlier draft</span>}
            </span>
            <Button size="xs" variant="secondary" className="rounded-full" onClick={() => setPreviewAs(null)}>
              Back to editing
            </Button>
          </div>
        </div>
      )}
      <div ref={scroller} data-email-scroller className="scrollbar-thin min-h-0 flex-1 overflow-auto overscroll-contain" onClick={() => !hand && editor.select(null)}>
        <div ref={layer} className={cn("relative flex min-w-fit flex-col items-center px-14 pt-16 pb-28 transition-[padding] duration-200", inspecting && !roomy && "pr-[20.5rem]")}>
          <InboxLine doc={doc} width={width} readOnly={readOnly} />
          <div
            className="email-canvas shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_40px_-12px_rgba(0,0,0,0.18)] transition-[width] duration-300"
            data-device={phone ? "phone" : "desktop"}
            style={{ width, backgroundColor: theme.colors.surface, position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            {css && <style>{css}</style>}
            <SortableContext items={doc.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {doc.sections.map((s, i) => (
                <Fragment key={s.id}>
                  {writing && i === footerAt && <WritingRow label={live?.written ? "Writing the next section" : "Planning the email"} />}
                  <CanvasSection section={s} index={i} ctx={ctx} theme={theme} phone={phone} readOnly={readOnly} fresh={fresh.includes(s.id)} />
                </Fragment>
              ))}
            </SortableContext>
            {writing && footerAt < 0 && <WritingRow label="Writing the next section" />}
          </div>
          {!readOnly && <FloatingToolbar layer={layer} />}
        </div>
      </div>
      {editor.notice && (
        <div role="status" className="absolute inset-x-0 bottom-5 z-40 mx-auto flex w-fit max-w-[min(34rem,calc(100%-2rem))] items-start gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm shadow-lg ring-1 ring-black/10">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span className="min-w-0">{editor.notice}</span>
          <button type="button" onClick={editor.clearNotice} aria-label="Dismiss" className="mt-0.5 shrink-0 text-neutral-400 hover:text-neutral-700">
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
