export const IMPORT_REQUEST_BODY_LIMIT_BYTES = 16 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes.`);
    this.name = "RequestBodyTooLargeError";
  }
}

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("Request body must be valid JSON.");
    this.name = "InvalidJsonBodyError";
  }
}

function declaredLengthExceedsLimit(request: Request, maxBytes: number): boolean {
  const value = request.headers.get("content-length");
  if (value === null || !/^\d+$/.test(value.trim())) return false;
  return Number(value) > maxBytes;
}

/**
 * Parse a JSON request without trusting `Content-Length`.
 * Missing or inaccurate length headers are allowed; streamed bytes remain capped.
 */
export async function readBoundedJson(
  request: Request,
  maxBytes = IMPORT_REQUEST_BODY_LIMIT_BYTES,
): Promise<unknown> {
  if (declaredLengthExceedsLimit(request, maxBytes)) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new InvalidJsonBodyError();
  }

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InvalidJsonBodyError();
  }
}
