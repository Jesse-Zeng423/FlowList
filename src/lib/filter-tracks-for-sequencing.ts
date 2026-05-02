import type { TrackAnalysis } from "@/types/flowlist";

const UNAVAILABLE_TITLE_RE = /deleted video|private video/i;

export function isUnavailableForSequencing(track: TrackAnalysis): boolean {
  const raw = track.importMeta?.rawTitle ?? "";
  const title = track.title ?? "";
  if (UNAVAILABLE_TITLE_RE.test(raw) || UNAVAILABLE_TITLE_RE.test(title)) return true;
  if (track.importMeta) {
    const id = track.importMeta.platformTrackId?.trim() ?? "";
    if (!id) return true;
  }
  if (!track.title?.trim()) return true;
  return false;
}

export function filterTracksForSequencing(tracks: TrackAnalysis[]): {
  active: TrackAnalysis[];
  skippedCount: number;
} {
  const active: TrackAnalysis[] = [];
  let skippedCount = 0;
  for (const t of tracks) {
    if (isUnavailableForSequencing(t)) {
      skippedCount++;
      continue;
    }
    active.push(t);
  }
  return { active, skippedCount };
}
