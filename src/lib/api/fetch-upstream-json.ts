/**
 * Upstream fetch with timeout, bounded retry, and JSON parsing that surfaces
 * the raw text on parse failure (so callers can include a snippet in errors).
 *
 * Deliberately *not* an abstraction over Google vs Spotify error shapes —
 * status mapping stays in the route handler. This helper handles only the
 * transport-level concerns shared by both.
 */

export type UpstreamResponse =
  | {
      ok: true;
      kind: "response";
      status: number;
      headers: Headers;
      rawText: string;
      json: unknown;
      parseError: string | null;
    }
  | { ok: false; kind: "network"; clientDetails: string }
  | { ok: false; kind: "timeout"; clientDetails: string };

export type FetchUpstreamOptions = {
  /** Per-call timeout. Default 8000ms. */
  perCallMs?: number;
  /** Max retry count for 5xx and 429 (does not include the original call). Default 1. */
  retries?: number;
  /** Base back-off in ms; jitter is added. Default 200. */
  backoffMs?: number;
  /** Cap for `Retry-After`-driven waits (ms). Default 2000. */
  retryAfterCapMs?: number;
};

const DEFAULT_PER_CALL_MS = 8_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_BACKOFF_MS = 200;
const DEFAULT_RETRY_AFTER_CAP_MS = 2_000;

function jitteredBackoff(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * baseMs);
}

function readRetryAfterMs(headers: Headers, capMs: number): number {
  const ra = headers.get("retry-after");
  if (!ra) return 0;
  const seconds = Number.parseInt(ra, 10);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds * 1000, capMs);
}

function shouldRetry(status: number): boolean {
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

async function singleFetch(
  url: string,
  init: RequestInit,
  perCallMs: number,
): Promise<UpstreamResponse> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(perCallMs),
      cache: "no-store",
    });
    let rawText = "";
    try {
      rawText = await res.text();
    } catch {
      rawText = "";
    }
    let json: unknown = null;
    let parseError: string | null = null;
    if (rawText) {
      try {
        json = JSON.parse(rawText);
      } catch (e) {
        parseError = e instanceof Error ? e.message : "JSON parse error";
        json = null;
      }
    }
    return {
      ok: true,
      kind: "response",
      status: res.status,
      headers: res.headers,
      rawText,
      json,
      parseError,
    };
  } catch (e) {
    const isTimeout =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return isTimeout
      ? { ok: false, kind: "timeout", clientDetails: message }
      : { ok: false, kind: "network", clientDetails: message };
  }
}

export async function fetchUpstream(
  url: string,
  init: RequestInit = {},
  opts: FetchUpstreamOptions = {},
): Promise<UpstreamResponse> {
  const perCallMs = opts.perCallMs ?? DEFAULT_PER_CALL_MS;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const retryAfterCapMs = opts.retryAfterCapMs ?? DEFAULT_RETRY_AFTER_CAP_MS;

  let attempt = 0;
  let last: UpstreamResponse = await singleFetch(url, init, perCallMs);

  while (attempt < retries) {
    if (last.ok && last.kind === "response") {
      if (!shouldRetry(last.status)) return last;
      const ra = readRetryAfterMs(last.headers, retryAfterCapMs);
      const wait = ra > 0 ? ra : jitteredBackoff(backoffMs * (attempt + 1));
      await new Promise((r) => setTimeout(r, wait));
    } else if (last.kind === "network") {
      // One quick retry on transport failure, no Retry-After to honor.
      await new Promise((r) => setTimeout(r, jitteredBackoff(backoffMs)));
    } else {
      // Timeouts: a retry would just wait again — fail fast.
      return last;
    }
    attempt += 1;
    last = await singleFetch(url, init, perCallMs);
  }

  return last;
}
