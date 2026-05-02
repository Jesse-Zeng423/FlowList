import type { SequencedTrack, TransitionInsight } from "@/types/flowlist";

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

export function buildArcSummaries(
  tracks: SequencedTrack[],
  flowKeywordIds: string[],
): { moodArcSummary: string; rhythmArcSummary: string } {
  if (tracks.length === 0) {
    return {
      moodArcSummary: "",
      rhythmArcSummary: "",
    };
  }
  const first = tracks[0]!;
  const last = tracks[tracks.length - 1]!;

  const moodDelta = last.moodDarknessScore - first.moodDarknessScore;
  let moodArcSummary = `Mood moves from “${first.estimatedMood}” toward “${last.estimatedMood}” across ${tracks.length} tracks.`;
  if (moodDelta > 12) {
    moodArcSummary += " Brightness and emotional lift increase over time.";
  } else if (moodDelta < -12) {
    moodArcSummary += " The arc leans into deeper, more shadowed emotional territory.";
  } else {
    moodArcSummary += " Darkness and light stay in dialogue without a single blunt swing.";
  }

  if (flowKeywordIds.includes("late_night_emotional")) {
    moodArcSummary += " The set favors intimate, nocturnal colors.";
  }

  const tempos = tracks.map((t) => t.tempoFeel);
  const slowPct = tempos.filter((t) => t === "slow").length / tempos.length;
  const fastPct = tempos.filter((t) => t === "fast").length / tempos.length;

  let rhythmArcSummary = `Rhythm story: groove intensity runs from ${first.rhythmIntensityScore} to ${last.rhythmIntensityScore} with ${first.tempoFeel} → ${last.tempoFeel} endcaps.`;
  if (slowPct > 0.45) {
    rhythmArcSummary += " Tempo feel skews slow-to-medium for a patient body rhythm.";
  } else if (fastPct > 0.45) {
    rhythmArcSummary += " Tempo feel skews medium-to-fast for sustained motion.";
  } else {
    rhythmArcSummary += " Tempo feel mixes slow, medium, and fast with smoothing passes to limit harsh jumps.";
  }

  return { moodArcSummary, rhythmArcSummary };
}
