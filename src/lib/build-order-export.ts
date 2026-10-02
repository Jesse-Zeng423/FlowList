import type { SequencedTrack } from "@/types/flowlist";

/** A usable track list, separate from the detailed analysis report. */
export function buildOrderExport(tracks: readonly SequencedTrack[]): string {
  return tracks.map((track, index) => {
    const artist = track.artistConfidence === "unknown" ? "Artist unknown" : track.artist;
    const title = `${index + 1}. ${track.title} — ${artist}`;
    const videoId = track.importMeta?.source === "youtube"
      ? track.importMeta.platformTrackId
      : null;
    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `${title}\nhttps://www.youtube.com/watch?v=${videoId}`
      : title;
  }).join("\n");
}
