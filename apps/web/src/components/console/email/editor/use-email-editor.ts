"use client";

// The campaign editor's state: the doc as the merchant sees it, what is
// selected, undo and redo (snapshots of the doc), and autosave. Hand edits
// apply locally right away and are saved 700 ms after the last one with the
// version they started from. When the server's doc moves ahead (an agent turn
// writing section by section, another tab) the editor adopts it as one undo
// step, so "Undo" also takes back what the agent did.

import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { applyOps } from "@slice/backend/convex/emailDoc";
import type { EmailDoc, EmailOp } from "@slice/backend/convex/emailTypes";
import { selectionExists, type Device, type Selection } from "./model";

const SAVE_DELAY = 700;
const HISTORY_LIMIT = 100;
/** Changes with the same coalesce key this close together are one undo step (a slider drag). */
const COALESCE_MS = 1200;

export type SaveState = "saved" | "dirty" | "saving" | "error";

/** Commands the floating toolbar and the Personalise panel send to the text being typed in. */
export interface InlineHandle {
  exec(command: string, value?: string): void;
  insertMerge(tag: string): void;
  commit(): void;
  /** Which inline styles the caret sits in, for the toolbar's pressed state. */
  state(): InlineState;
}

export interface InlineState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  ul: boolean;
  ol: boolean;
  link: boolean;
}

interface History {
  doc: EmailDoc | null;
  past: EmailDoc[];
  future: EmailDoc[];
}

export interface EditOptions {
  /** Merge into the previous undo step when it had the same key and was recent. */
  coalesce?: string;
  /** Select this after the change (a new block or section). */
  select?: Selection | null;
}

export function useEmailEditor({ campaignId, serverDoc, locked }: { campaignId: Id<"emailCampaigns">; serverDoc: EmailDoc | undefined; locked: boolean }) {
  const saveDoc = useMutation(api.emailCampaigns.saveDoc);
  // The campaign is loaded before the editor mounts, so the doc is there from the first render.
  const [hist, setHist] = useState<History>(() => ({ doc: serverDoc ?? null, past: [], future: [] }));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hover, setHover] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [tool, setTool] = useState<"select" | "hand">("select");

  // The latest values for the save loop, which outlives renders.
  const histRef = useRef<History>(hist);
  const base = useRef(serverDoc?.version ?? 0);
  const dirty = useRef(false);
  const saving = useRef(false);
  const rev = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestServer = useRef<EmailDoc | undefined>(undefined);
  const lastStep = useRef<{ key: string; at: number } | null>(null);
  const waiters = useRef<(() => void)[]>([]);
  const inline = useRef<InlineHandle | null>(null);
  // The save loop re-arms itself from timers; they call the latest save through this.
  const saveRef = useRef<() => Promise<void>>(async () => {});
  /** A toolbar command waiting for the inline editor to open (B on a block that is not being typed in). */
  const pendingCommand = useRef<{ command: string; value?: string } | null>(null);

  const commit = useCallback((next: History) => {
    histRef.current = next;
    setHist(next);
  }, []);

  const settle = useCallback(() => {
    if (dirty.current || saving.current) return;
    const ws = waiters.current;
    waiters.current = [];
    ws.forEach((w) => w());
  }, []);

  /** The server's doc is newer than ours: take it, keeping ours one undo step back. */
  const reconcile = useCallback(() => {
    const server = latestServer.current;
    if (!server || saving.current || server.version <= base.current) return;
    base.current = server.version;
    const h = histRef.current;
    const hadEdits = dirty.current;
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    setSaveState("saved");
    // An agent turn writes many versions in a row: one undo step for all of them.
    const same = lastStep.current?.key === "server";
    lastStep.current = { key: "server", at: Date.now() };
    const past = h.doc && !same ? [...h.past, h.doc].slice(-HISTORY_LIMIT) : h.past;
    commit({ doc: server, past, future: same ? h.future : [] });
    if (hadEdits) setNotice("This email changed somewhere else, so it was reloaded. Undo brings back your last change.");
    settle();
  }, [commit, settle]);

  const save = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const doc = histRef.current.doc;
    if (saving.current || !dirty.current || !doc) return;
    saving.current = true;
    setSaveState("saving");
    const sent = rev.current;
    try {
      const res = (await saveDoc({ id: campaignId, doc, baseVersion: base.current })) as { version: number; conflict?: boolean };
      if (res.conflict) {
        // Someone saved first. Their doc wins and ours stays one undo step back (reconcile).
        dirty.current = false;
        lastStep.current = null;
        setNotice("This email changed somewhere else, so it was reloaded. Undo brings back your last change.");
      } else {
        base.current = Math.max(base.current, res.version);
        if (rev.current === sent) dirty.current = false;
      }
      setSaveState(dirty.current ? "dirty" : "saved");
    } catch {
      setSaveState("error");
      saving.current = false;
      // Try again a little later; the edits stay here meanwhile.
      timer.current = setTimeout(() => void saveRef.current(), 4000);
      return;
    }
    saving.current = false;
    if (dirty.current) timer.current = setTimeout(() => void saveRef.current(), SAVE_DELAY);
    reconcile();
    settle();
  }, [saveDoc, campaignId, reconcile, settle]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const touch = useCallback(() => {
    dirty.current = true;
    rev.current += 1;
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY);
  }, [save]);

  // First load, then every server change.
  useEffect(() => {
    if (!serverDoc) return;
    latestServer.current = serverDoc;
    if (!histRef.current.doc) {
      base.current = serverDoc.version;
      commit({ doc: serverDoc, past: [], future: [] });
      return;
    }
    reconcile();
  }, [serverDoc, reconcile, commit]);

  // Save on the way out (tab close, leaving the editor).
  useEffect(() => {
    const flushNow = () => {
      if (dirty.current) void save();
    };
    window.addEventListener("pagehide", flushNow);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      flushNow();
    };
  }, [save]);

  // Text being typed in place is committed before any other change, so a toolbar click
  // (align, size) or undo never re-renders the block over unsaved words.
  const committing = useRef(false);
  const flushInline = useCallback(() => {
    if (!inline.current || committing.current) return;
    committing.current = true;
    try {
      inline.current.commit();
    } finally {
      committing.current = false;
    }
  }, []);

  /** Replace the doc with `fn(doc)` as one undo step. */
  const change = useCallback(
    (fn: (doc: EmailDoc) => EmailDoc, opts: EditOptions = {}) => {
      flushInline();
      const h = histRef.current;
      if (!h.doc || locked) return;
      const next = fn(h.doc);
      if (next === h.doc) return;
      const now = Date.now();
      const merge = !!opts.coalesce && lastStep.current?.key === opts.coalesce && now - lastStep.current.at < COALESCE_MS;
      lastStep.current = { key: opts.coalesce ?? `edit-${now}`, at: now };
      commit({ doc: next, past: merge ? h.past : [...h.past, h.doc].slice(-HISTORY_LIMIT), future: [] });
      if (opts.select !== undefined) {
        setSelection(opts.select);
        setEditing(null);
      }
      touch();
    },
    [locked, touch, commit, flushInline],
  );

  /** Apply edit operations (the same vocabulary as the agent's edit_email). */
  const apply = useCallback(
    (ops: EmailOp[], opts: EditOptions = {}) => {
      let problems: string[] = [];
      change((d) => {
        const res = applyOps(d, ops);
        problems = res.problems;
        // Nothing applied: no undo step.
        return res.changed.length ? res.doc : d;
      }, opts);
      return problems;
    },
    [change],
  );

  const undo = useCallback(() => {
    flushInline();
    const h = histRef.current;
    if (!h.doc || locked || !h.past.length) return;
    commit({ doc: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.doc, ...h.future] });
    lastStep.current = null;
    setEditing(null);
    touch();
  }, [locked, touch, commit, flushInline]);

  const redo = useCallback(() => {
    flushInline();
    const h = histRef.current;
    if (!h.doc || locked || !h.future.length) return;
    commit({ doc: h.future[0], past: [...h.past, h.doc], future: h.future.slice(1) });
    lastStep.current = null;
    setEditing(null);
    touch();
  }, [locked, touch, commit, flushInline]);

  /** Save now and resolve once nothing is waiting (before an agent turn, a preview or a test send). */
  const flush = useCallback(async () => {
    inline.current?.commit();
    if (!dirty.current && !saving.current) return;
    const done = new Promise<void>((resolve) => waiters.current.push(resolve));
    if (!saving.current) void save();
    await Promise.race([done, new Promise((r) => setTimeout(r, 8000))]);
  }, [save]);

  /** An agent turn starts: the versions it writes become their own undo step. */
  const beginTurn = useCallback(() => {
    lastStep.current = null;
    setEditing(null);
  }, []);

  const select = useCallback((sel: Selection | null) => {
    setSelection(sel);
    setEditing((e) => (sel?.kind === "block" && sel.id === e ? e : null));
  }, []);

  const startEditing = useCallback(
    (blockId: string, command?: { command: string; value?: string }) => {
      if (locked) return;
      pendingCommand.current = command ?? null;
      setSelection({ kind: "block", id: blockId });
      setEditing(blockId);
    },
    [locked],
  );

  const stopEditing = useCallback(() => setEditing(null), []);

  /** The toolbar command waiting for the inline editor, once (it clears). */
  const takeCommand = useCallback(() => {
    const c = pendingCommand.current;
    pendingCommand.current = null;
    return c;
  }, []);

  /** The inline editor that opened (or closed, with the handle it registered). */
  const registerInline = useCallback((handle: InlineHandle | null, previous?: InlineHandle) => {
    if (handle) inline.current = handle;
    else if (!previous || inline.current === previous) inline.current = null;
  }, []);

  // A selection whose block went away (undo, the agent) is dropped.
  const doc = hist.doc;
  const [seenDoc, setSeenDoc] = useState<EmailDoc | null>(null);
  if (doc !== seenDoc) {
    setSeenDoc(doc);
    if (doc && selection && !selectionExists(doc, selection)) {
      setSelection(null);
      setEditing(null);
    }
    if (doc && hover && !selectionExists(doc, hover)) setHover(null);
  }

  return {
    doc,
    locked,
    selection,
    select,
    hover,
    setHover,
    editing: locked ? null : editing,
    startEditing,
    stopEditing,
    inline,
    takeCommand,
    registerInline,
    change,
    apply,
    undo,
    redo,
    canUndo: hist.past.length > 0 && !locked,
    canRedo: hist.future.length > 0 && !locked,
    saveState,
    save,
    flush,
    beginTurn,
    notice,
    clearNotice: () => setNotice(null),
    device,
    setDevice,
    tool,
    setTool,
  };
}

export type EmailEditor = ReturnType<typeof useEmailEditor>;
