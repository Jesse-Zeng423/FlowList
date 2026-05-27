import { NextResponse } from "next/server";
import { extractSpotifyPlaylistId } from "@/lib/spotify-playlist-id";
import {
  IMPORT_REQUEST_BODY_LIMIT_BYTES,
  readBoundedJson,
  RequestBodyTooLargeError,
} from "@/lib/read-bounded-json";
import type {
  SpotifyImportedTrackRow,
  SpotifyPlaylistImportResponse,
} from "@/types/spotify-api";

export const runtime = "nodejs";

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
  return preferred?.url ?? null;
}

function formatArtists(artists: SpotifyArtist[]): string {
  return artists.map((a) => a.name).filter(Boolean).join(", ");
}

async function getAccessToken(): Promise<
  { ok: true; token: string } | { ok: false; reason: "missing_env" | "token_failed" }
> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    return { ok: false, reason: "missing_env" };
  }
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!res.ok) {
    return { ok: false, reason: "token_failed" };
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    return { ok: false, reason: "token_failed" };
  }
  return { ok: true, token: data.access_token };
}

async function spotifyFetch(
  url: string,
  token: string,
): Promise<{ ok: true; response: Response; data: unknown } | { ok: false; response: Response }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    return { ok: false, response };
  }
  return { ok: true, response, data };
}

function errorJson(
  code: NonNullable<Extract<SpotifyPlaylistImportResponse, { ok: false }>["error"]>["code"],
  message: string,
  retryAfterSeconds?: number,
  statusOverride?: number,
): NextResponse<SpotifyPlaylistImportResponse> {
  return NextResponse.json(
    { ok: false, error: { code, message, retryAfterSeconds } },
    {
      status:
        statusOverride ??
        (code === "INVALID_URL"
          ? 400
          : code === "MISSING_ENV"
            ? 503
            : code === "RATE_LIMIT"
              ? 429
              : code === "EMPTY_PLAYLIST"
                ? 422
                : 502),
    },
  );
}

export async function POST(req: Request): Promise<NextResponse<SpotifyPlaylistImportResponse>> {
  let body: unknown;
  try {
    body = await readBoundedJson(req);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorJson(
        "INVALID_URL",
        `Request body is too large. Maximum size is ${IMPORT_REQUEST_BODY_LIMIT_BYTES} bytes.`,
        undefined,
        413,
      );
    }
    return errorJson("INVALID_URL", "Request body must be JSON.");
  }

  const url = typeof (body as { url?: unknown })?.url === "string" ? (body as { url: string }).url : "";
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
    return errorJson("SPOTIFY_ERROR", "Could not obtain an access token from Spotify.");
  }
  const token = tokenResult.token;

  const playlistUrl = `https://api.spotify.com/v1/playlists/${playlistId}`;
  const playlistRes = await spotifyFetch(playlistUrl, token);
  if (!playlistRes.ok) {
    const { response } = playlistRes;
    if (response.status === 429) {
      const ra = response.headers.get("retry-after");
      const retryAfterSeconds = ra ? Number.parseInt(ra, 10) : undefined;
      return errorJson(
        "RATE_LIMIT",
        "Spotify rate-limited this request. Try again in a moment.",
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      );
    }
    if (response.status === 401 || response.status === 403) {
      return errorJson(
        "PLAYLIST_UNAVAILABLE",
        "This playlist is private, restricted, or cannot be accessed with the current credentials.",
      );
    }
    if (response.status === 404) {
      return errorJson(
        "PLAYLIST_UNAVAILABLE",
        "Playlist not found. It may be private, deleted, or the link may be wrong.",
      );
    }
    return errorJson("SPOTIFY_ERROR", `Spotify returned an error (${response.status}).`);
  }

  const playlist = playlistRes.data as PlaylistDetails;

  const allItems: PlaylistTrackItem[] = [];
  let offset = 0;
  const limit = 100;
  let total = 0;
  let firstPage = true;

  while (true) {
    const pageUrl = `${playlistUrl}/tracks?limit=${limit}&offset=${offset}`;
    const pageRes = await spotifyFetch(pageUrl, token);
    if (!pageRes.ok) {
      const { response } = pageRes;
      if (response.status === 429) {
        const ra = response.headers.get("retry-after");
        const retryAfterSeconds = ra ? Number.parseInt(ra, 10) : undefined;
        return errorJson(
          "RATE_LIMIT",
          "Spotify rate-limited this request while loading tracks. Try again shortly.",
          Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
        );
      }
      return errorJson("SPOTIFY_ERROR", `Failed to load playlist tracks (${response.status}).`);
    }
    const page = pageRes.data as PlaylistTracksPage;
    if (firstPage) {
      total = page.total ?? 0;
      firstPage = false;
    }
    allItems.push(...(page.items ?? []));
    offset += page.items?.length ?? 0;
    if (!page.items?.length || offset >= total) break;
  }

  const rows: SpotifyImportedTrackRow[] = [];
  for (const item of allItems) {
    const tr = item.track;
    if (!tr || tr.type === "episode") continue;
    if (!tr.uri.startsWith("spotify:track:")) continue;
    const external = tr.external_urls?.spotify;
    if (!tr.name || !external) continue;
    rows.push({
      spotifyUri: tr.uri,
      externalUrl: external,
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

  return NextResponse.json({
    ok: true,
    playlist: {
      id: playlist.id ?? playlistId,
      name: playlist.name ?? "Untitled playlist",
      ownerDisplayName: playlist.owner?.display_name ?? playlist.owner?.id ?? null,
      uri: playlist.uri ?? `spotify:playlist:${playlistId}`,
      externalUrl: playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlistId}`,
    },
    tracks: rows,
  });
}
