"use client";
"use no memo";
// The editor works on the canvas DOM directly (and reads it while rendering), so the compiler must not cache it.

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import type { BrandKit, HandEdits, HandElement, HandMotion, HtmlDoc } from "@slice/backend/convex/pagesTypes";
import { EDIT_MOUNT_ID } from "@/components/pages/edit-surface";
import { handCss, handSelector } from "@/components/pages/hand-css";
import { sanitizeDraft } from "@/components/pages/sanitize-draft";
import { sanitizePageCss } from "@/components/pages/sanitize-rules";
import { googleFontsHref, kitMode, kitToVars } from "@/components/pages/theme";
import {
  PG_ID,
  cloneHand,
  emptyHand,
  finalHand,
  isEmptyRecord,
  isTextual,
  labelOf,
  nameOf,
  newId,
  pickable,
  serializeBody,
  summarize,
  textOf,
  withMotion,
  withStyles,
  type Scope,
  type SectionNames,
} from "./model";
import { EditOverlay, type OverlayAction } from "./overlay";

interface Snapshot {
  html: string;
  hand: HandEdits;
  ops: string[];
  sel: string | number[] | null;
}

interface TextSession {
  el: HTMLElement;
  html: string;
  before: Snapshot;
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Child-index path from `body` to `el`, to find an element again after an undo. */
function pathOf(el: Element, body: Element): number[] {
  const path: number[] = [];
  for (let n: Element | null = el; n && n !== body; n = n.parentElement) {
    const parent: Element | null = n.parentElement;
    if (!parent) return [];
    path.unshift([...parent.children].indexOf(n));
  }
  return path;
}

function byPath(body: Element, path: number[]): Element | null {
  let n: Element | null = body;
  for (const i of path) n = n?.children[i] ?? null;
  return n === body ? null : n;
}

/** Is the keyboard in a text field (the console's inputs or the page's own)? */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export interface VisualEditor {
  ready: boolean;
  /** The canvas page's window and body, once loaded. */
  win: Window | null;
  body: HTMLElement | null;
  root: HTMLElement | null;
  selected: Element | null;
  /** Bumps on every change, so panels re-read the DOM and computed styles. */
  rev: number;
  /** Bumps when elements are added, removed or moved (the layers list). */
  treeRev: number;
  hand: HandEdits;
  scope: Scope;
  hoverState: boolean;
  setHoverState: (on: boolean) => void;
  names: SectionNames;
  editingText: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  notice: string | null;
  clearNotice: () => void;
  select: (el: Element | null, opts?: { scroll?: boolean }) => void;
  hover: (el: Element | null) => void;
  label: (el: Element) => string;
  name: (el: Element) => string;
  idOf: (el: Element) => string | null;
  recordOf: (el: Element | null) => HandElement | undefined;
  setStyle: (props: Record<string, string | null>, opts?: { scope?: Scope }) => void;
  setMotion: (patch: Partial<HandMotion> | null) => void;
  replayMotion: () => void;
  setAttr: (name: "href" | "src" | "alt" | "target", value: string | null) => void;
  setText: (text: string) => void;
  editText: () => void;
  remove: () => void;
  duplicate: () => void;
  move: (dir: -1 | 1) => void;
  selectParent: () => void;
  resetStyles: () => void;
  setSpacingGuides: (show: boolean) => void;
  /** A property's value as the page's own CSS has it, without the hand edits. */
  pageValue: (el: Element, prop: string) => string;
  undo: () => void;
  redo: () => void;
  /** Saves when there is anything to save; resolves false when the save failed (see notice). */
  save: () => Promise<boolean>;
  discard: () => void;
}

interface CanvasHandlers {
  ready: (c: { win: Window; body: HTMLElement; root: HTMLElement; style: HTMLStyleElement; overlay: EditOverlay }) => void;
  action: (a: OverlayAction) => void;
  hover: (el: Element | null) => void;
  pick: (el: Element | null) => void;
  double: (el: Element, at: { x: number; y: number }) => void;
  key: (e: KeyboardEvent) => void;
  /** The element being typed into, if any. */
  typingIn: () => HTMLElement | null;
  doneTyping: () => void;
}

/**
 * Builds the page into the canvas (/p/_edit) once it says it is ready, the
 * way the published renderer does (kit variables, fonts, the page CSS, the
 * sanitised markup), plus an empty stylesheet for the hand edits, the overlay
 * and the editor's event handlers. Returns the teardown.
 */
function mountCanvas(iframe: HTMLIFrameElement, kit: BrandKit, doc: HtmlDoc, h: CanvasHandlers): () => void {
  let disposed = false;
  let teardown: (() => void) | null = null;

  const build = () => {
    if (disposed || teardown) return;
    const win = iframe.contentWindow;
    const d = iframe.contentDocument;
    const mount = d?.getElementById(EDIT_MOUNT_ID);
    if (!win || !d || !mount || !win.pgEditReady) return;
    mount.textContent = "";
    const root = d.createElement("div");
    root.className = `pg-root pg-page pg-mode-${kitMode(kit)}`;
    for (const [k, v] of Object.entries(kitToVars(kit))) root.style.setProperty(k, String(v));
    const fonts = googleFontsHref(kit, doc.meta.fonts);
    if (fonts) {
      const link = d.createElement("link");
      link.rel = "stylesheet";
      link.href = fonts;
      d.head.appendChild(link);
    }
    const pageCss = d.createElement("style");
    pageCss.textContent = sanitizePageCss(doc.css);
    const style = d.createElement("style");
    style.setAttribute("data-pg-hand", "");
    const body = d.createElement("div");
    body.className = "pg-page-body";
    const clean = sanitizeDraft(doc.html);
    body.append(...[...clean.childNodes].map((n) => d.importNode(n, true)));
    root.append(pageCss, style, body);
    mount.appendChild(root);
    d.documentElement.style.scrollBehavior = "auto";

    const overlay = new EditOverlay(d, h.action);
    const inTyping = (e: Event) => {
      const t = h.typingIn();
      return !!t && t.contains(e.target as Node);
    };
    const onMove = (e: PointerEvent) => {
      if (overlay.owns(e)) return h.hover(null);
      const el = pickable(e.target, body);
      h.hover(el && el !== h.typingIn() ? el : null);
    };
    const onLeave = () => h.hover(null);
    const onDown = (e: MouseEvent) => {
      // Inside the text being edited the caret moves; elsewhere no text selection,
      // no focusing the page's inputs and no dragging pictures.
      if (overlay.owns(e) || inTyping(e)) return;
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (overlay.owns(e) || inTyping(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (h.typingIn()) h.doneTyping();
      h.pick(pickable(e.target, body));
    };
    const onDouble = (e: MouseEvent) => {
      if (overlay.owns(e)) return;
      e.preventDefault();
      const el = pickable(e.target, body);
      if (el) h.double(el, { x: e.clientX, y: e.clientY });
    };
    const block = (e: Event) => {
      if (!overlay.owns(e)) e.preventDefault();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (e.target && e.target === h.typingIn()) h.doneTyping();
    };
    const onPaste = (e: ClipboardEvent) => {
      // The contenteditable="true" fallback (no plaintext-only): paste as plain text.
      const t = h.typingIn();
      if (!t || t.getAttribute("contenteditable") !== "true") return;
      e.preventDefault();
      d.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? "");
    };
    const listeners: [string, EventListener, boolean][] = [
      ["pointermove", onMove as EventListener, true],
      ["pointerleave", onLeave, false],
      ["mousedown", onDown as EventListener, true],
      ["click", onClick as EventListener, true],
      ["dblclick", onDouble as EventListener, true],
      ["submit", block, true],
      ["auxclick", block, true],
      ["dragstart", block, true],
      ["keydown", h.key as EventListener, true],
      ["focusout", onFocusOut as EventListener, true],
      ["paste", onPaste as EventListener, true],
    ];
    for (const [type, fn, capture] of listeners) d.addEventListener(type, fn, capture);
    teardown = () => {
      for (const [type, fn, capture] of listeners) d.removeEventListener(type, fn, capture);
      overlay.destroy();
    };
    h.ready({ win, body, root, style, overlay });
  };

  const onMessage = (e: MessageEvent) => {
    if (e.source === iframe.contentWindow && e.data?.type === "pg:edit-ready") build();
  };
  window.addEventListener("message", onMessage);
  iframe.addEventListener("load", build);
  build();
  return () => {
    disposed = true;
    window.removeEventListener("message", onMessage);
    iframe.removeEventListener("load", build);
    teardown?.();
  };
}

/** A property as the page's own CSS has it: computed with the hand-edit sheet switched off. */
function computedWithout(sheet: CSSStyleSheet, win: Window, el: Element, prop: string): string {
  sheet.disabled = true;
  const v = win.getComputedStyle(el).getPropertyValue(prop).trim();
  sheet.disabled = false;
  return v;
}

export function useVisualEditor({
  frame,
  kit,
  doc,
  variantId,
  baseVersion,
  device,
}: {
  frame: RefObject<HTMLIFrameElement | null>;
  kit: BrandKit;
  /** The page as it was when the editor opened; later changes to the prop are ignored. */
  doc: HtmlDoc;
  variantId: Id<"pagesVariants">;
  baseVersion: number;
  device: "desktop" | "mobile";
}): VisualEditor {
  const saveHand = useMutation(api.pages.saveHandEdits);
  const [initial] = useState(() => ({ doc, kit }));
  const names = useMemo<SectionNames>(() => new Map(initial.doc.sections.map((s) => [s.id, s.label])), [initial]);

  const [ready, setReady] = useState(false);
  const [rev, setRev] = useState(0);
  const [treeRev, setTreeRev] = useState(0);
  const [selected, setSelected] = useState<Element | null>(null);
  const [hand, setHandState] = useState<HandEdits>(() => cloneHand(initial.doc.hand ?? emptyHand()));
  const [editingText, setEditingText] = useState(false);
  const [hoverState, setHoverStateRaw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState({ past: 0, future: 0, dirty: false });
  const [canvas, setCanvas] = useState<{ win: Window; body: HTMLElement; root: HTMLElement } | null>(null);

  const winRef = useRef<Window | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const overlayRef = useRef<EditOverlay | null>(null);
  const handRef = useRef(hand);
  const selRef = useRef<Element | null>(null);
  const opsRef = useRef<string[]>([]);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastCommit = useRef<{ key: string; at: number } | null>(null);
  const textRef = useRef<TextSession | null>(null);
  const baseRef = useRef(baseVersion);
  // What the last save (or the open) left: the summary diffs against it.
  const savedRef = useRef<{ hand: HandEdits; html: string }>({ hand: cloneHand(initial.doc.hand ?? emptyHand()), html: "" });
  const hoverStateRef = useRef(false);

  const scope: Scope = hoverState ? "hover" : device === "mobile" ? "phone" : "style";
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  /** Anything to save: undoable steps, structural ops, or hand styles that differ from the last save. */
  const dirtyNow = useCallback(
    () => past.current.length > 0 || opsRef.current.length > 0 || JSON.stringify(handRef.current.elements) !== JSON.stringify(savedRef.current.hand.elements),
    [],
  );

  const bump = useCallback(
    (tree = false) => {
      setRev((r) => r + 1);
      if (tree) setTreeRev((r) => r + 1);
      setHistory({ past: past.current.length, future: future.current.length, dirty: dirtyNow() });
    },
    [dirtyNow],
  );

  /* CSS ------------------------------------------------------------------------- */

  const applyCss = useCallback(() => {
    const style = styleRef.current;
    if (!style) return;
    let css = handCss(handRef.current);
    // Show the hover look on the selected element while its hover state is being edited.
    const sel = selRef.current;
    const id = sel?.getAttribute(PG_ID);
    const hov = id ? handRef.current.elements[id]?.hover : undefined;
    if (hoverStateRef.current && id && hov) {
      css += `\n${handSelector(id)}[${PG_ID}] { ${Object.entries(hov)
        .map(([p, v]) => `${p}: ${v} !important;`)
        .join(" ")} }`;
    }
    style.textContent = sanitizePageCss(css);
  }, []);

  const setHand = useCallback(
    (next: HandEdits) => {
      handRef.current = next;
      setHandState(next);
      applyCss();
    },
    [applyCss],
  );

  /* Selection --------------------------------------------------------------------- */

  const infoFor = useCallback(
    (el: Element) => {
      const body = bodyRef.current!;
      const parent = el.parentElement;
      return {
        label: nameOf(el, names, winRef.current),
        editing: !!textRef.current && textRef.current.el === el,
        textual: isTextual(el),
        canUp: !!el.previousElementSibling,
        canDown: !!el.nextElementSibling,
        canParent: !!parent && parent !== body,
      };
    },
    [names],
  );

  const syncOverlay = useCallback(() => {
    const el = selRef.current;
    overlayRef.current?.setSelection(el, el ? infoFor(el) : null);
  }, [infoFor]);

  const select = useCallback(
    (el: Element | null, opts?: { scroll?: boolean }) => {
      selRef.current = el;
      setSelected(el);
      syncOverlay();
      applyCss();
      if (el && opts?.scroll) {
        const r = el.getBoundingClientRect();
        const h = winRef.current?.innerHeight ?? 0;
        if (r.top < 40 || r.bottom > h - 40) el.scrollIntoView({ block: r.height > h * 0.7 ? "start" : "center", behavior: "smooth" });
      }
    },
    [syncOverlay, applyCss],
  );

  const hover = useCallback(
    (el: Element | null) => {
      overlayRef.current?.setHover(el, el ? nameOf(el, names, winRef.current) : "");
    },
    [names],
  );

  /* History ----------------------------------------------------------------------- */

  const snapshot = useCallback((): Snapshot => {
    const body = bodyRef.current!;
    const sel = selRef.current;
    return {
      html: body.innerHTML,
      hand: cloneHand(handRef.current),
      ops: [...opsRef.current],
      sel: sel ? (sel.getAttribute(PG_ID) ?? pathOf(sel, body)) : null,
    };
  }, []);

  const restore = useCallback(
    (s: Snapshot) => {
      const body = bodyRef.current;
      if (!body) return;
      if (body.innerHTML !== s.html) body.innerHTML = s.html;
      opsRef.current = [...s.ops];
      handRef.current = cloneHand(s.hand);
      setHandState(handRef.current);
      const el = s.sel === null ? null : typeof s.sel === "string" ? body.querySelector(`[${PG_ID}="${CSS.escape(s.sel)}"]`) : byPath(body, s.sel);
      select(el);
      applyCss();
    },
    [select, applyCss],
  );

  /** Runs a change and records the state before it for undo; changes with the same key within a second are one step. */
  const commit = useCallback(
    (change: () => void, opts?: { key?: string; tree?: boolean }) => {
      if (!bodyRef.current) return;
      const now = Date.now();
      const last = lastCommit.current;
      const merge = !!opts?.key && !!last && last.key === opts.key && now - last.at < 1000;
      if (!merge) {
        past.current.push(snapshot());
        if (past.current.length > 200) past.current.shift();
      }
      lastCommit.current = opts?.key ? { key: opts.key, at: now } : null;
      future.current = [];
      change();
      syncOverlay();
      bump(opts?.tree);
    },
    [snapshot, syncOverlay, bump],
  );

  const undo = useCallback(() => {
    const s = past.current.pop();
    if (!s) return;
    future.current.push(snapshot());
    lastCommit.current = null;
    restore(s);
    bump(true);
  }, [snapshot, restore, bump]);

  const redo = useCallback(() => {
    const s = future.current.pop();
    if (!s) return;
    past.current.push(snapshot());
    lastCommit.current = null;
    restore(s);
    bump(true);
  }, [snapshot, restore, bump]);

  /* Records -------------------------------------------------------------------------- */

  const idOf = useCallback((el: Element) => el.getAttribute(PG_ID), []);

  const ensureId = useCallback((el: Element): string => {
    const have = el.getAttribute(PG_ID);
    if (have) return have;
    const body = bodyRef.current!;
    const id = newId((x) => !!handRef.current.elements[x] || !!body.querySelector(`[${PG_ID}="${x}"]`));
    el.setAttribute(PG_ID, id);
    return id;
  }, []);

  const updateRecord = useCallback(
    (el: Element, fn: (r: HandElement) => HandElement) => {
      const id = ensureId(el);
      const h = handRef.current;
      const prev = h.elements[id] ?? { label: labelOf(el, names, winRef.current), at: Date.now() };
      const next = fn(prev);
      const elements = { ...h.elements };
      if (isEmptyRecord(next)) delete elements[id];
      else elements[id] = next;
      setHand({ ...h, elements });
    },
    [ensureId, names, setHand],
  );

  const recordOf = useCallback(
    (el: Element | null) => {
      const id = el?.getAttribute(PG_ID);
      return id ? hand.elements[id] : undefined;
    },
    [hand],
  );

  /* Text ------------------------------------------------------------------------------ */

  const finishText = useCallback(
    (cancel = false) => {
      const t = textRef.current;
      if (!t) return;
      textRef.current = null;
      const el = t.el;
      el.removeAttribute("contenteditable");
      el.removeAttribute("spellcheck");
      el.removeAttribute("data-pg-editing");
      el.ownerDocument.defaultView?.getSelection()?.removeAllRanges();
      if (cancel) el.innerHTML = t.html;
      // A lone <br> is what browsers leave in an emptied editable.
      if (el.innerHTML === "<br>") el.innerHTML = "";
      setEditingText(false);
      if (el.innerHTML !== t.html) {
        past.current.push(t.before);
        future.current = [];
        lastCommit.current = null;
        updateRecord(el, (r) => ({ ...r, text: textOf(el), at: Date.now() }));
      }
      syncOverlay();
      bump();
    },
    [updateRecord, syncOverlay, bump],
  );

  const startText = useCallback(
    (el: Element, at?: { x: number; y: number }) => {
      if (!isTextual(el) || !bodyRef.current) return;
      finishText();
      const h = el as HTMLElement;
      const d = h.ownerDocument;
      textRef.current = { el: h, html: h.innerHTML, before: snapshot() };
      h.setAttribute("contenteditable", "plaintext-only");
      if (h.contentEditable !== "plaintext-only") h.setAttribute("contenteditable", "true");
      h.setAttribute("spellcheck", "true");
      h.setAttribute("data-pg-editing", "");
      h.focus({ preventScroll: true });
      const sel = d.defaultView?.getSelection();
      let range: Range | null = null;
      if (at) {
        const caret = (d as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint?.(at.x, at.y);
        if (caret) {
          range = d.createRange();
          range.setStart(caret.offsetNode, caret.offset);
        } else range = (d as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(at.x, at.y) ?? null;
        if (range && !h.contains(range.startContainer)) range = null;
        range?.collapse(true);
      }
      if (!range) {
        range = d.createRange();
        range.selectNodeContents(h);
      }
      sel?.removeAllRanges();
      sel?.addRange(range);
      if (selRef.current !== el) select(el);
      setEditingText(true);
      syncOverlay();
    },
    [finishText, snapshot, select, syncOverlay],
  );


  /* Changes ------------------------------------------------------------------------------- */

  const setStyle = useCallback(
    (props: Record<string, string | null>, opts?: { scope?: Scope }) => {
      const el = selRef.current;
      if (!el) return;
      const s = opts?.scope ?? scopeRef.current;
      const id = ensureId(el);
      commit(() => updateRecord(el, (r) => withStyles(r, s, props)), { key: `style:${id}:${s}:${Object.keys(props).join(",")}` });
    },
    [commit, updateRecord, ensureId],
  );

  const setMotion = useCallback(
    (patch: Partial<HandMotion> | null) => {
      const el = selRef.current;
      if (!el) return;
      commit(() => updateRecord(el, (r) => withMotion(r, patch)), { key: `motion:${el.getAttribute(PG_ID)}:${patch ? Object.keys(patch).join(",") : "reset"}` });
    },
    [commit, updateRecord],
  );

  /** Plays the selected element's entrance again (restarting the CSS animation). */
  const replayMotion = useCallback(() => {
    for (const a of selRef.current?.getAnimations() ?? []) {
      a.currentTime = 0;
      a.play();
    }
  }, []);

  const setAttr = useCallback(
    (name: "href" | "src" | "alt" | "target", value: string | null) => {
      const el = selRef.current;
      if (!el) return;
      commit(
        () => {
          if (name === "target") {
            if (value) {
              el.setAttribute("target", "_blank");
              el.setAttribute("rel", "noopener noreferrer");
            } else {
              el.removeAttribute("target");
              el.removeAttribute("rel");
            }
            return;
          }
          if (value === null) el.removeAttribute(name);
          else el.setAttribute(name, value);
          if (name === "src") {
            // A new picture replaces every candidate the old one had.
            el.removeAttribute("srcset");
            el.removeAttribute("sizes");
            if (el.parentElement?.tagName.toUpperCase() === "PICTURE") el.parentElement.querySelectorAll("source").forEach((s) => s.remove());
            updateRecord(el, (r) => ({ ...r, src: value ?? "", at: Date.now() }));
          }
          if (name === "href") updateRecord(el, (r) => ({ ...r, href: value ?? "", at: Date.now() }));
        },
        { key: `attr:${name}:${el.getAttribute(PG_ID)}` },
      );
    },
    [commit, updateRecord],
  );

  const setText = useCallback(
    (text: string) => {
      const el = selRef.current;
      if (!el || textOf(el) === text.replace(/\s+/g, " ").trim()) return;
      commit(() => {
        el.textContent = text;
        updateRecord(el, (r) => ({ ...r, text: textOf(el), at: Date.now() }));
      });
    },
    [commit, updateRecord],
  );

  const editText = useCallback(() => {
    const el = selRef.current;
    if (el) startText(el);
  }, [startText]);

  const remove = useCallback(() => {
    const el = selRef.current;
    const body = bodyRef.current;
    if (!el || !body) return;
    const outside = (q: string) => [...body.querySelectorAll(q)].some((n) => n !== el && !el.contains(n));
    if (!outside("[data-cta]")) return setNotice("The page needs at least one call to action, so this one stays. Change it instead.");
    if (!outside("[data-section]")) return setNotice("The page needs at least one section.");
    commit(
      () => {
        opsRef.current.push(`Removed ${labelOf(el, names, winRef.current)}`);
        const next = el.nextElementSibling ?? el.previousElementSibling ?? (el.parentElement !== body ? el.parentElement : null);
        el.remove();
        select(next);
      },
      { tree: true },
    );
  }, [commit, names, select]);

  const duplicate = useCallback(() => {
    const el = selRef.current;
    const body = bodyRef.current;
    if (!el || !body) return;
    commit(
      () => {
        const clone = el.cloneNode(true) as Element;
        const d = body.ownerDocument;
        const taken = (attr: string) => (x: string) => !!body.querySelector(`[${attr}="${CSS.escape(x)}"]`) || !!clone.querySelector(`[${attr}="${CSS.escape(x)}"]`) || clone.getAttribute(attr) === x;
        const unique = (attr: string, base: string) => {
          let v = `${base}-copy`;
          for (let n = 2; taken(attr)(v) || (attr === "id" && d.getElementById(v)); n++) v = `${base}-copy-${n}`;
          return v;
        };
        const h = handRef.current;
        const elements = { ...h.elements };
        for (const n of [clone, ...clone.querySelectorAll("*")]) {
          const old = n.getAttribute(PG_ID);
          if (old) {
            n.removeAttribute(PG_ID);
            const rec = h.elements[old];
            if (rec) {
              const id = newId((x) => !!elements[x] || taken(PG_ID)(x));
              n.setAttribute(PG_ID, id);
              elements[id] = { ...JSON.parse(JSON.stringify(rec)), at: Date.now() };
            }
          }
          const section = n.getAttribute("data-section");
          if (section) n.setAttribute("data-section", unique("data-section", section));
          const domId = n.getAttribute("id");
          if (domId) n.setAttribute("id", unique("id", domId));
        }
        el.after(clone);
        setHand({ ...h, elements });
        opsRef.current.push(`Duplicated ${labelOf(el, names, winRef.current)}`);
        select(clone, { scroll: true });
      },
      { tree: true },
    );
  }, [commit, names, select, setHand]);

  const move = useCallback(
    (dir: -1 | 1) => {
      const el = selRef.current;
      const sib = dir < 0 ? el?.previousElementSibling : el?.nextElementSibling;
      if (!el || !sib) return;
      commit(
        () => {
          if (dir < 0) sib.before(el);
          else sib.after(el);
          const label = labelOf(el, names, winRef.current);
          const line = `Moved ${label} ${dir < 0 ? "above" : "below"} ${nameOf(sib, names, winRef.current)}`;
          // Several moves of one element read as where it ended up.
          const ops = opsRef.current;
          if (ops.length && ops[ops.length - 1].startsWith(`Moved ${label} `)) ops[ops.length - 1] = line;
          else ops.push(line);
          select(el, { scroll: true });
        },
        { tree: true },
      );
    },
    [commit, names, select],
  );

  const selectParent = useCallback(() => {
    const el = selRef.current;
    const body = bodyRef.current;
    if (!el || !body) return;
    const parent = el.parentElement;
    select(parent && parent !== body ? parent : null);
  }, [select]);

  const resetStyles = useCallback(() => {
    const el = selRef.current;
    if (!el?.getAttribute(PG_ID)) return;
    commit(() => updateRecord(el, (r) => ({ label: r.label, at: Date.now(), ...(r.text !== undefined ? { text: r.text } : {}), ...(r.src !== undefined ? { src: r.src } : {}), ...(r.href !== undefined ? { href: r.href } : {}) })));
  }, [commit, updateRecord]);

  const setHoverState = useCallback(
    (on: boolean) => {
      hoverStateRef.current = on;
      setHoverStateRaw(on);
      applyCss();
    },
    [applyCss],
  );

  const setSpacingGuides = useCallback((show: boolean) => overlayRef.current?.setSpacing(show), []);

  const pageValue = useCallback((el: Element, prop: string) => {
    const sheet = styleRef.current?.sheet;
    const win = winRef.current;
    return sheet && win ? computedWithout(sheet, win, el, prop) : "";
  }, []);

  /* Saving --------------------------------------------------------------------------------- */

  const save = useCallback(async (): Promise<boolean> => {
    finishText();
    const body = bodyRef.current;
    if (!body || !dirtyNow()) return true;
    const hand = finalHand(handRef.current, body, names, winRef.current, opsRef.current);
    const html = serializeBody(body, new Set(Object.keys(hand.elements)));
    const changes = summarize(savedRef.current.hand, hand, opsRef.current);
    if (!changes.length && html === savedRef.current.html) return true;
    setSaving(true);
    try {
      const { version } = await saveHand({ variantId, baseVersion: baseRef.current, html, hand, changes });
      baseRef.current = version;
      savedRef.current = { hand: cloneHand({ ...hand, version }), html };
      handRef.current = cloneHand({ ...hand, version });
      setHandState(handRef.current);
      opsRef.current = [];
      past.current = [];
      future.current = [];
      lastCommit.current = null;
      bump();
      return true;
    } catch (err) {
      setNotice(err instanceof ConvexError ? String(err.data) : "Could not save your edits. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [finishText, dirtyNow, names, saveHand, variantId, bump]);

  const discard = useCallback(() => {
    finishText(true);
    const body = bodyRef.current;
    if (!body) return;
    restore({ html: savedRef.current.html, hand: savedRef.current.hand, ops: [], sel: null });
    past.current = [];
    future.current = [];
    lastCommit.current = null;
    bump(true);
  }, [finishText, restore, bump]);

  /* Keyboard ----------------------------------------------------------------------------- */

  const actionsRef = useRef<Partial<Record<OverlayAction, () => void>>>({});
  useEffect(() => {
    actionsRef.current = { parent: selectParent, up: () => move(-1), down: () => move(1), duplicate, remove, text: editText };
  }, [selectParent, move, duplicate, remove, editText]);

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      const t = textRef.current;
      if (t) {
        if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          finishText();
        } else if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
          const d = t.el.ownerDocument;
          const sel = d.defaultView?.getSelection();
          const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
          if (range) {
            range.deleteContents();
            const br = d.createElement("br");
            range.insertNode(br);
            range.setStartAfter(br);
            range.collapse(true);
            sel!.removeAllRanges();
            sel!.addRange(range);
          }
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (typing(e.target)) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (!selRef.current) return;
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        remove();
      } else if (e.key === "Escape") {
        e.preventDefault();
        selectParent();
      } else if (e.key === "Enter") {
        e.preventDefault();
        editText();
      } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        move(e.key === "ArrowUp" ? -1 : 1);
      }
    };
  }, [finishText, save, undo, redo, duplicate, remove, selectParent, editText, move]);

  const canvasRef = useRef<Omit<CanvasHandlers, "action" | "key">>({ ready: () => {}, hover: () => {}, pick: () => {}, double: () => {}, typingIn: () => null, doneTyping: () => {} });
  useEffect(() => {
    canvasRef.current = {
      ready: ({ win, body, root, style, overlay }) => {
        winRef.current = win;
        bodyRef.current = body;
        rootRef.current = root;
        styleRef.current = style;
        overlayRef.current = overlay;
        savedRef.current.html = serializeBody(body, new Set(Object.keys(handRef.current.elements)));
        applyCss();
        setCanvas({ win, body, root });
        setReady(true);
        bump(true);
      },
      hover,
      pick: (el) => select(el),
      double: (el, at) => isTextual(el) && startText(el, at),
      typingIn: () => textRef.current?.el ?? null,
      doneTyping: () => finishText(),
    };
  }, [applyCss, bump, hover, select, startText, finishText]);

  // The canvas loads once per editor, with the doc and kit it opened with.
  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    const h = canvasRef;
    const stop = mountCanvas(iframe, initial.kit, initial.doc, {
      ready: (c) => h.current.ready(c),
      action: (a) => actionsRef.current[a]?.(),
      hover: (el) => h.current.hover(el),
      pick: (el) => h.current.pick(el),
      double: (el, at) => h.current.double(el, at),
      key: (e) => keyRef.current(e),
      typingIn: () => h.current.typingIn(),
      doneTyping: () => h.current.doneTyping(),
    });
    return () => {
      stop();
      overlayRef.current = null;
    };
  }, [frame, initial]);

  // The console's own keyboard (focus outside the canvas) drives the same shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    baseRef.current = Math.max(baseRef.current, baseVersion);
  }, [baseVersion]);

  const dirty = history.dirty;

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);


  return {
    ready,
    win: canvas?.win ?? null,
    body: canvas?.body ?? null,
    root: canvas?.root ?? null,
    // An element that went away (undo, removal) is no longer selected.
    selected: selected?.isConnected ? selected : null,
    rev,
    treeRev,
    hand,
    scope,
    hoverState,
    setHoverState,
    names,
    editingText,
    dirty,
    canUndo: history.past > 0,
    canRedo: history.future > 0,
    saving,
    notice,
    clearNotice: () => setNotice(null),
    select,
    hover,
    label: (el) => labelOf(el, names, canvas?.win),
    name: (el) => nameOf(el, names, canvas?.win),
    idOf,
    recordOf,
    setStyle,
    setMotion,
    replayMotion,
    setAttr,
    setText,
    editText,
    remove,
    duplicate,
    move,
    selectParent,
    resetStyles,
    setSpacingGuides,
    pageValue,
    undo,
    redo,
    save,
    discard,
  };
}
