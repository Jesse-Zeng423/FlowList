import type { SequencedTrack } from "@/types/flowlist";

export const YOUTUBE_EXPORT_KEY = "flowlist:youtube-export:v1";
export type YouTubePrivacy = "private" | "unlisted" | "public";
export interface YouTubeExportDraft {
  version: 1;
  title: string;
  privacy: YouTubePrivacy;
  tracks: Array<{ title: string; artist: string; videoId: string }>;
  playlistId: string | null;
  nextIndex: number;
}

export function makeYouTubeExportDraft(tracks: readonly SequencedTrack[], name?: string | null): YouTubeExportDraft | null {
  if (tracks.length === 0 || tracks.length > 300) return null;
  const rows = tracks.map(track => ({
    title: track.title,
    artist: track.artist,
    videoId: track.importMeta?.source === "youtube" ? track.importMeta.platformTrackId : "",
  }));
  if (rows.some(row => !/^[A-Za-z0-9_-]{11}$/.test(row.videoId))) return null;
  return { version: 1, title: `${name?.trim() || "My playlist"} · Flowlist`.slice(0, 120), privacy: "private", tracks: rows, playlistId: null, nextIndex: 0 };
}

export function parseYouTubeExportDraft(raw: string | null): YouTubeExportDraft | null {
  if (!raw || raw.length > 100_000) return null;
  try {
    const value = JSON.parse(raw) as YouTubeExportDraft;
    if (value.version !== 1 || !Array.isArray(value.tracks) || !value.tracks.length || value.tracks.length > 300 ||
      !value.tracks.every(row => typeof row.title === "string" && typeof row.artist === "string" && /^[A-Za-z0-9_-]{11}$/.test(row.videoId)) ||
      typeof value.title !== "string" || value.title.length > 120 ||
      !["private", "unlisted", "public"].includes(value.privacy) ||
      !Number.isInteger(value.nextIndex) || value.nextIndex < 0 || value.nextIndex > value.tracks.length ||
      (value.playlistId !== null && !/^[A-Za-z0-9_-]{10,80}$/.test(value.playlistId))) return null;
    return value;
  } catch { return null; }
}
