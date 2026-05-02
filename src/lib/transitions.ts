import type { SequencedTrack, TransitionInsight } from "@/types/flowlist";
import { DEFAULT_FLOW_IDS } from "@/lib/flow-options";
import { normalizedFlowIds, primaryFlowArchetype } from "@/lib/flow-archetype";

function tempoWord(t: SequencedTrack["tempoFeel"]): string {
  if (t === "slow") return "slow";
  if (t === "medium") return "steady mid-tempo";
  return "faster, more driving";
}

function deltaEnergy(a: SequencedTrack, b: SequencedTrack): string {
  const d = b.estimatedEnergy - a.estimatedEnergy;
  if (Math.abs(d) <= 1) {
    return "Energy stays in the same band, avoiding a jarring lift or drop.";
  }
  if (d > 0) {
    return `Energy steps up modestly (${a.estimatedEnergy} → ${b.estimatedEnergy}) so the climb feels earned.`;
  }
  return `Energy eases down (${a.estimatedEnergy} → ${b.estimatedEnergy}) for a softer handoff.`;
}

function deltaDarkness(a: SequencedTrack, b: SequencedTrack): string | null {
  const d = b.moodDarknessScore - a.moodDarknessScore;
  if (Math.abs(d) < 8) return null;
  if (d > 0) {
    return "The mood becomes lighter here, letting brightness increase without a sudden genre whiplash.";
  }
  return "The palette grows heavier and more shadowed, deepening the emotional room.";
}

function rhythmNote(a: SequencedTrack, b: SequencedTrack): string {
  const d = b.rhythmIntensityScore - a.rhythmIntensityScore;
  if (a.tempoFeel === b.tempoFeel) {
    if (Math.abs(d) < 12) {
      return `The tempo feel stays ${a.tempoFeel}, keeping rhythmic identity consistent across the cut.`;
    }
    return `The tempo feel stays ${a.tempoFeel} while groove intensity shifts slightly (${a.rhythmIntensityScore} → ${b.rhythmIntensityScore}) for subtle motion.`;
  }
  return `Rhythm moves from ${tempoWord(a.tempoFeel)} to ${tempoWord(b.tempoFeel)} in a controlled step so the playlist does not feel abrupt.`;
}

function keywordHooks(ids: string[]): string[] {
  const hooks: string[] = [];
  if (ids.includes("dark_to_light")) {
    hooks.push("the selected “from dark to light” flow");
  }
  if (ids.includes("light_to_dark")) {
    hooks.push("the selected “from light to dark” flow");
  }
  if (ids.includes("gradually_uplifting")) {
    hooks.push("a gradually uplifting arc");
  }
  if (ids.includes("reflective_cooldown")) {
    hooks.push("a reflective cooldown toward the end");
  }
  if (ids.includes("late_night_emotional")) {
    hooks.push("a late-night emotional through-line");
  }
  if (ids.includes("party_build_up") || ids.includes("workout_energy_rise")) {
    hooks.push("a momentum-forward build");
  }
  if (ids.includes("romantic_slow_burn")) {
    hooks.push("a romantic slow burn");
  }
  if (ids.includes("cinematic_arc")) {
    hooks.push("a cinematic narrative shape");
  }
  if (ids.includes("calm_to_intense")) {
    hooks.push("calm-to-intense progression");
  }
  if (ids.includes("intense_to_calm")) {
    hooks.push("intense-to-calm release");
  }
  return hooks;
}

export function buildTransitions(tracks: SequencedTrack[], flowKeywordIds: string[]): TransitionInsight[] {
  const hooks = keywordHooks(flowKeywordIds);
  const hook = hooks.length ? hooks[0]! : "your chosen journey keywords";

  const out: TransitionInsight[] = [];
  for (let i = 1; i < tracks.length; i++) {
    const a = tracks[i - 1]!;
    const b = tracks[i]!;
    const sentences: string[] = [];

    const shared = a.flavorTags.filter((t) => b.flavorTags.includes(t));
    if (shared.length) {
      sentences.push(
        `Shared ${shared.slice(0, 2).join(" / ")} DNA keeps tonal continuity while the set advances.`,
      );
    } else {
      sentences.push("This handoff reframes the emotional color while keeping motion controlled.");
      sentences.push(deltaEnergy(a, b));
    }

    const dark = deltaDarkness(a, b);
    if (dark) sentences.push(dark);

    sentences.push(rhythmNote(a, b));

    if (hooks.length) {
      sentences.push(`Overall sequencing bias reflects ${hook}.`);
    }

    const explanation = sentences.slice(0, 3).join(" ");

    out.push({
      fromIndex: i - 1,
      toIndex: i,
      explanation,
    });
  }
  return out;
}

function moodSummaryForFlow(primary: string, keys: string[], trackCount: number): string {
  const cinematicExtra =
    primary !== "cinematic_arc" && keys.includes("cinematic_arc")
      ? " Cinematic pacing still shapes how tension rises and resolves."
      : "";

  switch (primary) {
    case "intense_to_calm":
      return `This prototype arc places stronger energy, rhythm, and emotional intensity earlier, then eases into calmer, softer territory — matching “intense to calm.”${cinematicExtra}`;
    case "calm_to_intense":
      return `The sequence starts steadier and climbs in energy and drive toward a stronger late push — aligned with “calm to intense.”${cinematicExtra}`;
    case "dark_to_light":
      return `Mood brightness and emotional lift trend upward across the ${trackCount} tracks, moving from heavier colors toward lighter space.${cinematicExtra}`;
    case "light_to_dark":
      return `The playlist gradually shifts into darker, weightier emotional territory rather than staying in a purely bright register.${cinematicExtra}`;
    case "gradually_uplifting":
      return `Emotional brightness and perceived lift increase in measured steps — a gradual uplift rather than a single jump.${cinematicExtra}`;
    case "reflective_cooldown":
      return `The ordering lands in softer, more introspective ground — room to cool down and reflect instead of pushing harder.${cinematicExtra}`;
    case "party_build_up":
    case "workout_energy_rise":
      return `Rhythm and energy skew toward a late climb, like a warm-up that saves the biggest push for the final stretch.${cinematicExtra}`;
    case "slow_emotional_build":
      return `Intensity and vulnerability accrue slowly; the arc favors patience over early spikes.${cinematicExtra}`;
    case "late_night_emotional":
      return `The through-line stays intimate and nocturnal — close, subdued, and emotionally direct.${cinematicExtra}`;
    case "romantic_slow_burn":
      return `Tempo and intimacy deepen with restraint — romance without rushing the peak.${cinematicExtra}`;
    case "cinematic_arc":
    default:
      return `This mock journey follows a narrative contour: space to breathe, a rising middle, a focal band, then resolution — classic cinematic pacing across ${trackCount} tracks.`;
  }
}

function rhythmSummaryForFlow(
  primary: string,
  keys: string[],
  first: SequencedTrack,
  last: SequencedTrack,
): string {
  const cinematicExtra =
    primary !== "cinematic_arc" && keys.includes("cinematic_arc")
      ? " Narrative smoothing still governs how tempo steps are staged."
      : "";

  const span = `Groove intensity runs about ${first.rhythmIntensityScore} → ${last.rhythmIntensityScore} with ${first.tempoFeel} → ${last.tempoFeel} endcaps.`;

  switch (primary) {
    case "intense_to_calm":
      return `${span} Rhythmic drive is weighted earlier; later tracks ease toward sparser or steadier motion.${cinematicExtra}`;
    case "calm_to_intense":
    case "party_build_up":
    case "workout_energy_rise":
      return `${span} Perceived rhythm intensity generally strengthens toward the back half.${cinematicExtra}`;
    case "reflective_cooldown":
      return `${span} Later segments favor gentler motion and less aggressive groove.${cinematicExtra}`;
    case "gradually_uplifting":
      return `${span} Energy and rhythmic lift trend upward in small controlled steps.${cinematicExtra}`;
    case "dark_to_light":
    case "light_to_dark":
      return `${span} Tempo feel is smoothed between cuts; the arc follows your light/dark mood keyword more than raw BPM.${cinematicExtra}`;
    case "slow_emotional_build":
      return `${span} Groove shifts stay gradual so emotional buildup can breathe.${cinematicExtra}`;
    case "late_night_emotional":
    case "romantic_slow_burn":
      return `${span} Rhythmic changes stay understated — continuity matters more than impact.${cinematicExtra}`;
    case "cinematic_arc":
    default:
      return `${span} Rhythmic staging follows a story shape: establish, rise, focal band, then release.${cinematicExtra}`;
  }
}

export function buildArcSummaries(
  tracks: SequencedTrack[],
  flowKeywordIds: string[],
): { moodArcSummary: string; rhythmArcSummary: string } {
  if (tracks.length === 0) {
    return { moodArcSummary: "", rhythmArcSummary: "" };
  }
  let keys = normalizedFlowIds(flowKeywordIds);
  if (keys.length === 0) keys = [...DEFAULT_FLOW_IDS];
  const primary = primaryFlowArchetype(keys);
  const first = tracks[0]!;
  const last = tracks[tracks.length - 1]!;

  const moodArcSummary = moodSummaryForFlow(primary, keys, tracks.length);
  const rhythmArcSummary = rhythmSummaryForFlow(primary, keys, first, last);

  return { moodArcSummary, rhythmArcSummary };
}
