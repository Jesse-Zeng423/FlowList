import type { PlaylistFitAnalysis, TrackAnalysis } from "@/types/flowlist";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Grouping key: parsed artist when confident; otherwise upload channel / artist string. */
function groupingKey(track: TrackAnalysis): string {
  const ch = track.importMeta?.channelTitle?.trim();
  const conf = track.artistConfidence ?? "parsed";
  if (conf === "parsed" && track.artist.trim() && track.artist.trim().toLowerCase() !== "unknown artist") {
    return norm(track.artist);
  }
  if (ch) return norm(ch);
  return norm(track.artist) || "unknown";
}

function titleTokens(title: string): string[] {
  return norm(title)
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 2);
}

/**
 * Lightweight prototype: how "mixed" vs artist/channel-focused does this playlist look?
 * Uses metadata only — no audio, no external AI.
 */
export function analyzePlaylistFit(
  tracks: TrackAnalysis[],
  context: { playlistTitle?: string | null },
): PlaylistFitAnalysis {
  if (tracks.length === 0) {
    return { level: "mixed", label: "Looks mixed" };
  }

  let score = 0;
  const n = tracks.length;

  const keys = tracks.map(groupingKey).filter((k) => k && k !== "unknown");
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const maxShare = keys.length > 0 ? Math.max(...counts.values()) / keys.length : 0;
  const uniqueArtists = counts.size;

  if (maxShare >= 0.88) score += 4;
  else if (maxShare >= 0.62) score += 3;
  else if (maxShare >= 0.42) score += 1;

  if (uniqueArtists <= 2 && n >= 6) score += 2;
  else if (uniqueArtists <= 3 && n >= 10) score += 1;

  if (uniqueArtists >= Math.ceil(n * 0.45) && n >= 8) score -= 2;
  if (uniqueArtists >= Math.ceil(n * 0.35) && n >= 12) score -= 1;

  const plTitle = (context.playlistTitle ?? "").trim();
  const plLower = plTitle.toLowerCase();
  if (/\bbest of\b|\bgreatest hits\b|\ball the hits\b|\bessential\b|\bcollection\b|\bfull discography\b|\bhits?\s*\+/.test(plLower)) {
    score += 2;
  }
  if (/\bvs\b|\bmix\b|\bshuffle\b|\brandom\b|\bvariety\b/.test(plLower)) {
    score -= 1;
  }

  const dominantEntry = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const dominantKey = dominantEntry?.[0];
  if (dominantKey && plTitle.length > 0) {
    const domWords = dominantKey.split(/\s+/).filter((w) => w.length > 3);
    for (const w of domWords) {
      if (plLower.includes(w)) {
        score += 2;
        break;
      }
    }
    const titleWords = titleTokens(plTitle);
    let overlap = 0;
    for (const t of tracks.slice(0, Math.min(8, n))) {
      const tt = new Set(titleTokens(t.title));
      for (const w of titleWords) {
        if (w.length > 3 && tt.has(w)) overlap++;
      }
    }
    if (overlap >= 4 && n >= 6) score += 1;
  }

  const channels = tracks
    .map((t) => t.importMeta?.channelTitle?.trim().toLowerCase())
    .filter((c): c is string => Boolean(c));
  if (channels.length >= n * 0.85 && n >= 5) {
    const chMap = new Map<string, number>();
    for (const c of channels) chMap.set(c, (chMap.get(c) ?? 0) + 1);
    const chMax = Math.max(...chMap.values()) / channels.length;
    if (chMax >= 0.92) score += 3;
    else if (chMax >= 0.75) score += 2;
  }

  if (n >= 8) {
    const energies = tracks.map((t) => t.estimatedEnergy);
    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const varE =
      energies.reduce((s, e) => s + (e - mean) ** 2, 0) / Math.max(1, energies.length - 1);
    if (varE < 2.2) score += 1;
    if (varE > 5) score -= 1;
  }

  if (score >= 7) {
    return { level: "highly_consistent", label: "Looks highly consistent" };
  }
  if (score >= 4) {
    return { level: "moderately_consistent", label: "Looks moderately consistent" };
  }
  return { level: "mixed", label: "Looks mixed" };
}
