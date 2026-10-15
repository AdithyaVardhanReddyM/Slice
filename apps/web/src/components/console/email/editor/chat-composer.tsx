"use client";

// The chat's prompt box: text, images (attach, paste or drop) and blocks the
// merchant pointed at with "Edit with AI", which sit in the text as pills and
// go to the agent with their ids so it edits exactly those.

import { ArrowUp, Check, ChevronDown, Paperclip, Square, SquareDashed } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PAGES_MODELS, type PagesModel } from "@/lib/pages/models";
import { AttachmentStrip, type Attachment } from "@/components/console/pages/builder/attachments";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PickedBlock } from "./use-email-agent";

export interface ComposerValue {
  /** Plain text; each picked block is written as "[label]". */
  text: string;
  blocks: PickedBlock[];
  attachments: Attachment[];
}

export interface ChatComposerHandle {
  focus(): void;
  /** Replace the text. */
  set(text: string): void;
  /** Put a block in as a pill, where the caret was. */
  addBlock(block: PickedBlock): void;
}

type Pending = Attachment & { id: number; pending: boolean; error?: string; preview: string };

const PILL =
  "mx-px inline-flex max-w-full items-center gap-1 rounded-md bg-blue-600/10 py-px pr-1 pl-1 align-[-0.2em] text-[0.8125rem] leading-5 font-medium text-blue-700 ring-1 ring-blue-600/15 ring-inset select-none";
const DASHED_SQUARE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 shrink-0" aria-hidden="true"><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/></svg>';

/** The DOM pill inside the editable field (React does not own the field's children). */
function pillNode(b: PickedBlock, onRemove: (pill: HTMLElement) => void): HTMLSpanElement {
  const pill = document.createElement("span");
  pill.contentEditable = "false";
  pill.dataset.blockKey = b.id;
  pill.className = PILL;
  pill.title = b.label;
  pill.insertAdjacentHTML("afterbegin", DASHED_SQUARE);
  const label = document.createElement("span");
  label.className = "max-w-56 truncate";
  label.textContent = b.label;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${b.label}`);
  remove.className = "ml-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded text-blue-700/60 hover:bg-blue-600/15 hover:text-blue-800";
  remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="size-3" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  remove.addEventListener("mousedown", (e) => e.preventDefault());
  remove.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove(pill);
  });
  pill.append(label, remove);
  return pill;
}

/** A picked block as sent: the pill without the x. */
export function BlockPill({ label }: { label: string }) {
  return (
    <span className={cn(PILL, "pr-1.5")} title={label}>
      <SquareDashed className="size-3.5 shrink-0" />
      <span className="max-w-56 truncate">{label}</span>
    </span>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Message text with every picked block's "[label]" shown as a pill. */
export function PillText({ text, blocks = [] }: { text: string; blocks?: { label: string }[] }) {
  const labels = [...new Set(blocks.map((b) => b.label))].sort((a, b) => b.length - a.length);
  if (!labels.length) return <>{text}</>;
  const re = new RegExp(labels.map((l) => `\\[${escapeRe(l)}\\]`).join("|"), "g");
  const out: (string | { label: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ label: m[0].slice(1, -1) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <BlockPill key={i} label={p.label} />))}</>;
}

function serialize(root: HTMLElement, picked: Map<string, PickedBlock>): { text: string; blocks: PickedBlock[] } {
  let text = "";
  const blocks: PickedBlock[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const key = node.dataset.blockKey;
    if (key) {
      const b = picked.get(key);
      if (b) {
        text += `[${b.label}]`;
        if (!blocks.some((x) => x.id === b.id)) blocks.push(b);
      }
      return;
    }
    if (node.tagName === "BR") {
      text += "\n";
      return;
    }
    if ((node.tagName === "DIV" || node.tagName === "P") && text && !text.endsWith("\n")) text += "\n";
    node.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return { text: text.replace(/ /g, " ").trim(), blocks };
}

function caretToEnd(root: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(root);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Google Gemini's mark, single colour. */
function GeminiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("shrink-0 fill-current", className)}>
      <path d="M12 24A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12" />
    </svg>
  );
}

function ModelPicker({ value, onChange, disabled }: { value: PagesModel; onChange: (m: PagesModel) => void; disabled?: boolean }) {
  const current = PAGES_MODELS.find((m) => m.value === value) ?? PAGES_MODELS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-muted"
      >
        <GeminiMark className="size-3.5 text-foreground" />
        {current.short}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Model</DropdownMenuLabel>
          {PAGES_MODELS.map((m) => (
            <DropdownMenuItem key={m.value} onClick={() => onChange(m.value)} className="items-start gap-2.5 py-2">
              <GeminiMark className="mt-0.5 size-4 text-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.hint.replace("pages", "emails")}</span>
              </span>
              {m.value === value && <Check className="mt-0.5 size-4 shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ChatComposer = forwardRef<
  ChatComposerHandle,
  {
    placeholder: string;
    onSubmit: (value: ComposerValue) => void;
    onUpload?: (file: File) => Promise<Attachment>;
    busy?: boolean;
    onStop?: () => void;
    disabled?: boolean;
    model?: PagesModel;
    onModelChange?: (m: PagesModel) => void;
  }
>(function ChatComposer({ placeholder, onSubmit, onUpload, busy, onStop, disabled, model, onModelChange }, ref) {
  const field = useRef<HTMLDivElement>(null);
  const picked = useRef(new Map<string, PickedBlock>());
  const caret = useRef<Range | null>(null);
  const [empty, setEmpty] = useState(true);
  const [files, setFiles] = useState<Pending[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const attach = (list: FileList | File[] | null) => {
    if (!onUpload || !list) return;
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) continue;
      const id = nextId.current++;
      const preview = URL.createObjectURL(file);
      setFiles((f) => [...f, { id, url: "", name: file.name, type: file.type, pending: true, preview }]);
      onUpload(file)
        .then((a) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, ...a, pending: false } : x))))
        .catch((err: Error) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, pending: false, error: err.message } : x))));
    }
  };
  const removeFile = (index: number) =>
    setFiles((f) => {
      const gone = f[index];
      if (gone) URL.revokeObjectURL(gone.preview);
      return f.filter((_, i) => i !== index);
    });
  const uploading = files.some((f) => f.pending);

  const sync = () => {
    const el = field.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector("[data-block-key]"));
    const sel = window.getSelection();
    if (sel?.rangeCount && el.contains(sel.anchorNode)) caret.current = sel.getRangeAt(0).cloneRange();
  };

  const insertText = (text: string) => {
    const el = field.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) caretToEnd(el);
    const r = sel.getRangeAt(0);
    r.deleteContents();
    const t = document.createTextNode(text);
    r.insertNode(t);
    r.setStart(t, t.length);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  const submit = () => {
    const el = field.current;
    if (!el || busy || disabled || uploading) return;
    const value = serialize(el, picked.current);
    const attachments = files.filter((f) => f.url && !f.error).map(({ url, name, type }) => ({ url, name, type }));
    if (!value.text && attachments.length === 0) return;
    onSubmit({ ...value, attachments });
    el.innerHTML = "";
    picked.current.clear();
    caret.current = null;
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setEmpty(true);
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = field.current;
      if (!el) return;
      el.focus();
      caretToEnd(el);
    },
    set: (text) => {
      const el = field.current;
      if (!el) return;
      el.textContent = text;
      el.focus();
      caretToEnd(el);
      sync();
    },
    addBlock: (b) => {
      const el = field.current;
      if (!el) return;
      // The same block twice is one pill.
      if (picked.current.has(b.id) && el.querySelector(`[data-block-key="${CSS.escape(b.id)}"]`)) return;
      picked.current.set(b.id, b);
      const pill = pillNode(b, (node) => {
        picked.current.delete(b.id);
        const next = node.nextSibling;
        if (next?.nodeType === Node.TEXT_NODE && next.textContent?.startsWith(" ")) next.textContent = next.textContent.slice(1);
        node.remove();
        sync();
      });
      const space = document.createTextNode(" ");
      const at = caret.current && el.contains(caret.current.startContainer) ? caret.current : null;
      if (at) {
        at.collapse(false);
        at.insertNode(space);
        at.insertNode(pill);
        const before = pill.previousSibling;
        if (before?.nodeType === Node.TEXT_NODE && before.textContent && !/\s$/.test(before.textContent)) before.textContent += " ";
        el.focus();
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(space, 1);
        r.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(r);
      } else {
        el.append(pill, space);
        el.focus();
        caretToEnd(el);
      }
      sync();
    },
  }));

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_-12px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.08] transition-shadow focus-within:ring-black/20">
      <div className="relative">
        {empty && <span className="pointer-events-none absolute top-3 left-3.5 text-sm leading-6 text-muted-foreground select-none">{placeholder}</span>}
        <div
          ref={field}
          role="textbox"
          aria-multiline
          aria-label={placeholder}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={sync}
          onKeyUp={sync}
          onClick={sync}
          onPaste={(e) => {
            e.preventDefault();
            const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (images.length && onUpload) attach(images);
            else insertText(e.clipboardData.getData("text/plain"));
            sync();
          }}
          onDragOver={(e) => {
            if (onUpload && e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!onUpload || !e.dataTransfer.files.length) return;
            e.preventDefault();
            attach(e.dataTransfer.files);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="scrollbar-thin max-h-56 min-h-[4.25rem] overflow-y-auto overscroll-contain px-3.5 pt-3 pb-1 text-sm leading-6 break-words whitespace-pre-wrap outline-none"
        />
      </div>
      <AttachmentStrip items={files} onRemove={removeFile} className="px-3 pb-2" size="sm" />
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
        <div className="flex min-w-0 items-center gap-1">
          {onUpload && (
            <>
              <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (attach(e.target.files), (e.target.value = ""))} />
              <button
                type="button"
                disabled={disabled}
                aria-label="Attach an image"
                title="Attach an image (or paste or drop one)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInput.current?.click()}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                <Paperclip className="size-4" />
              </button>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {model && onModelChange && <ModelPicker value={model} onChange={onModelChange} disabled={busy} />}
          {busy ? (
            <Button type="button" size="icon-sm" variant="outline" onClick={onStop} aria-label="Stop" className="size-8 rounded-full">
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-sm"
              onClick={submit}
              disabled={(empty && files.length === 0) || uploading || disabled}
              aria-label="Send"
              className="size-8 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:opacity-100"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
