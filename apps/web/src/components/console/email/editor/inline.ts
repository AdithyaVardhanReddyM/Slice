"use client";

// Typing in place on the canvas. The renderer's own text element (the h1, the
// paragraph div, the button's link, the quote) becomes contenteditable, so
// what the merchant types looks exactly like what is sent. On commit its HTML
// goes through the same sanitiser every write uses; merge-tag chips turn back
// into {{tags}} there.

import { sanitizeInline, sanitizeRich } from "@slice/backend/convex/emailDoc";
import type { EmailBlock } from "@slice/backend/convex/emailTypes";
import { MERGE_TAGS } from "@slice/backend/convex/emailTypes";
import { blockText, plain } from "./model";
import type { InlineHandle, InlineState } from "./use-email-editor";

/** The element holding a block's words inside its rendered HTML. */
export function editableTarget(host: HTMLElement, block: EmailBlock): HTMLElement | null {
  switch (block.type) {
    case "heading":
      return host.querySelector<HTMLElement>("h1, h2, h3");
    case "text":
      return host.querySelector<HTMLElement>("div.bf");
    case "button":
      return host.querySelector<HTMLElement>("a.bf");
    case "quote":
      // The first .hf is the quotation mark; the second is the quote.
      return host.querySelectorAll<HTMLElement>("td > div.hf")[1] ?? null;
    default:
      return null;
  }
}

/** The fields a commit writes, from the edited element's HTML. */
function fieldsFrom(block: EmailBlock, html: string): Partial<EmailBlock> | null {
  switch (block.type) {
    case "heading":
      return { text: sanitizeInline(html) };
    case "quote":
      return { text: sanitizeInline(html) };
    case "text":
      return { html: sanitizeRich(html) };
    case "button":
      // A label is plain text; merge tags survive the sanitiser as {{tags}}.
      return { label: plain(sanitizeInline(html)) || block.label };
    default:
      return null;
  }
}

const sameFields = (block: EmailBlock, set: Partial<EmailBlock>) => Object.entries(set).every(([k, v]) => (block as unknown as Record<string, unknown>)[k] === v);

/** The chip the renderer draws for a merge tag in edit mode, as a DOM node. */
export function mergeChip(key: string, fallback?: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.dataset.merge = key;
  if (fallback) chip.dataset.fallback = fallback;
  chip.contentEditable = "false";
  chip.setAttribute(
    "style",
    "display:inline-block;padding:0 0.45em;margin:0 0.05em;border-radius:999px;background-color:rgba(127,127,127,0.16);box-shadow:inset 0 0 0 1px rgba(127,127,127,0.3);font-size:0.82em;line-height:1.45;font-weight:500;vertical-align:0.06em;white-space:nowrap",
  );
  chip.textContent = MERGE_TAGS.find((t) => t.key === key)?.label ?? key;
  return chip;
}

function placeCaret(target: HTMLElement, at: { x: number; y: number } | null, selectAll: boolean) {
  const sel = window.getSelection();
  if (!sel) return;
  let range: Range | null = null;
  if (selectAll) {
    range = document.createRange();
    range.selectNodeContents(target);
  } else if (at) {
    // Where the double click landed, so the caret starts under the pointer.
    const doc = target.ownerDocument as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    const pos = doc.caretPositionFromPoint?.(at.x, at.y);
    if (pos && target.contains(pos.offsetNode)) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    } else {
      const r = document.caretRangeFromPoint?.(at.x, at.y);
      if (r && target.contains(r.startContainer)) range = r;
    }
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Turns the block's text element into an editor until `commit`. Returns the
 * handle the toolbar talks to, and a cleanup that puts the rendered HTML back
 * when nothing changed (the canvas re-renders it when something did).
 */
export function startInline({
  host,
  block,
  at,
  command,
  onCommit,
  onDone,
}: {
  host: HTMLElement;
  block: EmailBlock;
  /** Pointer position of the double click that started it. */
  at: { x: number; y: number } | null;
  /** A toolbar command to run on the whole text right away (B on a block not being typed in). */
  command: { command: string; value?: string } | null;
  onCommit: (set: Partial<EmailBlock>) => void;
  onDone: () => void;
}): { handle: InlineHandle; cleanup: () => void } | null {
  const target = editableTarget(host, block);
  if (!target) return null;
  const original = host.innerHTML;
  // Empty blocks show a soft placeholder; typing starts from nothing.
  if (!blockText(block)) target.innerHTML = "";
  const multiline = block.type === "text";
  let committed = false;
  let changed = false;
  let saved: Range | null = null;

  target.contentEditable = "true";
  target.spellcheck = true;
  target.style.outline = "none";
  target.style.cursor = "text";
  target.style.caretColor = "currentColor";
  target.focus({ preventScroll: true });
  try {
    document.execCommand("defaultParagraphSeparator", false, "p");
  } catch {
    // Older engines ignore it; paragraphs come out as divs and the sanitiser turns them into p.
  }
  placeCaret(target, at, !!command);

  const restore = () => {
    if (document.activeElement !== target) target.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (saved && sel && target.contains(saved.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(saved);
    }
  };

  const exec = (cmd: string, value?: string) => {
    restore();
    const css = cmd === "foreColor";
    try {
      if (css) document.execCommand("styleWithCSS", false, "true");
      document.execCommand(cmd, false, value);
      if (css) document.execCommand("styleWithCSS", false, "false");
    } catch {
      // A command the engine does not know does nothing.
    }
    changed = true;
    const sel = window.getSelection();
    if (sel?.rangeCount) saved = sel.getRangeAt(0).cloneRange();
  };

  const commit = () => {
    if (committed) return;
    committed = true;
    if (changed) {
      const set = fieldsFrom(block, target.innerHTML);
      if (set && !sameFields(block, set)) onCommit(set);
      else host.innerHTML = original;
    } else host.innerHTML = original;
    onDone();
  };

  const onInput = () => {
    changed = true;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      commit();
      return;
    }
    // Headings, buttons and quotes are one paragraph; Shift+Enter still breaks a line in headings.
    if (e.key === "Enter" && !multiline && (block.type === "button" || !e.shiftKey)) {
      e.preventDefault();
      if (block.type !== "button" && e.shiftKey) exec("insertLineBreak");
      return;
    }
    if ((e.metaKey || e.ctrlKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) changed = true;
  };
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    exec("insertText", multiline ? text : text.replace(/\s*\n+\s*/g, " "));
  };
  const onSelection = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount && target.contains(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange();
  };
  const onBlur = () => {
    // Focus moving into the toolbar or one of its popovers keeps the text open.
    setTimeout(() => {
      const a = document.activeElement;
      if (a === target || a?.closest("[data-editor-toolbar],[data-inline-keep]")) return;
      commit();
    }, 0);
  };
  const onClick = (e: MouseEvent) => {
    // Links inside the text are for editing, not following.
    if ((e.target as HTMLElement).closest("a")) e.preventDefault();
  };

  target.addEventListener("input", onInput);
  target.addEventListener("keydown", onKey);
  target.addEventListener("paste", onPaste);
  target.addEventListener("blur", onBlur);
  target.addEventListener("click", onClick);
  document.addEventListener("selectionchange", onSelection);

  if (command) exec(command.command, command.value);

  const state = (): InlineState => {
    const q = (c: string) => {
      try {
        return document.queryCommandState(c);
      } catch {
        return false;
      }
    };
    const sel = window.getSelection();
    const node = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
    return { bold: q("bold"), italic: q("italic"), underline: q("underline"), ul: q("insertUnorderedList"), ol: q("insertOrderedList"), link: !!node?.closest("a") && target.contains(node) };
  };

  const insertMerge = (tag: string) => {
    const [key, fallback] = tag.split("|");
    restore();
    const sel = window.getSelection();
    if (!sel?.rangeCount || !target.contains(sel.anchorNode)) placeCaret(target, null, false);
    const r = window.getSelection()!.getRangeAt(0);
    r.deleteContents();
    const chip = mergeChip(key, fallback);
    const space = document.createTextNode(" ");
    r.insertNode(space);
    r.insertNode(chip);
    r.setStartAfter(space);
    r.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(r);
    changed = true;
  };

  const handle: InlineHandle = { exec, insertMerge, commit, state };
  const cleanup = () => {
    target.removeEventListener("input", onInput);
    target.removeEventListener("keydown", onKey);
    target.removeEventListener("paste", onPaste);
    target.removeEventListener("blur", onBlur);
    target.removeEventListener("click", onClick);
    document.removeEventListener("selectionchange", onSelection);
    if (!committed) commit();
    target.contentEditable = "false";
  };
  return { handle, cleanup };
}
