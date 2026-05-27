export type ImportApiParseResult<T> =
  | { ok: true; data: T; status: number }
  | {
      ok: false;
      reason: "empty" | "invalid_json";
      status: number;
      rawSnippet: string;
      truncated: boolean;
    };

/**
 * Provider routes can fail behind hosts or proxies that return HTML or an empty body.
 * Keep those failures out of route-specific UI handlers and expose safe diagnostic context.
 */
export async function parseImportApiResponse<T>(
  response: Pick<Response, "status" | "text">,
): Promise<ImportApiParseResult<T>> {
  const text = await response.text();
  if (!text) {
    return { ok: false, reason: "empty", status: response.status, rawSnippet: "", truncated: false };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T, status: response.status };
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
      status: response.status,
      rawSnippet: text.slice(0, 160),
      truncated: text.length > 160,
    };
  }
}
