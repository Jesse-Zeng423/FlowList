import type { TrackAnalysis } from "@/types/flowlist";
import type { NormalizedTrack } from "@/types/normalized-track";
import { buildMockTrackAnalysis } from "@/lib/parse-input";

/**
 * Map platform-neutral rows to TrackAnalysis for prototype sequencing. Channel name
 * is forwarded as a hint source so YouTube imports get slightly more accurate
 * rhythm/mood scores when the channel implies a genre context.
 */
export function normalizedTracksToTrackAnalyses(rows: NormalizedTrack[]): TrackAnalysis[] {
  return rows.map((row, index) => {
    const seed = `${row.source}:${row.platformTrackId}:${index}`;
    const albumLabel =
      row.source === "youtube"
        ? `YouTube · ${row.channelTitle}`
        : (row.album ?? row.channelTitle);
    const artistConfidence = row.artistConfidence ?? "parsed";
    const parsed = {
      title: row.title,
      artist: row.artist,
      channel: row.channelTitle ?? null,
    };
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
