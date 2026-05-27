import { NextResponse } from "next/server";
import { fetchUpstream, type UpstreamResponse } from "@/lib/api/fetch-upstream-json";
import { readBoundedJson } from "@/lib/api/read-json-body";
import {
  safeExternalUrl,
  YOUTUBE_IMAGE_HOSTS,
} from "@/lib/api/safe-external-url";
import { sanitizeLogFields, truncForLog } from "@/lib/api/log";
import { classifyYouTubePlaylistInput } from "@/lib/youtube-playlist-classify";
import { cleanYouTubeTrackTitle } from "@/lib/youtube-title-clean";
import type { NormalizedTrack } from "@/types/normalized-track";
import type {
  YoutubeApiErrorPayload,
  YoutubeImportLimit,
  YoutubePlaylistImportErrorCode,
  YoutubePlaylistImportResponse,
} from "@/types/youtube-api";

export const runtime = "nodejs";

const YT = "https://www.googleapis.com/youtube/v3";
const DEFAULT_IMPORT_LIMIT: YoutubeImportLimit = 200;
const ALLOWED_IMPORT_LIMITS = new Set<number>([100, 200, 300]);
const REQUEST_BODY_CAP_BYTES = 8 * 1024;

const NO_STORE: ResponseInit = {
  headers: { "Cache-Control": "no-store" },
};

const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

const GENERIC_IMPORT_FAILURE_DETAILS =
  "Unexpected server error while importing the playlist.";

function clientNetworkFailureDetails(detailedTechnical: string): string {
  return isProd
    ? "Could not reach the YouTube Data API right now. Check your connection or try again later."
    : detailedTechnical;
}

/** Never send stack traces to the browser; prod returns a fixed banner string. */
function clientCatchAllFailureDetails(thrown: unknown): string {
  if (isProd) return GENERIC_IMPORT_FAILURE_DETAILS;
  const message =
    thrown instanceof Error ? thrown.message : typeof thrown === "string" ? thrown : String(thrown);
  return truncForLog(message, 380);
}

function devLog(message: string, fields?: Record<string, unknown>) {
  if (!isDev) return;
  if (fields) {
    console.debug("[flowlist:youtube-import]", message, sanitizeLogFields(fields));
  } else {
    console.debug("[flowlist:youtube-import]", message);
  }
}

/** Always log fetch failures (prod + dev) so hosted/server logs help debug. */
function logYoutubeFetchFailure(fields: Record<string, unknown>) {
  console.warn("[flowlist:youtube-import] fetch failed", sanitizeLogFields(fields));
}

type GoogleApiErrorBody = {
  error?: {
    message?: string;
    code?: number;
    errors?: Array<{ domain?: string; reason?: string; message?: string }>;
  };
};

function readGoogleError(json: unknown): { message: string | null; reason: string | null } {
  if (typeof json !== "object" || json === null) return { message: null, reason: null };
  const j = json as GoogleApiErrorBody;
  const message = j.error?.message ?? null;
  const reason = j.error?.errors?.[0]?.reason ?? null;
  return { message, reason };
}

type ErrorJsonOptions = {
  retryAfterSeconds?: number;
};

function errorJson(
  code: YoutubePlaylistImportErrorCode,
  message: string,
  details: string | null,
  status: number,
  options: ErrorJsonOptions = {},
): NextResponse<YoutubeApiErrorPayload> {
  const payload: YoutubeApiErrorPayload = {
    ok: false,
    error: { code, message, details },
  };
  if (typeof options.retryAfterSeconds === "number") {
    payload.error.retryAfterSeconds = options.retryAfterSeconds;
  }
  return NextResponse.json(payload, { status, ...NO_STORE });
}

function readImportLimit(body: unknown): YoutubeImportLimit {
  const raw = (body as { importLimit?: unknown }).importLimit;
  if (typeof raw === "number" && ALLOWED_IMPORT_LIMITS.has(raw)) {
    return raw as YoutubeImportLimit;
  }
  if (raw !== undefined) {
    devLog("Invalid importLimit; falling back to default", {
      importLimit: raw,
      defaultImportLimit: DEFAULT_IMPORT_LIMIT,
      allowed: [100, 200, 300],
    });
  }
  return DEFAULT_IMPORT_LIMIT;
}

type YtThumbnail = { url?: string; width?: number; height?: number };
type YtThumbnails = { default?: YtThumbnail; medium?: YtThumbnail; high?: YtThumbnail };

type PlaylistItemSnippet = {
  title?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnails?: YtThumbnails;
  resourceId?: { videoId?: string; kind?: string };
};

type PlaylistItem = {
  id?: string;
  snippet?: PlaylistItemSnippet;
  contentDetails?: { videoId?: string };
};

type PlaylistItemsResponse = {
  items?: PlaylistItem[];
  nextPageToken?: string;
  pageInfo?: { totalResults?: number };
};

type PlaylistSnippetResponse = {
  items?: Array<{
    id?: string;
    snippet?: { title?: string; channelTitle?: string };
    contentDetails?: { itemCount?: number };
  }>;
};

function pickThumb(t: YtThumbnails | undefined): string | null {
  if (!t) return null;
  const raw = t.medium?.url ?? t.high?.url ?? t.default?.url ?? null;
  return safeExternalUrl(raw, YOUTUBE_IMAGE_HOSTS);
}

type YtFetchOperation = "playlists.list" | "playlistItems.list";

function networkErrorUserMessage(operation: YtFetchOperation): string {
  const base =
    operation === "playlists.list"
      ? "Could not reach the YouTube Data API to load the playlist."
      : "Could not reach the YouTube Data API while listing playlist items.";
  return `${base} This may be caused by local network, VPN, or proxy issues if this server cannot reach www.googleapis.com.`;
}

async function callYouTube(
  pathAndQuery: string,
  apiKey: string,
  ctx: { playlistId: string; operation: YtFetchOperation },
): Promise<UpstreamResponse> {
  const url = `${YT}${pathAndQuery}`;
  const result = await fetchUpstream(
    url,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        Accept: "application/json",
      },
    },
    { perCallMs: 8_000, retries: 1 },
  );

  if (result.ok) {
    const { message: googleMessage, reason: googleReason } = readGoogleError(result.json);
    devLog("YouTube API response", {
      playlistId: ctx.playlistId,
      operation: ctx.operation,
      url,
      status: result.status,
      googleMessage: googleMessage ?? "",
      googleReason: googleReason ?? "",
      parseError: result.parseError ?? "",
    });
  } else {
    logYoutubeFetchFailure({
      playlistId: ctx.playlistId,
      operation: ctx.operation,
      url,
      kind: result.kind,
      details: result.clientDetails,
    });
  }

  return result;
}

function mapGoogleFailure(
  status: number,
  json: unknown,
  headers: Headers,
  context: string,
): NextResponse<YoutubeApiErrorPayload> {
  const { message: googleMessage, reason: googleReason } = readGoogleError(json);
  const details = googleMessage ?? `HTTP ${status} (${context})`;

  const retryAfterRaw = headers.get("retry-after");
  const retryAfterSeconds =
    retryAfterRaw && Number.isFinite(Number.parseInt(retryAfterRaw, 10))
      ? Math.max(0, Number.parseInt(retryAfterRaw, 10))
      : undefined;

  if (status === 403) {
    const quotaReasons = new Set([
      "quotaExceeded",
      "dailyLimitExceeded",
      "rateLimitExceeded",
      "userRateLimitExceeded",
    ]);
    if (googleReason && quotaReasons.has(googleReason)) {
      return errorJson(
        "YOUTUBE_API_QUOTA",
        "YouTube API quota or rate limit was exceeded. Try again later, use manual paste, or the demo playlist.",
        details,
        429,
        { retryAfterSeconds },
      );
    }
    return errorJson(
      "YOUTUBE_API_403",
      "YouTube rejected this request (403). Check that the API key is valid and APIs are enabled.",
      details,
      403,
    );
  }

  if (status === 404) {
    return errorJson(
      "YOUTUBE_API_404",
      "YouTube returned 404 for this request. The playlist may be missing, private, or the ID may be wrong.",
      details,
      404,
    );
  }

  if (status === 429) {
    return errorJson(
      "YOUTUBE_API_QUOTA",
      "YouTube API rate limit was exceeded. Try again shortly.",
      details,
      429,
      { retryAfterSeconds },
    );
  }

  const httpStatus =
    Number.isFinite(status) && status >= 400 && status < 600 ? status : 502;
  return errorJson(
    "UNKNOWN_SERVER_ERROR",
    `Unexpected YouTube API response (${status}).`,
    details,
    httpStatus,
  );
}

function classificationToError(
  c: ReturnType<typeof classifyYouTubePlaylistInput>,
): NextResponse<YoutubeApiErrorPayload> | null {
  switch (c.kind) {
    case "ok":
      return null;
    case "empty":
      return errorJson(
        "INVALID_URL",
        "URL is empty after trimming.",
        "Paste a full YouTube or YouTube Music playlist link.",
        400,
      );
    case "video_link":
      return errorJson(
        "VIDEO_LINK_NOT_PLAYLIST",
        "That looks like a single-video link, not a playlist URL.",
        c.host === "youtu.be"
          ? "youtu.be short links point at a single video. Open the playlist on YouTube and copy that link instead."
          : "/watch URLs without a list= parameter point at a single video. Copy the playlist URL (containing list=…) instead.",
        400,
      );
    case "non_youtube":
      return errorJson(
        "INVALID_URL",
        "That URL is not a YouTube or YouTube Music link.",
        `Hostname ${c.host} is not allowed.`,
        400,
      );
    case "missing_list":
      return errorJson(
        "INVALID_URL",
        "Could not read a playlist id from list=…. Paste a full YouTube or YouTube Music playlist URL.",
        "After trimming and removing trailing backslashes, no valid list= parameter was found.",
        400,
      );
    case "invalid_id":
      return errorJson(
        "INVALID_URL",
        "Playlist id contains invalid characters.",
        "Expected a list= value matching [a-zA-Z0-9_-]+.",
        400,
      );
  }
}

export async function POST(req: Request): Promise<NextResponse<YoutubePlaylistImportResponse>> {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
      return errorJson(
        "MISSING_YOUTUBE_API_KEY",
        "YOUTUBE_API_KEY is not set on the server.",
        "Add YOUTUBE_API_KEY to .env.local and restart the dev server.",
        503,
      );
    }

    const parsed = await readBoundedJson<{
      url?: unknown;
      importLimit?: unknown;
    }>(req, REQUEST_BODY_CAP_BYTES);
    if (!parsed.ok) {
      if (parsed.code === "BODY_TOO_LARGE") {
        return errorJson(
          "BODY_TOO_LARGE",
          "Request body is too large.",
          parsed.details,
          413,
        );
      }
      return errorJson(
        "INVALID_URL",
        "Request body must be valid JSON with a url field.",
        parsed.details,
        400,
      );
    }
    const body = parsed.body;

    const urlField = body.url;
    if (typeof urlField !== "string") {
      return errorJson(
        "INVALID_URL",
        "Missing or invalid url in request body.",
        "Expected a JSON object with a string field: url.",
        400,
      );
    }
    const importLimit = readImportLimit(body);

    const classification = classifyYouTubePlaylistInput(urlField);
    devLog("Classified URL", {
      kind: classification.kind,
      inputLength: urlField.length,
      importLimit,
    });
    const classificationError = classificationToError(classification);
    if (classificationError) return classificationError;
    if (classification.kind !== "ok") {
      // Should be unreachable due to the early return above, but the type narrow is helpful.
      return errorJson("INVALID_URL", "Unrecognized playlist input.", null, 400);
    }
    const playlistId = classification.id;

    const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

    const playlistsPath = `/playlists?${q({ part: "snippet,contentDetails", id: playlistId })}`;
    const plResult = await callYouTube(playlistsPath, key, {
      playlistId,
      operation: "playlists.list",
    });
    if (!plResult.ok) {
      const code: YoutubePlaylistImportErrorCode =
        plResult.kind === "timeout" ? "YOUTUBE_API_TIMEOUT" : "YOUTUBE_API_NETWORK_ERROR";
      return errorJson(
        code,
        networkErrorUserMessage("playlists.list"),
        clientNetworkFailureDetails(plResult.clientDetails),
        plResult.kind === "timeout" ? 504 : 502,
      );
    }

    if (plResult.status < 200 || plResult.status >= 300) {
      return mapGoogleFailure(plResult.status, plResult.json, plResult.headers, "playlists.list");
    }

    const plData = plResult.json as PlaylistSnippetResponse;
    const plItem = plData.items?.[0];
    if (!plItem?.id) {
      return errorJson(
        "YOUTUBE_API_404",
        "No playlist was returned for this id.",
        "The playlist may be private, deleted, or the list id may be invalid.",
        404,
      );
    }

    const playlistTitle = plItem.snippet?.title?.trim() || "Imported YouTube Playlist";
    const playlistChannel = plItem.snippet?.channelTitle?.trim() ?? null;
    const externalUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

    const collected: PlaylistItem[] = [];
    let pageToken: string | undefined;
    let lastPageHadNext = false;

    while (collected.length < importLimit) {
      const batch = Math.min(50, importLimit - collected.length);
      const params: Record<string, string> = {
        part: "snippet,contentDetails",
        playlistId,
        maxResults: String(batch),
      };
      if (pageToken) params.pageToken = pageToken;

      const itemsPath = `/playlistItems?${q(params)}`;
      const itemsResult = await callYouTube(itemsPath, key, {
        playlistId,
        operation: "playlistItems.list",
      });
      if (!itemsResult.ok) {
        const code: YoutubePlaylistImportErrorCode =
          itemsResult.kind === "timeout"
            ? "YOUTUBE_API_TIMEOUT"
            : "YOUTUBE_API_NETWORK_ERROR";
        return errorJson(
          code,
          networkErrorUserMessage("playlistItems.list"),
          clientNetworkFailureDetails(itemsResult.clientDetails),
          itemsResult.kind === "timeout" ? 504 : 502,
        );
      }

      if (itemsResult.status < 200 || itemsResult.status >= 300) {
        return mapGoogleFailure(
          itemsResult.status,
          itemsResult.json,
          itemsResult.headers,
          "playlistItems.list",
        );
      }

      const page = itemsResult.json as PlaylistItemsResponse;
      const batchItems = page.items ?? [];
      for (const it of batchItems) {
        if (collected.length >= importLimit) break;
        collected.push(it);
      }

      lastPageHadNext = Boolean(page.nextPageToken);
      if (!page.nextPageToken || batchItems.length === 0) break;
      pageToken = page.nextPageToken;
      if (collected.length >= importLimit) break;
    }

    const tracks: NormalizedTrack[] = [];
    let skippedMissingVideoId = 0;

    for (let i = 0; i < collected.length; i++) {
      const item = collected[i]!;
      const sn = item.snippet;
      const vid =
        sn?.resourceId?.videoId ??
        item.contentDetails?.videoId ??
        (sn?.resourceId?.kind === "youtube#video" ? sn.resourceId.videoId : undefined);
      if (!vid) {
        skippedMissingVideoId++;
        continue;
      }
      const channelTitle = sn?.channelTitle?.trim() || playlistChannel || "Unknown channel";
      const rawVideoTitle = sn?.title?.trim() || "Untitled";
      const cleaned = cleanYouTubeTrackTitle(rawVideoTitle, channelTitle);
      const externalVideoUrl = `https://www.youtube.com/watch?v=${vid}`;
      tracks.push({
        id: `youtube-${vid}-${i}`,
        source: "youtube",
        rawTitle: cleaned.rawTitle,
        title: cleaned.title,
        artist: cleaned.artist,
        artistConfidence: cleaned.artistConfidence,
        album: null,
        channelTitle,
        thumbnailUrl: pickThumb(sn?.thumbnails),
        externalUrl: externalVideoUrl,
        platformTrackId: vid,
        platformPlaylistId: playlistId,
        publishedAt: sn?.publishedAt ?? null,
      });
    }

    if (tracks.length === 0) {
      return errorJson(
        "EMPTY_PLAYLIST",
        "This playlist has no videos we could import.",
        "Items may be unavailable, or the playlist may only contain non-video entries.",
        422,
      );
    }

    const totalHint = plItem.contentDetails?.itemCount;
    const truncated =
      lastPageHadNext || (typeof totalHint === "number" && totalHint > importLimit);

    return NextResponse.json(
      {
        ok: true,
        playlist: {
          id: playlistId,
          title: playlistTitle,
          channelTitle: playlistChannel,
          source: "youtube" as const,
          externalUrl,
          trackCount: tracks.length,
          truncated,
          importLimit,
          fetchedItemSlots: collected.length,
          skippedMissingVideoId,
          youtubeReportedTotalItems: typeof totalHint === "number" ? totalHint : null,
        },
        tracks,
      },
      NO_STORE,
    );
  } catch (e) {
    console.error("[flowlist:youtube-import] unhandled error", e);
    devLog("Unhandled server error (see stderr)", {
      summary: e instanceof Error ? e.message : String(e),
    });
    return errorJson(
      "UNKNOWN_SERVER_ERROR",
      "An unexpected error occurred while importing the playlist.",
      clientCatchAllFailureDetails(e),
      500,
    );
  }
}
