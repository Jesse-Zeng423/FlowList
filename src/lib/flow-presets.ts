/**
 * Flowlist's product positioning lives here:
 *   "Turns messy playlists into smooth listening journeys."
 *
 * Single source of truth for:
 *  - playlist types (genre / character of the imported set)
 *  - flow keywords (whole-journey transformations the sequencer should bias toward)
 *  - the internal scoring archetype + smoothing/hint metadata each keyword maps to
 *
 * UI components must read from here. Sequencing pipelines must derive archetypes/hints
 * from selected keyword ids via the helpers below — never hardcode strings.
 */

export type PlaylistTypeId =
  | "mixed_mess"
  | "hip_hop"
  | "rnb_soul"
  | "pop_dance"
  | "rock_alt"
  | "electronic_club"
  | "classical_score"
  | "jazz_blues"
  | "chill_lofi";

/**
 * Internal scoring profiles. Each FlowKeyword maps to exactly one archetype, plus
 * optional smoothing/hint adjustments. New keywords should reuse these where possible.
 */
export type FlowArchetypeId =
  | "intense_to_calm"
  | "calm_to_intense"
  | "reflective_cooldown"
  | "party_build_up"
  | "workout_energy_rise"
  | "gradually_uplifting"
  | "dark_to_light"
  | "light_to_dark"
  | "slow_emotional_build"
  | "cinematic_arc"
  | "late_night_emotional"
  | "romantic_slow_burn"
  | "low_disruption"
  | "energy_wave"
  | "melancholy_to_resolution";

export interface FlowKeywordHints {
  /** Alternate rise/fall instead of a monotonic curve. */
  wave?: boolean;
  /** Cluster the strongest tracks into a tighter peak band. */
  clusterPeak?: boolean;
  /** Push the peak/lift toward the back third of the playlist. */
  lateLift?: boolean;
  /** Surface stronger contrast between adjacent tracks (less smoothing). */
  emphasizeContrast?: boolean;
}

export interface FlowKeyword {
  /** Namespaced as `<playlistType>.<slug>` — globally unique, stored in app state. */
  id: string;
  label: string;
  description: string;
  archetype: FlowArchetypeId;
  /**
   * 0–2 multiplier on the smoothing pass. 1 is neutral.
   * <1 = allow more abrupt jumps (e.g. drops, contrast).
   * >1 = aggressively smooth tempo / energy steps.
   */
  smoothing: number;
  hints?: FlowKeywordHints;
}

export interface PlaylistType {
  id: PlaylistTypeId;
  label: string;
  description: string;
  keywords: FlowKeyword[];
}

const t = (id: PlaylistTypeId, slug: string) => `${id}.${slug}`;

export const PLAYLIST_TYPES: PlaylistType[] = [
  {
    id: "mixed_mess",
    label: "Mixed Mess",
    description:
      "A chaotic mix of genres, moods, and energies. Best choice when your playlist feels random.",
    keywords: [
      {
        id: t("mixed_mess", "chaos_to_coherence"),
        label: "Chaos to Coherence",
        description:
          "Start with the scattered pieces and gradually make the playlist feel organized.",
        archetype: "cinematic_arc",
        smoothing: 1.6,
      },
      {
        id: t("mixed_mess", "genre_bridge"),
        label: "Genre Bridge",
        description:
          "Smooth out jumps between different genres so transitions feel intentional.",
        archetype: "low_disruption",
        smoothing: 1.8,
      },
      {
        id: t("mixed_mess", "energy_wave"),
        label: "Energy Wave",
        description:
          "Create waves of rise and release instead of a flat or random order.",
        archetype: "energy_wave",
        smoothing: 1.0,
        hints: { wave: true },
      },
      {
        id: t("mixed_mess", "mood_chapters"),
        label: "Mood Chapters",
        description:
          "Group the playlist into emotional chapters with clear movement.",
        archetype: "cinematic_arc",
        smoothing: 1.2,
      },
      {
        id: t("mixed_mess", "surprise_but_smooth"),
        label: "Surprise but Smooth",
        description:
          "Keep the fun of variety while avoiding harsh whiplash.",
        archetype: "low_disruption",
        smoothing: 1.5,
      },
      {
        id: t("mixed_mess", "soft_landing"),
        label: "Soft Landing",
        description:
          "Let the playlist resolve into a calmer, more satisfying ending.",
        archetype: "reflective_cooldown",
        smoothing: 1.3,
      },
    ],
  },
  {
    id: "hip_hop",
    label: "Hip-Hop / Rap",
    description:
      "Bars, beats, confidence, darkness, flex, introspection, and energy shifts.",
    keywords: [
      {
        id: t("hip_hop", "banger_run"),
        label: "Banger Run",
        description: "Stack the hardest tracks into a focused high-energy stretch.",
        archetype: "party_build_up",
        smoothing: 0.8,
        hints: { clusterPeak: true, lateLift: true },
      },
      {
        id: t("hip_hop", "dark_to_victory"),
        label: "Dark to Victory",
        description:
          "Move from darker tension into confidence, power, or triumph.",
        archetype: "dark_to_light",
        smoothing: 1.0,
        hints: { lateLift: true },
      },
      {
        id: t("hip_hop", "aggressive_to_reflective"),
        label: "Aggressive to Reflective",
        description:
          "Start with harder energy and land in something more introspective.",
        archetype: "intense_to_calm",
        smoothing: 1.1,
      },
      {
        id: t("hip_hop", "club_peak"),
        label: "Club Peak",
        description:
          "Build toward the most physical, crowd-moving section.",
        archetype: "party_build_up",
        smoothing: 0.9,
        hints: { clusterPeak: true, lateLift: true },
      },
      {
        id: t("hip_hop", "late_night_rap_arc"),
        label: "Late-night Rap Arc",
        description:
          "Shape the playlist like a late-night drive through darker, smoother cuts.",
        archetype: "late_night_emotional",
        smoothing: 1.3,
      },
      {
        id: t("hip_hop", "lyrical_focus"),
        label: "Lyrical Focus",
        description:
          "Prioritize storytelling and lyrical weight over pure energy.",
        archetype: "slow_emotional_build",
        smoothing: 1.2,
      },
    ],
  },
  {
    id: "rnb_soul",
    label: "R&B / Soul",
    description:
      "Smooth vocals, intimacy, heartbreak, late-night warmth, and slow emotional motion.",
    keywords: [
      {
        id: t("rnb_soul", "romantic_slow_burn"),
        label: "Romantic Slow Burn",
        description:
          "Let intimacy and tension build slowly instead of rushing the peak.",
        archetype: "romantic_slow_burn",
        smoothing: 1.4,
      },
      {
        id: t("rnb_soul", "heartbreak_to_closure"),
        label: "Heartbreak to Closure",
        description:
          "Move from emotional ache toward acceptance or release.",
        archetype: "melancholy_to_resolution",
        smoothing: 1.2,
      },
      {
        id: t("rnb_soul", "late_night_intimacy"),
        label: "Late-night Intimacy",
        description:
          "Keep the playlist smooth, warm, and close, with no sudden shocks.",
        archetype: "late_night_emotional",
        smoothing: 1.6,
      },
      {
        id: t("rnb_soul", "desire_to_distance"),
        label: "Desire to Distance",
        description:
          "Start with closeness and gradually drift into reflection.",
        archetype: "intense_to_calm",
        smoothing: 1.3,
      },
      {
        id: t("rnb_soul", "smooth_vocal_journey"),
        label: "Smooth Vocal Journey",
        description: "Sequence around vocal texture and emotional softness.",
        archetype: "late_night_emotional",
        smoothing: 1.5,
      },
      {
        id: t("rnb_soul", "after_hours_arc"),
        label: "After Hours Arc",
        description:
          "Build a darker, nocturnal flow that feels made for late night.",
        archetype: "late_night_emotional",
        smoothing: 1.2,
      },
    ],
  },
  {
    id: "pop_dance",
    label: "Pop / Dance",
    description: "Catchy hooks, bright energy, dance momentum, and emotional lift.",
    keywords: [
      {
        id: t("pop_dance", "feel_good_rise"),
        label: "Feel-good Rise",
        description: "Gradually lift the brightness and energy.",
        archetype: "gradually_uplifting",
        smoothing: 1.1,
      },
      {
        id: t("pop_dance", "sing_along_peak"),
        label: "Sing-along Peak",
        description:
          "Build toward the biggest hooks and most memorable choruses.",
        archetype: "cinematic_arc",
        smoothing: 0.9,
        hints: { clusterPeak: true, lateLift: true },
      },
      {
        id: t("pop_dance", "bright_to_bittersweet"),
        label: "Bright to Bittersweet",
        description:
          "Start shiny and fun, then slowly reveal more emotional depth.",
        archetype: "light_to_dark",
        smoothing: 1.1,
      },
      {
        id: t("pop_dance", "dance_pop_build"),
        label: "Dance-pop Build",
        description:
          "Increase movement and rhythm until the playlist becomes fully danceable.",
        archetype: "party_build_up",
        smoothing: 1.0,
        hints: { lateLift: true },
      },
      {
        id: t("pop_dance", "main_character_arc"),
        label: "Main Character Arc",
        description: "Shape the order like a confident, cinematic pop moment.",
        archetype: "cinematic_arc",
        smoothing: 1.1,
      },
      {
        id: t("pop_dance", "uplifting_finish"),
        label: "Uplifting Finish",
        description: "End with emotional lift rather than fading out flat.",
        archetype: "gradually_uplifting",
        smoothing: 1.0,
        hints: { lateLift: true },
      },
    ],
  },
  {
    id: "rock_alt",
    label: "Rock / Alternative",
    description: "Guitars, tension, release, raw emotion, and anthem moments.",
    keywords: [
      {
        id: t("rock_alt", "slow_burn_to_anthem"),
        label: "Slow Burn to Anthem",
        description:
          "Start restrained and build toward the biggest, most cathartic moments.",
        archetype: "slow_emotional_build",
        smoothing: 1.0,
        hints: { clusterPeak: true, lateLift: true },
      },
      {
        id: t("rock_alt", "angst_to_release"),
        label: "Angst to Release",
        description:
          "Turn tension, frustration, or heaviness into emotional release.",
        archetype: "cinematic_arc",
        smoothing: 0.9,
        hints: { emphasizeContrast: true },
      },
      {
        id: t("rock_alt", "guitar_energy_rise"),
        label: "Guitar Energy Rise",
        description: "Let riffs, drums, and distortion gradually intensify.",
        archetype: "workout_energy_rise",
        smoothing: 1.0,
      },
      {
        id: t("rock_alt", "emotional_catharsis"),
        label: "Emotional Catharsis",
        description: "Sequence around the feeling of finally letting something out.",
        archetype: "cinematic_arc",
        smoothing: 0.9,
        hints: { clusterPeak: true, emphasizeContrast: true },
      },
      {
        id: t("rock_alt", "road_trip_rock"),
        label: "Road Trip Rock",
        description:
          "Keep momentum moving forward without making the ride feel chaotic.",
        archetype: "calm_to_intense",
        smoothing: 1.4,
      },
      {
        id: t("rock_alt", "acoustic_landing"),
        label: "Acoustic Landing",
        description: "End with something stripped-back, human, or reflective.",
        archetype: "reflective_cooldown",
        smoothing: 1.3,
      },
    ],
  },
  {
    id: "electronic_club",
    label: "Electronic / Club",
    description:
      "Pulse, build-ups, drops, hypnotic loops, and club-style momentum.",
    keywords: [
      {
        id: t("electronic_club", "warm_up_to_peak"),
        label: "Warm-up to Peak",
        description:
          "Start like the room is filling up and build toward the strongest section.",
        archetype: "party_build_up",
        smoothing: 1.1,
        hints: { lateLift: true },
      },
      {
        id: t("electronic_club", "drop_journey"),
        label: "Drop Journey",
        description:
          "Arrange the playlist around tension, release, and drop placement.",
        archetype: "cinematic_arc",
        smoothing: 0.8,
        hints: { emphasizeContrast: true, clusterPeak: true },
      },
      {
        id: t("electronic_club", "hypnotic_pulse"),
        label: "Hypnotic Pulse",
        description:
          "Keep rhythm consistent and immersive without abrupt breaks.",
        archetype: "low_disruption",
        smoothing: 1.8,
      },
      {
        id: t("electronic_club", "dark_club_arc"),
        label: "Dark Club Arc",
        description: "Move through shadowy, physical, late-night energy.",
        archetype: "late_night_emotional",
        smoothing: 1.2,
        hints: { lateLift: true },
      },
      {
        id: t("electronic_club", "euphoric_release"),
        label: "Euphoric Release",
        description: "Build toward a bright, expansive emotional high.",
        archetype: "gradually_uplifting",
        smoothing: 1.0,
        hints: { clusterPeak: true, lateLift: true },
      },
      {
        id: t("electronic_club", "cooldown_set"),
        label: "Cooldown Set",
        description: "Let the energy settle gradually after the peak.",
        archetype: "reflective_cooldown",
        smoothing: 1.4,
      },
    ],
  },
  {
    id: "classical_score",
    label: "Classical / Orchestral / Score",
    description:
      "Movement, tension, drama, calm, grandeur, and resolution.",
    keywords: [
      {
        id: t("classical_score", "gentle_opening"),
        label: "Gentle Opening",
        description:
          "Begin with space, softness, or restraint before larger movement appears.",
        archetype: "slow_emotional_build",
        smoothing: 1.4,
      },
      {
        id: t("classical_score", "tension_and_release"),
        label: "Tension and Release",
        description:
          "Shape the playlist around pressure, suspense, and resolution.",
        archetype: "cinematic_arc",
        smoothing: 0.9,
        hints: { emphasizeContrast: true },
      },
      {
        id: t("classical_score", "grand_finale"),
        label: "Grand Finale",
        description: "Build toward the most dramatic or expansive ending.",
        archetype: "cinematic_arc",
        smoothing: 1.0,
        hints: { clusterPeak: true, lateLift: true },
      },
      {
        id: t("classical_score", "dramatic_arc"),
        label: "Dramatic Arc",
        description: "Make the order feel like a full narrative movement.",
        archetype: "cinematic_arc",
        smoothing: 1.0,
      },
      {
        id: t("classical_score", "melancholy_to_resolution"),
        label: "Melancholy to Resolution",
        description:
          "Move from sorrow or uncertainty toward emotional settlement.",
        archetype: "melancholy_to_resolution",
        smoothing: 1.2,
      },
      {
        id: t("classical_score", "storm_to_serenity"),
        label: "Storm to Serenity",
        description:
          "Begin with force or darkness and gradually arrive at calm.",
        archetype: "intense_to_calm",
        smoothing: 1.2,
      },
    ],
  },
  {
    id: "jazz_blues",
    label: "Jazz / Blues",
    description:
      "Groove, swing, smoky atmosphere, warmth, improvisation, and late-night motion.",
    keywords: [
      {
        id: t("jazz_blues", "smoky_night"),
        label: "Smoky Night",
        description:
          "Create a late-night lounge atmosphere with warm, shadowed movement.",
        archetype: "late_night_emotional",
        smoothing: 1.3,
      },
      {
        id: t("jazz_blues", "cool_to_warm"),
        label: "Cool to Warm",
        description:
          "Start restrained and gradually become more expressive or inviting.",
        archetype: "gradually_uplifting",
        smoothing: 1.2,
      },
      {
        id: t("jazz_blues", "improvisation_journey"),
        label: "Improvisation Journey",
        description:
          "Let solos, groove changes, and expressive moments guide the order.",
        archetype: "cinematic_arc",
        smoothing: 1.1,
      },
      {
        id: t("jazz_blues", "swing_build"),
        label: "Swing Build",
        description: "Increase rhythmic life and looseness across the playlist.",
        archetype: "calm_to_intense",
        smoothing: 1.2,
      },
      {
        id: t("jazz_blues", "blue_mood_to_warm_resolution"),
        label: "Blue Mood to Warm Resolution",
        description:
          "Move from bluesy melancholy toward a softer landing.",
        archetype: "melancholy_to_resolution",
        smoothing: 1.3,
      },
      {
        id: t("jazz_blues", "after_midnight_flow"),
        label: "After Midnight Flow",
        description:
          "Keep the sequence intimate, slow-burning, and nocturnal.",
        archetype: "late_night_emotional",
        smoothing: 1.5,
      },
    ],
  },
  {
    id: "chill_lofi",
    label: "Chill / Lo-fi / Ambient",
    description:
      "Low-energy continuity, focus flow, dreaminess, texture, and soft landings.",
    keywords: [
      {
        id: t("chill_lofi", "focus_flow"),
        label: "Focus Flow",
        description: "Keep the order steady and non-distracting for deep work.",
        archetype: "low_disruption",
        smoothing: 1.9,
      },
      {
        id: t("chill_lofi", "no_sudden_jumps"),
        label: "No Sudden Jumps",
        description: "Avoid sharp energy or rhythm changes as much as possible.",
        archetype: "low_disruption",
        smoothing: 2.0,
      },
      {
        id: t("chill_lofi", "dreamy_drift"),
        label: "Dreamy Drift",
        description:
          "Let the playlist float gently across textures and soft moods.",
        archetype: "late_night_emotional",
        smoothing: 1.7,
      },
      {
        id: t("chill_lofi", "low_energy_continuity"),
        label: "Low-energy Continuity",
        description:
          "Prioritize smoothness and consistency over dramatic movement.",
        archetype: "reflective_cooldown",
        smoothing: 1.7,
      },
      {
        id: t("chill_lofi", "calm_loop"),
        label: "Calm Loop",
        description:
          "Make the playlist feel repeatable, circular, and easy to stay inside.",
        archetype: "low_disruption",
        smoothing: 1.8,
      },
      {
        id: t("chill_lofi", "gentle_fade"),
        label: "Gentle Fade",
        description:
          "End softly, with the energy dissolving rather than stopping abruptly.",
        archetype: "reflective_cooldown",
        smoothing: 1.6,
      },
    ],
  },
];

const TYPE_BY_ID: Map<string, PlaylistType> = new Map(
  PLAYLIST_TYPES.map((p) => [p.id, p]),
);
const KEYWORD_BY_ID: Map<string, FlowKeyword> = new Map();
for (const p of PLAYLIST_TYPES) {
  for (const k of p.keywords) KEYWORD_BY_ID.set(k.id, k);
}

export function getPlaylistType(id: string | null | undefined): PlaylistType | null {
  if (!id) return null;
  return TYPE_BY_ID.get(id) ?? null;
}

export function getFlowKeyword(id: string | null | undefined): FlowKeyword | null {
  if (!id) return null;
  return KEYWORD_BY_ID.get(id) ?? null;
}

export function getFlowKeywordsForType(
  typeId: string | null | undefined,
): FlowKeyword[] {
  return getPlaylistType(typeId)?.keywords ?? [];
}

export function isKeywordValidForType(keywordId: string, typeId: string): boolean {
  return getFlowKeywordsForType(typeId).some((k) => k.id === keywordId);
}

export function getPlaylistTypeLabel(id: string | null | undefined): string | null {
  return getPlaylistType(id)?.label ?? null;
}

export function getFlowKeywordLabels(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const k = getFlowKeyword(id);
    if (k) out.push(k.label);
  }
  return out;
}

/** Maximum number of flow keywords a user can pick at once (current prototype rule). */
export const MAX_FLOW_KEYWORDS = 2;

/** Demo defaults — Mixed Mess, where Flowlist's value is most visible. */
export const DEFAULT_DEMO_PLAYLIST_TYPE: PlaylistTypeId = "mixed_mess";
export const DEFAULT_DEMO_FLOW_KEYWORD_IDS: string[] = [
  t("mixed_mess", "chaos_to_coherence"),
  t("mixed_mess", "energy_wave"),
];

/** Flow keyword id for Soft Landing (Mixed Mess). Sequencer treats this specially. */
export const SOFT_LANDING_FLOW_KEYWORD_ID = t("mixed_mess", "soft_landing");
