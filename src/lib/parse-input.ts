import type { ArtistConfidence, TrackAnalysis } from "@/types/flowlist";
import { MOCK_CATALOG } from "@/lib/mock-catalog";
import { extractYouTubePlaylistId } from "@/lib/youtube-playlist-id";

const SPOTIFY_PLAYLIST_RE =
  /^https?:\/\/(open\.)?spotify\.com\/(playlist\/|intl-\w+\/playlist\/)[a-zA-Z0-9]+/i;

const DASH_DELIMS = [" – ", " — ", " - ", "\t", " | "] as const;

export type PlaylistInputKind = "empty" | "youtube_url" | "spotify_url" | "manual";

export function looksLikeSpotifyPlaylistUrl(line: string): boolean {
  const s = line.trim();
  return SPOTIFY_PLAYLIST_RE.test(s);
}

export function classifyPlaylistInput(raw: string): PlaylistInputKind {
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  const firstLine =
    trimmed
      .split(/\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  if (extractYouTubePlaylistId(firstLine)) return "youtube_url";
  if (looksLikeSpotifyPlaylistUrl(firstLine)) return "spotify_url";
  return "manual";
}

export function parsePlaylistLines(raw: string): string[] {
  return raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function indexOfFirstDash(line: string): { delim: string; index: number } | null {
  let best: { delim: string; index: number } | null = null;
  for (const d of DASH_DELIMS) {
    const i = line.indexOf(d);
    if (i === -1) continue;
    if (!best || i < best.index) best = { delim: d, index: i };
  }
  return best;
}

/**
 * Disambiguate "A - B" between Artist–Title vs Title–Artist using catalog exact matches only,
 * then light heuristics, then default Artist–Title (first segment = artist).
 */
function tokenCount(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

function disambiguateDashParts(left: string, right: string): { title: string; artist: string } {
  const a = left.trim();
  const b = right.trim();
  const m1 = MOCK_CATALOG.find(
    (t) => norm(t.title) === norm(a) && norm(t.artist) === norm(b),
  );
  if (m1) return { title: m1.title, artist: m1.artist };
  const m2 = MOCK_CATALOG.find(
    (t) => norm(t.title) === norm(b) && norm(t.artist) === norm(a),
  );
  if (m2) return { title: m2.title, artist: m2.artist };

  const titleHints = /\b(feat\.?|ft\.|remix|rmx|mix|edit|version|live|acoustic|interlude)\b/i;
  if (titleHints.test(a)) return { title: a, artist: b };
  if (titleHints.test(b)) return { title: b, artist: a };

  const lt = tokenCount(a);
  const rt = tokenCount(b);
  if (lt < rt) return { title: b, artist: a };
  if (rt < lt) return { title: a, artist: b };

  return { title: a, artist: b };
}

/**
 * Parse one line: "Artist - Song", "Song - Artist", "Artist, Song Title", single title, etc.
 */
export function parseTrackLine(line: string): { title: string; artist: string } {
  const trimmed = line.trim();
  if (!trimmed) return { title: "Untitled", artist: "Unknown artist" };

  const commaIdx = trimmed.indexOf(",");
  const dashHit = indexOfFirstDash(trimmed);

  if (commaIdx !== -1 && (!dashHit || commaIdx < dashHit.index)) {
    const artist = trimmed.slice(0, commaIdx).trim();
    const title = trimmed.slice(commaIdx + 1).trim();
    if (artist && title) return { title, artist };
  }

  if (dashHit) {
    const { delim, index } = dashHit;
    const left = trimmed.slice(0, index).trim();
    const right = trimmed.slice(index + delim.length).trim();
    if (left && right) return disambiguateDashParts(left, right);
  }

  return { title: trimmed.slice(0, 200), artist: "Unknown artist" };
}

/** Deterministic pseudo-random 0..max from string (stable mock analysis). */
function hashToInt(seed: string, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return max <= 0 ? 0 : h % (max + 1);
}

function tempoFromSeed(seed: string): TrackAnalysis["tempoFeel"] {
  const r = hashToInt(seed + ":t", 2);
  return r === 0 ? "slow" : r === 1 ? "medium" : "fast";
}

/**
 * Mock analysis for a parsed title/artist. Replace with model/API later.
 */
export function buildMockTrackAnalysis(
  parsed: { title: string; artist: string },
  index: number,
  sourceLine: string,
  albumLabel: string,
  artistConfidence: ArtistConfidence = "parsed",
): TrackAnalysis {
  const seed = `${sourceLine}:${index}:${parsed.title}:${parsed.artist}`;
  const id = `import-${hashToInt(seed, 1_000_000_000)}`;
  const darkness = 15 + hashToInt(seed + ":d", 70);
  const intensity = 25 + hashToInt(seed + ":i", 55);
  const uplift = 20 + hashToInt(seed + ":u", 60);
  const energy = 1 + hashToInt(seed + ":e", 9);
  const rhythm = 15 + hashToInt(seed + ":r", 75);
  const moods = [
    "dreamy introspection",
    "late-night glow",
    "soft tension",
    "hopeful drift",
    "nocturnal pulse",
    "cinematic hush",
  ];
  const mood = moods[hashToInt(seed + ":m", moods.length - 1)];
  const flavors = [
    ["reflective", "late-night"],
    ["romantic", "nostalgic"],
    ["cinematic", "melancholic"],
    ["uplifting", "calm"],
    ["intense", "cinematic"],
  ];
  const flavorTags = flavors[hashToInt(seed + ":f", flavors.length - 1)] ?? ["reflective"];

  return {
    id,
    title: parsed.title.slice(0, 200) || `Track ${index + 1}`,
    artist: parsed.artist.slice(0, 200),
    artistConfidence,
    album: albumLabel,
    estimatedMood: mood,
    estimatedEnergy: energy,
    moodDarknessScore: darkness,
    emotionalIntensityScore: intensity,
    upliftScore: uplift,
    tempoFeel: tempoFromSeed(seed),
    rhythmIntensityScore: rhythm,
    flavorTags,
  };
}

export function resolveManualTracksFromText(
  raw: string,
  albumLabel: string,
): TrackAnalysis[] {
  if (classifyPlaylistInput(raw) !== "manual") return [];
  const lines = parsePlaylistLines(raw);
  return lines.map((line, i) => {
    const parsed = parseTrackLine(line);
    const artistConfidence: ArtistConfidence =
      parsed.artist.trim().toLowerCase() === "unknown artist" ? "unknown" : "parsed";
    return buildMockTrackAnalysis(parsed, i, line, albumLabel, artistConfidence);
  });
}
