"use client";

import Link from "next/link";
import { ArrowUp, AtSign, Check, ChevronDown, Paperclip, Square, Users } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AUDIENCE_KIND_LABEL, profileOf, type Audience } from "@/lib/pages/types";
import { PAGES_MODELS, type PagesModel } from "@/lib/pages/models";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusDot } from "../shared";
import { AttachmentStrip, type Attachment } from "./attachments";
import { KIND_ICON, coverTiles } from "../taste-cover";

export interface ComposerValue {
  /** Plain text; each mention is written as "@Name". */
  text: string;
  mentions: Audience[];
  /** Images attached to the message, already uploaded. */
  attachments: Attachment[];
}

type Pending = Attachment & { id: number; pending: boolean; error?: string; preview: string };

export interface ComposerHandle {
  focus(): void;
  /** Replace the content: strings become text, audiences become pills. */
  set(parts: (string | Audience)[]): void;
}

const PILL =
  "mx-px inline-flex items-center gap-1 rounded-md bg-primary/10 py-px pr-1.5 pl-0.5 align-[-0.2em] text-[0.8125rem] leading-5 font-medium text-primary ring-1 ring-primary/15 ring-inset select-none";
const PILL_AVATAR = "size-4 shrink-0 rounded-[4px] object-cover";
const PILL_MONO = "flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-primary/15 text-[10px] font-semibold";

const avatarOf = (a: Audience) => coverTiles(profileOf(a), 1)[0]?.image;

/** The DOM pill inside the editable field (React does not own the field's children). */
function pillNode(a: Audience): HTMLSpanElement {
  const pill = document.createElement("span");
  pill.contentEditable = "false";
  pill.dataset.audienceId = a._id;
  pill.dataset.audienceName = a.name;
  pill.className = PILL;
  const image = avatarOf(a);
  if (image) {
    const img = document.createElement("img");
    img.src = image;
    img.alt = "";
    img.className = PILL_AVATAR;
    pill.append(img);
  } else {
    const mono = document.createElement("span");
    mono.className = PILL_MONO;
    mono.textContent = a.name.charAt(0).toUpperCase();
    pill.append(mono);
  }
  pill.append(document.createTextNode(a.name));
  return pill;
}

/** A mention pill rendered by React, for messages already sent. */
export function AudiencePill({ audience, name }: { audience?: Audience; name: string }) {
  const image = audience ? avatarOf(audience) : undefined;
  return (
    <span className={PILL}>
      {image ? (
        // Qloo images come from many hosts; next/image would need each allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className={PILL_AVATAR} />
      ) : (
        <span className={PILL_MONO}>{name.charAt(0).toUpperCase()}</span>
      )}
      {name}
    </span>
  );
}

/** Message text with every "@Audience name" shown as a pill. */
export function MentionText({ text, audiences }: { text: string; audiences: Audience[] }) {
  const parts = useMemo(() => {
    const names = [...audiences].sort((a, b) => b.name.length - a.name.length);
    if (names.length === 0) return [text];
    const escaped = names.map((a) => a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`@(${escaped.join("|")})`, "g");
    const out: (string | Audience)[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(names.find((a) => a.name === m[1])!);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text, audiences]);
  return <>{parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <AudiencePill key={i} audience={p} name={p.name} />))}</>;
}

function serialize(root: HTMLElement, audiences: Audience[]): Omit<ComposerValue, "attachments"> {
  let text = "";
  const mentions: Audience[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const id = node.dataset.audienceId;
    if (id) {
      const a = audiences.find((x) => x._id === id);
      text += `@${a?.name ?? node.dataset.audienceName ?? ""}`;
      if (a && !mentions.includes(a)) mentions.push(a);
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
  return { text: text.replace(/ /g, " ").trim(), mentions };
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

type MenuState = { query: string; node: Text; at: number; caret: number };

/**
 * The builder's prompt box. Type @ (or press the @ button) to mention a saved
 * audience; it becomes an inline pill and is sent along with the text.
 */
/** Google Gemini's mark, single colour (inherits the text colour). */
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
        {current.label}
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
                <span className="block text-xs text-muted-foreground">{m.hint}</span>
              </span>
              {m.value === value && <Check className="mt-0.5 size-4 shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const PromptComposer = forwardRef<
  ComposerHandle,
  {
    audiences: Audience[];
    placeholder: string;
    onSubmit: (value: ComposerValue) => void;
    /** Uploads one image and returns where it lives; enables the paperclip, paste and drop. */
    onUpload?: (file: File) => Promise<Attachment>;
    /** A turn is running: the send button becomes Stop. */
    busy?: boolean;
    onStop?: () => void;
    disabled?: boolean;
    autoFocus?: boolean;
    /** Left side of the toolbar, after the @ button. */
    hint?: ReactNode;
    /** The model the agent runs on, picked from the toolbar. */
    model?: PagesModel;
    onModelChange?: (model: PagesModel) => void;
    className?: string;
    brandSlug: string;
  }
>(function PromptComposer({ audiences, placeholder, onSubmit, busy, onStop, disabled, autoFocus, hint, className, brandSlug, model, onModelChange, onUpload }, ref) {
  const field = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [files, setFiles] = useState<Pending[]>([]);
  const picker = useRef<HTMLInputElement>(null);
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
  const [index, setIndex] = useState(0);
  const menuRef = useRef<MenuState | null>(null);
  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);

  const matches = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.trim().toLowerCase();
    return audiences.filter((a) => a.status !== "failed" && (!q || a.name.toLowerCase().includes(q))).slice(0, 8);
  }, [menu, audiences]);

  const sync = useCallback(() => {
    const el = field.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector("[data-audience-id]"));
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !sel.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) {
      setMenu(null);
      return;
    }
    const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
    const m = before.match(/(?:^|[\s ])@([^@\n]{0,24})$/);
    if (!m) {
      setMenu(null);
      return;
    }
    const query = m[1];
    if (menuRef.current?.query !== query) setIndex(0);
    setMenu({ query, node: node as Text, at: sel.anchorOffset - query.length - 1, caret: sel.anchorOffset });
  }, []);

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

  const choose = (a: Audience) => {
    const el = field.current;
    const sel = window.getSelection();
    if (!el || !sel || !menu || !menu.node.isConnected) return;
    const r = document.createRange();
    r.setStart(menu.node, Math.max(0, menu.at));
    r.setEnd(menu.node, Math.min(menu.caret, menu.node.length));
    r.deleteContents();
    const pill = pillNode(a);
    const space = document.createTextNode(" ");
    r.insertNode(space);
    r.insertNode(pill);
    r.setStart(space, 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    setMenu(null);
    sync();
  };

  const submit = () => {
    const el = field.current;
    if (!el || busy || disabled || uploading) return;
    const value = serialize(el, audiences);
    const attachments = files.filter((f) => f.url && !f.error).map(({ url, name, type }) => ({ url, name, type }));
    if (!value.text && attachments.length === 0) return;
    onSubmit({ ...value, attachments });
    el.innerHTML = "";
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setEmpty(true);
    setMenu(null);
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = field.current;
      if (!el) return;
      el.focus();
      caretToEnd(el);
    },
    set: (parts) => {
      const el = field.current;
      if (!el) return;
      el.innerHTML = "";
      for (const p of parts) el.append(typeof p === "string" ? document.createTextNode(p) : pillNode(p));
      el.focus();
      caretToEnd(el);
      sync();
    },
  }));

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  const open = menu !== null;

  return (
    <div className={cn("relative", className)}>
      {open && (
        <div className="absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
            <span>Target an audience</span>
            <span>↑↓ to move · Enter to pick</span>
          </div>
          {matches.length === 0 ? (
            <div className="space-y-2 px-3 py-3 text-sm">
              <p className="text-muted-foreground">
                {audiences.length === 0 ? "No saved audiences yet." : `No audience matches “${menu.query.trim()}”.`} You can also describe who it is for in
                words, like “for people under 25 in Berlin”.
              </p>
              <Link href={`/dashboard/pages/${brandSlug}/audiences?new=1`} className="text-sm font-medium text-foreground underline underline-offset-4">
                Create an audience
              </Link>
            </div>
          ) : (
            <ul role="listbox" className="max-h-72 overflow-y-auto overscroll-contain p-1">
              {matches.map((a, i) => {
                const image = avatarOf(a);
                const Icon = KIND_ICON[a.kind] ?? Users;
                return (
                  <li key={a._id} role="option" aria-selected={i === index}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(a);
                      }}
                      onMouseEnter={() => setIndex(i)}
                      className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left", i === index && "bg-muted")}
                    >
                      <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-800 text-white/80">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image} alt="" className="size-full object-cover" />
                        ) : (
                          <Icon className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {a.status !== "ready" && <StatusDot status={a.status} />}
                          {AUDIENCE_KIND_LABEL[a.kind] ?? a.kind}
                          {a.status === "compiling" && " · compiling"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {/* A 1px warm gradient border around a faintly tinted field; the glow lifts on focus. */}
      <div className="group/composer rounded-[1.15rem] bg-linear-to-br from-primary via-amber-300 to-primary p-[1.5px] shadow-[0_12px_40px_-10px] shadow-primary/50 ring-4 ring-primary/10 transition-shadow duration-300 focus-within:shadow-[0_16px_48px_-8px] focus-within:shadow-primary/70 focus-within:ring-primary/20">
        <div className="overflow-hidden rounded-[1.05rem] bg-background">
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
              onKeyUp={(e) => {
                if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) sync();
              }}
              onClick={sync}
              onBlur={() => setTimeout(() => setMenu(null), 120)}
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
                if (open && matches.length > 0) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setIndex((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    choose(matches[Math.min(index, matches.length - 1)]);
                    return;
                  }
                }
                if (open && e.key === "Escape") {
                  e.preventDefault();
                  setMenu(null);
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="scrollbar-thin max-h-60 min-h-[4.5rem] overflow-y-auto overscroll-contain px-3.5 pt-3 pb-1 text-sm leading-6 break-words whitespace-pre-wrap outline-none"
            />
          </div>
          <AttachmentStrip items={files} onRemove={removeFile} className="px-3 pb-2" size="sm" />
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  field.current?.focus();
                  insertText(empty ? "@" : " @");
                  sync();
                }}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pr-2.5 pl-2 text-xs font-medium text-primary shadow-xs transition-colors hover:border-primary/50 hover:bg-primary/15 disabled:pointer-events-none disabled:opacity-50"
              >
                <AtSign className="size-3.5" />
                Audience
              </button>
              {onUpload && (
                <>
                  <input ref={picker} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (attach(e.target.files), (e.target.value = ""))} />
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label="Attach an image"
                    title="Attach an image (or paste or drop one)"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => picker.current?.click()}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Paperclip className="size-4" />
                  </button>
                </>
              )}
              {hint && <span className="min-w-0 truncate text-xs text-muted-foreground">{hint}</span>}
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
                  className="size-8 rounded-full bg-linear-to-b from-primary/85 to-primary shadow-sm shadow-primary/30 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
