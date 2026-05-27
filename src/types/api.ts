export type ApiErrorPayload<TCode extends string = string> = {
  error: {
    code: TCode;
    message: string;
    details?: string | null;
    retryAfterSeconds?: number;
  };
};

export type ApiResult<TSuccess, TCode extends string = string> =
  | TSuccess
  | ApiErrorPayload<TCode>;

export function isApiErrorPayload<TCode extends string = string>(
  value: unknown,
): value is ApiErrorPayload<TCode> {
  if (typeof value !== "object" || value === null) return false;
  const err = (value as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; message?: unknown; details?: unknown; retryAfterSeconds?: unknown };
  if (typeof e.code !== "string" || typeof e.message !== "string") return false;
  if (e.details !== undefined && e.details !== null && typeof e.details !== "string") return false;
  if (e.retryAfterSeconds !== undefined && typeof e.retryAfterSeconds !== "number") return false;
  return true;
}
