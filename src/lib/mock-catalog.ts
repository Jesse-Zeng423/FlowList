import type { TempoFeel, TrackAnalysis } from "@/types/flowlist";

/**
 * Lookup-only catalog used to disambiguate manual "Artist - Title" parsing. The
 * curated rows here intentionally omit the new richer rhythm/mood/analysis fields
 * because they're never returned through `TrackAnalysis` to the sequencer; only
 * `title` / `artist` are read. Keep the type narrow so adding entries stays cheap.
 */
export type MockCatalogEntry = Pick<
  TrackAnalysis,
  | "id"
  | "title"
  | "artist"
  | "album"
  | "estimatedMood"
  | "estimatedEnergy"
  | "moodDarknessScore"
  | "emotionalIntensityScore"
  | "upliftScore"
  | "rhythmIntensityScore"
  | "flavorTags"
> & { tempoFeel: TempoFeel };

export const MOCK_CATALOG: MockCatalogEntry[] = [
  {
    id: "mock-1",
    title: "Glass Hours",
    artist: "North Echo",
    album: "Static Bloom",
    estimatedMood: "melancholic ambient",
    estimatedEnergy: 2,
    moodDarknessScore: 18,
    emotionalIntensityScore: 42,
    upliftScore: 22,
    tempoFeel: "slow",
    rhythmIntensityScore: 18,
    flavorTags: ["late-night", "reflective", "cinematic"],
  },
  {
    id: "mock-2",
    title: "Neon Tides",
    artist: "Velvet Circuit",
    album: "Afterhours",
    estimatedMood: "nocturnal groove",
    estimatedEnergy: 5,
    moodDarknessScore: 35,
    emotionalIntensityScore: 48,
    upliftScore: 40,
    tempoFeel: "medium",
    rhythmIntensityScore: 52,
    flavorTags: ["late-night", "romantic", "nostalgic"],
  },
  {
    id: "mock-3",
    title: "Pulse Meridian",
    artist: "Kairo",
    album: "Body Memory",
    estimatedMood: "driving euphoria",
    estimatedEnergy: 8,
    moodDarknessScore: 55,
    emotionalIntensityScore: 72,
    upliftScore: 78,
    tempoFeel: "fast",
    rhythmIntensityScore: 88,
    flavorTags: ["party", "workout", "uplifting"],
  },
  {
    id: "mock-4",
    title: "Paper Moons",
    artist: "Sable Haze",
    album: "Loft Sessions",
    estimatedMood: "soft yearning",
    estimatedEnergy: 3,
    moodDarknessScore: 28,
    emotionalIntensityScore: 55,
    upliftScore: 35,
    tempoFeel: "slow",
    rhythmIntensityScore: 24,
    flavorTags: ["romantic", "nostalgic", "cinematic"],
  },
  {
    id: "mock-5",
    title: "Iron Garden",
    artist: "Rook & Stone",
    album: "Heavy Weather",
    estimatedMood: "brooding tension",
    estimatedEnergy: 6,
    moodDarknessScore: 22,
    emotionalIntensityScore: 68,
    upliftScore: 25,
    tempoFeel: "medium",
    rhythmIntensityScore: 62,
    flavorTags: ["aggressive", "cinematic", "intense"],
  },
  {
    id: "mock-6",
    title: "Sunset Algebra",
    artist: "Mira Low",
    album: "Golden Math",
    estimatedMood: "hopeful drift",
    estimatedEnergy: 4,
    moodDarknessScore: 62,
    emotionalIntensityScore: 38,
    upliftScore: 70,
    tempoFeel: "medium",
    rhythmIntensityScore: 36,
    flavorTags: ["uplifting", "reflective"],
  },
  {
    id: "mock-7",
    title: "Midnight Relay",
    artist: "Two Cities",
    album: "Parallel Lines",
    estimatedMood: "anxious anticipation",
    estimatedEnergy: 7,
    moodDarknessScore: 30,
    emotionalIntensityScore: 76,
    upliftScore: 32,
    tempoFeel: "fast",
    rhythmIntensityScore: 80,
    flavorTags: ["cinematic", "intense", "late-night"],
  },
  {
    id: "mock-8",
    title: "Hush Protocol",
    artist: "Field Kit",
    album: "Quiet Signals",
    estimatedMood: "calm focus",
    estimatedEnergy: 2,
    moodDarknessScore: 48,
    emotionalIntensityScore: 28,
    upliftScore: 45,
    tempoFeel: "slow",
    rhythmIntensityScore: 14,
    flavorTags: ["reflective", "calm"],
  },
  {
    id: "mock-9",
    title: "Velvet Strike",
    artist: "Nadia K",
    album: "Heatwave",
    estimatedMood: "playful heat",
    estimatedEnergy: 9,
    moodDarknessScore: 58,
    emotionalIntensityScore: 64,
    upliftScore: 82,
    tempoFeel: "fast",
    rhythmIntensityScore: 92,
    flavorTags: ["party", "romantic", "uplifting"],
  },
  {
    id: "mock-10",
    title: "Fog Choir",
    artist: "Lantern Theory",
    album: "Bridges",
    estimatedMood: "ethereal sorrow",
    estimatedEnergy: 3,
    moodDarknessScore: 20,
    emotionalIntensityScore: 60,
    upliftScore: 18,
    tempoFeel: "slow",
    rhythmIntensityScore: 22,
    flavorTags: ["cinematic", "melancholic", "late-night"],
  },
  {
    id: "mock-11",
    title: "Chrome Heart",
    artist: "Yuki Phase",
    album: "Tokyo Ghost",
    estimatedMood: "futuristic longing",
    estimatedEnergy: 5,
    moodDarknessScore: 40,
    emotionalIntensityScore: 52,
    upliftScore: 48,
    tempoFeel: "medium",
    rhythmIntensityScore: 58,
    flavorTags: ["nostalgic", "cinematic"],
  },
  {
    id: "mock-12",
    title: "Open Water",
    artist: "Harbor Lights",
    album: "Drift",
    estimatedMood: "gentle resolve",
    estimatedEnergy: 3,
    moodDarknessScore: 72,
    emotionalIntensityScore: 34,
    upliftScore: 68,
    tempoFeel: "slow",
    rhythmIntensityScore: 20,
    flavorTags: ["reflective", "uplifting", "outro"],
  },
  {
    id: "mock-13",
    title: "Redline Saints",
    artist: "Motorcade",
    album: "Asphalt Saints",
    estimatedMood: "raw adrenaline",
    estimatedEnergy: 10,
    moodDarknessScore: 45,
    emotionalIntensityScore: 82,
    upliftScore: 55,
    tempoFeel: "fast",
    rhythmIntensityScore: 95,
    flavorTags: ["aggressive", "workout", "party"],
  },
  {
    id: "mock-14",
    title: "Cinder & Rain",
    artist: "Avery Row",
    album: "Small Fires",
    estimatedMood: "intimate ache",
    estimatedEnergy: 4,
    moodDarknessScore: 26,
    emotionalIntensityScore: 70,
    upliftScore: 30,
    tempoFeel: "medium",
    rhythmIntensityScore: 34,
    flavorTags: ["romantic", "melancholic", "late-night"],
  },
  {
    id: "mock-15",
    title: "Skyline Lullaby",
    artist: "June Atlas",
    album: "City Sleep",
    estimatedMood: "tender closure",
    estimatedEnergy: 2,
    moodDarknessScore: 68,
    emotionalIntensityScore: 44,
    upliftScore: 62,
    tempoFeel: "slow",
    rhythmIntensityScore: 16,
    flavorTags: ["reflective", "romantic", "outro"],
  },
  {
    id: "mock-16",
    title: "Basement Gospel",
    artist: "The Still",
    album: "Low Rooms",
    estimatedMood: "gritty soul",
    estimatedEnergy: 5,
    moodDarknessScore: 24,
    emotionalIntensityScore: 58,
    upliftScore: 38,
    tempoFeel: "medium",
    rhythmIntensityScore: 48,
    flavorTags: ["nostalgic", "late-night"],
  },
  {
    id: "mock-17",
    title: "Laser Bloom",
    artist: "Prism Run",
    album: "Hyperlove",
    estimatedMood: "euphoric surge",
    estimatedEnergy: 9,
    moodDarknessScore: 60,
    emotionalIntensityScore: 66,
    upliftScore: 88,
    tempoFeel: "fast",
    rhythmIntensityScore: 90,
    flavorTags: ["party", "uplifting", "workout"],
  },
  {
    id: "mock-18",
    title: "Empty Frames",
    artist: "Grey Season",
    album: "Winter Rooms",
    estimatedMood: "cold nostalgia",
    estimatedEnergy: 3,
    moodDarknessScore: 15,
    emotionalIntensityScore: 54,
    upliftScore: 20,
    tempoFeel: "slow",
    rhythmIntensityScore: 20,
    flavorTags: ["melancholic", "reflective", "cinematic"],
  },
];

const catalogByKey = new Map<string, MockCatalogEntry>();

function catalogKeys(t: MockCatalogEntry) {
  const a = `${t.title} ${t.artist}`.toLowerCase().replace(/\s+/g, " ");
  const b = `${t.artist} ${t.title}`.toLowerCase();
  return [a, b, t.title.toLowerCase(), t.artist.toLowerCase()];
}

for (const t of MOCK_CATALOG) {
  for (const k of catalogKeys(t)) {
    catalogByKey.set(k, t);
  }
}

export function findCatalogMatch(line: string): MockCatalogEntry | undefined {
  const norm = line.toLowerCase().trim().replace(/\s+/g, " ");
  if (!norm) return undefined;
  if (catalogByKey.has(norm)) return catalogByKey.get(norm);
  for (const t of MOCK_CATALOG) {
    if (norm.includes(t.title.toLowerCase()) && norm.includes(t.artist.toLowerCase())) {
      return t;
    }
  }
  for (const t of MOCK_CATALOG) {
    if (norm.includes(t.title.toLowerCase())) return t;
  }
  return undefined;
}
