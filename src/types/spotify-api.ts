/** Client-facing shape returned by POST /api/spotify/playlist */

export type SpotifyPlaylistImportResponse =
  | {
      ok: true;
      playlist: {
        id: string;
        name: string;
        ownerDisplayName: string | null;
        uri: string;
        externalUrl: string;
        /** True when the upstream reported more tracks than the import cap. */
        truncated: boolean;
        /** Cap that was applied (cap === total fetched when truncated). */
        importCap: number;
        /** Spotify-reported total — may exceed importCap. */
        spotifyReportedTotal: number;
      };
      tracks: SpotifyImportedTrackRow[];
    }
  | {
      ok: false;
      error: {
        code: SpotifyPlaylistImportErrorCode;
        message: string;
        retryAfterSeconds?: number;
        details?: string | null;
      };
    };

export type SpotifyPlaylistImportErrorCode =
  | "INVALID_URL"
  | "BODY_TOO_LARGE"
  | "BLOCKED_ORIGIN"
  | "MISSING_ENV"
  | "PLAYLIST_UNAVAILABLE"
  | "EMPTY_PLAYLIST"
  | "SPOTIFY_ERROR"
  | "SPOTIFY_TIMEOUT"
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
