/**
 * Strategy-aware operations consumed by `transition-cost`, `role-scoring`, and
 * `sequence-playlist`. Everything in here takes a `FlowStrategy` (already
 * combined when the user picked two keywords) instead of raw keyword ids, which
 * keeps the call sites short and prevents `if (id === "...")` from leaking back
 * into the rest of the codebase.
 *
 * Helpers in this file:
 *  - `featureValue(track, key)`         — read a 0..100 feature off a track.
 *  - `strategyLateScore(track, s)`      — produces the "late-progress" score the
 *                                         primary sort uses; built from
 *                                         `strategy.progression`.
 *  - `strategyPeakScore(track, s)`      — fitness as a Peak slot.
 *  - `strategyLandingScore(track, s)`   — fitness as the closer.
 *  - `strategyIntroScore(track, s)`     — fitness as the opener.
 *  - `tempoRank(t)`                     — slow=0 / medium=1 / fast=2.
 *  - `phaseThresholdsForStrategy(s)`    — index thresholds for non-chaptered flows.
 */

import type { TempoFeel, TrackAnalysis } from "@/types/flowlist";
import type {
  EnergyBand,
  FlowStrategy,
} from "@/lib/flow-strategies";

export function tempoRank(t: TempoFeel): number {
  return t === "slow" ? 0 : t === "medium" ? 1 : 2;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Map an `EnergyBand` UI label to a 0..100 target value (centred on band). */
function bandTargetValue(band: EnergyBand | undefined): number | null {
  if (!band) return null;
  switch (band) {
    case "low":
      return 18;
    case "medium":
      return 50;
    case "high":
      return 80;
  }
}

/** All numeric features the strategy progression targets can read. */
export type FeatureKey =
  | "energy"
  | "rhythm"
  | "beatHardness"
  | "hookOrDropImpact"
  | "danceability"
  | "grooveStability"
  | "moodDarkness"
  | "warmth"
  | "euphoria"
  | "melancholy"
  | "aggression"
  | "intimacy"
  | "cinematicScale"
  | "resolution"
  | "tension"
  | "nostalgia";

/** Read a 0..100 feature from a track. `energy` is the only 1..10 mirror. */
export function featureValue(track: TrackAnalysis, key: FeatureKey): number {
  switch (key) {
    case "energy":
      return clamp(track.estimatedEnergy * 10, 0, 100);
    case "rhythm":
      return track.audioFeatures.rhythmIntensity;
    case "beatHardness":
      return track.audioFeatures.beatHardness;
    case "hookOrDropImpact":
      return track.audioFeatures.hookOrDropImpact;
    case "danceability":
      return track.audioFeatures.danceabilityFeel;
    case "grooveStability":
      return track.audioFeatures.grooveStability;
    case "moodDarkness":
      return track.mood.moodDarkness;
    case "warmth":
      return track.mood.emotionalWarmth;
    case "euphoria":
      return track.mood.euphoria;
    case "melancholy":
      return track.mood.melancholy;
    case "aggression":
      return track.mood.aggression;
    case "intimacy":
      return track.mood.intimacy;
    case "cinematicScale":
      return track.mood.cinematicScale;
    case "resolution":
      return track.mood.resolution;
    case "tension":
      return track.mood.tension;
    case "nostalgia":
      return track.mood.nostalgia;
  }
}

const PROGRESSION_KEYS: FeatureKey[] = [
  "energy",
  "rhythm",
  "beatHardness",
  "hookOrDropImpact",
  "danceability",
  "grooveStability",
  "moodDarkness",
  "warmth",
  "euphoria",
  "melancholy",
  "aggression",
  "intimacy",
  "cinematicScale",
  "resolution",
  "tension",
  "nostalgia",
];

/**
 * Compute a 0..100 "late-progress" score for a track under one strategy.
 *
 * Each progression target with weight `t` contributes:
 *   - `t > 0` (rising): higher feature → later in playlist
 *   - `t < 0` (falling): higher feature → earlier
 *   - `t === 0.5` (wave): use distance from middle (50)
 *
 * For wave / cluster-run / chaptered curves where progression is sparse, the
 * function falls back to a generic "midband" score so the primary sort is at
 * least sensible (cluster-run and chaptered both override ordering downstream
 * anyway).
 */
export function strategyLateScore(track: TrackAnalysis, strategy: FlowStrategy): number {
  let score = 0;
  let weight = 0;

  for (const key of PROGRESSION_KEYS) {
    const target = strategy.progression[key];
    if (typeof target !== "number" || target === 0) continue;
    const v = featureValue(track, key);
    const w = Math.abs(target);
    let contrib: number;
    if (target > 0) {
      contrib = v;
    } else if (target < 0) {
      contrib = 100 - v;
    } else {
      contrib = 50;
    }
    score += w * contrib;
    weight += w;
  }

  // Fallback for curves that don't drive ordering through progression.
  if (weight === 0) {
    if (strategy.curveType === "wave" || strategy.curveType === "cluster-run") {
      // Energy slope makes the cluster-run high tracks land in the upper tier.
      const energy = featureValue(track, "energy");
      return energy;
    }
    if (strategy.curveType === "loop" || strategy.curveType === "stability-focused") {
      // Place lower-rhythm earlier and higher-rhythm later, just as a soft default
      // — the smoothing pass will handle the real ordering.
      const rhythm = featureValue(track, "rhythm");
      return rhythm;
    }
    return 50;
  }
  return clamp(score / weight, 0, 100);
}

// ---------------------------------------------------------------------------
// Role scoring
// ---------------------------------------------------------------------------

function moodCueBonus(track: TrackAnalysis, cues: string[] | undefined, perCue = 4): number {
  if (!cues?.length) return 0;
  const hay = `${track.estimatedMood} ${track.flavorTags.join(" ")} ${track.analysis.tags.join(" ")}`.toLowerCase();
  let s = 0;
  for (const c of cues) {
    if (hay.includes(c.toLowerCase())) s += perCue;
  }
  return s;
}

/** Distance from band target (0..100). Smaller → bigger reward. */
function bandReward(value: number, band: EnergyBand | undefined, scale = 0.4): number {
  const target = bandTargetValue(band);
  if (target === null) return 0;
  // Reward up to `scale * 100` when value matches; falls off linearly.
  return Math.max(0, scale * 100 - Math.abs(value - target) * scale);
}

/** Higher = better fit to open the playlist. */
export function strategyIntroScore(track: TrackAnalysis, strategy: FlowStrategy): number {
  const t = track.audioFeatures.tempoFeel;
  let s =
    (10 - track.estimatedEnergy) * 4 +
    (100 - track.audioFeatures.rhythmIntensity) * 0.32 +
    track.mood.cinematicScale * 0.18 +
    track.mood.nostalgia * 0.1 +
    (t === "fast" ? -16 : t === "slow" ? 8 : 4);
  if (track.analysis.bestRoles.includes("intro")) s += 6;

  const open = strategy.preferredOpening;
  if (open) {
    s += bandReward(featureValue(track, "energy"), open.energy, 0.5);
    s += bandReward(featureValue(track, "rhythm"), open.rhythm, 0.4);
    s += moodCueBonus(track, open.mood);
  }

  // Strategies that want a low-energy / restrained opener
  // (Gentle Opening, Romantic Slow Burn, etc.) get extra penalty for early energy spikes.
  const eSpike = strategy.penalties.earlyEnergySpike ?? 0;
  if (eSpike > 0 && track.estimatedEnergy >= 7) s -= eSpike * 1.5;

  // Cluster-run flows actually want the opener to feel like the room "filling up"
  // (not the loudest track).
  if (strategy.flags.clusterRun) {
    if (track.estimatedEnergy <= 6) s += 3;
    s += track.audioFeatures.grooveStability * 0.08;
  }
  return s;
}

/** Higher = better fit for a Peak slot. */
export function strategyPeakScore(track: TrackAnalysis, strategy: FlowStrategy): number {
  const peak = strategy.preferredPeak;
  let s =
    track.estimatedEnergy * 4 +
    track.audioFeatures.rhythmIntensity * 0.32 +
    track.audioFeatures.beatHardness * 0.22 +
    track.mood.cinematicScale * 0.16 +
    track.mood.euphoria * 0.18;
  if (track.analysis.bestRoles.includes("peak")) s += 6;

  if (peak) {
    s += bandReward(featureValue(track, "energy"), peak.energy, 0.5);
    s += bandReward(featureValue(track, "rhythm"), peak.rhythm, 0.4);
    s += moodCueBonus(track, peak.mood, 5);
  }

  // Cluster-run flows reward physical, hard, danceable peaks.
  if (strategy.flags.clusterRun) {
    s += track.audioFeatures.beatHardness * 0.12 + track.audioFeatures.hookOrDropImpact * 0.1;
  }
  // Grand Finale: cinematic scale matters more than raw loudness.
  if (strategy.flags.grandFinale) {
    s += track.mood.cinematicScale * 0.2 + track.mood.tension * 0.1;
  }
  // Bridge/Surprise modes don't really have a peak — neutralise to keep median sane.
  if (strategy.curveType === "stability-focused" && !strategy.flags.clusterRun) {
    s *= 0.7;
  }

  // Romantic slow burn / lyrical focus / intimate peak flows: emotional > loud.
  if (peak?.mood?.includes("intimate") || peak?.mood?.includes("tension")) {
    s += track.mood.intimacy * 0.14 + track.mood.tension * 0.14;
    s -= track.mood.aggression * 0.1;
  }

  return s;
}

/** Higher = better fit for the closer / Outro band. */
export function strategyLandingScore(
  track: TrackAnalysis,
  strategy: FlowStrategy,
): number {
  const t = track.audioFeatures.tempoFeel;
  let s =
    (10 - track.estimatedEnergy) * 4 +
    (100 - track.audioFeatures.rhythmIntensity) * 0.42 +
    track.mood.resolution * 0.32 +
    track.mood.intimacy * 0.18 +
    track.mood.nostalgia * 0.12 +
    (100 - track.mood.aggression) * 0.15 +
    (t === "fast" ? -22 : t === "slow" ? 12 : 4);
  if (track.analysis.bestRoles.includes("outro")) s += 8;

  const end = strategy.preferredEnding;
  if (end) {
    s += bandReward(featureValue(track, "energy"), end.energy, 0.5);
    s += bandReward(featureValue(track, "rhythm"), end.rhythm, 0.5);
    s += moodCueBonus(track, end.mood, 5);
    if (end.resolutionBias) {
      s += track.mood.resolution * 0.18 + track.mood.intimacy * 0.1;
    }
  }

  if (strategy.flags.landingFocused) {
    if (track.audioFeatures.rhythmIntensity > 65) s -= 28;
    if (track.estimatedEnergy >= 8) s -= 28;
    if (track.mood.aggression >= 65) s -= 18;
  }

  // Grand Finale: the closer should be cinematic, NOT soft.
  if (strategy.flags.grandFinale) {
    s = track.mood.cinematicScale * 0.6 + track.estimatedEnergy * 4 + track.mood.tension * 0.18;
    if (track.estimatedEnergy <= 3) s -= 30;
  }

  // Soft-cue keyword bonus, useful for long-tail intimate strategies.
  const hay = `${track.estimatedMood} ${track.flavorTags.join(" ")}`.toLowerCase();
  for (const cue of [
    "reflect",
    "intimate",
    "nocturnal",
    "soft",
    "calm",
    "dream",
    "hush",
    "nostalgic",
    "melancholic",
    "glow",
  ]) {
    if (hay.includes(cue)) s += 3;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Phase thresholds
// ---------------------------------------------------------------------------

/**
 * Cumulative phase boundaries on normalized position (0–1):
 * `Intro | Build | Peak | Cooldown | Outro`.
 *
 * Strategy-aware: cluster-run flows narrow the peak band; landing-focused flows
 * stretch the cooldown/outro band; grand-finale pushes the peak deep into the
 * back third.
 */
export function phaseThresholdsForStrategy(strategy: FlowStrategy): [number, number, number, number] {
  let thresholds: [number, number, number, number];
  switch (strategy.curveType) {
    case "linear-rise":
    case "peak-centered":
      thresholds = [0.12, 0.45, 0.78, 0.92];
      break;
    case "linear-fall":
      thresholds = [0.1, 0.3, 0.5, 0.78];
      break;
    case "wave":
      thresholds = [0.12, 0.34, 0.6, 0.84];
      break;
    case "chaptered":
      // Ignored downstream — chapters override phase placement. Keep sane defaults.
      thresholds = [0.12, 0.36, 0.62, 0.86];
      break;
    case "landing-focused":
      thresholds = [0.12, 0.32, 0.5, 0.72];
      break;
    case "contrast-to-resolution":
      thresholds = [0.12, 0.36, 0.6, 0.82];
      break;
    case "stability-focused":
      thresholds = [0.16, 0.42, 0.62, 0.86];
      break;
    case "cluster-run":
      // Peak narrowed; cluster lives mid-playlist by default but lateLift bumps it.
      thresholds = [0.14, 0.38, 0.66, 0.88];
      break;
    case "loop":
      thresholds = [0.16, 0.42, 0.62, 0.84];
      break;
    default:
      thresholds = [0.12, 0.35, 0.58, 0.82];
  }

  if (strategy.flags.grandFinale) {
    thresholds = [thresholds[0], thresholds[1] + 0.05, thresholds[2] + 0.1, thresholds[3] + 0.05];
  }
  if (strategy.flags.clusterRun) {
    const mid = (thresholds[1] + thresholds[2]) / 2;
    thresholds = [
      thresholds[0],
      Math.max(0.16, mid - 0.08),
      Math.min(0.9, mid + 0.08),
      thresholds[3],
    ];
  }
  return thresholds;
}
