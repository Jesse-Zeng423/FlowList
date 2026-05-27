import type { NormalizedTrack } from "@/types/normalized-track";
import { isApiErrorPayload, type ApiErrorPayload, type ApiResult } from "@/types/api";

export type YoutubePlaylistImportErrorCode =
  | "INVALID_URL"
  | "MISSING_YOUTUBE_API_KEY"
  | "YOUTUBE_API_403"
  | "YOUTUBE_API_404"
  | "YOUTUBE_API_QUOTA"
  | "YOUTUBE_API_NETWORK_ERROR"
  | "EMPTY_PLAYLIST"
  | "CROSS_ORIGIN_FORBIDDEN"
  | "UNKNOWN_SERVER_ERROR";

export type YoutubeImportLimit = 100 | 200 | 300;

export type YoutubeApiErrorPayload = ApiErrorPayload<YoutubePlaylistImportErrorCode>;

type YoutubePlaylistImportSuccess = {
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
};

export type YoutubePlaylistImportResponse = ApiResult<
  YoutubePlaylistImportSuccess,
  YoutubePlaylistImportErrorCode
>;

export function isYoutubeApiErrorPayload(
  value: unknown,
): value is YoutubeApiErrorPayload {
  return isApiErrorPayload<YoutubePlaylistImportErrorCode>(value);
}
