import type { NormalizedTrack } from "@/types/normalized-track";

export type YoutubePlaylistImportErrorCode =
  | "INVALID_URL"
  | "VIDEO_LINK_NOT_PLAYLIST"
  | "BODY_TOO_LARGE"
  | "BLOCKED_ORIGIN"
  | "MISSING_YOUTUBE_API_KEY"
  | "YOUTUBE_API_403"
  | "YOUTUBE_API_404"
  | "YOUTUBE_API_QUOTA"
  | "YOUTUBE_API_NETWORK_ERROR"
  | "YOUTUBE_API_TIMEOUT"
  | "EMPTY_PLAYLIST"
  | "UNKNOWN_SERVER_ERROR";

export type YoutubeImportLimit = 100 | 200 | 300;

export type YoutubeApiErrorPayload = {
  /** Optional discriminator. Older clients ignore it; new clients can narrow on `ok`. */
  ok?: false;
  error: {
    code: YoutubePlaylistImportErrorCode;
    message: string;
    details: string | null;
    /** Present when the upstream returned `Retry-After`. Seconds. */
    retryAfterSeconds?: number;
  };
};

export type YoutubePlaylistImportResponse =
  | {
      ok: true;
      playlist: {
        id: string;
        title: string;
        channelTitle: string | null;
        source: "youtube";
        externalUrl: string;
        trackCount: number;
        truncated: boolean;
        importLimit: YoutubeImportLimit;
        /** Raw playlist slots read from YouTube (capped by importLimit pagination). */
        fetchedItemSlots: number;
        /** Rows skipped — no usable video ID (often private/deleted placeholders). */
        skippedMissingVideoId: number;
        /** YouTube-declared playlist size when available — may exceed playable imports. */
        youtubeReportedTotalItems: number | null;
      };
      tracks: NormalizedTrack[];
    }
  | YoutubeApiErrorPayload;

export function isYoutubeApiErrorPayload(
  value: unknown,
): value is YoutubeApiErrorPayload {
  if (typeof value !== "object" || value === null) return false;
  const err = (value as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  if (typeof e.code !== "string" || typeof e.message !== "string") return false;
  if (e.details !== undefined && e.details !== null && typeof e.details !== "string") {
    return false;
  }
  return true;
}
