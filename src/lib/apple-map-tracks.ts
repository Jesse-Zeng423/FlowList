import type { NormalizedTrack } from "@/types/normalized-track";
import type { TrackAnalysis } from "@/types/flowlist";
import { normalizedTracksToTrackAnalyses } from "@/lib/normalized-to-track-analysis";
export interface AppleImportedRow { id: string; type: string; title: string; artist: string; album: string; url: string; durationMs: number | null; }
export function appleRowsToTrackAnalyses(rows: AppleImportedRow[], playlistId: string): TrackAnalysis[] {
  const normalized: NormalizedTrack[] = rows.filter(row => /^[A-Za-z0-9._-]{1,100}$/.test(row.id) && ["library-songs", "songs", "library-music-videos", "music-videos"].includes(row.type)).map((row, index) => ({
    id: `apple-${row.id}-${index}`, source: "apple", rawTitle: row.title, title: row.title,
    artist: row.artist, artistConfidence: "parsed", album: row.album, channelTitle: row.artist,
    thumbnailUrl: null, externalUrl: /^https:\/\/music\.apple\.com\//.test(row.url) ? row.url : "",
    platformTrackId: row.id, platformTrackType: row.type, platformPlaylistId: playlistId, durationMs: row.durationMs ?? undefined,
  }));
  return normalizedTracksToTrackAnalyses(normalized);
}
