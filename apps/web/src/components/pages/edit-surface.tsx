"use client";

import { useEffect } from "react";

// The visual editor's canvas page. It brings the renderer's CSS (the /p
// layout) and a mount point; the console's editor (useVisualEditor) builds the
// page into #pg-edit-mount and edits that DOM in place. React renders the
// mount point empty and never touches what goes inside it.

export const EDIT_MOUNT_ID = "pg-edit-mount";

declare global {
  interface Window {
    pgEditReady?: boolean;
  }
}

export function EditSurface() {
  useEffect(() => {
    window.pgEditReady = true;
    window.parent.postMessage({ type: "pg:edit-ready" }, window.location.origin);
  }, []);
  return <div id={EDIT_MOUNT_ID} />;
}
