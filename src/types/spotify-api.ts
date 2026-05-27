/** Client-facing shape returned by POST /api/spotify/playlist */

import type { ApiErrorPayload } from "@/types/api";

export type SpotifyPlaylistImportResponse =
  | {
      ok: true;
      playlist: {
        id: string;
        name: string;
        ownerDisplayName: string | null;
        uri: string;
        externalUrl: string;
      };
      tracks: SpotifyImportedTrackRow[];
    }
  | ({ ok: false } & ApiErrorPayload<SpotifyPlaylistImportErrorCode>);

export type SpotifyPlaylistImportErrorCode =
  | "INVALID_URL"
  | "MISSING_ENV"
  | "PLAYLIST_UNAVAILABLE"
  | "EMPTY_PLAYLIST"
  | "SPOTIFY_ERROR"
  | "RATE_LIMIT";

export type SpotifyImportedTrackRow = {
  spotifyUri: string;
  externalUrl: string;
  title: string;
  artists: string;
  albumName: string;
  albumImageUrl: string | null;
  durationMs: number;
};
