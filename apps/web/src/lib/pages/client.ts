import { ConvexError } from "convex/values";

/** A user-facing message from a Convex mutation or agent call. */
export function errorText(e: unknown): string {
  if (e instanceof ConvexError && typeof e.data === "string") return e.data;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong.";
}

/**
 * Kick off an agent job (brand extraction or page generation). The job
 * reports progress through Convex, so the caller only needs to know whether
 * it started; the request itself stays open until the job ends.
 */
export function startAgentJob(
  path: "/api/pages/brand" | "/api/pages/generate",
  body: { brandId: string } | { pageId: string },
  onError: (message: string) => void,
) {
  fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      if (res.ok) return;
      const data = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
      onError(data?.error ?? data?.detail ?? `The agent couldn't start (${res.status}).`);
    })
    .catch(() => onError("Couldn't reach the agent."));
}
