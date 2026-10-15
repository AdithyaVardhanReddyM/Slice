// Edits more than one control offers (the toolbar, the keyboard, the layers).

import { cloneWithNewIds, findBlock, findSection } from "@slice/backend/convex/emailDoc";
import type { EmailDoc } from "@slice/backend/convex/emailTypes";
import type { Selection } from "./model";
import type { EmailEditor } from "./use-email-editor";

/** Duplicate the selected block or section right after itself, and select the copy. */
export function duplicate(editor: EmailEditor, doc: EmailDoc, sel: Selection) {
  if (sel.kind === "block") {
    const f = findBlock(doc, sel.id);
    if (!f) return;
    const copy = cloneWithNewIds(f.block);
    editor.apply([{ op: "insert_block", columnId: f.column.id, index: f.index + 1, block: copy }], { select: { kind: "block", id: copy.id } });
  } else if (sel.kind === "section") {
    const f = findSection(doc, sel.id);
    if (!f) return;
    const copy = cloneWithNewIds(f.section);
    editor.apply([{ op: "insert_section", after: f.section.id, section: copy }], { select: { kind: "section", id: copy.id } });
  }
}

/** Remove the selected block or section. */
export function remove(editor: EmailEditor, sel: Selection) {
  if (sel.kind === "block") editor.apply([{ op: "remove_block", id: sel.id }], { select: null });
  else if (sel.kind === "section") editor.apply([{ op: "remove_section", id: sel.id }], { select: null });
}
