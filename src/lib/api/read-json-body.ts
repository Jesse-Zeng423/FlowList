/**
 * Bound the JSON body of a route-handler request before parsing.
 *
 * Hostile clients can advertise a small `Content-Length` and stream a much
 * larger body via `Transfer-Encoding: chunked`, so we check the header AND
 * the read size. Both bound to `capBytes`.
 */

export type BoundedJsonResult<T = unknown> =
  | { ok: true; body: T }
  | { ok: false; code: "INVALID_JSON" | "BODY_TOO_LARGE" | "MISSING_LENGTH"; details: string };

export async function readBoundedJson<T = unknown>(
  req: Request,
  capBytes: number = 8 * 1024,
): Promise<BoundedJsonResult<T>> {
  const lenHeader = req.headers.get("content-length");
  if (lenHeader == null) {
    return {
      ok: false,
      code: "MISSING_LENGTH",
      details: "Request must include a Content-Length header.",
    };
  }
  const len = Number.parseInt(lenHeader, 10);
  if (!Number.isFinite(len) || len < 0) {
    return {
      ok: false,
      code: "MISSING_LENGTH",
      details: "Content-Length is not a valid non-negative integer.",
    };
  }
  if (len > capBytes) {
    return {
      ok: false,
      code: "BODY_TOO_LARGE",
      details: `Body exceeds ${capBytes}-byte cap (Content-Length=${len}).`,
    };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch (e) {
    return {
      ok: false,
      code: "INVALID_JSON",
      details: e instanceof Error ? e.message : "Could not read body.",
    };
  }
  if (raw.length > capBytes) {
    return {
      ok: false,
      code: "BODY_TOO_LARGE",
      details: `Body length ${raw.length} exceeds ${capBytes}-byte cap.`,
    };
  }

  try {
    return { ok: true, body: JSON.parse(raw) as T };
  } catch (e) {
    return {
      ok: false,
      code: "INVALID_JSON",
      details: e instanceof Error ? e.message : "Body was not valid JSON.",
    };
  }
}
