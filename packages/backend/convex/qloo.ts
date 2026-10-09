import {
  createQlooClient,
  encodeQlooParams,
  QlooError,
  type QlooParams,
} from "@slice/qloo";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  type ActionCtx,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { WARM_LIST } from "./qlooWarmList";

// Every Qloo call goes through `cachedQlooGet` (Convex code) or POST /qloo (the
// agent), so the hackathon key is only spent on cache misses.
//
// Convex env: QLOO_API_KEY, and QLOO_PROXY_SECRET for the HTTP route.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Convex documents max out at 1 MiB; bigger responses are returned but not cached. */
const MAX_BODY_CHARS = 900_000;

export type CacheStatus = "hit" | "miss" | "stale";

const paramsValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean(), v.array(v.string())),
);

/**
 * Qloo GET through the cache. Returns the response as JSON text. When Qloo
 * rate limits or is down, an expired entry is served ("stale") instead of
 * failing.
 */
export async function cachedQlooGet(
  ctx: ActionCtx,
  path: string,
  params: QlooParams = {},
): Promise<{ body: string; status: CacheStatus }> {
  path = "/" + path.replace(/^\/+/, "");
  const request = `${path}?${encodeQlooParams(params)}`;
  const hash = await sha256(request);
  const now = Date.now();

  const cached = await ctx.runQuery(internal.qloo.lookup, { hash });
  if (cached && cached.expiresAt > now) {
    return { body: cached.body, status: "hit" };
  }

  let parsed: unknown;
  try {
    parsed = await qloo().get(path, params);
  } catch (err) {
    const transient =
      !(err instanceof QlooError) || err.status === 429 || err.status >= 500;
    if (cached && transient) return { body: cached.body, status: "stale" };
    throw err;
  }

  const body = JSON.stringify(parsed);
  if (body.length <= MAX_BODY_CHARS) {
    await ctx.runMutation(internal.qloo.save, {
      hash,
      request,
      body,
      fetchedAt: now,
      expiresAt: now + ttlFor(path, parsed),
    });
  } else {
    console.warn(
      `Qloo response too large to cache (${body.length} chars): ${request}`,
    );
  }
  return { body, status: "miss" };
}

/** How long a response stays fresh. */
function ttlFor(path: string, body: unknown): number {
  // Short, so a bad query isn't replayed all day.
  if (isEmpty(body)) return HOUR;
  // Entity lookups and IDs don't change.
  if (path === "/search" || path === "/entities") return 30 * DAY;
  if (path.startsWith("/v2/trending")) return 6 * HOUR;
  return DAY;
}

/** `{ results: [] }` from search, `{ results: { entities: [] } }` from insights. */
function isEmpty(body: unknown): boolean {
  const results = (body as { results?: unknown } | null)?.results;
  if (Array.isArray(results)) return results.length === 0;
  const entities = (results as { entities?: unknown } | null | undefined)
    ?.entities;
  return Array.isArray(entities) && entities.length === 0;
}

function qloo() {
  const apiKey = process.env.QLOO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "QLOO_API_KEY is not set (npx convex env set QLOO_API_KEY ...)",
    );
  }
  return createQlooClient({ apiKey });
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export const lookup = internalQuery({
  args: { hash: v.string() },
  returns: v.union(
    v.null(),
    v.object({ body: v.string(), expiresAt: v.number() }),
  ),
  handler: async (ctx, { hash }) => {
    const entry = await ctx.db
      .query("qlooCache")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    return entry && { body: entry.body, expiresAt: entry.expiresAt };
  },
});

export const save = internalMutation({
  args: {
    hash: v.string(),
    request: v.string(),
    body: v.string(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, entry) => {
    const existing = await ctx.db
      .query("qlooCache")
      .withIndex("by_hash", (q) => q.eq("hash", entry.hash))
      .unique();
    if (existing) await ctx.db.replace(existing._id, entry);
    else await ctx.db.insert("qlooCache", entry);
    return null;
  },
});

/**
 * Pre-caches `WARM_LIST` (or the given requests) before a demo. Fresh entries
 * are skipped, so it's cheap to re-run.
 *
 *   npx convex run qloo:warm
 */
export const warm = internalAction({
  args: {
    requests: v.optional(
      v.array(v.object({ path: v.string(), params: paramsValidator })),
    ),
  },
  returns: v.object({
    hit: v.number(),
    miss: v.number(),
    stale: v.number(),
    failed: v.array(v.string()),
  }),
  handler: async (ctx, { requests = WARM_LIST }) => {
    const counts = { hit: 0, miss: 0, stale: 0, failed: [] as string[] };
    for (const { path, params } of requests) {
      try {
        const { status } = await cachedQlooGet(ctx, path, params);
        counts[status] += 1;
        // Pace live calls so warming doesn't trip the rate limit itself.
        if (status !== "hit") await new Promise((r) => setTimeout(r, 250));
      } catch (err) {
        counts.failed.push(
          `${path}?${encodeQlooParams(params)}: ${String(err)}`,
        );
      }
    }
    return counts;
  },
});

/**
 * POST /qloo with `{ path, params }` and `Authorization: Bearer
 * <QLOO_PROXY_SECRET>`. Responds with Qloo's JSON and an `X-Slice-Cache`
 * header (hit | miss | stale). Qloo errors are passed through with their
 * status.
 */
export const proxy = httpAction(async (ctx, req) => {
  const secret = process.env.QLOO_PROXY_SECRET;
  if (!secret) return json({ error: "QLOO_PROXY_SECRET is not set" }, 500);
  if (req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const input = (await req.json().catch(() => null)) as {
    path?: unknown;
    params?: unknown;
  } | null;
  const params = input?.params ?? {};
  if (typeof input?.path !== "string" || !isQlooParams(params)) {
    return json({ error: "expected { path: string, params?: object }" }, 400);
  }

  try {
    const { body, status } = await cachedQlooGet(ctx, input.path, params);
    return new Response(body, {
      headers: { "Content-Type": "application/json", "X-Slice-Cache": status },
    });
  } catch (err) {
    if (err instanceof QlooError) {
      return json(err.body ?? { error: err.message }, err.status);
    }
    throw err;
  }
});

function isQlooParams(value: unknown): value is QlooParams {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (p) =>
      ["string", "number", "boolean", "undefined"].includes(typeof p) ||
      (Array.isArray(p) && p.every((s) => typeof s === "string")),
  );
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
