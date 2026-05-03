import {
  getFlowKeyword,
  type FlowArchetypeId,
  type FlowKeyword,
  type FlowKeywordHints,
} from "@/lib/flow-presets";

/**
 * Earlier entries win when two selected keywords resolve to different archetypes.
 * The order reflects how strongly each archetype "shapes" the playlist.
 */
const ARCHETYPE_PRIORITY: FlowArchetypeId[] = [
  "energy_wave",
  "low_disruption",
  "intense_to_calm",
  "calm_to_intense",
  "reflective_cooldown",
  "party_build_up",
  "workout_energy_rise",
  "gradually_uplifting",
  "melancholy_to_resolution",
  "dark_to_light",
  "light_to_dark",
  "slow_emotional_build",
  "cinematic_arc",
  "late_night_emotional",
  "romantic_slow_burn",
];

export interface ResolvedFlow {
  archetypes: FlowArchetypeId[];
  primary: FlowArchetypeId;
  smoothing: number;
  hints: Required<FlowKeywordHints>;
  keywords: FlowKeyword[];
}

const DEFAULT_HINTS: Required<FlowKeywordHints> = {
  wave: false,
  clusterPeak: false,
  lateLift: false,
  emphasizeContrast: false,
};

/**
 * Resolve the user-facing flow keyword ids into the internal scoring inputs.
 * - `archetypes` drives `lateProgressScore`
 * - `primary` drives phase thresholds + summary copy baseline
 * - `smoothing` aggregates per-keyword weights
 * - `hints` OR-merges per-keyword hint flags
 */
export function resolveFlow(flowKeywordIds: string[]): ResolvedFlow {
  const keywords: FlowKeyword[] = [];
  for (const id of flowKeywordIds) {
    const k = getFlowKeyword(id);
    if (k) keywords.push(k);
  }

  if (keywords.length === 0) {
    return {
      archetypes: ["cinematic_arc"],
      primary: "cinematic_arc",
      smoothing: 1,
      hints: { ...DEFAULT_HINTS },
      keywords: [],
    };
  }

  const archetypes = keywords.map((k) => k.archetype);
  const set = new Set(archetypes);
  let primary: FlowArchetypeId = archetypes[0]!;
  for (const id of ARCHETYPE_PRIORITY) {
    if (set.has(id)) {
      primary = id;
      break;
    }
  }

  const smoothing = keywords.reduce((acc, k) => acc + k.smoothing, 0) / keywords.length;

  const hints: Required<FlowKeywordHints> = { ...DEFAULT_HINTS };
  for (const k of keywords) {
    if (k.hints?.wave) hints.wave = true;
    if (k.hints?.clusterPeak) hints.clusterPeak = true;
    if (k.hints?.lateLift) hints.lateLift = true;
    if (k.hints?.emphasizeContrast) hints.emphasizeContrast = true;
  }

  return { archetypes, primary, smoothing, hints, keywords };
}

/** Cumulative phase boundaries on normalized position (0–1): Intro | Build | Peak | Cooldown | Outro. */
export function phaseThresholdsForArchetype(
  primary: FlowArchetypeId,
  hints: Required<FlowKeywordHints>,
): [number, number, number, number] {
  let thresholds: [number, number, number, number];
  switch (primary) {
    case "intense_to_calm":
      thresholds = [0.1, 0.3, 0.52, 0.8];
      break;
    case "calm_to_intense":
    case "party_build_up":
    case "workout_energy_rise":
      thresholds = [0.12, 0.48, 0.82, 0.92];
      break;
    case "reflective_cooldown":
      thresholds = [0.12, 0.32, 0.45, 0.72];
      break;
    case "gradually_uplifting":
      thresholds = [0.1, 0.34, 0.62, 0.86];
      break;
    case "melancholy_to_resolution":
      thresholds = [0.12, 0.36, 0.56, 0.8];
      break;
    case "dark_to_light":
    case "light_to_dark":
      thresholds = [0.12, 0.36, 0.58, 0.84];
      break;
    case "slow_emotional_build":
      thresholds = [0.12, 0.4, 0.66, 0.88];
      break;
    case "late_night_emotional":
    case "romantic_slow_burn":
      thresholds = [0.14, 0.38, 0.58, 0.82];
      break;
    case "low_disruption":
      thresholds = [0.16, 0.42, 0.62, 0.86];
      break;
    case "energy_wave":
      thresholds = [0.12, 0.34, 0.6, 0.84];
      break;
    case "cinematic_arc":
    default:
      thresholds = [0.12, 0.35, 0.58, 0.82];
      break;
  }

  if (hints.lateLift) {
    thresholds = [
      Math.min(thresholds[0] + 0.02, 0.2),
      Math.min(thresholds[1] + 0.05, 0.55),
      Math.min(thresholds[2] + 0.08, 0.85),
      Math.min(thresholds[3] + 0.04, 0.92),
    ];
  }
  if (hints.clusterPeak) {
    const mid = (thresholds[1] + thresholds[2]) / 2;
    thresholds = [
      thresholds[0],
      Math.max(0.15, mid - 0.07),
      Math.min(0.9, mid + 0.07),
      thresholds[3],
    ];
  }

  return thresholds;
}
