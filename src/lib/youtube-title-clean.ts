import type { ArtistConfidence } from "@/types/flowlist";

/**
 * Conservative YouTube video title cleanup and "Artist - Title" style parsing.
 * On failure: title = cleaned string; artist = channel when present (not a verified performer name).
 */

const SUFFIX_RES: RegExp[] = [
  /\s*\(official\s+video\)\s*$/i,
  /\s*\[official\s+video\]\s*$/i,
  /\s*\(official\s+audio\)\s*$/i,
  /\s*\[official\s+audio\]\s*$/i,
  /\s*\(lyrics\)\s*$/i,
  /\s*\[lyrics\]\s*$/i,
  /\s*lyric\s+video\s*$/i,
  /\s*visualizer\s*$/i,
  /\s*music\s+video\s*$/i,
  /\s*official\s+music\s+video\s*$/i,
  /\s*\bhd\b\s*$/i,
  /\s*\b4k\b\s*$/i,
];

function stripSuffixes(title: string): string {
  let t = title.trim();
  let prev = "";
  while (t !== prev) {
    prev = t;
    for (const re of SUFFIX_RES) {
      t = t.replace(re, "").trim();
    }
  }
  return t.replace(/\s{2,}/g, " ").trim();
}

function trySplitArtistTitle(cleaned: string): { artist: string; title: string } | null {
  const colon = /^(.{2,120}?):\s*(.{2,200})$/u.exec(cleaned);
  if (colon?.[1] && colon[2]) {
    return { artist: colon[1].trim(), title: colon[2].trim() };
  }
  const dash = /^(.{2,120}?)\s+[-–—]\s+(.{2,200})$/u.exec(cleaned);
  if (dash?.[1] && dash[2]) {
    return { artist: dash[1].trim(), title: dash[2].trim() };
  }
  return null;
}

export function cleanYouTubeTrackTitle(
  rawVideoTitle: string,
  channelTitle: string,
): { rawTitle: string; title: string; artist: string; artistConfidence: ArtistConfidence } {
  const rawTitle = rawVideoTitle.trim();
  const cleaned = stripSuffixes(rawTitle);
  const split = trySplitArtistTitle(cleaned);
  if (split) {
    return {
      rawTitle,
      title: split.title,
      artist: split.artist,
      artistConfidence: "parsed",
    };
  }
  const ch = channelTitle.trim();
  if (ch) {
    return {
      rawTitle,
      title: cleaned || rawTitle,
      artist: ch,
      artistConfidence: "channel_fallback",
    };
  }
  return {
    rawTitle,
    title: cleaned || rawTitle,
    artist: "Unknown channel",
    artistConfidence: "unknown",
  };
}
