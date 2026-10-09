export const QLOO_HACKATHON_URL = "https://hackathon.api.qloo.com";

type ParamValue = string | number | boolean | readonly string[] | undefined;
export type QlooParams = Record<string, ParamValue>;

export interface QlooClientOptions {
  apiKey: string;
  /** Hackathon keys only work against the hackathon host. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class QlooError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

/**
 * Params as a query string with keys sorted, so the same request always
 * encodes the same way. The Convex cache uses this as part of its key.
 */
export function encodeQlooParams(params: QlooParams = {}): string {
  const search = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === undefined) continue;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return search.toString();
}

/**
 * Minimal transport for the Qloo API. Endpoint helpers (search, insights,
 * tags, compare, trending) get built on top of `get` as features need them.
 *
 * Qloo silently ignores invalid parameters, so an empty result is not proof
 * that a query was well-formed.
 */
export function createQlooClient({
  apiKey,
  baseUrl = QLOO_HACKATHON_URL,
  fetch: fetchImpl = globalThis.fetch,
}: QlooClientOptions) {
  async function get<T = unknown>(
    path: string,
    params: QlooParams = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    url.search = encodeQlooParams(params);

    const res = await fetchImpl(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      throw new QlooError(
        `Qloo ${res.status} on ${url.pathname}`,
        res.status,
        body,
      );
    }
    return body as T;
  }

  return { get };
}

export type QlooClient = ReturnType<typeof createQlooClient>;
