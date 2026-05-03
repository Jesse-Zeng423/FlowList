import type { Phase } from "@/types/flowlist";
import type { FlowArchetypeId } from "@/lib/flow-presets";
import { PLAYLIST_TYPES } from "@/lib/flow-presets";
import {
  FLOW_HARD_CONFLICT_KEYS,
  collectRecommendedNotes,
  collectSoftTensionNotes,
  flowKeywordCanonPair,
} from "@/lib/flow-compatibility";

// ---------------------------------------------------------------------------
// Types — product vocabulary aligned with Flowlist sequencer + UI semantics
// ---------------------------------------------------------------------------

export type FlowSemanticIntent =
  | "chaptered"
  | "wave"
  | "bridge"
  | "landing"
  | "final-crest"
  | "linear-rise"
  | "linear-fall"
  | "peak-run"
  | "stability"
  | "contrast-resolution"
  | "intimate"
  | "cinematic"
  | "club"
  | "loop"
  | "warmth-rise"
  | "resolution-rise"
  | "nocturnal"
  | "surprise-soft";

export type FinalSectionPolicy =
  | "soft-landing"
  | "final-crest"
  | "grand-finale"
  | "uplifting-finish"
  | "steady-loop"
  | "reflective-outro"
  | "neutral";

export interface FlowSemanticProfile {
  keywordId: string;
  label: string;
  intents: FlowSemanticIntent[];
  macroBehavior: string;
  finalSectionPolicy: FinalSectionPolicy;
  allowsHighEnergyEnding: boolean;
  requiresSoftEnding: boolean;
  preferredSectionNames: string[];
  summaryLanguage: { mood: string[]; rhythm: string[] };
  allowedExplanationPhrases: string[];
  forbiddenExplanationPhrases: string[];
}

export interface ResolvedFlowSemantics {
  keywordIds: readonly string[];
  profiles: FlowSemanticProfile[];
  dominantMacroIntent: FlowSemanticIntent | null;
  intentUnion: FlowSemanticIntent[];
  finalSectionPolicyMerged: FinalSectionPolicy;
  allowsLandingLanguage: boolean;
  allowsHighEnergyEnding: boolean;
  requiresSoftEnding: boolean;
  waveStructureActive: boolean;
  moodChaptersActive: boolean;
  grandFinaleKeyword: boolean;
  upliftingFinishKeyword: boolean;
  genreBridgeKeyword: boolean;
  noSuddenJumpsKeyword: boolean;
  /** Union of phrase-level bans from profiles + global landing bans when gated */
  explanationBannedPhrasesNormalized: readonly string[];
  semanticConflictNotes: readonly string[];
  softTensionNotes: readonly string[];
  recommendedPairNotes: readonly string[];
}

const INTENT_WEIGHT: Partial<Record<FlowSemanticIntent, number>> = {
  chaptered: 120,
  wave: 115,
  "peak-run": 90,
  "contrast-resolution": 82,
  "resolution-rise": 78,
  "linear-rise": 75,
  "linear-fall": 75,
  bridge: 70,
  "club": 68,
  cinematic: 65,
  stability: 60,
  "surprise-soft": 58,
  landing: 55,
  "final-crest": 50,
  "warmth-rise": 48,
  intimate: 45,
  nocturnal: 44,
  loop: 40,
};

const KW = {
  energyWave: "mixed_mess.energy_wave",
  moodChapters: "mixed_mess.mood_chapters",
  genreBridge: "mixed_mess.genre_bridge",
  softLanding: "mixed_mess.soft_landing",
  nsj: "chill_lofi.no_sudden_jumps",
  grandFinale: "classical_score.grand_finale",
  uplift: "pop_dance.uplifting_finish",
  calmLoop: "chill_lofi.calm_loop",
  gentleFade: "chill_lofi.gentle_fade",
  acousticLanding: "rock_alt.acoustic_landing",
  cooldown: "electronic_club.cooldown_set",
  storm: "classical_score.storm_to_serenity",
} as const;

/** Landing / cooldown copy is semantically truthful for these selections */
const LANDING_LANGUAGE_KEYWORDS = new Set<string>([
  KW.softLanding,
  KW.gentleFade,
  KW.acousticLanding,
  KW.cooldown,
  KW.storm,
]);

/** These keywords bias the playlist toward a softened final slice */
const SOFT_ENDING_BIAS_KEYWORDS = new Set<string>([
  KW.softLanding,
  KW.gentleFade,
  KW.acousticLanding,
  KW.cooldown,
  KW.storm,
]);

export const GLOBAL_LANDING_PHRASES =
  /\blanding zone\b|ease(s)? the listener out|softening the landing|\bsofter landing\b|\blands gently\b/gi;

const ARCH_SEMANTICS: Record<
  FlowArchetypeId,
  Omit<FlowSemanticProfile, "keywordId" | "label">
> = {
  intense_to_calm: {
    intents: ["linear-fall", "resolution-rise"],
    macroBehavior:
      "Move from sharper intensity toward calmer rhythm, intimacy, or resolution cues late in the set.",
    finalSectionPolicy: "reflective-outro",
    allowsHighEnergyEnding: false,
    requiresSoftEnding: true,
    preferredSectionNames: ["Release arc", "Softening stretch", "Resolution"],
    summaryLanguage: {
      mood: ["releases tension toward calm", "warmer intimacy late", "settled endings"],
      rhythm: ["lower drive toward the tail", "softer grooves later", "less aggressive motion"],
    },
    allowedExplanationPhrases: ["Energy eases for a quieter handoff.", "Motion opens space after intensity."],
    forbiddenExplanationPhrases: ["Closing like a nightclub peak unless paired with uplift flows."],
  },
  calm_to_intense: {
    intents: ["linear-rise"],
    macroBehavior:
      "Build forward momentum rather than drifting flat — widen dynamic range progressively.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Lift", "Forward drive"],
    summaryLanguage: {
      mood: ["increasing confidence / lift", "brighter payoff potential"],
      rhythm: ["steady climb in perceived drive"],
    },
    allowedExplanationPhrases: ["Momentum carries the cut forward.", "Brightness steps up progressively."],
    forbiddenExplanationPhrases: [],
  },
  reflective_cooldown: {
    intents: ["landing", "resolution-rise"],
    macroBehavior:
      "After focal energy, glide toward quieter motion and resolution — endings should feel breathable.",
    finalSectionPolicy: "soft-landing",
    allowsHighEnergyEnding: false,
    requiresSoftEnding: true,
    preferredSectionNames: ["Cooldown", "Soft landing", "Gentle outro"],
    summaryLanguage: {
      mood: ["warmer intimacy", "settled endings", "less tension late"],
      rhythm: ["fewer spikes late", "sparser rhythmic pressure"],
    },
    allowedExplanationPhrases: ["Rhythm and energy ease toward a landing.", "The ending moves softer."],
    forbiddenExplanationPhrases: ["Treats the finale like a nightclub sprint unless uplift is selected."],
  },
  party_build_up: {
    intents: ["peak-run", "club"],
    macroBehavior:
      "Cluster or stage the strongest kinetic moments — grooves and beats should feel purposeful.",
    finalSectionPolicy: "final-crest",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Banger run", "Hard stretch", "Peak band"],
    summaryLanguage: {
      mood: ["physical confidence", "anthem colours"],
      rhythm: ["heavier groove arcs", "dance-floor lift"],
    },
    allowedExplanationPhrases: ["The rhythm lifts into peak territory.", "Both tracks ride similar club physics."],
    forbiddenExplanationPhrases: ["Assume a whisper-quiet ending"],
  },
  workout_energy_rise: {
    intents: ["linear-rise", "peak-run"],
    macroBehavior: "Treat intensity like a treadmill curve — escalate drive without dead air.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Build", "Power band"],
    summaryLanguage: {
      mood: ["determination", "athletic lift"],
      rhythm: ["tightened groove escalation"],
    },
    allowedExplanationPhrases: ["Percussive intensity stacks.", "Groove climbs with control."],
    forbiddenExplanationPhrases: [],
  },
  gradually_uplifting: {
    intents: ["warmth-rise"],
    macroBehavior: "Glow warmth/euphoria upward — endings can stay bright when no landing keywords are paired.",
    finalSectionPolicy: "uplifting-finish",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Lift band", "Final glow"],
    summaryLanguage: {
      mood: ["brighter payoff", "emotional uplift"],
      rhythm: ["energetic but smooth transitions"],
    },
    allowedExplanationPhrases: ["Warmth carries through the transition.", "The lift stays optimistic."],
    forbiddenExplanationPhrases: [],
  },
  dark_to_light: {
    intents: ["contrast-resolution"],
    macroBehavior: "Start shadowed/heavy, resolve into confident victorious colour.",
    finalSectionPolicy: "uplifting-finish",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Victory bend", "Light lift"],
    summaryLanguage: {
      mood: ["dark colour early", "confident payoff later"],
      rhythm: ["tension early", "opening groove later"],
    },
    allowedExplanationPhrases: ["Contrast is intentional — shared rhythm bridges the polarity."],
    forbiddenExplanationPhrases: [],
  },
  light_to_dark: {
    intents: ["contrast-resolution", "linear-fall"],
    macroBehavior:
      "Open bright/pop-forward, deepen into bittersweet nostalgic colour without losing cohesion.",
    finalSectionPolicy: "reflective-outro",
    allowsHighEnergyEnding: false,
    requiresSoftEnding: false,
    preferredSectionNames: ["Glow early", "Deeper dusk"],
    summaryLanguage: {
      mood: ["bright intro colour", "bittersweet / nostalgic resolution"],
      rhythm: ["front-loaded brightness", "softer kinetic resolve"],
    },
    allowedExplanationPhrases: ["Warm threads keep the tonal shift humane."],
    forbiddenExplanationPhrases: [],
  },
  slow_emotional_build: {
    intents: ["intimate", "cinematic"],
    macroBehavior: "Treat peaks as emotional or narrative arcs, not purely loud SPL.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: false,
    requiresSoftEnding: false,
    preferredSectionNames: ["Slow burn", "Emotional swell"],
    summaryLanguage: {
      mood: ["intimacy and tension interplay", "narrative payoff"],
      rhythm: ["measured escalation"],
    },
    allowedExplanationPhrases: ["Keeps lyrical weight audible across the transition."],
    forbiddenExplanationPhrases: [],
  },
  cinematic_arc: {
    intents: ["cinematic"],
    macroBehavior:
      "Sequence like staged scenes — deliberate contrast and resolution arcs over random scatter.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Scene", "Act change"],
    summaryLanguage: {
      mood: ["scene-to-scene colour changes", "narrative resolution"],
      rhythm: ["larger leaps only where emotionally motivated"],
    },
    allowedExplanationPhrases: ["The cut advances the cinematic arc deliberately."],
    forbiddenExplanationPhrases: [],
  },
  late_night_emotional: {
    intents: ["nocturnal", "intimate"],
    macroBehavior: "Maintain warm, smoky, darkened intimacy — hype language should stay rare.",
    finalSectionPolicy: "reflective-outro",
    allowsHighEnergyEnding: false,
    requiresSoftEnding: false,
    preferredSectionNames: ["Midnight veil", "Nocturnal hold"],
    summaryLanguage: {
      mood: ["smoky intimacy", "low spotlight energy"],
      rhythm: ["medium/slow-motion continuity"],
    },
    allowedExplanationPhrases: ["Tempo intimacy keeps the booth close."],
    forbiddenExplanationPhrases: ["Peak hour festival hype wording"],
  },
  romantic_slow_burn: {
    intents: ["intimate"],
    macroBehavior: "Closeness and tension escalate slowly — forbid early gratuitous spikes.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: false,
    requiresSoftEnding: false,
    preferredSectionNames: ["Velvet arc", "Tension braid"],
    summaryLanguage: {
      mood: ["slow-touch intimacy", "sensual lift late"],
      rhythm: ["unhurried motion"],
    },
    allowedExplanationPhrases: [],
    forbiddenExplanationPhrases: [],
  },
  low_disruption: {
    intents: ["stability"],
    macroBehavior:
      "Keep neighbouring tracks compatible — minimise tempo/energy/rhythm discontinuities.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Steady band"],
    summaryLanguage: {
      mood: ["continuity-focused ordering"],
      rhythm: ["neighbour-aware groove blending"],
    },
    allowedExplanationPhrases: ["Tempo, rhythm, and energy stay close to protect continuity."],
    forbiddenExplanationPhrases: [],
  },
  energy_wave: {
    intents: ["wave"],
    macroBehavior:
      "Macro contour breathes — repeated crests/releases instead of monotone drift or random scatter.",
    finalSectionPolicy: "final-crest",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Wave", "Release", "Final wave"],
    summaryLanguage: {
      mood: ["crest + release arcs", "intentionally varied neighbourhoods"],
      rhythm: ["repeating rises and decompressions"],
    },
    allowedExplanationPhrases: [
      "This track forms part of the next crest in the wave.",
      "This release lowers the groove before the next lift.",
      "Genre Bridge cushions the shift between wave sections.",
    ],
    forbiddenExplanationPhrases: [
      "minimal disruption",
      "same energy neighbourhood unless NSJ dominates",
      "Treat every outro as a soft landing",
    ],
  },
  melancholy_to_resolution: {
    intents: ["resolution-rise"],
    macroBehavior:
      "Shift sadness/tension fingerprints toward warmer resolution cues without abandoning sincerity.",
    finalSectionPolicy: "reflective-outro",
    allowsHighEnergyEnding: false,
    requiresSoftEnding: false,
    preferredSectionNames: ["Blue prelude", "Warm resolve"],
    summaryLanguage: {
      mood: ["melancholic early colour", "settled intimacy later"],
      rhythm: ["softer kinetic resolve"],
    },
    allowedExplanationPhrases: [],
    forbiddenExplanationPhrases: [],
  },
};

const KEYWORD_DELTA: Partial<Record<string, Partial<FlowSemanticProfile>>> = {
  [KW.genreBridge]: {
    intents: ["bridge", "stability"],
    macroBehavior:
      "Use bridge-compatible tracks between contrasting neighbourhoods — contrast persists, spikes are staged.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    summaryLanguage: {
      mood: ["bridge tracks connect neighbourhoods", "style contrasts stay intentional"],
      rhythm: ["shared tempo/mood cushions style shifts"],
    },
    forbiddenExplanationPhrases: [
      "minimal disruption unless No Sudden Jumps is controlling copy",
      "erase contrast completely",
    ],
  },
  [KW.moodChapters]: {
    intents: ["chaptered", "cinematic"],
    macroBehavior:
      "Chapters organise internal colour — big jumps happen between chapters, not inside coherent pockets.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Chapter", "Act"],
    forbiddenExplanationPhrases: [
      "Ignore chapter boundaries when describing summaries",
      "Generic Intro→Build arcs without acknowledging chapters",
    ],
  },
  "mixed_mess.chaos_to_coherence": {
    intents: ["contrast-resolution"],
    macroBehavior:
      "Tuck the wildest leaps early, coax the playlist toward clearer emotional neighbourhoods later.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    forbiddenExplanationPhrases: [
      "Dramatic wave motion unless Energy Wave is also controlling structure",
      "No Sudden Jumps strict wording",
    ],
  },
  "mixed_mess.surprise_but_smooth": {
    intents: ["surprise-soft", "bridge"],
    macroBehavior:
      "Preserves contrast but cushions each jump with overlapping tempo/rhythm/warmth signals.",
    finalSectionPolicy: "neutral",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    allowedExplanationPhrases: ["Contrast stays playful because shared grooves bridge the pivot."],
  },
  [KW.softLanding]: {
    requiresSoftEnding: true,
    allowsHighEnergyEnding: false,
    finalSectionPolicy: "soft-landing",
    summaryLanguage: {
      mood: ["closing softness", "warm resolution"],
      rhythm: ["lower rhythmic drive toward the finale"],
    },
  },
  [KW.grandFinale]: {
    intents: ["cinematic", "final-crest"],
    finalSectionPolicy: "grand-finale",
    allowsHighEnergyEnding: true,
    requiresSoftEnding: false,
    preferredSectionNames: ["Grand finale", "Final rise", "Closing movement"],
  },
  [KW.uplift]: {
    intents: ["warmth-rise", "linear-rise"],
    finalSectionPolicy: "uplifting-finish",
    allowsHighEnergyEnding: true,
  },
  [KW.nsj]: {
    intents: ["stability"],
    macroBehavior:
      "Minimise abrupt tempo/energy/rhythm jumps — continuity beats drama.",
    summaryLanguage: {
      mood: ["continuity dominates"],
      rhythm: ["minimal neighbour disruption"],
    },
    forbiddenExplanationPhrases: ["deliberate chaos", "intentional whiplash", "celebratory surprise spikes"],
    allowedExplanationPhrases: ["Tempo, rhythm, and energy stay close across the boundary."],
  },
  [KW.calmLoop]: {
    intents: ["loop", "stability"],
    finalSectionPolicy: "steady-loop",
    allowsHighEnergyEnding: false,
    preferredSectionNames: ["Loop hinge", "Return"],
  },
};

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function mergeProfiles(base: FlowSemanticProfile, overlay?: Partial<FlowSemanticProfile>): FlowSemanticProfile {
  if (!overlay) return base;
  return {
    ...base,
    ...overlay,
    intents: uniq([
      ...(base.intents ?? []),
      ...((overlay.intents ?? base.intents) ?? []),
    ]),
    preferredSectionNames: uniq([
      ...(base.preferredSectionNames ?? []),
      ...(overlay.preferredSectionNames ?? []),
    ]),
    summaryLanguage: {
      mood: uniq([
        ...(base.summaryLanguage?.mood ?? []),
        ...(overlay.summaryLanguage?.mood ?? []),
      ]),
      rhythm: uniq([
        ...(base.summaryLanguage?.rhythm ?? []),
        ...(overlay.summaryLanguage?.rhythm ?? []),
      ]),
    },
    allowedExplanationPhrases: uniq([
      ...(base.allowedExplanationPhrases ?? []),
      ...(overlay.allowedExplanationPhrases ?? []),
    ]),
    forbiddenExplanationPhrases: uniq([
      ...(base.forbiddenExplanationPhrases ?? []),
      ...(overlay.forbiddenExplanationPhrases ?? []),
    ]),
  };
}

function inferProfile(keyword: { id: string; label: string; archetype: FlowArchetypeId }): FlowSemanticProfile {
  const baseTemplate = ARCH_SEMANTICS[keyword.archetype];
  const base: FlowSemanticProfile = {
    ...baseTemplate,
    keywordId: keyword.id,
    label: keyword.label,
  };
  return mergeProfiles(base, KEYWORD_DELTA[keyword.id]);
}

const PROFILE_CACHE = new Map<string, FlowSemanticProfile>();

function profileForKeywordId(id: string): FlowSemanticProfile {
  let p = PROFILE_CACHE.get(id);
  if (p) return p;
  const kw =
    PLAYLIST_TYPES.flatMap((t) => t.keywords).find((k) => k.id === id) ??
    ({
      id,
      label: id,
      archetype: "cinematic_arc" satisfies FlowArchetypeId as FlowArchetypeId,
      smoothing: 1,
      description: "",
    } as typeof PLAYLIST_TYPES[number]["keywords"][number]);
  p = inferProfile(kw);
  PROFILE_CACHE.set(id, p);
  return p;
}

export function getFlowSemanticProfile(keywordId: string): FlowSemanticProfile {
  return profileForKeywordId(keywordId);
}

function pickDominantIntent(intentUnion: FlowSemanticIntent[]): FlowSemanticIntent | null {
  if (intentUnion.length === 0) return null;
  let best = intentUnion[0]!;
  let bestW = INTENT_WEIGHT[best] ?? 0;
  for (const intent of intentUnion) {
    const w = INTENT_WEIGHT[intent] ?? 5;
    if (w > bestW) {
      best = intent;
      bestW = w;
    }
  }
  return best;
}

function mergeFinalPolicies(policies: FinalSectionPolicy[]): FinalSectionPolicy {
  if (policies.some((p) => p === "grand-finale")) return "grand-finale";
  if (policies.some((p) => p === "uplifting-finish")) return "uplifting-finish";
  if (policies.some((p) => p === "steady-loop")) return "steady-loop";
  if (policies.some((p) => p === "soft-landing")) return "soft-landing";
  if (policies.some((p) => p === "reflective-outro")) return "reflective-outro";
  if (policies.some((p) => p === "final-crest")) return "final-crest";
  return "neutral";
}

export function combineResolvedFlowSemantics(
  flowKeywordIds: readonly string[],
): ResolvedFlowSemantics {
  const ids = [...flowKeywordIds].filter(Boolean);
  const profiles = ids.map(profileForKeywordId);
  const intentUnion = uniq(profiles.flatMap((p) => p.intents));
  const dominantMacroIntent = pickDominantIntent(intentUnion);

  let finalMerged = mergeFinalPolicies(profiles.map((p) => p.finalSectionPolicy));

  const hasSoftKw = ids.some((id) => SOFT_ENDING_BIAS_KEYWORDS.has(id));
  const gf = ids.includes(KW.grandFinale);
  const uplift = ids.includes(KW.uplift);

  if (gf && hasSoftKw) {
    finalMerged = "grand-finale";
  }

  const waveStructureActive = ids.includes(KW.energyWave) || intentUnion.includes("wave");
  const moodChaptersActive = ids.includes(KW.moodChapters);

  const landingLanguageExplicit = ids.some((id) => LANDING_LANGUAGE_KEYWORDS.has(id));
  /** Grand finale + soft-ending cue: sequencer uses soft-lead wording */
  const allowsLandingLanguage = landingLanguageExplicit || (gf && hasSoftKw);

  const anyRequiresSoft = profiles.some((p) => p.requiresSoftEnding);
  const allowsHighEnergyEnding = !!(gf || uplift || !anyRequiresSoft);

  const banned = uniq(profiles.flatMap((p) => p.forbiddenExplanationPhrases.map((s) => s.trim().toLowerCase())));
  if (!allowsLandingLanguage) {
    banned.push(
      "landing zone",
      "eases the listener out",
      "softening the landing",
      "softer landing",
      "lands gently",
    );
  }

  const semanticHard: string[] = [];
  if (ids.length === 2 && FLOW_HARD_CONFLICT_KEYS.has(flowKeywordCanonPair(ids[0]!, ids[1]!))) {
    semanticHard.push("Hard conflicting keyword pair slipped through selection UI — verify compatibility rules.");
  }

  return {
    keywordIds: ids,
    profiles,
    dominantMacroIntent,
    intentUnion,
    finalSectionPolicyMerged: finalMerged,
    allowsLandingLanguage,
    allowsHighEnergyEnding,
    requiresSoftEnding: anyRequiresSoft,
    waveStructureActive,
    moodChaptersActive,
    grandFinaleKeyword: gf,
    upliftingFinishKeyword: uplift,
    genreBridgeKeyword: ids.includes(KW.genreBridge),
    noSuddenJumpsKeyword: ids.includes(KW.nsj),
    explanationBannedPhrasesNormalized: uniq(banned),
    semanticConflictNotes: semanticHard,
    softTensionNotes: collectSoftTensionNotes(ids),
    recommendedPairNotes: collectRecommendedNotes(ids),
  };
}

export function allowsLandingSemantics(semantics: ResolvedFlowSemantics): boolean {
  return semantics.allowsLandingLanguage;
}

const CREST_SPIN = ["Final wave ribbon", "Closing crest", "Last lift ribbon", "Final surge ribbon"];

export function semanticPhaseRibbonLabel(args: {
  phase: Phase;
  index: number;
  total: number;
  isLastTrack: boolean;
  semantics: ResolvedFlowSemantics;
  hideForMoodRibbon: boolean;
}): string | null {
  const { phase, index, semantics, hideForMoodRibbon, total, isLastTrack } = args;
  if (hideForMoodRibbon || total === 0) return null;

  const wave = semantics.waveStructureActive;
  const chap = semantics.moodChaptersActive;
  if (chap) {
    return phase === "Outro"
      ? "Chapter tail — internal colour resolves before the playlist ends."
      : "Inside chapter colour.";
  }

  if (semantics.grandFinaleKeyword && isLastTrack && (phase === "Peak" || phase === "Outro")) {
    return "Grand finale — closing movement";
  }

  if (
    wave &&
    phase === "Outro" &&
    !semantics.allowsLandingLanguage &&
    semantics.allowsHighEnergyEnding
  ) {
    return CREST_SPIN[index % CREST_SPIN.length] ?? "Closing crest";
  }

  if (wave && phase === "Outro" && semantics.allowsLandingLanguage) {
    return "Soft landing ribbon";
  }

  if (wave && phase === "Cooldown") {
    return "Release between waves";
  }

  if (semantics.allowsLandingLanguage && phase === "Outro") {
    return "Landing / resolution ribbon";
  }

  return null;
}

export function runSemanticConsistencyDevWarnings(input: {
  flowKeywordIds: readonly string[];
  moodArcSummary: string;
  rhythmArcSummary: string;
  transitionBlob: string;
  positionBlob: string;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  const sem = combineResolvedFlowSemantics(input.flowKeywordIds);

  const text = `${input.moodArcSummary} ${input.rhythmArcSummary} ${input.transitionBlob} ${input.positionBlob}`;
  const lower = text.toLowerCase();

  GLOBAL_LANDING_PHRASES.lastIndex = 0;
  if (!sem.allowsLandingLanguage && GLOBAL_LANDING_PHRASES.test(lower)) {
    console.warn("[flowlist:semantics] Landing copy surfaced without landing-capable flows.");
  }

  if (input.flowKeywordIds.length === 2) {
    const k = flowKeywordCanonPair(input.flowKeywordIds[0]!, input.flowKeywordIds[1]!);
    if (FLOW_HARD_CONFLICT_KEYS.has(k)) {
      console.warn(
        `[flowlist:semantics] Hard conflicting keywords simultaneously selected: ${input.flowKeywordIds.join(" · ")}`,
      );
    }
  }

  for (const frag of sem.explanationBannedPhrasesNormalized) {
    if (!frag.trim()) continue;
    if (lower.includes(frag)) {
      console.warn(`[flowlist:semantics] Forbidden fragment surfaced: "${frag}"`);
    }
  }

  const nsjActive = sem.noSuddenJumpsKeyword;
  if (
    nsjActive &&
    (lower.includes("deliberate gear-shift") ||
      lower.includes("deliberate gear-change") ||
      lower.includes("intentional whiplash"))
  ) {
    console.warn("[flowlist:semantics] No Sudden Jumps selection contradicts surfaced copy.");
  }
}