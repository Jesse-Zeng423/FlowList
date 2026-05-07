import { NextResponse } from "next/server";
import { fetchUpstream, type UpstreamResponse } from "@/lib/api/fetch-upstream-json";
import { readBoundedJson } from "@/lib/api/read-json-body";
import {
  safeExternalUrl,
  SPOTIFY_IMAGE_HOSTS,
  SPOTIFY_LINK_HOSTS,
} from "@/lib/api/safe-external-url";
import { sanitizeLogFields, truncForLog } from "@/lib/api/log";
import { extractSpotifyPlaylistId } from "@/lib/spotify-playlist-id";
import type {
  SpotifyImportedTrackRow,
  SpotifyPlaylistImportErrorCode,
  SpotifyPlaylistImportResponse,
} from "@/types/spotify-api";

export const runtime = "nodejs";

const REQUEST_BODY_CAP_BYTES = 8 * 1024;
const SPOTIFY_IMPORT_CAP = 300;

const NO_STORE: ResponseInit = {
  headers: { "Cache-Control": "no-store" },
};

const isDev = process.env.NODE_ENV === "development";

function devWarn(message: string, fields?: Record<string, unknown>) {
  if (!isDev) return;
  if (fields) {
    console.debug("[flowlist:spotify-import]", message, sanitizeLogFields(fields));
  } else {
    console.debug("[flowlist:spotify-import]", message);
  }
}

function logUpstreamFailure(fields: Record<string, unknown>) {
  console.warn("[flowlist:spotify-import] fetch failed", sanitizeLogFields(fields));
}

type SpotifyImage = { url: string; width?: number | null; height?: number | null };
type SpotifyArtist = { name: string };
type SpotifyAlbum = { name: string; images?: SpotifyImage[] };
type SpotifyTrack = {
  uri: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  external_urls?: { spotify?: string };
  duration_ms: number;
  type?: string;
};

type PlaylistTrackItem = { track: SpotifyTrack | null };

type PlaylistTracksPage = {
  items: PlaylistTrackItem[];
  total: number;
  limit: number;
  offset: number;
};

type PlaylistDetails = {
  id: string;
  name: string;
  uri: string;
  external_urls?: { spotify?: string };
  owner?: { display_name?: string | null; id?: string };
};

function pickAlbumImage(images: SpotifyImage[] | undefined): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const preferred =
    sorted.find((i) => (i.width ?? 0) >= 64) ?? sorted[sorted.length - 1];
  const raw = preferred?.url ?? null;
  return safeExternalUrl(raw, SPOTIFY_IMAGE_HOSTS);
}

function formatArtists(artists: SpotifyArtist[]): string {
  return artists.map((a) => a.name).filter(Boolean).join(", ");
}

type ErrorJsonOptions = {
  retryAfterSeconds?: number;
  details?: string | null;
};

function statusForCode(code: SpotifyPlaylistImportErrorCode): number {
  switch (code) {
    case "INVALID_URL":
      return 400;
    case "BODY_TOO_LARGE":
      return 413;
    case "BLOCKED_ORIGIN":
      return 403;
    case "MISSING_ENV":
      return 503;
    case "RATE_LIMIT":
      return 429;
    case "EMPTY_PLAYLIST":
      return 422;
    case "PLAYLIST_UNAVAILABLE":
      return 404;
    case "SPOTIFY_TIMEOUT":
      return 504;
    case "SPOTIFY_ERROR":
    default:
      return 502;
  }
}

function errorJson(
  code: SpotifyPlaylistImportErrorCode,
  message: string,
  options: ErrorJsonOptions = {},
): NextResponse<SpotifyPlaylistImportResponse> {
  return NextResponse.json(
    {
      ok: false as const,
      error: {
        code,
        message,
        retryAfterSeconds: options.retryAfterSeconds,
        details: options.details ?? null,
      },
    },
    { status: statusForCode(code), ...NO_STORE },
  );
}

async function getAccessToken(): Promise<
  | { ok: true; token: string }
  | { ok: false; reason: "missing_env" | "token_failed" | "network" | "timeout"; details: string }
> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    return { ok: false, reason: "missing_env", details: "SPOTIFY_CLIENT_ID/SECRET not set" };
  }
  const result = await fetchUpstream(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    },
    { perCallMs: 6_000, retries: 1 },
  );

  if (!result.ok) {
    logUpstreamFailure({
      operation: "token",
      kind: result.kind,
      details: result.clientDetails,
    });
    return { ok: false, reason: result.kind === "timeout" ? "timeout" : "network", details: result.clientDetails };
  }

  if (result.status < 200 || result.status >= 300) {
    devWarn("Spotify token exchange returned non-2xx", {
      status: result.status,
      bodySnippet: truncForLog(result.rawText, 200),
    });
    return { ok: false, reason: "token_failed", details: `HTTP ${result.status}` };
  }

  const data = (result.json ?? {}) as { access_token?: string };
  if (!data.access_token) {
    return { ok: false, reason: "token_failed", details: "Missing access_token in response" };
  }
  return { ok: true, token: data.access_token };
}

async function spotifyApi(
  url: string,
  token: string,
  ctx: { operation: string },
): Promise<UpstreamResponse> {
  const result = await fetchUpstream(
    url,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
    { perCallMs: 8_000, retries: 1 },
  );
  if (!result.ok) {
    logUpstreamFailure({
      operation: ctx.operation,
      kind: result.kind,
      details: result.clientDetails,
    });
  } else {
    devWarn("Spotify API response", {
      operation: ctx.operation,
      status: result.status,
      parseError: result.parseError ?? "",
    });
  }
  return result;
}

function readRetryAfterSeconds(headers: Headers): number | undefined {
  const ra = headers.get("retry-after");
  if (!ra) return undefined;
  const n = Number.parseInt(ra, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function POST(req: Request): Promise<NextResponse<SpotifyPlaylistImportResponse>> {
  const parsed = await readBoundedJson<{ url?: unknown }>(req, REQUEST_BODY_CAP_BYTES);
  if (!parsed.ok) {
    if (parsed.code === "BODY_TOO_LARGE") {
      return errorJson("BODY_TOO_LARGE", "Request body is too large.", {
        details: parsed.details,
      });
    }
    return errorJson("INVALID_URL", "Request body must be JSON with a url field.", {
      details: parsed.details,
    });
  }

  const url = typeof parsed.body.url === "string" ? parsed.body.url : "";
  const playlistId = extractSpotifyPlaylistId(url);
  if (!playlistId) {
    return errorJson(
      "INVALID_URL",
      "That does not look like a valid Spotify playlist URL or spotify:playlist: URI.",
    );
  }

  const tokenResult = await getAccessToken();
  if (!tokenResult.ok) {
    if (tokenResult.reason === "missing_env") {
      return errorJson(
        "MISSING_ENV",
        "Spotify is not configured on the server (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET).",
      );
    }
    if (tokenResult.reason === "timeout") {
      return errorJson("SPOTIFY_TIMEOUT", "Spotify token endpoint timed out.", {
        details: tokenResult.details,
      });
    }
    return errorJson("SPOTIFY_ERROR", "Could not obtain an access token from Spotify.", {
      details: tokenResult.details,
    });
  }
  const token = tokenResult.token;

  const playlistUrl = `https://api.spotify.com/v1/playlists/${playlistId}`;
  const playlistRes = await spotifyApi(playlistUrl, token, { operation: "playlists.get" });
  if (!playlistRes.ok) {
    return errorJson(
      playlistRes.kind === "timeout" ? "SPOTIFY_TIMEOUT" : "SPOTIFY_ERROR",
      playlistRes.kind === "timeout"
        ? "Spotify timed out while loading the playlist."
        : "Could not reach Spotify to load the playlist.",
      { details: playlistRes.clientDetails },
    );
  }
  if (playlistRes.status < 200 || playlistRes.status >= 300) {
    if (playlistRes.status === 429) {
      return errorJson("RATE_LIMIT", "Spotify rate-limited this request. Try again in a moment.", {
        retryAfterSeconds: readRetryAfterSeconds(playlistRes.headers),
      });
    }
    if (playlistRes.status === 401 || playlistRes.status === 403) {
      return errorJson(
        "PLAYLIST_UNAVAILABLE",
        "This playlist is private, restricted, or cannot be accessed with the current credentials.",
      );
    }
    if (playlistRes.status === 404) {
      return errorJson(
        "PLAYLIST_UNAVAILABLE",
        "Playlist not found. It may be private, deleted, or the link may be wrong.",
      );
    }
    const snippet = playlistRes.parseError
      ? truncForLog(playlistRes.rawText, 200)
      : null;
    return errorJson(
      "SPOTIFY_ERROR",
      `Spotify returned an error (${playlistRes.status}).`,
      { details: snippet },
    );
  }

  const playlist = (playlistRes.json ?? {}) as PlaylistDetails;

  const allItems: PlaylistTrackItem[] = [];
  let offset = 0;
  const pageLimit = 100;
  let total = 0;
  let firstPage = true;
  let truncated = false;

  while (allItems.length < SPOTIFY_IMPORT_CAP) {
    const remaining = SPOTIFY_IMPORT_CAP - allItems.length;
    const batchSize = Math.min(pageLimit, remaining);
    const pageUrl = `${playlistUrl}/tracks?limit=${batchSize}&offset=${offset}`;
    const pageRes = await spotifyApi(pageUrl, token, { operation: "playlists.tracks" });
    if (!pageRes.ok) {
      return errorJson(
        pageRes.kind === "timeout" ? "SPOTIFY_TIMEOUT" : "SPOTIFY_ERROR",
        pageRes.kind === "timeout"
          ? "Spotify timed out while loading playlist tracks."
          : "Could not reach Spotify while loading tracks.",
        { details: pageRes.clientDetails },
      );
    }
    if (pageRes.status < 200 || pageRes.status >= 300) {
      if (pageRes.status === 429) {
        return errorJson(
          "RATE_LIMIT",
          "Spotify rate-limited this request while loading tracks. Try again shortly.",
          { retryAfterSeconds: readRetryAfterSeconds(pageRes.headers) },
        );
      }
      const snippet = pageRes.parseError ? truncForLog(pageRes.rawText, 200) : null;
      return errorJson(
        "SPOTIFY_ERROR",
        `Failed to load playlist tracks (${pageRes.status}).`,
        { details: snippet },
      );
    }
    const page = (pageRes.json ?? {}) as PlaylistTracksPage;
    if (firstPage) {
      total = page.total ?? 0;
      firstPage = false;
    }
    const items = page.items ?? [];
    allItems.push(...items);
    offset += items.length;
    if (items.length === 0 || offset >= total) break;
  }

  if (total > SPOTIFY_IMPORT_CAP) truncated = true;

  const rows: SpotifyImportedTrackRow[] = [];
  for (const item of allItems) {
    const tr = item.track;
    if (!tr || tr.type === "episode") continue;
    if (!tr.uri.startsWith("spotify:track:")) continue;
    const externalRaw = tr.external_urls?.spotify ?? null;
    const externalSafe = safeExternalUrl(externalRaw, SPOTIFY_LINK_HOSTS);
    if (!tr.name || !externalSafe) {
      if (externalRaw && !externalSafe) {
        devWarn("Dropping unsafe external_urls.spotify", {
          externalRaw: truncForLog(externalRaw, 120),
        });
      }
      continue;
    }
    rows.push({
      spotifyUri: tr.uri,
      externalUrl: externalSafe,
      title: tr.name,
      artists: formatArtists(tr.artists ?? []),
      albumName: tr.album?.name ?? "Unknown album",
      albumImageUrl: pickAlbumImage(tr.album?.images),
      durationMs: tr.duration_ms ?? 0,
    });
  }

  if (rows.length === 0) {
    return errorJson(
      "EMPTY_PLAYLIST",
      "This playlist has no playable tracks we could read (empty, or only local/unavailable items).",
    );
  }

  const playlistExternalSafe =
    safeExternalUrl(playlist.external_urls?.spotify, SPOTIFY_LINK_HOSTS) ??
    `https://open.spotify.com/playlist/${playlistId}`;

  return NextResponse.json(
    {
      ok: true as const,
      playlist: {
        id: playlist.id ?? playlistId,
        name: playlist.name ?? "Untitled playlist",
        ownerDisplayName: playlist.owner?.display_name ?? playlist.owner?.id ?? null,
        uri: playlist.uri ?? `spotify:playlist:${playlistId}`,
        externalUrl: playlistExternalSafe,
        truncated,
        importCap: SPOTIFY_IMPORT_CAP,
        spotifyReportedTotal: total,
      },
      tracks: rows,
    },
    NO_STORE,
  );
}
