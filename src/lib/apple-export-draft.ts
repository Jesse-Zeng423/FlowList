import type { SequencedTrack } from "@/types/flowlist";
export const APPLE_EXPORT_KEY = "flowlist:apple-export:v1";
export interface AppleExportDraft { version: 1; name: string; tracks: Array<{ id: string; type: string; title: string; artist: string }>; playlistId: string | null; }
export function makeAppleExportDraft(tracks: readonly SequencedTrack[], playlistName?: string | null): AppleExportDraft | null {
  if (!tracks.length || tracks.length > 300 || tracks.some(track => track.importMeta?.source !== "apple" || !track.importMeta.platformTrackType)) return null;
  return { version: 1, name: `${playlistName?.trim() || "My playlist"} · Flowlist`.slice(0, 120), tracks: tracks.map(track => ({ id: track.importMeta!.platformTrackId, type: track.importMeta!.platformTrackType!, title: track.title, artist: track.artist })), playlistId: null };
}
export function parseAppleExportDraft(raw: string | null): AppleExportDraft | null {
  if (!raw || raw.length > 100_000) return null;
  try {
    const value = JSON.parse(raw) as AppleExportDraft;
    if (value.version !== 1 || typeof value.name !== "string" || value.name.length > 120 || !Array.isArray(value.tracks) || !value.tracks.length || value.tracks.length > 300 || !value.tracks.every(row => typeof row.id === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(row.id) && ["library-songs", "songs", "library-music-videos", "music-videos"].includes(row.type) && typeof row.title === "string" && typeof row.artist === "string") || (value.playlistId !== null && (typeof value.playlistId !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(value.playlistId)))) return null;
    return value;
  } catch { return null; }
}
