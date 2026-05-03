/**
 * Central pairwise compatibility between flow keywords (hard conflict, soft tension, recommended pairs).
 * Selection is capped at MAX_FLOW_KEYWORDS (2); rules still use global ids for cross-type future-proofing.
 */

const K = {
  chaos: "mixed_mess.chaos_to_coherence",
  bridge: "mixed_mess.genre_bridge",
  wave: "mixed_mess.energy_wave",
  chapters: "mixed_mess.mood_chapters",
  surpriseSmooth: "mixed_mess.surprise_but_smooth",
  softLanding: "mixed_mess.soft_landing",
  nsj: "chill_lofi.no_sudden_jumps",
  gf: "classical_score.grand_finale",
  sts: "classical_score.storm_to_serenity",
  melRes: "classical_score.melancholy_to_resolution",
  gentleFade: "chill_lofi.gentle_fade",
  acousticLanding: "rock_alt.acoustic_landing",
  cooldown_set: "electronic_club.cooldown_set",
  euphoric: "electronic_club.euphoric_release",
  calm_loop: "chill_lofi.calm_loop",
  banger: "hip_hop.banger_run",
  club_peak: "hip_hop.club_peak",
  drop: "electronic_club.drop_journey",
  warm_peak: "electronic_club.warm_up_to_peak",
  low_energy: "chill_lofi.low_energy_continuity",
  aggressive_reflect: "hip_hop.aggressive_to_reflective",
  lateNightRap: "hip_hop.late_night_rap_arc",
  romantic_slow: "rnb_soul.romantic_slow_burn",
  desire_distance: "rnb_soul.desire_to_distance",
  uplift: "pop_dance.uplifting_finish",
  bright_bitter: "pop_dance.bright_to_bittersweet",
  feel_good: "pop_dance.feel_good_rise",
  hypnotic: "electronic_club.hypnotic_pulse",
};

function canonPair(a: string, b: string): string {
  return a < b ? `${a}<>${b}` : `${b}<>${a}`;
}

export function flowKeywordCanonPair(a: string, b: string): string {
  return canonPair(a, b);
}

/** Disables the opposite card entirely. Messages are short UX notes. */
const HARD_CONFLICT_MESSAGES: Record<string, string> = {
  /** Mixed Mess structural */
  [canonPair(K.chapters, K.wave)]:
    "Mood chapters and Energy Wave fight for playlist macro structure.",
  [canonPair(K.chapters, K.chaos)]:
    "Chapters need internal coherence — Chaos-to-Coherence wants a drifting global arc.",
  /** Classical ending direction */
  [canonPair(K.gf, K.sts)]:
    "Grand Finale pushes an expansive finale; Storm to Serenity wants a quieter landing.",
  /** Hip-hop */
  [canonPair(K.banger, K.aggressive_reflect)]:
    "Banger clustering fights the pullback into reflection.",
  [canonPair(K.banger, K.lateNightRap)]:
    "Banger run wants a spike; late-night arc keeps things smooth.",
  [canonPair(K.club_peak, K.aggressive_reflect)]:
    "Club peak ramps physical energy; reflective arc wants softer motion.",
  /** R&B */
  [canonPair(K.romantic_slow, K.desire_distance)]:
    "Slow burn climbs closeness; Desire to Distance drifts outward.",
  /** Electronic hypnotic vs drop-heavy */
  [canonPair(K.hypnotic, K.drop)]:
    "Hypnotic continuity clashes with abrupt drop choreography.",
};

// Cross-playlist-type endings & continuity (requested for unified semantics)
[
  canonPair(K.softLanding, K.gf),
  canonPair(K.softLanding, K.uplift),
  canonPair(K.gentleFade, K.gf),
  canonPair(K.gentleFade, K.uplift),
  canonPair(K.acousticLanding, K.gf),
  canonPair(K.cooldown_set, K.gf),
  canonPair(K.nsj, K.banger),
  canonPair(K.nsj, K.club_peak),
  canonPair(K.nsj, K.drop),
  canonPair(K.nsj, K.warm_peak),
  canonPair(K.chapters, K.banger),
  canonPair(K.chapters, K.warm_peak),
  canonPair(K.chapters, K.drop),
  canonPair(K.wave, K.calm_loop),
  canonPair(K.banger, K.calm_loop),
  canonPair(K.low_energy, K.banger),
  canonPair(K.low_energy, K.club_peak),
  canonPair(K.low_energy, K.drop),
].forEach((pair) => {
  if (!(pair in HARD_CONFLICT_MESSAGES)) {
    HARD_CONFLICT_MESSAGES[pair] = "Conflicts with selected movement.";
  }
});

export const FLOW_HARD_CONFLICT_KEYS = new Set(Object.keys(HARD_CONFLICT_MESSAGES));

/** Selectable tensions — hover text only (never includes hypnotic × drop — that pair is HARD). */
const SOFT_TENSION_MESSAGES: Record<string, string> = {
  [canonPair(K.wave, K.softLanding)]:
    "Energy Wave pushes crest/release cycles; Soft Landing wants the final bend downward — Flowlist will balance both.",
  [canonPair(K.surpriseSmooth, K.softLanding)]:
    "Surprise-but-smooth keeps contrast alive; Soft Landing softens the close — pairing can pull in different directions.",
  [canonPair(K.nsj, K.wave)]:
    "No Sudden Jumps caps jump size; waves still crest — sequencing stays within continuity bounds.",
  [canonPair(K.nsj, K.surpriseSmooth)]:
    "NSJ restricts surprise spikes; Surprise but Smooth still cushions contrast — sequencing balances both.",
  [canonPair(K.nsj, "jazz_blues.swing_build")]:
    "Swing build loosens the groove — NSJ still keeps neighbouring tracks from jarring spikes.",
  [canonPair(K.nsj, K.euphoric)]:
    "Euphoric lifts want climbs — NSJ still caps reckless jumps between neighbouring tracks.",
  [canonPair(K.uplift, K.softLanding)]:
    "Uplifting finish lifts the close; Soft Landing biases softer motion — sequencing balances gently.",
  [canonPair(K.gf, K.melRes)]:
    "Melancholy-to-resolution arcs can still crown in drama — Flowlist keeps one finale direction.",
  [canonPair(K.bright_bitter, K.uplift)]:
    "Bittersweet moods vs uplifting finish tug on the finale — sequencer blends carefully.",
  [canonPair(K.feel_good, K.bright_bitter)]:
    "Feel-good brightness vs bittersweet deepening — contrast is intentional but needs balance.",
  [canonPair("pop_dance.sing_along_peak", K.bright_bitter)]:
    "Hook peak wants lift; bittersweet pulls emotional weight — sequencer stages both.",
  [canonPair("pop_dance.dance_pop_build", K.bright_bitter)]:
    "Dance build vs emotional bittersweet — Flowlist averages the contour.",
  [canonPair(K.cooldown_set, K.euphoric)]:
    "Cooldown set wants post-peak glide; euphoric release pushes upward — sequencer plans peak then glide.",
  [canonPair(K.hypnotic, K.euphoric)]:
    "Hypnotic steadiness vs euphoric lift — pacing can tug; penalties stay moderate.",
  [canonPair("rock_alt.slow_burn_to_anthem", K.acousticLanding)]:
    "Anthem climax vs acoustic softness — sequencer can tuck the landing after peak energy.",
  [canonPair("rock_alt.guitar_energy_rise", K.acousticLanding)]:
    "Guitar climbs vs softer landing — Flowlist sequences the payoff before the unplugged close.",
  [canonPair("rock_alt.road_trip_rock", K.acousticLanding)]:
    "Momentum vs reflective landing — Flowlist keeps road-trip drive before stripping back.",
};

// Jazz / Chill extras
SOFT_TENSION_MESSAGES[canonPair("jazz_blues.swing_build", "jazz_blues.smoky_night")] =
  "Swing build adds lift; smoky night favors low glow — sequencer keeps motion gentle.";
SOFT_TENSION_MESSAGES[
  canonPair("jazz_blues.cool_to_warm", "jazz_blues.blue_mood_to_warm_resolution")
] = "Two warm arcs — Flowlist aligns them without double-counting the same move.";
SOFT_TENSION_MESSAGES[canonPair(K.nsj, "chill_lofi.dreamy_drift")] =
  "Dreamy drift floats across textures — NSJ still caps harsh jumps.";
SOFT_TENSION_MESSAGES[canonPair("chill_lofi.focus_flow", "chill_lofi.dreamy_drift")] =
  "Focus wants steadiness; drift adds lateral motion — Flowlist keeps distractions low.";
SOFT_TENSION_MESSAGES[canonPair(K.calm_loop, K.gentleFade)] =
  "Loops want circular return; fades want directional ending — sequencer picks a dominant close.";
SOFT_TENSION_MESSAGES[canonPair("electronic_club.dark_club_arc", K.euphoric)] =
  "Dark club vs euphoric lift — Flowlist stages contrast without losing club physics.";

const RECOMMENDED_PAIRS = new Set<string>([
  canonPair(K.bridge, K.wave),
  canonPair(K.bridge, K.chapters),
  canonPair(K.bridge, K.surpriseSmooth),
  canonPair(K.bridge, K.chaos),
  canonPair(K.wave, K.surpriseSmooth),
  canonPair(K.softLanding, K.chapters),
  canonPair(K.softLanding, K.chaos),
  canonPair(K.chapters, K.surpriseSmooth),
  canonPair(K.nsj, "chill_lofi.focus_flow"),
  canonPair(K.nsj, K.low_energy),
  canonPair(K.low_energy, K.calm_loop),
  canonPair(K.banger, K.club_peak),
  canonPair("hip_hop.dark_to_victory", "hip_hop.lyrical_focus"),
  canonPair(K.aggressive_reflect, "hip_hop.lyrical_focus"),
  canonPair(K.lateNightRap, "hip_hop.lyrical_focus"),
  canonPair("hip_hop.dark_to_victory", K.club_peak),
  canonPair(K.romantic_slow, "rnb_soul.late_night_intimacy"),
  canonPair(K.romantic_slow, "rnb_soul.smooth_vocal_journey"),
  canonPair("rnb_soul.heartbreak_to_closure", "rnb_soul.smooth_vocal_journey"),
  canonPair("rnb_soul.heartbreak_to_closure", "rnb_soul.late_night_intimacy"),
  canonPair("rnb_soul.after_hours_arc", K.desire_distance),
  canonPair("rnb_soul.late_night_intimacy", "rnb_soul.smooth_vocal_journey"),
  canonPair(K.feel_good, K.uplift),
  canonPair(K.feel_good, "pop_dance.main_character_arc"),
  canonPair("pop_dance.dance_pop_build", "pop_dance.sing_along_peak"),
  canonPair("pop_dance.main_character_arc", "pop_dance.sing_along_peak"),
  canonPair("pop_dance.main_character_arc", K.uplift),
  canonPair("rock_alt.slow_burn_to_anthem", "rock_alt.emotional_catharsis"),
  canonPair("rock_alt.angst_to_release", "rock_alt.emotional_catharsis"),
  canonPair("rock_alt.guitar_energy_rise", "rock_alt.slow_burn_to_anthem"),
  canonPair("rock_alt.road_trip_rock", "rock_alt.guitar_energy_rise"),
  canonPair(K.acousticLanding, "rock_alt.angst_to_release"),
  canonPair(K.warm_peak, K.drop),
  canonPair(K.warm_peak, K.euphoric),
  canonPair(K.drop, "electronic_club.dark_club_arc"),
  canonPair(K.hypnotic, "electronic_club.dark_club_arc"),
  canonPair(K.cooldown_set, K.warm_peak),
  canonPair("classical_score.tension_and_release", K.gf),
  canonPair("classical_score.tension_and_release", "classical_score.dramatic_arc"),
  canonPair("classical_score.dramatic_arc", K.gf),
  canonPair(K.melRes, "classical_score.gentle_opening"),
  canonPair(K.sts, "classical_score.tension_and_release"),
  canonPair("jazz_blues.smoky_night", "jazz_blues.after_midnight_flow"),
  canonPair(
    "jazz_blues.cool_to_warm",
    "jazz_blues.blue_mood_to_warm_resolution",
  ),
  canonPair("jazz_blues.improvisation_journey", "jazz_blues.swing_build"),
  canonPair("jazz_blues.blue_mood_to_warm_resolution", "jazz_blues.after_midnight_flow"),
]);

export interface HardConflictHit {
  labelId: string;
  /** Short subtitle for amber line */
  detail?: string;
  /** Primary lock message */
  message: string;
}

export function resolveHardConflict(
  candidateId: string,
  selectedIds: readonly string[],
): HardConflictHit | null {
  for (const sid of selectedIds) {
    if (sid === candidateId) continue;
    const key = canonPair(candidateId, sid);
    const message = HARD_CONFLICT_MESSAGES[key];
    if (!message) continue;
    return { labelId: sid, message, detail: message };
  }
  return null;
}

export function softTensionAgainstSelected(
  candidateId: string,
  selectedIds: readonly string[],
): string | null {
  for (const sid of selectedIds) {
    if (sid === candidateId) continue;
    const hint = SOFT_TENSION_MESSAGES[canonPair(candidateId, sid)];
    if (hint) return hint;
  }
  return null;
}

export function isRecommendedPairing(candidateId: string, selectedIds: readonly string[]): boolean {
  for (const sid of selectedIds) {
    if (sid === candidateId) continue;
    if (RECOMMENDED_PAIRS.has(canonPair(candidateId, sid))) return true;
  }
  return false;
}

/** Notes appended into combined semantics for dev / diagnostics */
export function collectSoftTensionNotes(selectedIds: readonly string[]): string[] {
  if (selectedIds.length < 2) return [];
  const [a, b] = selectedIds;
  if (!a || !b) return [];
  const key = canonPair(a, b);
  const hint = SOFT_TENSION_MESSAGES[key];
  return hint ? [hint] : [];
}

export function collectRecommendedNotes(selectedIds: readonly string[]): string[] {
  if (selectedIds.length < 2) return [];
  const [a, b] = selectedIds;
  if (!a || !b) return [];
  const key = canonPair(a, b);
  if (RECOMMENDED_PAIRS.has(key)) {
    return ["Pairing aligns with complementary movement roles."];
  }
  return [];
}
