import { FLOW_KEYWORDS } from "@/lib/flow-options";

const ARCHETYPE_PRIORITY = [
  "intense_to_calm",
  "calm_to_intense",
  "reflective_cooldown",
  "party_build_up",
  "workout_energy_rise",
  "gradually_uplifting",
  "dark_to_light",
  "light_to_dark",
  "slow_emotional_build",
  "cinematic_arc",
  "late_night_emotional",
  "romantic_slow_burn",
] as const;

export function normalizedFlowIds(ids: string[]): string[] {
  const valid = new Set(FLOW_KEYWORDS.map((k) => k.id));
  return ids.filter((id) => valid.has(id));
}

/** First matching keyword wins — drives phase bands and arc copy so summaries match the user’s main intent. */
export function primaryFlowArchetype(ids: string[]): string {
  const keys = normalizedFlowIds(ids);
  if (keys.length === 0) return "cinematic_arc";
  const set = new Set(keys);
  for (const id of ARCHETYPE_PRIORITY) {
    if (set.has(id)) return id;
  }
  return keys[0]!;
}

/** Cumulative phase boundaries on normalized position (0–1): Intro | Build | Peak | Cooldown | Outro. */
export function phaseThresholdsForArchetype(primary: string): [number, number, number, number] {
  switch (primary) {
    case "intense_to_calm":
      return [0.1, 0.3, 0.52, 0.8];
    case "calm_to_intense":
    case "party_build_up":
    case "workout_energy_rise":
      return [0.12, 0.48, 0.82, 0.92];
    case "reflective_cooldown":
      return [0.12, 0.32, 0.45, 0.72];
    case "gradually_uplifting":
      return [0.1, 0.34, 0.62, 0.86];
    case "dark_to_light":
    case "light_to_dark":
      return [0.12, 0.36, 0.58, 0.84];
    case "slow_emotional_build":
      return [0.12, 0.4, 0.66, 0.88];
    case "late_night_emotional":
    case "romantic_slow_burn":
      return [0.14, 0.38, 0.58, 0.82];
    case "cinematic_arc":
    default:
      return [0.12, 0.35, 0.58, 0.82];
  }
}
