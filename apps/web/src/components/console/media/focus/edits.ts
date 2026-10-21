"use client";

// Layer edits shared by the bar over the page, the keyboard and the layers panel.

import { newId, type Layer } from "@slice/backend/convex/mediaTypes";
import { useStudio } from "./context";

export function useLayerEdits() {
  const { editor, select } = useStudio();
  const patch = (id: string, p: Partial<Layer>, opts?: { history?: boolean }) => editor.update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...p } as Layer) : l)) }), opts);
  const remove = (ids: string[]) => {
    editor.update((d) => ({ ...d, layers: d.layers.filter((l) => !ids.includes(l.id)) }));
    select({ kind: "none" });
  };
  const duplicate = (ids: string[]) => {
    const copies: string[] = [];
    editor.update((d) => {
      const layers = [...d.layers];
      for (const id of ids) {
        const i = layers.findIndex((l) => l.id === id);
        if (i < 0) continue;
        const copy = { ...layers[i], id: newId("l"), x: layers[i].x + 24, y: layers[i].y + 24, locked: undefined } as Layer;
        copies.push(copy.id);
        layers.splice(i + 1, 0, copy);
      }
      return { ...d, layers };
    });
    select({ kind: "layers", ids: copies });
  };
  /** +1 brings forward, -1 sends back, "top" / "bottom" all the way. */
  const order = (id: string, dir: 1 | -1 | "top" | "bottom") =>
    editor.update((d) => {
      const layers = [...d.layers];
      const i = layers.findIndex((l) => l.id === id);
      if (i < 0) return d;
      const [l] = layers.splice(i, 1);
      const j = dir === "top" ? layers.length : dir === "bottom" ? 0 : Math.max(0, Math.min(layers.length, i + dir));
      layers.splice(j, 0, l);
      return { ...d, layers };
    });
  return { patch, remove, duplicate, order, checkpoint: editor.checkpoint };
}
