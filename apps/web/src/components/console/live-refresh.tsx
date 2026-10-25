"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";

/**
 * Re-renders the server-built console page when the widget's data changes: a
 * shopper writes, opens a pick, adds one to their cart, or lands on the site.
 */
export function LiveRefresh({ storeKey }: { storeKey: string }) {
  const version = useQuery(api.conciergeConsole.version, { storeKey });
  const router = useRouter();
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (version === undefined) return;
    if (seen.current !== undefined && seen.current !== version) router.refresh();
    seen.current = version;
  }, [version, router]);
  return null;
}
