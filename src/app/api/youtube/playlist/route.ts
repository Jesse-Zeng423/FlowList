import { NextResponse } from "next/server";
import { extractYouTubePlaylistId, sanitizeYouTubePlaylistUrlInput } from "@/lib/youtube-playlist-id";
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

const isDev = process.env.NODE_ENV === "development";

function devLog(message: string, fields?: Record<string, unknown>) {
  if (isDev) {
    console.log("[flowlist:youtube-import]", message, fields ? JSON.stringify(fields) : "");
  }
}

function redactGoogleUrl(url: string): string {
  return url.replace(/([?&])key=[^&]*/g, "$1key=***");
}

/** Full request URL with query string, with `key` removed (not masked). Safer than regex for logging. */
function urlWithoutApiKey(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    u.searchParams.delete("key");
    return u.toString();
  } catch {
    return redactGoogleUrl(fullUrl);
  }
}

function serializeFetchError(e: unknown): {
  name: string;
  message: string;
  cause: string | null;
} {
  if (!(e instanceof Error)) {
    return { name: "Unknown", message: String(e), cause: null };
  }
  const { name, message, cause } = e;
  let causeStr: string | null = null;
  if (cause instanceof Error) {
    causeStr = `${cause.name}: ${cause.message}`;
  } else if (cause !== undefined && cause !== null) {
    if (typeof cause === "object" && "message" in cause) {
      causeStr = `${(cause as { name?: string }).name ?? "Error"}: ${String((cause as { message: unknown }).message)}`;
    } else {
      try {
        causeStr = JSON.stringify(cause);
      } catch {
        causeStr = String(cause);
      }
    }
  }
  return { name, message, cause: causeStr };
}

function formatNetworkErrorDetails(ser: ReturnType<typeof serializeFetchError>): string {
  const parts = [`${ser.name}: ${ser.message}`];
  if (ser.cause) parts.push(`Cause: ${ser.cause}`);
  return parts.join(" | ");
}

function networkErrorUserMessage(operation: "playlists.list" | "playlistItems.list"): string {
  const base =
    operation === "playlists.list"
      ? "Could not reach the YouTube Data API to load the playlist."
      : "Could not reach the YouTube Data API while listing playlist items.";
  return `${base} This may be caused by local network, VPN, or proxy issues if this server cannot reach www.googleapis.com.`;
}

/** Always log fetch failures (prod + dev) so hosted/server logs help debug; never includes the API key. */
function logYoutubeFetchFailure(fields: Record<string, unknown>) {
  console.warn("[flowlist:youtube-import] fetch failed", JSON.stringify(fields));
}

type GoogleApiErrorBody = {
  error?: {
    message?: string;
    code?: number;
    errors?: Array<{ domain?: string; reason?: string; message?: string }>;
  };
};

function readGoogleError(json: unknown): { message: string | null; reason: string | null } {
  const j = json as GoogleApiErrorBody;
  const message = j.error?.message ?? null;
  const reason = j.error?.errors?.[0]?.reason ?? null;
  return { message, reason };
}

function errorJson(
  code: YoutubePlaylistImportErrorCode,
  message: string,
  details: string | null,
  status: number,
): NextResponse<YoutubeApiErrorPayload> {
  return NextResponse.json({ error: { code, message, details } }, { status });
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
  return t.medium?.url ?? t.high?.url ?? t.default?.url ?? null;
}

type YtFetchOperation = "playlists.list" | "playlistItems.list";

async function ytFetchJson(
  url: string,
  ctx: { playlistId: string; operation: YtFetchOperation },
): Promise<
  | { ok: true; status: number; json: unknown }
  | { ok: false; kind: "network"; clientDetails: string }
> {
  const requestUrlWithoutKey = urlWithoutApiKey(url);
  try {
    const res = await fetch(url, { cache: "no-store" });
    const rawText = await res.text();
    let json: unknown = null;
    if (rawText) {
      try {
        json = JSON.parse(rawText);
      } catch {
        json = { _parseNote: "response was not valid JSON", rawSnippet: rawText.slice(0, 200) };
      }
    }
    const { message: googleMessage, reason: googleReason } = readGoogleError(json);
    devLog("YouTube API response", {
      playlistId: ctx.playlistId,
      operation: ctx.operation,
      requestUrlWithoutKey,
      status: res.status,
      googleMessage: googleMessage ?? undefined,
      googleReason: googleReason ?? undefined,
    });
    return { ok: true, status: res.status, json };
  } catch (e) {
    const ser = serializeFetchError(e);
    logYoutubeFetchFailure({
      playlistId: ctx.playlistId,
      operation: ctx.operation,
      requestUrlWithoutKey,
      errorName: ser.name,
      errorMessage: ser.message,
      errorCause: ser.cause,
    });
    devLog("YouTube fetch threw (see also stderr warn)", {
      playlistId: ctx.playlistId,
      operation: ctx.operation,
      requestUrlWithoutKey,
      errorName: ser.name,
      errorMessage: ser.message,
      errorCause: ser.cause,
    });
    return { ok: false, kind: "network", clientDetails: formatNetworkErrorDetails(ser) };
  }
}

function mapGoogleFailure(
  status: number,
  json: unknown,
  context: string,
): NextResponse<YoutubeApiErrorPayload> {
  const { message: googleMessage, reason: googleReason } = readGoogleError(json);
  const details = googleMessage ?? `HTTP ${status} (${context})`;

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

  const httpStatus =
    Number.isFinite(status) && status >= 400 && status < 600 ? status : 502;
  return errorJson(
    "UNKNOWN_SERVER_ERROR",
    `Unexpected YouTube API response (${status}).`,
    details,
    httpStatus,
  );
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorJson(
        "INVALID_URL",
        "Request body must be valid JSON with a url field.",
        "Could not parse JSON body.",
        400,
      );
    }

    const urlField = (body as { url?: unknown }).url;
    if (typeof urlField !== "string") {
      return errorJson(
        "INVALID_URL",
        "Missing or invalid url in request body.",
        "Expected a JSON object with a string field: url.",
        400,
      );
    }
    const url = sanitizeYouTubePlaylistUrlInput(urlField);
    const importLimit = readImportLimit(body);
    if (!url) {
      return errorJson(
        "INVALID_URL",
        "URL is empty after trimming.",
        "Paste a full YouTube or YouTube Music playlist link.",
        400,
      );
    }

    const playlistId = extractYouTubePlaylistId(url);
    devLog("Extracted playlist id", {
      playlistId: playlistId ?? null,
      inputLength: url.length,
      importLimit,
    });

    if (!playlistId) {
      return errorJson(
        "INVALID_URL",
        "Could not read a playlist id from list=…. Paste a full YouTube or YouTube Music playlist URL.",
        "After trimming and removing trailing backslashes, no valid list= parameter was found.",
        400,
      );
    }

    const q = (params: Record<string, string>) => {
      const u = new URLSearchParams({ ...params, key });
      return u.toString();
    };

    const playlistsUrl = `${YT}/playlists?${q({ part: "snippet,contentDetails", id: playlistId })}`;
    const plResult = await ytFetchJson(playlistsUrl, {
      playlistId,
      operation: "playlists.list",
    });
    if (!plResult.ok) {
      return errorJson(
        "YOUTUBE_API_NETWORK_ERROR",
        networkErrorUserMessage("playlists.list"),
        plResult.clientDetails,
        502,
      );
    }

    const { status: plStatus, json: plJson } = plResult;

    if (plStatus < 200 || plStatus >= 300) {
      return mapGoogleFailure(plStatus, plJson, "playlists.list");
    }

    const plData = plJson as PlaylistSnippetResponse;

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

      const itemsUrl = `${YT}/playlistItems?${q(params)}`;
      const itemsResult = await ytFetchJson(itemsUrl, {
        playlistId,
        operation: "playlistItems.list",
      });
      if (!itemsResult.ok) {
        return errorJson(
          "YOUTUBE_API_NETWORK_ERROR",
          networkErrorUserMessage("playlistItems.list"),
          itemsResult.clientDetails,
          502,
        );
      }

      const { status: itemsStatus, json: itemsJson } = itemsResult;
      if (itemsStatus < 200 || itemsStatus >= 300) {
        return mapGoogleFailure(itemsStatus, itemsJson, "playlistItems.list");
      }

      const page = itemsJson as PlaylistItemsResponse;
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

    return NextResponse.json({
      ok: true,
      playlist: {
        id: playlistId,
        title: playlistTitle,
        channelTitle: playlistChannel,
        source: "youtube",
        externalUrl,
        trackCount: tracks.length,
        truncated,
        importLimit,
        fetchedItemSlots: collected.length,
        skippedMissingVideoId,
        youtubeReportedTotalItems: typeof totalHint === "number" ? totalHint : null,
      },
      tracks,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    devLog("Unhandled server error", { message });
    return errorJson(
      "UNKNOWN_SERVER_ERROR",
      "An unexpected error occurred while importing the playlist.",
      message,
      500,
    );
  }
}
