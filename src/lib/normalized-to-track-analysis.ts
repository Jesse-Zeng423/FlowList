import type { TrackAnalysis } from "@/types/flowlist";
import type { NormalizedTrack } from "@/types/normalized-track";
import { buildMockTrackAnalysis } from "@/lib/parse-input";

/**
 * Map platform-neutral rows to TrackAnalysis for mock sequencing.
 */
export function normalizedTracksToTrackAnalyses(rows: NormalizedTrack[]): TrackAnalysis[] {
  return rows.map((row, index) => {
    const parsed = { title: row.title, artist: row.artist };
    const seed = `${row.source}:${row.platformTrackId}:${index}`;
    const albumLabel =
      row.source === "youtube"
        ? `YouTube · ${row.channelTitle}`
        : (row.album ?? row.channelTitle);
    const artistConfidence = row.artistConfidence ?? "parsed";
    const base = buildMockTrackAnalysis(parsed, index, seed, albumLabel, artistConfidence);
    return {
      ...base,
      id: row.id,
      album: albumLabel,
      importMeta: {
        source: row.source,
        externalUrl: row.externalUrl,
        thumbnailUrl: row.thumbnailUrl,
        platformTrackId: row.platformTrackId,
        platformPlaylistId: row.platformPlaylistId,
        rawTitle: row.rawTitle,
        channelTitle: row.channelTitle,
        durationMs: row.durationMs,
      },
    };
  });
}
