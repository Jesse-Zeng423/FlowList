/**
 * Deterministic prototype analysis generator.
 *
 * Produces the analysis-only fields of a `TrackAnalysis` (everything except
 * id/title/artist/album/importMeta) for the current sync pipeline. The rhythm/tempo
 * portion is delegated to `buildPrototypeAudioFeatures` so the audio-feature provider
 * pipeline can reuse the same logic. Mood, analysis tags, bestRoles, and UI mirrors
 * are computed here.
 *
 * Output is **prototype** analysis: `audioFeatures.source = "prototype"`,
 * `analysis.analysisSource = "prototype"`, and confidence is intentionally low.
 * Replace this module (or swap providers) when real audio/AI analysis is wired up.
 */

import type {
  AnalysisMeta,
  BestRole,
  MoodFeatures,
  TempoFeel,
  TrackAnalysis,
} from "@/types/flowlist";
import {
  buildPrototypeAudioFeatures,
  type PrototypeFeatureInput,
} from "@/lib/audio-features/prototype-features";

const FEATURE_VERSION = "v2";

function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pseudoRandomInt(seed: string, salt: string, max: number): number {
  if (max <= 0) return 0;
  return fnv1a(`${seed}::${FEATURE_VERSION}::${salt}`) % (max + 1);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

interface MoodHints {
  fast: boolean;
  slow: boolean;
  intimate: boolean;
  aggressive: boolean;
  euphoric: boolean;
  melancholic: boolean;
  cinematic: boolean;
  nostalgic: boolean;
  hooky: boolean;
  drop: boolean;
  acoustic: boolean;
}

const HINT_PATTERNS: { [K in keyof MoodHints]: RegExp } = {
  fast: /\b(fast|speed|run|race|riot|sprint|highway)\b/i,
  slow: /\b(slow|stillness|whisper|hush|quiet|sleep|drift|interlude)\b/i,
  intimate: /\b(love|heart|alone|kiss|touch|miss|home|stay|close|skin)\b/i,
  aggressive: /\b(rage|war|fight|burn|kill|enemy|destroy|monster|savage|murder)\b/i,
  euphoric: /\b(party|celebration|forever|alive|free|sun|happy|euphoria|paradise)\b/i,
  melancholic: /\b(sad|tears|cry|broken|lost|gone|empty|ghost|grief|sorrow|alone|miss)\b/i,
  cinematic: /\b(theme|score|trailer|epic|prelude|finale|requiem|symphony|movement|interlude)\b/i,
  nostalgic: /\b(memory|years|remember|childhood|old|youth|2000|1990|2010|back\s+then)\b/i,
  hooky: /\b(remix|edit|version|rmx|club\s*mix|extended|radio\s*edit)\b/i,
  drop: /\b(drop|bass|trap|edm|festival|rave|dubstep|hardstyle)\b/i,
  acoustic: /\b(acoustic|piano|unplugged|live\s+session|stripped|orchestral)\b/i,
};

function extractMoodHints(haystack: string): MoodHints {
  const out = {} as MoodHints;
  for (const key of Object.keys(HINT_PATTERNS) as Array<keyof MoodHints>) {
    out[key] = HINT_PATTERNS[key].test(haystack);
  }
  return out;
}

const PROTOTYPE_MOOD_LABELS = [
  "dreamy introspection",
  "late-night glow",
  "soft tension",
  "hopeful drift",
  "nocturnal pulse",
  "cinematic hush",
  "warm intimacy",
  "fragile lift",
  "shadowed motion",
  "weightless drift",
] as const;

const PROTOTYPE_FLAVOR_GROUPS = [
  ["reflective", "late-night"],
  ["romantic", "nostalgic"],
  ["cinematic", "melancholic"],
  ["uplifting", "calm"],
  ["intense", "cinematic"],
  ["dreamy", "intimate"],
  ["aggressive", "driving"],
  ["nostalgic", "soft"],
] as const;

export type TrackAnalysisCore = Omit<
  TrackAnalysis,
  "id" | "title" | "artist" | "artistConfidence" | "album" | "importMeta"
>;

export type PrototypeAnalysisInput = PrototypeFeatureInput;

export interface PrototypeAnalysisContext {
  playlistTypeId?: string | null;
  flowKeywordIds?: string[];
}

/**
 * Build the analysis-only fields of a `TrackAnalysis` for one track. Caller is
 * responsible for `id`, `title`, `artist`, `album`, and `importMeta`. The rhythm/tempo
 * portion is built via `buildPrototypeAudioFeatures` so it stays consistent with the
 * provider-pipeline path.
 *
 * `context` is reserved for future flow-aware adjustments; ignored today so feature
 * scores stay stable across different flow keyword choices.
 */
export function buildPrototypeAnalysisCore(
  input: PrototypeAnalysisInput,
  context?: PrototypeAnalysisContext,
): TrackAnalysisCore {
  void context;
  const baseSeed = input.seed ?? `${input.title}|${input.artist}|${input.channel ?? ""}`;
  const haystack = `${input.title} ${input.artist} ${input.channel ?? ""}`.toLowerCase();
  const hints = extractMoodHints(haystack);

  // Rhythm/tempo features come from the audio-feature subsystem.
  const audioFeatures = buildPrototypeAudioFeatures(input);
  const tempoFeel: TempoFeel = audioFeatures.tempoFeel;
  const rhythmIntensity = audioFeatures.rhythmIntensity;

  // ---------- mood ----------
  let moodDarkness = 20 + pseudoRandomInt(baseSeed, "md", 65);
  if (hints.melancholic || hints.aggressive) moodDarkness += 14;
  if (hints.euphoric) moodDarkness -= 16;
  moodDarkness = clamp(moodDarkness, 5, 95);

  let emotionalWarmth = 30 + pseudoRandomInt(baseSeed, "ew", 55);
  if (hints.intimate || hints.nostalgic || hints.acoustic) emotionalWarmth += 14;
  if (hints.aggressive) emotionalWarmth -= 14;
  emotionalWarmth = clamp(emotionalWarmth, 5, 95);

  let melancholy = 25 + pseudoRandomInt(baseSeed, "mel", 55);
  if (hints.melancholic) melancholy += 22;
  if (hints.euphoric) melancholy -= 22;
  melancholy = clamp(melancholy, 5, 95);

  let euphoria = 25 + pseudoRandomInt(baseSeed, "eu", 55);
  if (hints.euphoric) euphoria += 24;
  if (hints.melancholic) euphoria -= 18;
  if (tempoFeel === "fast") euphoria += 6;
  euphoria = clamp(euphoria, 5, 95);

  let aggression = 15 + pseudoRandomInt(baseSeed, "ag", 55);
  if (hints.aggressive) aggression += 28;
  if (hints.intimate || hints.cinematic || hints.acoustic) aggression -= 18;
  aggression = clamp(aggression, 5, 95);

  let intimacy = 25 + pseudoRandomInt(baseSeed, "in", 55);
  if (hints.intimate || hints.nostalgic || hints.acoustic) intimacy += 20;
  if (hints.aggressive) intimacy -= 22;
  if (tempoFeel === "slow") intimacy += 8;
  intimacy = clamp(intimacy, 5, 95);

  let cinematicScale = 25 + pseudoRandomInt(baseSeed, "ci", 55);
  if (hints.cinematic) cinematicScale += 28;
  if (hints.intimate) cinematicScale -= 8;
  cinematicScale = clamp(cinematicScale, 5, 95);

  let nostalgia = 20 + pseudoRandomInt(baseSeed, "no", 60);
  if (hints.nostalgic) nostalgia += 22;
  if (hints.acoustic) nostalgia += 6;
  nostalgia = clamp(nostalgia, 5, 95);

  let tension = 25 + pseudoRandomInt(baseSeed, "te", 55);
  if (hints.cinematic || hints.aggressive) tension += 14;
  if (hints.euphoric || hints.acoustic) tension -= 12;
  tension = clamp(tension, 5, 95);

  let resolution = 20 + pseudoRandomInt(baseSeed, "re", 55);
  if (hints.intimate || hints.nostalgic || hints.acoustic) resolution += 14;
  if (tempoFeel === "slow") resolution += 6;
  if (hints.aggressive) resolution -= 12;
  resolution = clamp(resolution, 5, 95);

  // ---------- composite / mirrors ----------
  const energyRaw =
    rhythmIntensity * 0.45 +
    audioFeatures.beatHardness * 0.22 +
    euphoria * 0.18 +
    (tempoFeel === "fast" ? 14 : tempoFeel === "medium" ? 5 : 0);
  const estimatedEnergy = clamp(Math.round(energyRaw / 10), 1, 10);

  const emotionalIntensityScore = clamp(
    Math.round(melancholy * 0.35 + aggression * 0.35 + tension * 0.3),
    0,
    100,
  );
  const upliftScore = clamp(
    Math.round(50 + (euphoria - melancholy) * 0.5 + (emotionalWarmth - 50) * 0.25),
    0,
    100,
  );

  // ---------- analysis meta ----------
  const tags: string[] = [];
  if (hints.fast) tags.push("fast");
  if (hints.slow) tags.push("slow");
  if (hints.intimate) tags.push("intimate");
  if (hints.aggressive) tags.push("aggressive");
  if (hints.euphoric) tags.push("euphoric");
  if (hints.melancholic) tags.push("melancholic");
  if (hints.cinematic) tags.push("cinematic");
  if (hints.nostalgic) tags.push("nostalgic");
  if (hints.drop) tags.push("drop-oriented");
  if (hints.hooky) tags.push("hooky");
  if (hints.acoustic) tags.push("acoustic");

  const bestRoles: BestRole[] = [];
  if (rhythmIntensity < 45 && estimatedEnergy <= 5 && tempoFeel !== "fast" && aggression < 60) {
    bestRoles.push("intro");
  }
  if (estimatedEnergy >= 4 && estimatedEnergy <= 7 && (tension >= 50 || emotionalWarmth >= 55)) {
    bestRoles.push("build");
  }
  if (
    (estimatedEnergy >= 7 && rhythmIntensity >= 55) ||
    (rhythmIntensity >= 65 &&
      (audioFeatures.beatHardness >= 60 || cinematicScale >= 70 || euphoria >= 65))
  ) {
    bestRoles.push("peak");
  }
  if (estimatedEnergy <= 6 && rhythmIntensity <= 55 && resolution >= 35) {
    bestRoles.push("cooldown");
  }
  if (
    estimatedEnergy <= 5 &&
    rhythmIntensity <= 50 &&
    (resolution >= 55 || intimacy >= 55) &&
    aggression < 55
  ) {
    bestRoles.push("outro");
  }

  const analysis: AnalysisMeta = {
    confidence: confidenceFromHints(hints, input),
    tags,
    bestRoles,
    analysisSource: "prototype",
  };

  // ---------- pick UI labels ----------
  const moodLabel =
    PROTOTYPE_MOOD_LABELS[fnv1a(`${baseSeed}:moodlabel`) % PROTOTYPE_MOOD_LABELS.length]!;

  let flavorTags: string[] = [
    ...(PROTOTYPE_FLAVOR_GROUPS[fnv1a(`${baseSeed}:flavor`) % PROTOTYPE_FLAVOR_GROUPS.length] ?? [
      "reflective",
    ]),
  ];
  if (hints.intimate && !flavorTags.includes("intimate")) flavorTags.push("intimate");
  if (hints.cinematic && !flavorTags.includes("cinematic")) flavorTags.push("cinematic");
  if (hints.aggressive && !flavorTags.includes("aggressive")) flavorTags.push("aggressive");
  if (hints.nostalgic && !flavorTags.includes("nostalgic")) flavorTags.push("nostalgic");
  if (hints.acoustic && !flavorTags.includes("acoustic")) flavorTags.push("acoustic");
  flavorTags = flavorTags.slice(0, 4);

  const mood: MoodFeatures = {
    moodDarkness,
    emotionalWarmth,
    melancholy,
    euphoria,
    aggression,
    intimacy,
    cinematicScale,
    nostalgia,
    tension,
    resolution,
  };

  return {
    estimatedMood: moodLabel,
    estimatedEnergy,
    moodDarknessScore: moodDarkness,
    emotionalIntensityScore,
    upliftScore,
    tempoFeel,
    rhythmIntensityScore: rhythmIntensity,
    flavorTags,
    audioFeatures,
    mood,
    analysis,
  };
}

function confidenceFromHints(hints: MoodHints, input: PrototypeAnalysisInput): number {
  let confidence = 0.32;
  const hintCount = Object.values(hints).filter(Boolean).length;
  if (hintCount >= 1) confidence += 0.05 * Math.min(hintCount, 4);
  const a = input.artist.trim().toLowerCase();
  if (a && a !== "unknown artist" && a !== "unknown channel") {
    confidence += 0.05;
  }
  return Number(Math.min(0.7, Math.max(0, confidence)).toFixed(2));
}
