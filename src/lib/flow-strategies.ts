/**
 * Centralized flow strategy registry.
 *
 * Every flow keyword is paired with a `FlowStrategy` that fully describes how the
 * sequencer should treat that keyword. The sequencing engine, transition-cost
 * helpers, role scorers, and arc-summary generator all consume the resolved
 * strategy — there is **no** scattered `if (keywordId === ...)` logic anywhere
 * else in the codebase.
 *
 * Adding a new keyword now means:
 *  1. Add the keyword to `flow-presets.ts` (UI label, description).
 *  2. Add a matching `FlowStrategy` here.
 *  3. Done — sequencing, transitions, validations, and summaries pick it up.
 *
 * Two keywords selected at once are merged via `combineFlowStrategies`. The
 * combiner respects override priority for the structural curve (e.g. `chaptered`
 * dominates `landing-focused`), takes the *max* of restrictive penalties so
 * "No Sudden Jumps" + anything stays smooth, and OR-merges behaviour flags.
 */

import {
  PLAYLIST_TYPES,
  type FlowKeyword,
  type PlaylistType,
  type PlaylistTypeId,
} from "@/lib/flow-presets";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * High-level structural shape the strategy wants the playlist to follow.
 *
 *  - `linear-rise` / `linear-fall`: monotonic feature curve.
 *  - `wave`: alternating rises and releases.
 *  - `chaptered`: split into 4–6 internally coherent chapters.
 *  - `peak-centered`: build to one focal high section.
 *  - `landing-focused`: emphasise a soft / resolved closing section.
 *  - `contrast-to-resolution`: front-load tension/contrast, resolve at the end.
 *  - `stability-focused`: keep all features close to each other.
 *  - `cluster-run`: cluster the strongest "X" tracks (banger/peak) into a tight run.
 *  - `loop`: end where it can re-start without a jolt.
 */
export type FlowCurveType =
  | "linear-rise"
  | "linear-fall"
  | "wave"
  | "chaptered"
  | "peak-centered"
  | "landing-focused"
  | "contrast-to-resolution"
  | "stability-focused"
  | "cluster-run"
  | "loop";

/** Vibe of the explanation copy used in summaries / position reasons. */
export type FlowExplanationTone =
  | "journey"
  | "club"
  | "cinematic"
  | "intimate"
  | "focused"
  | "dramatic"
  | "playful";

/** 0–10 weights. Higher = the sequencer cares more about that dimension. */
export interface FlowPriorityWeights {
  transitionSmoothness: number;
  energyProgression: number;
  rhythmProgression: number;
  moodProgression: number;
  varietyPreservation: number;
  chapterCoherence: number;
  peakStrength: number;
  landingStrength: number;
  genreBridge: number;
  surpriseTolerance: number;
}

/** 0–10 penalties. Higher = bigger transition cost contribution for that delta. */
export interface FlowPenalties {
  tempoJump: number;
  energyJump: number;
  rhythmJump: number;
  aggressionJump: number;
  moodWhiplash: number;
  /** Extra penalty if the *late* part of the playlist still has high rhythm. */
  lateHighRhythm?: number;
  /** Extra penalty for spiking energy in the early part of the playlist. */
  earlyEnergySpike?: number;
}

export type EnergyBand = "low" | "medium" | "high";

export interface FlowOpeningPreference {
  energy?: EnergyBand;
  rhythm?: EnergyBand;
  /** Mood cue keywords matched against `track.flavorTags` and `estimatedMood`. */
  mood?: string[];
}
export interface FlowPeakPreference {
  energy?: "medium" | "high";
  rhythm?: "medium" | "high";
  mood?: string[];
}
export interface FlowEndingPreference {
  energy?: EnergyBand;
  rhythm?: EnergyBand;
  mood?: string[];
  /** When true, also reward `mood.resolution` for ending tracks. */
  resolutionBias?: boolean;
}

/**
 * Per-feature target direction across the playlist.
 *
 *  -  1   = high values should be late in the playlist (rising).
 *  - -1   = high values should be early (falling).
 *  -  0.5 = wave / alternating.
 *  -  0   = ignore for ordering.
 *
 * Weights between -1 and 1 are also valid (softer pulls).
 */
export interface FlowProgressionTargets {
  energy?: number;
  rhythm?: number;
  beatHardness?: number;
  hookOrDropImpact?: number;
  danceability?: number;
  grooveStability?: number;
  moodDarkness?: number;
  warmth?: number;
  euphoria?: number;
  melancholy?: number;
  aggression?: number;
  intimacy?: number;
  cinematicScale?: number;
  resolution?: number;
  tension?: number;
  nostalgia?: number;
}

/** Auxiliary behaviour flags (OR-merged when combining strategies). */
export interface FlowBehaviorFlags {
  /** Use chapter-based phase assignment instead of the index thresholds. */
  chaptered?: boolean;
  /** Cluster the strongest peak tracks into a contiguous run. */
  clusterRun?: boolean;
  /** Apply soft-landing tail logic (also triggered by curveType `landing-focused`). */
  landingFocused?: boolean;
  /** Final track must be the cinematic peak, not the soft track. */
  grandFinale?: boolean;
  /** Sequence should feel circular (Calm Loop). */
  loop?: boolean;
  /** Reward bridge tracks between contrasting neighbours (Genre Bridge). */
  bridgeMode?: boolean;
  /** Extra surprise tolerance — softer transition penalties. */
  surpriseAllowed?: boolean;
  /** Avoid placing too many low-motion tracks in a row (Road Trip Rock). */
  momentumRequired?: boolean;
  /** Final transition (last → first) should also feel smooth (Calm Loop). */
  loopBack?: boolean;
  /**
   * Conflict-resolved: cluster must land in the mid-section (≤60% through the
   * playlist), not near the end. Set when Banger Run + Soft Landing are both
   * selected, so the banger cluster never overrides the soft tail.
   */
  bangerClusterMidOnly?: boolean;
  /**
   * Energy Wave macro (multi-rise/release). OR-merged from `mixed_mess.energy_wave`
   * so the waveform passes still run even when Soft Landing dominates `curveType`.
   */
  waveMacro?: boolean;
}

// ---------------------------------------------------------------------------
// Combined strategy diagnostics
// ---------------------------------------------------------------------------

/**
 * Structural description of how two strategies were merged.
 *
 * When only one keyword is selected, trivial values are returned so the
 * downstream code always has a `diagnostics` object available.
 */
export interface CombinedStrategyDiagnostics {
  /** curveType that won in the combination (after conflict resolution). */
  dominantCurveType: FlowCurveType;
  /**
   * Which strategy provides the structural backbone after conflict resolution.
   *
   *  - `"chaptered"` — chapter-based segmentation drives phase assignment.
   *  - `"cluster-run"` — a tight cluster of peak tracks dominates the shape.
   *  - `"landing-focused"` — a soft/resolved ending dominates the final section.
   *  - `"standard"` — no single dominating structure; default phase thresholds.
   */
  dominantStructure: "chaptered" | "cluster-run" | "landing-focused" | "standard";
  /**
   * How the final section / final track was resolved.
   *
   *  - `"soft-landing"` — Soft Landing wins the final section.
   *  - `"grand-finale"` — Grand Finale wins the final track outright.
   *  - `"grand-finale-with-smooth-lead-in"` — Grand Finale takes the last track but
   *    Soft Landing shapes the penultimate approach.
   *  - `"banger-cluster-then-soft"` — Banger cluster sits in mid-section; soft tail
   *    is preserved at the end.
   *  - `"declining-intensity"` — playlist tapers down in energy/intensity through
   *    the end (Storm to Serenity).
   *  - `"standard"` — default from the primary strategy.
   */
  finalSectionPolicy:
    | "soft-landing"
    | "grand-finale"
    | "grand-finale-with-smooth-lead-in"
    | "banger-cluster-then-soft"
    | "declining-intensity"
    | "standard";
  /**
   * How strict transition penalties are after combining.
   *
   *  - `"strict"` — No Sudden Jumps or equivalent dominates; high penalty wall.
   *  - `"moderate"` — averaged penalties, no extreme permissiveness or restriction.
   *  - `"permissive"` — `surpriseAllowed` is active and no NSJ overrides it.
   */
  transitionStrictness: "strict" | "moderate" | "permissive";
  /** Human-readable notes about each conflict detected and how it was resolved. */
  conflictNotes: string[];
}

export interface FlowStrategy {
  /** Matches `FlowKeyword.id` exactly. */
  id: string;
  label: string;
  /** Playlist types this strategy is offered under. Usually one. */
  playlistTypeIds: PlaylistTypeId[];
  description: string;
  curveType: FlowCurveType;
  priorityWeights: FlowPriorityWeights;
  preferredOpening?: FlowOpeningPreference;
  preferredPeak?: FlowPeakPreference;
  preferredEnding?: FlowEndingPreference;
  penalties: FlowPenalties;
  progression: FlowProgressionTargets;
  explanationTone: FlowExplanationTone;
  flags: FlowBehaviorFlags;
  /** Tempo-smoothing multiplier (1 = neutral, 0–2). Same as legacy `FlowKeyword.smoothing`. */
  smoothing: number;
}

// ---------------------------------------------------------------------------
// Default strategy + builder
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHTS: FlowPriorityWeights = {
  transitionSmoothness: 5,
  energyProgression: 5,
  rhythmProgression: 5,
  moodProgression: 4,
  varietyPreservation: 3,
  chapterCoherence: 0,
  peakStrength: 5,
  landingStrength: 5,
  genreBridge: 0,
  surpriseTolerance: 4,
};

const DEFAULT_PENALTIES: FlowPenalties = {
  tempoJump: 4,
  energyJump: 4,
  rhythmJump: 4,
  aggressionJump: 4,
  moodWhiplash: 3,
};

const DEFAULT_PROGRESSION: FlowProgressionTargets = {};

const DEFAULT_FLAGS: FlowBehaviorFlags = {};

interface StrategyOverride {
  id: string;
  label: string;
  playlistTypeIds: PlaylistTypeId[];
  description: string;
  curveType: FlowCurveType;
  smoothing: number;
  explanationTone: FlowExplanationTone;
  priorityWeights?: Partial<FlowPriorityWeights>;
  penalties?: Partial<FlowPenalties>;
  progression?: FlowProgressionTargets;
  preferredOpening?: FlowOpeningPreference;
  preferredPeak?: FlowPeakPreference;
  preferredEnding?: FlowEndingPreference;
  flags?: FlowBehaviorFlags;
}

function mk(o: StrategyOverride): FlowStrategy {
  return {
    id: o.id,
    label: o.label,
    playlistTypeIds: o.playlistTypeIds,
    description: o.description,
    curveType: o.curveType,
    smoothing: o.smoothing,
    explanationTone: o.explanationTone,
    priorityWeights: { ...DEFAULT_WEIGHTS, ...(o.priorityWeights ?? {}) },
    penalties: { ...DEFAULT_PENALTIES, ...(o.penalties ?? {}) },
    progression: { ...DEFAULT_PROGRESSION, ...(o.progression ?? {}) },
    preferredOpening: o.preferredOpening,
    preferredPeak: o.preferredPeak,
    preferredEnding: o.preferredEnding,
    flags: { ...DEFAULT_FLAGS, ...(o.flags ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Registry — every keyword in flow-presets.ts has a strategy here
// ---------------------------------------------------------------------------

const STRATEGIES: FlowStrategy[] = [
  // ===================== Mixed Mess =====================
  mk({
    id: "mixed_mess.chaos_to_coherence",
    label: "Chaos to Coherence",
    playlistTypeIds: ["mixed_mess"],
    description:
      "Tames the sharpest jumps over time so the back half feels more coherent than the front.",
    curveType: "contrast-to-resolution",
    smoothing: 1.5,
    explanationTone: "journey",
    priorityWeights: {
      transitionSmoothness: 7,
      varietyPreservation: 6,
      genreBridge: 6,
      chapterCoherence: 5,
      surpriseTolerance: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 5 },
    progression: { resolution: 0.6, moodDarkness: 0, energy: 0.2 },
    flags: { bridgeMode: true, surpriseAllowed: true },
  }),
  mk({
    id: "mixed_mess.genre_bridge",
    label: "Genre Bridge",
    playlistTypeIds: ["mixed_mess"],
    description:
      "Treats genre, mood, and source differences as bridges — placing transitional tracks between contrasting neighbours.",
    curveType: "stability-focused",
    smoothing: 1.7,
    explanationTone: "journey",
    priorityWeights: {
      transitionSmoothness: 8,
      genreBridge: 9,
      varietyPreservation: 7,
      surpriseTolerance: 5,
    },
    penalties: { tempoJump: 6, energyJump: 5, rhythmJump: 5, aggressionJump: 6, moodWhiplash: 6 },
    flags: { bridgeMode: true },
    progression: {},
  }),
  mk({
    id: "mixed_mess.energy_wave",
    label: "Energy Wave",
    playlistTypeIds: ["mixed_mess"],
    description:
      "Alternates rise and release in waves rather than one slope — good for chaotic playlists where flat ordering is dull.",
    curveType: "wave",
    smoothing: 1.0,
    explanationTone: "playful",
    priorityWeights: {
      energyProgression: 7,
      rhythmProgression: 6,
      varietyPreservation: 6,
      transitionSmoothness: 4,
      surpriseTolerance: 6,
    },
    penalties: { tempoJump: 4, energyJump: 5, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 3 },
    progression: { energy: 0.5, rhythm: 0.5 },
    flags: { waveMacro: true },
  }),
  mk({
    id: "mixed_mess.mood_chapters",
    label: "Mood Chapters",
    playlistTypeIds: ["mixed_mess"],
    description:
      "Splits the playlist into 4–6 internally coherent chapters — bigger shifts happen between chapters, not inside them.",
    curveType: "chaptered",
    smoothing: 1.2,
    explanationTone: "journey",
    priorityWeights: {
      chapterCoherence: 9,
      transitionSmoothness: 6,
      moodProgression: 5,
      varietyPreservation: 5,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    flags: { chaptered: true },
    progression: {},
  }),
  mk({
    id: "mixed_mess.surprise_but_smooth",
    label: "Surprise but Smooth",
    playlistTypeIds: ["mixed_mess"],
    description:
      "Allows more contrast than other flows but cushions surprises with a shared tempo, warmth, or rhythm bridge.",
    curveType: "stability-focused",
    smoothing: 1.4,
    explanationTone: "playful",
    priorityWeights: {
      transitionSmoothness: 6,
      surpriseTolerance: 8,
      varietyPreservation: 7,
      genreBridge: 4,
    },
    penalties: { tempoJump: 3, energyJump: 4, rhythmJump: 3, aggressionJump: 4, moodWhiplash: 4 },
    flags: { surpriseAllowed: true, bridgeMode: true },
    progression: {},
  }),
  mk({
    id: "mixed_mess.soft_landing",
    label: "Soft Landing",
    playlistTypeIds: ["mixed_mess"],
    description:
      "Shapes the closing stretch toward calmer rhythm, lower energy, and resolved mood.",
    curveType: "landing-focused",
    smoothing: 1.3,
    explanationTone: "intimate",
    priorityWeights: {
      landingStrength: 9,
      transitionSmoothness: 6,
      moodProgression: 5,
      energyProgression: 6,
      rhythmProgression: 6,
    },
    penalties: {
      tempoJump: 4,
      energyJump: 4,
      rhythmJump: 4,
      aggressionJump: 5,
      moodWhiplash: 4,
      lateHighRhythm: 8,
    },
    progression: {
      energy: -0.7,
      rhythm: -0.7,
      aggression: -0.5,
      resolution: 0.7,
      intimacy: 0.4,
    },
    preferredEnding: {
      energy: "low",
      rhythm: "low",
      mood: ["reflective", "intimate", "calm", "nocturnal"],
      resolutionBias: true,
    },
    flags: { landingFocused: true },
  }),

  // ===================== Hip-Hop / Rap =====================
  mk({
    id: "hip_hop.banger_run",
    label: "Banger Run",
    playlistTypeIds: ["hip_hop"],
    description:
      "Stacks the hardest beat hardness, rhythm, and aggression into a focused central run.",
    curveType: "cluster-run",
    smoothing: 0.9,
    explanationTone: "club",
    priorityWeights: {
      peakStrength: 9,
      rhythmProgression: 7,
      energyProgression: 7,
      transitionSmoothness: 4,
      surpriseTolerance: 5,
    },
    penalties: { tempoJump: 3, energyJump: 4, rhythmJump: 3, aggressionJump: 3, moodWhiplash: 3 },
    preferredPeak: { energy: "high", rhythm: "high", mood: ["aggressive", "driving"] },
    progression: { energy: 0.4, rhythm: 0.5, beatHardness: 0.6 },
    flags: { clusterRun: true },
  }),
  mk({
    id: "hip_hop.dark_to_victory",
    label: "Dark to Victory",
    playlistTypeIds: ["hip_hop"],
    description:
      "Starts in heavier or darker territory and lifts into confident, triumphant tracks.",
    curveType: "linear-rise",
    smoothing: 1.0,
    explanationTone: "journey",
    priorityWeights: {
      moodProgression: 8,
      energyProgression: 6,
      peakStrength: 7,
      landingStrength: 4,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    preferredOpening: { mood: ["dark", "shadowed", "aggressive"] },
    preferredEnding: { mood: ["uplifting", "euphoric", "confident"], resolutionBias: true },
    progression: {
      moodDarkness: -0.7,
      euphoria: 0.6,
      resolution: 0.5,
      energy: 0.3,
    },
  }),
  mk({
    id: "hip_hop.aggressive_to_reflective",
    label: "Aggressive to Reflective",
    playlistTypeIds: ["hip_hop"],
    description:
      "Front-loads aggression and drops it gradually so the outro lands somewhere introspective.",
    curveType: "linear-fall",
    smoothing: 1.1,
    explanationTone: "intimate",
    priorityWeights: {
      moodProgression: 8,
      energyProgression: 6,
      landingStrength: 7,
      transitionSmoothness: 5,
    },
    penalties: { tempoJump: 4, energyJump: 5, rhythmJump: 5, aggressionJump: 6, moodWhiplash: 4 },
    preferredOpening: { energy: "high", mood: ["aggressive", "intense"] },
    preferredEnding: {
      energy: "low",
      mood: ["reflective", "intimate", "melancholic"],
      resolutionBias: true,
    },
    progression: { aggression: -0.7, energy: -0.4, intimacy: 0.5, melancholy: 0.4, resolution: 0.4 },
    flags: { landingFocused: true },
  }),
  mk({
    id: "hip_hop.club_peak",
    label: "Club Peak",
    playlistTypeIds: ["hip_hop"],
    description:
      "Builds toward a central or back-third peak of danceable, beat-heavy, hook-loaded tracks.",
    curveType: "peak-centered",
    smoothing: 0.9,
    explanationTone: "club",
    priorityWeights: {
      peakStrength: 9,
      rhythmProgression: 7,
      energyProgression: 7,
      transitionSmoothness: 5,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 3 },
    preferredPeak: { energy: "high", rhythm: "high" },
    progression: { energy: 0.5, rhythm: 0.6, hookOrDropImpact: 0.6 },
    flags: { clusterRun: true },
  }),
  mk({
    id: "hip_hop.late_night_rap_arc",
    label: "Late-night Rap Arc",
    playlistTypeIds: ["hip_hop"],
    description: "Darker, smoother, mid-tempo nocturnal flow — avoids harsh bright jumps.",
    curveType: "stability-focused",
    smoothing: 1.4,
    explanationTone: "intimate",
    priorityWeights: {
      transitionSmoothness: 7,
      moodProgression: 5,
      varietyPreservation: 4,
      landingStrength: 6,
    },
    penalties: { tempoJump: 5, energyJump: 5, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 5 },
    preferredOpening: { mood: ["nocturnal", "shadowed"] },
    preferredEnding: { mood: ["reflective", "shadowed"] },
    progression: { intimacy: 0.4, moodDarkness: 0.2 },
  }),
  mk({
    id: "hip_hop.lyrical_focus",
    label: "Lyrical Focus",
    playlistTypeIds: ["hip_hop"],
    description:
      "Sequences around storytelling weight — emotional intensity, intimacy, tension — not raw energy.",
    curveType: "peak-centered",
    smoothing: 1.2,
    explanationTone: "intimate",
    priorityWeights: {
      moodProgression: 7,
      peakStrength: 7,
      transitionSmoothness: 6,
      energyProgression: 3,
    },
    penalties: { tempoJump: 4, energyJump: 3, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 5 },
    preferredPeak: { mood: ["cinematic", "emotional", "tension"] },
    progression: { tension: 0.5, intimacy: 0.4, melancholy: 0.3, cinematicScale: 0.4 },
  }),

  // ===================== R&B / Soul =====================
  mk({
    id: "rnb_soul.romantic_slow_burn",
    label: "Romantic Slow Burn",
    playlistTypeIds: ["rnb_soul"],
    description:
      "Avoids huge early jumps and builds intimacy, warmth, and tension toward an emotional peak.",
    curveType: "linear-rise",
    smoothing: 1.4,
    explanationTone: "intimate",
    priorityWeights: {
      transitionSmoothness: 7,
      moodProgression: 8,
      peakStrength: 6,
      varietyPreservation: 3,
      landingStrength: 5,
    },
    penalties: {
      tempoJump: 6,
      energyJump: 6,
      rhythmJump: 5,
      aggressionJump: 6,
      moodWhiplash: 4,
      earlyEnergySpike: 6,
    },
    preferredPeak: { mood: ["intimate", "tension", "warm"] },
    progression: { intimacy: 0.7, warmth: 0.5, tension: 0.4, energy: 0.2 },
  }),
  mk({
    id: "rnb_soul.heartbreak_to_closure",
    label: "Heartbreak to Closure",
    playlistTypeIds: ["rnb_soul"],
    description:
      "Begins in melancholy and tension; gradually moves toward acceptance, warmth, and resolution.",
    curveType: "contrast-to-resolution",
    smoothing: 1.3,
    explanationTone: "intimate",
    priorityWeights: {
      moodProgression: 8,
      landingStrength: 7,
      transitionSmoothness: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    preferredOpening: { mood: ["melancholic", "tension"] },
    preferredEnding: { mood: ["resolved", "warm"], resolutionBias: true },
    progression: { melancholy: -0.6, tension: -0.4, resolution: 0.7, warmth: 0.5 },
    flags: { landingFocused: true },
  }),
  mk({
    id: "rnb_soul.late_night_intimacy",
    label: "Late-night Intimacy",
    playlistTypeIds: ["rnb_soul"],
    description: "Smooth, warm, close — penalises abrupt rhythm or tempo spikes.",
    curveType: "stability-focused",
    smoothing: 1.7,
    explanationTone: "intimate",
    priorityWeights: {
      transitionSmoothness: 9,
      moodProgression: 5,
      varietyPreservation: 3,
    },
    penalties: { tempoJump: 7, energyJump: 6, rhythmJump: 7, aggressionJump: 7, moodWhiplash: 5 },
    progression: { intimacy: 0.3, warmth: 0.2, aggression: -0.3 },
  }),
  mk({
    id: "rnb_soul.desire_to_distance",
    label: "Desire to Distance",
    playlistTypeIds: ["rnb_soul"],
    description: "Starts close and intimate, then drifts into reflection and emotional distance.",
    curveType: "linear-fall",
    smoothing: 1.3,
    explanationTone: "intimate",
    priorityWeights: {
      moodProgression: 8,
      transitionSmoothness: 6,
      landingStrength: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 5, aggressionJump: 5, moodWhiplash: 4 },
    preferredOpening: { mood: ["intimate", "warm"] },
    preferredEnding: { mood: ["reflective", "cool"], resolutionBias: true },
    progression: { intimacy: -0.5, resolution: 0.5, warmth: -0.2 },
  }),
  mk({
    id: "rnb_soul.smooth_vocal_journey",
    label: "Smooth Vocal Journey",
    playlistTypeIds: ["rnb_soul"],
    description: "Maximises continuity — tempo, warmth, low aggression. No harsh beats between softs.",
    curveType: "stability-focused",
    smoothing: 1.6,
    explanationTone: "intimate",
    priorityWeights: {
      transitionSmoothness: 9,
      moodProgression: 5,
      varietyPreservation: 3,
      surpriseTolerance: 2,
    },
    penalties: { tempoJump: 7, energyJump: 6, rhythmJump: 7, aggressionJump: 7, moodWhiplash: 6 },
    progression: { warmth: 0.2 },
  }),
  mk({
    id: "rnb_soul.after_hours_arc",
    label: "After Hours Arc",
    playlistTypeIds: ["rnb_soul"],
    description: "Darker, nocturnal, cinematic — builds into a late-night peak then descends to reflection.",
    curveType: "peak-centered",
    smoothing: 1.2,
    explanationTone: "intimate",
    priorityWeights: {
      moodProgression: 7,
      peakStrength: 7,
      transitionSmoothness: 6,
      landingStrength: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 5, aggressionJump: 6, moodWhiplash: 4 },
    preferredPeak: { mood: ["cinematic", "tension", "shadowed"] },
    progression: { moodDarkness: 0.4, tension: 0.5, cinematicScale: 0.5, intimacy: 0.3 },
  }),

  // ===================== Pop / Dance =====================
  mk({
    id: "pop_dance.feel_good_rise",
    label: "Feel-good Rise",
    playlistTypeIds: ["pop_dance"],
    description: "Gradually lifts brightness, warmth, euphoria, and energy.",
    curveType: "linear-rise",
    smoothing: 1.1,
    explanationTone: "playful",
    priorityWeights: {
      moodProgression: 7,
      energyProgression: 7,
      peakStrength: 5,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    preferredEnding: { mood: ["uplifting", "euphoric"], resolutionBias: true },
    progression: { euphoria: 0.6, warmth: 0.5, moodDarkness: -0.4, energy: 0.4 },
  }),
  mk({
    id: "pop_dance.sing_along_peak",
    label: "Sing-along Peak",
    playlistTypeIds: ["pop_dance"],
    description: "Builds toward the biggest hooks and most memorable choruses.",
    curveType: "peak-centered",
    smoothing: 0.9,
    explanationTone: "playful",
    priorityWeights: {
      peakStrength: 9,
      rhythmProgression: 6,
      moodProgression: 5,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 3 },
    preferredPeak: { mood: ["euphoric", "uplifting"] },
    progression: { hookOrDropImpact: 0.7, euphoria: 0.5, energy: 0.4 },
    flags: { clusterRun: true },
  }),
  mk({
    id: "pop_dance.bright_to_bittersweet",
    label: "Bright to Bittersweet",
    playlistTypeIds: ["pop_dance"],
    description: "Starts shiny and euphoric, slowly reveals melancholy or nostalgia.",
    curveType: "linear-fall",
    smoothing: 1.1,
    explanationTone: "journey",
    priorityWeights: { moodProgression: 8, transitionSmoothness: 5 },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 4 },
    progression: { euphoria: -0.5, melancholy: 0.5, nostalgia: 0.5, moodDarkness: 0.3 },
  }),
  mk({
    id: "pop_dance.dance_pop_build",
    label: "Dance-pop Build",
    playlistTypeIds: ["pop_dance"],
    description: "Increases danceability and rhythm intensity into a danceable peak.",
    curveType: "linear-rise",
    smoothing: 1.0,
    explanationTone: "club",
    priorityWeights: {
      rhythmProgression: 8,
      energyProgression: 7,
      peakStrength: 7,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 3 },
    preferredPeak: { rhythm: "high", energy: "high" },
    progression: { rhythm: 0.6, danceability: 0.6, energy: 0.4 },
  }),
  mk({
    id: "pop_dance.main_character_arc",
    label: "Main Character Arc",
    playlistTypeIds: ["pop_dance"],
    description: "A confident, cinematic pop curve — stylish open, confident peak, polished lift.",
    curveType: "peak-centered",
    smoothing: 1.1,
    explanationTone: "cinematic",
    priorityWeights: {
      moodProgression: 7,
      peakStrength: 7,
      landingStrength: 5,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 4 },
    preferredPeak: { mood: ["cinematic", "euphoric"] },
    progression: { euphoria: 0.5, cinematicScale: 0.5, resolution: 0.4, energy: 0.3 },
  }),
  mk({
    id: "pop_dance.uplifting_finish",
    label: "Uplifting Finish",
    playlistTypeIds: ["pop_dance"],
    description: "Reserves brightness, warmth, and resolution for the closing stretch.",
    curveType: "linear-rise",
    smoothing: 1.0,
    explanationTone: "playful",
    priorityWeights: {
      moodProgression: 7,
      energyProgression: 5,
      landingStrength: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 3 },
    preferredEnding: { mood: ["uplifting", "warm", "euphoric"], resolutionBias: true },
    progression: { euphoria: 0.6, warmth: 0.5, resolution: 0.5 },
  }),

  // ===================== Rock / Alternative =====================
  mk({
    id: "rock_alt.slow_burn_to_anthem",
    label: "Slow Burn to Anthem",
    playlistTypeIds: ["rock_alt"],
    description: "Restrained open; gradually intensifies into anthem-like cathartic peak.",
    curveType: "peak-centered",
    smoothing: 1.0,
    explanationTone: "dramatic",
    priorityWeights: {
      energyProgression: 7,
      rhythmProgression: 7,
      peakStrength: 9,
      moodProgression: 5,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 4 },
    preferredPeak: { energy: "high", rhythm: "high", mood: ["cathartic", "cinematic"] },
    progression: { energy: 0.6, rhythm: 0.5, beatHardness: 0.5, cinematicScale: 0.4 },
    flags: { clusterRun: true },
  }),
  mk({
    id: "rock_alt.angst_to_release",
    label: "Angst to Release",
    playlistTypeIds: ["rock_alt"],
    description: "Begins tense and aggressive; resolves into catharsis or release.",
    curveType: "contrast-to-resolution",
    smoothing: 0.9,
    explanationTone: "dramatic",
    priorityWeights: {
      moodProgression: 8,
      peakStrength: 7,
      landingStrength: 6,
      surpriseTolerance: 5,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 5 },
    preferredOpening: { mood: ["tense", "aggressive", "dark"] },
    preferredEnding: { mood: ["cathartic", "resolved"], resolutionBias: true },
    progression: { tension: -0.5, aggression: -0.5, resolution: 0.6, cinematicScale: 0.3 },
  }),
  mk({
    id: "rock_alt.guitar_energy_rise",
    label: "Guitar Energy Rise",
    playlistTypeIds: ["rock_alt"],
    description: "Uses beat hardness and rhythm intensity as proxies for instrumental drive.",
    curveType: "linear-rise",
    smoothing: 1.0,
    explanationTone: "dramatic",
    priorityWeights: {
      rhythmProgression: 8,
      energyProgression: 7,
      peakStrength: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 3 },
    progression: { rhythm: 0.7, beatHardness: 0.7, energy: 0.5 },
  }),
  mk({
    id: "rock_alt.emotional_catharsis",
    label: "Emotional Catharsis",
    playlistTypeIds: ["rock_alt"],
    description: "Tension + intensity climbs; the peak releases into resolution.",
    curveType: "contrast-to-resolution",
    smoothing: 0.9,
    explanationTone: "dramatic",
    priorityWeights: {
      moodProgression: 8,
      peakStrength: 8,
      landingStrength: 6,
      surpriseTolerance: 5,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 5 },
    preferredPeak: { mood: ["tension", "cathartic", "cinematic"] },
    progression: { tension: 0.4, cinematicScale: 0.5, resolution: 0.5 },
    flags: { clusterRun: true },
  }),
  mk({
    id: "rock_alt.road_trip_rock",
    label: "Road Trip Rock",
    playlistTypeIds: ["rock_alt"],
    description: "Forward momentum — avoids long stops or low-motion stretches.",
    curveType: "stability-focused",
    smoothing: 1.4,
    explanationTone: "playful",
    priorityWeights: {
      transitionSmoothness: 6,
      energyProgression: 6,
      varietyPreservation: 4,
    },
    penalties: { tempoJump: 5, energyJump: 5, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 4 },
    progression: { energy: 0.2, rhythm: 0.2 },
    flags: { momentumRequired: true },
  }),
  mk({
    id: "rock_alt.acoustic_landing",
    label: "Acoustic Landing",
    playlistTypeIds: ["rock_alt"],
    description: "Ends stripped-back — lower beats, lower aggression, higher intimacy and resolution.",
    curveType: "landing-focused",
    smoothing: 1.3,
    explanationTone: "intimate",
    priorityWeights: {
      landingStrength: 9,
      moodProgression: 6,
      transitionSmoothness: 6,
    },
    penalties: {
      tempoJump: 4,
      energyJump: 4,
      rhythmJump: 4,
      aggressionJump: 6,
      moodWhiplash: 4,
      lateHighRhythm: 7,
    },
    preferredEnding: {
      energy: "low",
      rhythm: "low",
      mood: ["acoustic", "intimate", "reflective"],
      resolutionBias: true,
    },
    progression: { energy: -0.5, rhythm: -0.5, beatHardness: -0.5, intimacy: 0.5, resolution: 0.5 },
    flags: { landingFocused: true },
  }),

  // ===================== Electronic / Club =====================
  mk({
    id: "electronic_club.warm_up_to_peak",
    label: "Warm-up to Peak",
    playlistTypeIds: ["electronic_club"],
    description: "Classic DJ curve — moderate open, smooth rhythm rise into the strongest section.",
    curveType: "peak-centered",
    smoothing: 1.1,
    explanationTone: "club",
    priorityWeights: {
      rhythmProgression: 8,
      energyProgression: 7,
      peakStrength: 9,
      transitionSmoothness: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 3, moodWhiplash: 3 },
    preferredPeak: { rhythm: "high", energy: "high" },
    progression: { rhythm: 0.6, danceability: 0.6, energy: 0.5, beatHardness: 0.4 },
    flags: { clusterRun: true },
  }),
  mk({
    id: "electronic_club.drop_journey",
    label: "Drop Journey",
    playlistTypeIds: ["electronic_club"],
    description: "Arranges around tension and release — peaks land on hook/drop impact.",
    curveType: "peak-centered",
    smoothing: 0.8,
    explanationTone: "club",
    priorityWeights: {
      peakStrength: 9,
      rhythmProgression: 7,
      surpriseTolerance: 6,
    },
    penalties: { tempoJump: 3, energyJump: 4, rhythmJump: 3, aggressionJump: 3, moodWhiplash: 3 },
    preferredPeak: { rhythm: "high", energy: "high" },
    progression: { hookOrDropImpact: 0.7, tension: 0.4, rhythm: 0.5 },
    flags: { clusterRun: true, surpriseAllowed: true },
  }),
  mk({
    id: "electronic_club.hypnotic_pulse",
    label: "Hypnotic Pulse",
    playlistTypeIds: ["electronic_club"],
    description: "Tempo, rhythm, and groove stay near-constant — sudden changes are very expensive.",
    curveType: "stability-focused",
    smoothing: 1.9,
    explanationTone: "focused",
    priorityWeights: {
      transitionSmoothness: 10,
      varietyPreservation: 2,
      surpriseTolerance: 1,
    },
    penalties: { tempoJump: 9, energyJump: 7, rhythmJump: 9, aggressionJump: 6, moodWhiplash: 5 },
    progression: {},
  }),
  mk({
    id: "electronic_club.dark_club_arc",
    label: "Dark Club Arc",
    playlistTypeIds: ["electronic_club"],
    description: "Maintains physical rhythm in a darker, late-night register.",
    curveType: "stability-focused",
    smoothing: 1.2,
    explanationTone: "club",
    priorityWeights: {
      rhythmProgression: 7,
      moodProgression: 6,
      transitionSmoothness: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 4, moodWhiplash: 4 },
    progression: { moodDarkness: 0.3, rhythm: 0.4, danceability: 0.4 },
  }),
  mk({
    id: "electronic_club.euphoric_release",
    label: "Euphoric Release",
    playlistTypeIds: ["electronic_club"],
    description: "Builds toward bright, expansive emotional highs.",
    curveType: "peak-centered",
    smoothing: 1.0,
    explanationTone: "club",
    priorityWeights: {
      moodProgression: 7,
      peakStrength: 8,
      energyProgression: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 3, moodWhiplash: 3 },
    preferredPeak: { mood: ["euphoric", "uplifting"] },
    progression: { euphoria: 0.7, warmth: 0.4, danceability: 0.4 },
    flags: { clusterRun: true },
  }),
  mk({
    id: "electronic_club.cooldown_set",
    label: "Cooldown Set",
    playlistTypeIds: ["electronic_club"],
    description: "After a peak, gradually reduces rhythm, beats, and danceability.",
    curveType: "landing-focused",
    smoothing: 1.4,
    explanationTone: "intimate",
    priorityWeights: {
      landingStrength: 9,
      energyProgression: 6,
      rhythmProgression: 6,
      transitionSmoothness: 7,
    },
    penalties: {
      tempoJump: 5,
      energyJump: 5,
      rhythmJump: 5,
      aggressionJump: 5,
      moodWhiplash: 4,
      lateHighRhythm: 8,
    },
    progression: { rhythm: -0.6, beatHardness: -0.5, energy: -0.5, intimacy: 0.4, resolution: 0.4 },
    flags: { landingFocused: true },
  }),

  // ===================== Classical / Orchestral =====================
  mk({
    id: "classical_score.gentle_opening",
    label: "Gentle Opening",
    playlistTypeIds: ["classical_score"],
    description: "Begins with space, softness, and restraint before larger movement appears.",
    curveType: "linear-rise",
    smoothing: 1.4,
    explanationTone: "cinematic",
    priorityWeights: {
      transitionSmoothness: 7,
      energyProgression: 5,
      moodProgression: 5,
      peakStrength: 5,
    },
    penalties: {
      tempoJump: 5,
      energyJump: 5,
      rhythmJump: 5,
      aggressionJump: 5,
      moodWhiplash: 4,
      earlyEnergySpike: 7,
    },
    preferredOpening: { energy: "low", rhythm: "low", mood: ["cinematic", "calm"] },
    progression: { energy: 0.4, cinematicScale: 0.4 },
  }),
  mk({
    id: "classical_score.tension_and_release",
    label: "Tension and Release",
    playlistTypeIds: ["classical_score"],
    description: "Shapes the playlist around pressure, suspense, and resolution.",
    curveType: "contrast-to-resolution",
    smoothing: 0.9,
    explanationTone: "cinematic",
    priorityWeights: {
      moodProgression: 8,
      peakStrength: 7,
      landingStrength: 6,
      surpriseTolerance: 5,
    },
    penalties: { tempoJump: 5, energyJump: 5, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 5 },
    preferredPeak: { mood: ["tension", "cinematic"] },
    preferredEnding: { mood: ["resolved"], resolutionBias: true },
    progression: { tension: 0.3, cinematicScale: 0.5, resolution: 0.5 },
  }),
  mk({
    id: "classical_score.grand_finale",
    label: "Grand Finale",
    playlistTypeIds: ["classical_score"],
    description: "Builds toward the most expansive, dramatic closing track.",
    curveType: "peak-centered",
    smoothing: 1.0,
    explanationTone: "cinematic",
    priorityWeights: {
      peakStrength: 9,
      moodProgression: 7,
      transitionSmoothness: 5,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    preferredEnding: { mood: ["cinematic", "expansive"], resolutionBias: false },
    progression: { cinematicScale: 0.8, energy: 0.5, tension: 0.4 },
    flags: { grandFinale: true, clusterRun: true },
  }),
  mk({
    id: "classical_score.dramatic_arc",
    label: "Dramatic Arc",
    playlistTypeIds: ["classical_score"],
    description: "Full narrative movement — multiple chapters with contrast and resolution.",
    curveType: "chaptered",
    smoothing: 1.0,
    explanationTone: "dramatic",
    priorityWeights: {
      chapterCoherence: 8,
      moodProgression: 7,
      peakStrength: 7,
      transitionSmoothness: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    progression: { cinematicScale: 0.4, tension: 0.2, resolution: 0.3 },
    flags: { chaptered: true },
  }),
  mk({
    id: "classical_score.melancholy_to_resolution",
    label: "Melancholy to Resolution",
    playlistTypeIds: ["classical_score"],
    description: "Moves from sorrow toward emotional settlement.",
    curveType: "contrast-to-resolution",
    smoothing: 1.2,
    explanationTone: "cinematic",
    priorityWeights: {
      moodProgression: 8,
      landingStrength: 7,
      transitionSmoothness: 6,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    preferredEnding: { mood: ["resolved", "warm"], resolutionBias: true },
    progression: { melancholy: -0.6, resolution: 0.7, warmth: 0.4 },
    flags: { landingFocused: true },
  }),
  mk({
    id: "classical_score.storm_to_serenity",
    label: "Storm to Serenity",
    playlistTypeIds: ["classical_score"],
    description: "Begins with force or darkness, arrives at calm and resolution.",
    curveType: "linear-fall",
    smoothing: 1.2,
    explanationTone: "cinematic",
    priorityWeights: {
      energyProgression: 7,
      moodProgression: 8,
      landingStrength: 7,
    },
    penalties: {
      tempoJump: 4,
      energyJump: 5,
      rhythmJump: 5,
      aggressionJump: 6,
      moodWhiplash: 4,
      lateHighRhythm: 6,
    },
    preferredOpening: { energy: "high", mood: ["dark", "intense"] },
    preferredEnding: { energy: "low", mood: ["serene", "resolved"], resolutionBias: true },
    progression: {
      energy: -0.6,
      rhythm: -0.5,
      aggression: -0.6,
      moodDarkness: -0.5,
      resolution: 0.6,
    },
    flags: { landingFocused: true },
  }),

  // ===================== Jazz / Blues =====================
  mk({
    id: "jazz_blues.smoky_night",
    label: "Smoky Night",
    playlistTypeIds: ["jazz_blues"],
    description: "Lounge-like continuity — warm, intimate, low-to-medium energy.",
    curveType: "stability-focused",
    smoothing: 1.5,
    explanationTone: "intimate",
    priorityWeights: {
      transitionSmoothness: 8,
      moodProgression: 5,
      varietyPreservation: 4,
    },
    penalties: { tempoJump: 5, energyJump: 5, rhythmJump: 5, aggressionJump: 6, moodWhiplash: 4 },
    progression: { warmth: 0.3, intimacy: 0.3 },
  }),
  mk({
    id: "jazz_blues.cool_to_warm",
    label: "Cool to Warm",
    playlistTypeIds: ["jazz_blues"],
    description: "Restrained open, gradually expressive and warmer.",
    curveType: "linear-rise",
    smoothing: 1.2,
    explanationTone: "journey",
    priorityWeights: { moodProgression: 8, transitionSmoothness: 6, energyProgression: 5 },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    progression: { warmth: 0.7, energy: 0.3, intimacy: 0.4 },
  }),
  mk({
    id: "jazz_blues.improvisation_journey",
    label: "Improvisation Journey",
    playlistTypeIds: ["jazz_blues"],
    description: "Allows movement and expressive contrast while keeping the groove compatible.",
    curveType: "wave",
    smoothing: 1.1,
    explanationTone: "journey",
    priorityWeights: {
      varietyPreservation: 6,
      transitionSmoothness: 6,
      surpriseTolerance: 5,
      chapterCoherence: 3,
    },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    progression: { rhythm: 0.5, energy: 0.5 },
    flags: { surpriseAllowed: true },
  }),
  mk({
    id: "jazz_blues.swing_build",
    label: "Swing Build",
    playlistTypeIds: ["jazz_blues"],
    description: "Increases rhythmic life and looseness while keeping warmth.",
    curveType: "linear-rise",
    smoothing: 1.2,
    explanationTone: "playful",
    priorityWeights: { rhythmProgression: 8, energyProgression: 6, moodProgression: 5 },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 3 },
    progression: { rhythm: 0.7, danceability: 0.5, warmth: 0.3 },
  }),
  mk({
    id: "jazz_blues.blue_mood_to_warm_resolution",
    label: "Blue Mood to Warm Resolution",
    playlistTypeIds: ["jazz_blues"],
    description: "Begins bluesy and melancholic, lands warmer and resolved.",
    curveType: "contrast-to-resolution",
    smoothing: 1.3,
    explanationTone: "intimate",
    priorityWeights: { moodProgression: 8, landingStrength: 7, transitionSmoothness: 6 },
    penalties: { tempoJump: 4, energyJump: 4, rhythmJump: 4, aggressionJump: 5, moodWhiplash: 4 },
    preferredOpening: { mood: ["melancholic", "blue"] },
    preferredEnding: { mood: ["warm", "resolved"], resolutionBias: true },
    progression: { melancholy: -0.5, warmth: 0.5, resolution: 0.6 },
    flags: { landingFocused: true },
  }),
  mk({
    id: "jazz_blues.after_midnight_flow",
    label: "After Midnight Flow",
    playlistTypeIds: ["jazz_blues"],
    description: "Late-night intimate continuity — lower aggression, smoother transitions.",
    curveType: "stability-focused",
    smoothing: 1.6,
    explanationTone: "intimate",
    priorityWeights: { transitionSmoothness: 9, moodProgression: 5 },
    penalties: { tempoJump: 6, energyJump: 6, rhythmJump: 6, aggressionJump: 7, moodWhiplash: 5 },
    progression: { intimacy: 0.4, aggression: -0.3 },
  }),

  // ===================== Chill / Lo-fi / Ambient =====================
  mk({
    id: "chill_lofi.focus_flow",
    label: "Focus Flow",
    playlistTypeIds: ["chill_lofi"],
    description: "Stability-first — keeps rhythm and energy mostly constant for deep work.",
    curveType: "stability-focused",
    smoothing: 1.9,
    explanationTone: "focused",
    priorityWeights: {
      transitionSmoothness: 10,
      varietyPreservation: 1,
      surpriseTolerance: 1,
    },
    penalties: { tempoJump: 8, energyJump: 7, rhythmJump: 8, aggressionJump: 7, moodWhiplash: 6 },
    progression: {},
  }),
  mk({
    id: "chill_lofi.no_sudden_jumps",
    label: "No Sudden Jumps",
    playlistTypeIds: ["chill_lofi"],
    description: "Penalises every kind of jump — tempo, rhythm, energy — across the whole playlist.",
    curveType: "stability-focused",
    smoothing: 2.0,
    explanationTone: "focused",
    priorityWeights: {
      transitionSmoothness: 10,
      varietyPreservation: 1,
      surpriseTolerance: 0,
    },
    penalties: { tempoJump: 10, energyJump: 9, rhythmJump: 10, aggressionJump: 8, moodWhiplash: 7 },
    progression: {},
  }),
  mk({
    id: "chill_lofi.dreamy_drift",
    label: "Dreamy Drift",
    playlistTypeIds: ["chill_lofi"],
    description: "Gentle drift through warm, dreamy textures — never too sharp.",
    curveType: "stability-focused",
    smoothing: 1.7,
    explanationTone: "intimate",
    priorityWeights: {
      transitionSmoothness: 8,
      moodProgression: 5,
      varietyPreservation: 3,
    },
    penalties: { tempoJump: 6, energyJump: 6, rhythmJump: 6, aggressionJump: 7, moodWhiplash: 5 },
    progression: { warmth: 0.3, nostalgia: 0.3, aggression: -0.4 },
  }),
  mk({
    id: "chill_lofi.low_energy_continuity",
    label: "Low-energy Continuity",
    playlistTypeIds: ["chill_lofi"],
    description: "Keeps energy low-to-medium throughout. No strong peaks.",
    curveType: "stability-focused",
    smoothing: 1.7,
    explanationTone: "focused",
    priorityWeights: {
      transitionSmoothness: 9,
      energyProgression: 4,
      peakStrength: 1,
      varietyPreservation: 2,
    },
    penalties: { tempoJump: 6, energyJump: 7, rhythmJump: 6, aggressionJump: 7, moodWhiplash: 5 },
    progression: {},
  }),
  mk({
    id: "chill_lofi.calm_loop",
    label: "Calm Loop",
    playlistTypeIds: ["chill_lofi"],
    description: "Repeatable, circular feel — the closing track also fits back into the opening.",
    curveType: "loop",
    smoothing: 1.8,
    explanationTone: "focused",
    priorityWeights: {
      transitionSmoothness: 9,
      varietyPreservation: 2,
      landingStrength: 4,
    },
    penalties: { tempoJump: 7, energyJump: 6, rhythmJump: 7, aggressionJump: 6, moodWhiplash: 5 },
    progression: {},
    flags: { loop: true, loopBack: true },
  }),
  mk({
    id: "chill_lofi.gentle_fade",
    label: "Gentle Fade",
    playlistTypeIds: ["chill_lofi"],
    description: "Energy and rhythm dissolve toward the end rather than stopping abruptly.",
    curveType: "linear-fall",
    smoothing: 1.6,
    explanationTone: "intimate",
    priorityWeights: {
      landingStrength: 9,
      transitionSmoothness: 8,
      energyProgression: 6,
      rhythmProgression: 6,
    },
    penalties: {
      tempoJump: 5,
      energyJump: 5,
      rhythmJump: 5,
      aggressionJump: 6,
      moodWhiplash: 4,
      lateHighRhythm: 8,
    },
    preferredEnding: { energy: "low", rhythm: "low", resolutionBias: true },
    progression: {
      energy: -0.6,
      rhythm: -0.6,
      tension: -0.4,
      resolution: 0.5,
      intimacy: 0.3,
    },
    flags: { landingFocused: true },
  }),
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const STRATEGY_BY_ID: Map<string, FlowStrategy> = new Map(
  STRATEGIES.map((s) => [s.id, s]),
);

/**
 * Returns the strategy for a single keyword id, or `null` if unknown.
 *
 * `playlistType` is optional — useful if a future keyword id is shared across
 * types. With the current registry every keyword id is globally unique, so the
 * playlist type is only used as a fallback when an unrecognised id appears.
 */
export function getFlowStrategy(
  flowKeywordId: string | null | undefined,
  playlistType?: PlaylistType | PlaylistTypeId | null,
): FlowStrategy | null {
  if (!flowKeywordId) return null;
  const direct = STRATEGY_BY_ID.get(flowKeywordId);
  if (direct) return direct;
  // No fallback by playlist type yet — keep the API surface for later AI hints.
  void playlistType;
  return null;
}

export function getFlowStrategiesForPlaylistType(
  playlistTypeId: string | null | undefined,
): FlowStrategy[] {
  if (!playlistTypeId) return [];
  return STRATEGIES.filter((s) => s.playlistTypeIds.includes(playlistTypeId as PlaylistTypeId));
}

// ---------------------------------------------------------------------------
// Combine
// ---------------------------------------------------------------------------

/** Priority order when picking the dominant `curveType`. Earlier = wins. */
const CURVE_PRIORITY: FlowCurveType[] = [
  "chaptered",
  "cluster-run",
  "landing-focused",
  /** Energy Wave beats stability-focused so Genre Bridge cushions transitions without flattening crests/releases. */
  "wave",
  "stability-focused",
  "peak-centered",
  "loop",
  "linear-rise",
  "linear-fall",
  "contrast-to-resolution",
];

function dominantCurve(a: FlowCurveType, b: FlowCurveType): FlowCurveType {
  const ai = CURVE_PRIORITY.indexOf(a);
  const bi = CURVE_PRIORITY.indexOf(b);
  return ai <= bi ? a : b;
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

/**
 * Keyword ids involved in explicit conflict-resolution rules.
 *
 * Centralising the id strings here so a rename in flow-presets.ts will only
 * require an update in one place.
 */
const KID = {
  noSuddenJumps: "chill_lofi.no_sudden_jumps",
  surpriseButSmooth: "mixed_mess.surprise_but_smooth",
  moodChapters: "mixed_mess.mood_chapters",
  softLanding: "mixed_mess.soft_landing",
  grandFinale: "classical_score.grand_finale",
  bangerRun: "hip_hop.banger_run",
  stormToSerenity: "classical_score.storm_to_serenity",
  energyWave: "mixed_mess.energy_wave",
} as const;

/**
 * Apply explicit conflict-resolution rules to an already-combined strategy,
 * returning a corrected strategy and a diagnostics object describing every
 * change that was made.
 *
 * The raw combiner (average weights, max penalties, OR-merge flags) runs
 * first.  This function then overrides specific fields where blind merging
 * would create a logical contradiction.
 */
function resolveConflicts(
  raw: FlowStrategy,
  strategies: FlowStrategy[],
): { combined: FlowStrategy; diagnostics: CombinedStrategyDiagnostics } {
  const ids = new Set(strategies.map((s) => s.id));
  const conflictNotes: string[] = [];

  // Mutable copies of the fields we may adjust.
  const flags: FlowBehaviorFlags = { ...raw.flags };
  const penalties: FlowPenalties = { ...raw.penalties };
  const priorityWeights: typeof raw.priorityWeights = { ...raw.priorityWeights };

  const hasNSJ = ids.has(KID.noSuddenJumps);
  const hasSurprise = ids.has(KID.surpriseButSmooth);
  const hasMoodChapters = ids.has(KID.moodChapters);
  const hasSoftLanding = ids.has(KID.softLanding);
  const hasGrandFinale = ids.has(KID.grandFinale);
  const hasBangerRun = ids.has(KID.bangerRun);
  const hasStormToSerenity = ids.has(KID.stormToSerenity);
  const hasEnergyWave = ids.has(KID.energyWave);
  const hasGenreBridge = ids.has("mixed_mess.genre_bridge");

  // ── Rule 1: No Sudden Jumps + Surprise but Smooth ───────────────────────
  // NSJ's restriction wins: disable surpriseAllowed and pin surpriseTolerance
  // to the lower (NSJ) value so averaging cannot soften the restriction.
  if (hasNSJ && hasSurprise) {
    flags.surpriseAllowed = false;
    const nsjS = strategies.find((s) => s.id === KID.noSuddenJumps);
    if (nsjS) {
      priorityWeights.surpriseTolerance = Math.min(
        priorityWeights.surpriseTolerance,
        nsjS.priorityWeights.surpriseTolerance,
      );
    }
    conflictNotes.push(
      "No Sudden Jumps overrides Surprise but Smooth: surpriseAllowed disabled, surpriseTolerance capped to No Sudden Jumps level.",
    );
  }

  // ── Rule 2: No Sudden Jumps + Energy Wave ───────────────────────────────
  // Wave shape is preserved (curveType stays wave / whatever dominance gives),
  // but any surpriseAllowed flag is suppressed so wave transitions never
  // exceed NSJ's tolerance.
  if (hasNSJ && hasEnergyWave) {
    flags.surpriseAllowed = false;
    conflictNotes.push(
      "Energy Wave preserves wave shape, but No Sudden Jumps caps transition sharpness — wave peaks must stay within penalty bounds.",
    );
  }

  // ── Rule 2b: Genre Bridge + Energy Wave ───────────────────────────────────
  if (hasEnergyWave && hasGenreBridge) {
    conflictNotes.push(
      "Energy Wave drives macro crests/releases; Genre Bridge cushions the cuts between neighbourhoods so contrasts do not wreck the waveform.",
    );
  }

  if (hasEnergyWave && hasSoftLanding) {
    conflictNotes.push(
      "Energy Wave keeps the macro waveform (crest/release cycles); Soft Landing bends the final stretch softer without flattening earlier lifts.",
    );
  }

  // ── Rule 3: Mood Chapters + any other ───────────────────────────────────
  // Mood Chapters already wins the curveType priority (chaptered ranks #1).
  // Emit a note so the dev summary is clear about which strategy holds structure.
  if (hasMoodChapters && strategies.length > 1) {
    const other = strategies.find((s) => s.id !== KID.moodChapters);
    if (other) {
      conflictNotes.push(
        `Mood Chapters holds structural backbone (chaptered curve); "${other.label}" influences chapter ordering and final-chapter behavior.`,
      );
    }
  }

  // ── Rule 4: Soft Landing + Grand Finale ─────────────────────────────────
  // These are NOT mutually exclusive — they each control a different aspect:
  //   • Soft Landing shapes the penultimate approach (lead-in).
  //   • Grand Finale overrides the very last track to the most dramatic option.
  // Both flags survive. The sequencer runs landing logic first, then grand-finale
  // pulls the cinematic track to the absolute end.
  // Preferred ending: inherit Soft Landing's (smoother lead-in) but allow
  // Grand Finale to win the final slot.
  if (hasSoftLanding && hasGrandFinale) {
    flags.landingFocused = true;
    flags.grandFinale = true;
    // Use Soft Landing's preferredEnding for the approach but ensure grandFinale
    // wins the finale — no additional flag changes needed beyond keeping both.
    conflictNotes.push(
      "Soft Landing shapes the approach (smooth lead-in); Grand Finale overrides the final track to the most dramatic option.",
    );
  }

  // ── Rule 5: Banger Run + Soft Landing ───────────────────────────────────
  // Banger Run clusters high-energy tracks. Without override it would place the
  // cluster late (focal=0.65 for grandFinale) or mid-late (focal=0.42). Either
  // way, it should not bleed into the soft tail that Soft Landing enforces.
  // Solution: force bangerClusterMidOnly so the cluster stays in the first 60%.
  if (hasBangerRun && hasSoftLanding) {
    flags.bangerClusterMidOnly = true;
    flags.clusterRun = true;
    flags.landingFocused = true;
    conflictNotes.push(
      "Banger Run cluster anchored to the mid-section (≤60% through playlist); Soft Landing controls the final stretch.",
    );
  }

  // ── Rule 6: Storm to Serenity + Grand Finale ────────────────────────────
  // Grand Finale would pull the most intense/cinematic track to the very end,
  // reversing Storm to Serenity's declining-intensity arc. Strip grandFinale.
  if (hasStormToSerenity && hasGrandFinale) {
    flags.grandFinale = false;
    conflictNotes.push(
      "Storm to Serenity's declining intensity arc takes precedence; Grand Finale final-track override suppressed to preserve the downward trajectory.",
    );
  }

  // ── Build diagnostics ────────────────────────────────────────────────────

  const dominantStructure: CombinedStrategyDiagnostics["dominantStructure"] = flags.chaptered
    ? "chaptered"
    : flags.clusterRun && !flags.landingFocused
      ? "cluster-run"
      : flags.landingFocused
        ? "landing-focused"
        : "standard";

  const finalSectionPolicy: CombinedStrategyDiagnostics["finalSectionPolicy"] =
    hasSoftLanding && hasGrandFinale
      ? "grand-finale-with-smooth-lead-in"
      : flags.grandFinale
        ? "grand-finale"
        : hasBangerRun && hasSoftLanding
          ? "banger-cluster-then-soft"
          : hasStormToSerenity
            ? "declining-intensity"
            : flags.landingFocused
              ? "soft-landing"
              : "standard";

  const transitionStrictness: CombinedStrategyDiagnostics["transitionStrictness"] = hasNSJ
    ? "strict"
    : flags.surpriseAllowed
      ? "permissive"
      : "moderate";

  const diagnostics: CombinedStrategyDiagnostics = {
    dominantCurveType: raw.curveType, // curveType was already resolved by dominantCurve()
    dominantStructure,
    finalSectionPolicy,
    transitionStrictness,
    conflictNotes,
  };

  return {
    combined: { ...raw, flags, penalties, priorityWeights },
    diagnostics,
  };
}

/** Trivial diagnostics for a single-strategy run (no conflicts possible). */
function trivialDiagnostics(s: FlowStrategy): CombinedStrategyDiagnostics {
  return {
    dominantCurveType: s.curveType,
    dominantStructure: s.flags.chaptered
      ? "chaptered"
      : s.flags.clusterRun
        ? "cluster-run"
        : s.flags.landingFocused
          ? "landing-focused"
          : "standard",
    finalSectionPolicy: s.flags.grandFinale
      ? "grand-finale"
      : s.flags.landingFocused
        ? "soft-landing"
        : "standard",
    transitionStrictness: s.id === KID.noSuddenJumps
      ? "strict"
      : s.flags.surpriseAllowed
        ? "permissive"
        : "moderate",
    conflictNotes: [],
  };
}

// ---------------------------------------------------------------------------
// Pure numeric combiner (no conflict resolution)
// ---------------------------------------------------------------------------

/** Merge two or more strategies by averaging weights, max-ing penalties, and
 *  OR-merging flags.  Does NOT apply conflict resolution — call this first,
 *  then pass the result into `resolveConflicts`. */
function rawMergeStrategies(strategies: FlowStrategy[]): FlowStrategy {
  // Single-strategy or empty are handled by callers.
  const weightKeys = Object.keys(DEFAULT_WEIGHTS) as Array<keyof FlowPriorityWeights>;
  const penaltyKeys: Array<keyof FlowPenalties> = [
    "tempoJump",
    "energyJump",
    "rhythmJump",
    "aggressionJump",
    "moodWhiplash",
    "lateHighRhythm",
    "earlyEnergySpike",
  ];
  const progKeys = [
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
  ] as const;

  const weights = { ...DEFAULT_WEIGHTS };
  for (const k of weightKeys) {
    weights[k] = strategies.reduce((acc, s) => acc + s.priorityWeights[k], 0) / strategies.length;
  }

  const penalties: FlowPenalties = {
    tempoJump: 0,
    energyJump: 0,
    rhythmJump: 0,
    aggressionJump: 0,
    moodWhiplash: 0,
  };
  for (const k of penaltyKeys) {
    let m: number | undefined;
    for (const s of strategies) {
      const v = s.penalties[k];
      if (typeof v !== "number") continue;
      m = m === undefined ? v : Math.max(m, v);
    }
    if (typeof m === "number") {
      (penalties as Record<keyof FlowPenalties, number>)[k] = m;
    }
  }

  const progression: FlowProgressionTargets = {};
  for (const k of progKeys) {
    const values = strategies
      .map((s) => s.progression[k])
      .filter((v): v is number => typeof v === "number");
    if (values.length === 0) continue;
    progression[k] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  const flags: FlowBehaviorFlags = {};
  for (const s of strategies) {
    if (s.flags.chaptered) flags.chaptered = true;
    if (s.flags.clusterRun) flags.clusterRun = true;
    if (s.flags.landingFocused) flags.landingFocused = true;
    if (s.flags.grandFinale) flags.grandFinale = true;
    if (s.flags.loop) flags.loop = true;
    if (s.flags.bridgeMode) flags.bridgeMode = true;
    if (s.flags.surpriseAllowed) flags.surpriseAllowed = true;
    if (s.flags.momentumRequired) flags.momentumRequired = true;
    if (s.flags.loopBack) flags.loopBack = true;
    if (s.flags.waveMacro) flags.waveMacro = true;
  }

  const smoothing = strategies.reduce((acc, s) => acc + s.smoothing, 0) / strategies.length;

  let curveType: FlowCurveType = strategies[0]!.curveType;
  for (let i = 1; i < strategies.length; i++) {
    curveType = dominantCurve(curveType, strategies[i]!.curveType);
  }

  const preferredOpening = strategies.find((s) => s.preferredOpening)?.preferredOpening;
  const preferredPeak = strategies.find((s) => s.preferredPeak)?.preferredPeak;
  const preferredEnding = strategies.find((s) => s.preferredEnding)?.preferredEnding;

  const TONE_PRIORITY: FlowExplanationTone[] = [
    "cinematic",
    "dramatic",
    "intimate",
    "club",
    "focused",
    "playful",
    "journey",
  ];
  const tone =
    TONE_PRIORITY.find((t) => strategies.some((s) => s.explanationTone === t)) ?? "journey";

  return {
    id: strategies.map((s) => s.id).join("+"),
    label: strategies.map((s) => s.label).join(" + "),
    playlistTypeIds: Array.from(new Set(strategies.flatMap((s) => s.playlistTypeIds))),
    description: strategies.map((s) => s.description).join(" "),
    curveType,
    smoothing,
    explanationTone: tone,
    priorityWeights: weights,
    penalties,
    preferredOpening,
    preferredPeak,
    preferredEnding,
    progression,
    flags,
  };
}

/**
 * Energy Wave participates in the combined strategy. True when `curveType` is
 * `wave`, or when `waveMacro` survived OR-merge (e.g. Soft Landing won curve
 * dominance but Energy Wave should still reshape ordering).
 */
export function strategyUsesWaveMotion(strategy: FlowStrategy): boolean {
  return strategy.curveType === "wave" || !!strategy.flags.waveMacro;
}

// ---------------------------------------------------------------------------
// Public combine API
// ---------------------------------------------------------------------------

/**
 * Combine 1..N strategies into a single conflict-resolved strategy.
 *
 * Call this when you only need the final `FlowStrategy` and don't need the
 * `CombinedStrategyDiagnostics`.  Use `resolveStrategyFromKeywordIds` if you
 * also want the debug diagnostics.
 */
export function combineFlowStrategies(strategies: FlowStrategy[]): FlowStrategy {
  if (strategies.length === 0) {
    return mk({
      id: "__neutral",
      label: "Neutral",
      playlistTypeIds: [],
      description: "No strategy selected.",
      curveType: "stability-focused",
      smoothing: 1.2,
      explanationTone: "journey",
    });
  }
  if (strategies.length === 1) return strategies[0]!;
  const raw = rawMergeStrategies(strategies);
  return resolveConflicts(raw, strategies).combined;
}

// ---------------------------------------------------------------------------
// Convenience: resolve from id list
// ---------------------------------------------------------------------------

/** Strategy chosen for the run + the underlying single-keyword strategies. */
export interface ResolvedStrategy {
  combined: FlowStrategy;
  parts: FlowStrategy[];
  /** Debug summary produced by the conflict-resolution layer. */
  diagnostics: CombinedStrategyDiagnostics;
}

export function resolveStrategyFromKeywordIds(flowKeywordIds: string[]): ResolvedStrategy {
  const parts = flowKeywordIds
    .map((id) => getFlowStrategy(id))
    .filter((s): s is FlowStrategy => s !== null);

  if (parts.length === 0) {
    const neutral = combineFlowStrategies([]);
    return { combined: neutral, parts: [], diagnostics: trivialDiagnostics(neutral) };
  }
  if (parts.length === 1) {
    return { combined: parts[0]!, parts, diagnostics: trivialDiagnostics(parts[0]!) };
  }

  const raw = rawMergeStrategies(parts);
  const { combined, diagnostics } = resolveConflicts(raw, parts);
  return { combined, parts, diagnostics };
}

// ---------------------------------------------------------------------------
// Dev safety: every keyword in flow-presets.ts MUST have a strategy.
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== "production") {
  const missing: string[] = [];
  for (const t of PLAYLIST_TYPES) {
    for (const k of t.keywords) {
      if (!STRATEGY_BY_ID.has(k.id)) missing.push(k.id);
    }
  }
  if (missing.length) {
    console.warn(
      `[flowlist:flow-strategies] missing strategies for: ${missing.join(", ")}`,
    );
  }
}

// Re-export keyword + playlist type for convenience so callers can import all
// flow-related types from one spot.
export type { FlowKeyword, PlaylistType, PlaylistTypeId };
