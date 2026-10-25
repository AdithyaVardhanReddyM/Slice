"use client";

import { useEffect } from "react";

/** Tells the console window that opened this popup how the connect went, then closes it. */
export function Notify({ platform, ok }: { platform: string | null; ok: boolean }) {
  useEffect(() => {
    window.opener?.postMessage({ type: "slice:store-connected", platform, ok }, window.location.origin);
    const t = setTimeout(() => window.close(), ok ? 600 : 2500);
    return () => clearTimeout(t);
  }, [platform, ok]);
  return null;
}
