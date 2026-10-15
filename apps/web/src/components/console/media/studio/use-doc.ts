"use client";

// The studio's working copy of one creative. Edits apply locally at once and
// save to Convex shortly after (saveDoc merges shots that landed meanwhile);
// once saved, the live server doc takes over again. Undo and redo keep a
// stack per creative for the session.

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import type { MediaDoc } from "@slice/backend/convex/mediaTypes";

interface Local {
  id: string;
  doc: MediaDoc;
  seq: number;
}

const SAVE_AFTER_MS = 650;
const MAX_UNDO = 60;

export function useCreativeDoc(creative: { _id: Id<"mediaCreatives">; doc: unknown } | null) {
  const saveDoc = useMutation(api.media.saveDoc);
  const [local, setLocal] = useState<Local | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localRef = useRef<Local | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const stacks = useRef(new Map<string, { undo: MediaDoc[]; redo: MediaDoc[] }>());
  const [counts, setCounts] = useState<Record<string, { undo: number; redo: number }>>({});
  const sync = (id: string, s: { undo: MediaDoc[]; redo: MediaDoc[] }) => setCounts((c) => ({ ...c, [id]: { undo: s.undo.length, redo: s.redo.length } }));

  const server = (creative?.doc as MediaDoc | undefined) ?? null;
  const doc = local && creative && local.id === creative._id ? local.doc : server;
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) await inflight.current;
    const pending = localRef.current;
    if (!pending) return;
    setSaving(true);
    const run = (async () => {
      try {
        await saveDoc({ id: pending.id as Id<"mediaCreatives">, doc: pending.doc });
        setError(null);
        // Convex has applied the new doc by now; show the server copy unless more edits came in.
        if (localRef.current?.seq === pending.seq) {
          localRef.current = null;
          setLocal(null);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
        inflight.current = null;
      }
    })();
    inflight.current = run;
    await run;
  }, [saveDoc]);

  const commit = useCallback(
    (id: string, next: MediaDoc) => {
      seq.current += 1;
      const l = { id, doc: next, seq: seq.current };
      localRef.current = l;
      setLocal(l);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
    },
    [flush],
  );

  const stackOf = (id: string) => {
    let s = stacks.current.get(id);
    if (!s) stacks.current.set(id, (s = { undo: [], redo: [] }));
    return s;
  };

  /** Remember the current doc so the next edits undo as one step (call on drag start). */
  const checkpoint = useCallback(() => {
    const cur = docRef.current;
    if (!creative || !cur) return;
    const s = stackOf(creative._id);
    s.undo.push(cur);
    if (s.undo.length > MAX_UNDO) s.undo.shift();
    s.redo = [];
    sync(creative._id, s);
  }, [creative]);

  /** Apply an edit. `history: false` skips the undo entry (moves after a checkpoint). */
  const update = useCallback(
    (fn: (d: MediaDoc) => MediaDoc, opts?: { history?: boolean }) => {
      const cur = docRef.current;
      if (!creative || !cur) return;
      const next = fn(cur);
      if (next === cur) return;
      if (opts?.history !== false) {
        const s = stackOf(creative._id);
        s.undo.push(cur);
        if (s.undo.length > MAX_UNDO) s.undo.shift();
        s.redo = [];
        sync(creative._id, s);
      }
      docRef.current = next;
      commit(creative._id, next);
    },
    [creative, commit],
  );

  const undo = useCallback(() => {
    const cur = docRef.current;
    if (!creative || !cur) return;
    const s = stackOf(creative._id);
    const prev = s.undo.pop();
    if (!prev) return;
    s.redo.push(cur);
    sync(creative._id, s);
    docRef.current = prev;
    commit(creative._id, prev);
  }, [creative, commit]);

  const redo = useCallback(() => {
    const cur = docRef.current;
    if (!creative || !cur) return;
    const s = stackOf(creative._id);
    const next = s.redo.pop();
    if (!next) return;
    s.undo.push(cur);
    sync(creative._id, s);
    docRef.current = next;
    commit(creative._id, next);
  }, [creative, commit]);

  // Save before leaving the page or switching creatives.
  useEffect(() => {
    const onLeave = () => {
      if (localRef.current) void flush();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [flush]);
  const creativeId = creative?._id;
  useEffect(() => {
    return () => {
      if (localRef.current && localRef.current.id === creativeId) void flush();
    };
  }, [creativeId, flush]);

  const n = creative ? counts[creative._id] : undefined;
  return {
    doc,
    dirty: !!local,
    saving,
    error,
    update,
    checkpoint,
    undo,
    redo,
    canUndo: !!n?.undo,
    canRedo: !!n?.redo,
    flush,
  };
}

export type CreativeDoc = ReturnType<typeof useCreativeDoc>;
