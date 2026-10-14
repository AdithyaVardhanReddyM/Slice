"use client";

import { useAction } from "convex/react";
import { useCallback } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { postJson } from "@/lib/pages/stream";

/**
 * Compile, then ask the agent for a brief. A failed compile is recorded on the
 * audience itself (status "failed" with the reason, shown on its card), so it
 * is not rethrown here; brief errors are swallowed too. A customer list passes
 * its people as `briefFor`: they get the briefs, the list itself none.
 */
export function useCompileAudience() {
  const compile = useAction(api.pagesAudiences.compile);
  return useCallback(
    async (id: Id<"pagesAudiences">, briefFor: Id<"pagesAudiences">[] = [id]) => {
      try {
        await compile({ id });
      } catch {
        return;
      }
      for (const b of briefFor) postJson("/api/pages/audience-brief", { audience_id: b }).catch(() => undefined);
    },
    [compile],
  );
}
