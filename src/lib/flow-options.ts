import type { FlowKeywordDefinition } from "@/types/flowlist";

export const FLOW_KEYWORDS: FlowKeywordDefinition[] = [
  {
    id: "dark_to_light",
    label: "From dark to light",
    description: "Move from heavier moods toward brighter, lighter emotional space.",
  },
  {
    id: "light_to_dark",
    label: "From light to dark",
    description: "Start airy and ease into deeper, more intense emotional territory.",
  },
  {
    id: "slow_emotional_build",
    label: "Slow emotional build",
    description: "Let intensity and vulnerability rise gradually without rushing the arc.",
  },
  {
    id: "gradually_uplifting",
    label: "Gradually uplifting",
    description: "Increase emotional brightness and lift over the course of the set.",
  },
  {
    id: "calm_to_intense",
    label: "Calm to intense",
    description: "Grow rhythm energy and emotional pressure toward a stronger peak.",
  },
  {
    id: "intense_to_calm",
    label: "Intense to calm",
    description: "Release tension and land in a softer, more grounded place.",
  },
  {
    id: "late_night_emotional",
    label: "Late-night emotional",
    description: "Cohesive nocturnal intimacy: introspective, close, and unhurried.",
  },
  {
    id: "romantic_slow_burn",
    label: "Romantic slow burn",
    description: "Patient tempo and rising intimacy; romance without sudden spikes.",
  },
  {
    id: "cinematic_arc",
    label: "Cinematic arc",
    description: "Classic narrative lift: quiet opening, rising stakes, climax, resolution.",
  },
  {
    id: "party_build_up",
    label: "Party build-up",
    description: "Groove and energy climb like a warm-up set toward a dance-floor peak.",
  },
  {
    id: "workout_energy_rise",
    label: "Workout energy rise",
    description: "Rhythm-forward momentum that keeps stepping up without harsh jumps.",
  },
  {
    id: "reflective_cooldown",
    label: "Reflective cooldown",
    description: "End softer, slower, and more inward — space to process what came before.",
  },
];

export const DEFAULT_FLOW_IDS = ["dark_to_light", "cinematic_arc"] as const;
