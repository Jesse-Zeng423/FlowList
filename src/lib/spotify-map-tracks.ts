import type { TrackAnalysis } from "@/types/flowlist";
import type { SpotifyImportedTrackRow } from "@/types/spotify-api";
import type { NormalizedTrack } from "@/types/normalized-track";
import { normalizedTracksToTrackAnalyses } from "@/lib/normalized-to-track-analysis";

function rowToNormalized(row: SpotifyImportedTrackRow, playlistId: string, index: number): NormalizedTrack {
  const tid = row.spotifyUri.replace(/^spotify:track:/i, "");
  return {
    id: `spotify-${tid}-${index}`,
    source: "spotify",
    rawTitle: row.title,
    title: row.title,
    artist: row.artists,
    artistConfidence: "parsed",
    album: row.albumName,
    channelTitle: row.artists,
    thumbnailUrl: row.albumImageUrl,
    externalUrl: row.externalUrl,
    platformTrackId: tid,
    platformPlaylistId: playlistId,
    durationMs: row.durationMs,
  };
}

/** Experimental legacy: Spotify metadata → shared normalized pipeline. */
export function spotifyRowsToTrackAnalyses(
  rows: SpotifyImportedTrackRow[],
  playlistId: string,
): TrackAnalysis[] {
  const normalized = rows.map((r, i) => rowToNormalized(r, playlistId, i));
  return normalizedTracksToTrackAnalyses(normalized);
}
