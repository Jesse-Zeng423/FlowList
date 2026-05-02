import type { Phase, SequencedPlaylist, SequencedTrack, TrackAnalysis } from "@/types/flowlist";
import { DEFAULT_FLOW_IDS } from "@/lib/flow-options";
import {
  normalizedFlowIds,
  phaseThresholdsForArchetype,
  primaryFlowArchetype,
} from "@/lib/flow-archetype";
import { filterTracksForSequencing } from "@/lib/filter-tracks-for-sequencing";
import { buildArcSummaries, buildTransitions } from "@/lib/transitions";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function tempoRank(t: TrackAnalysis["tempoFeel"]): number {
  return t === "slow" ? 0 : t === "medium" ? 1 : 2;
}

function lateProgressScore(track: TrackAnalysis, keywordIds: string[]): number {
  const keys = keywordIds;
  const parts: number[] = [];

  const add = (v: number) => {
    parts.push(clamp(v, 0, 100));
  };

  for (const k of keys) {
    switch (k) {
      case "dark_to_light":
        add(track.moodDarknessScore);
        break;
      case "light_to_dark":
        add(100 - track.moodDarknessScore);
        break;
      case "slow_emotional_build":
        add(track.emotionalIntensityScore * 0.55 + track.estimatedEnergy * 9);
        break;
      case "gradually_uplifting":
        add(track.moodDarknessScore * 0.45 + track.upliftScore * 0.45 + track.estimatedEnergy * 6);
        break;
      case "calm_to_intense":
        add(track.estimatedEnergy * 9 + track.rhythmIntensityScore * 0.35);
        break;
      case "intense_to_calm":
        add(100 - (track.estimatedEnergy * 9 + track.rhythmIntensityScore * 0.35));
        break;
      case "late_night_emotional":
        add(
          (100 - Math.abs(track.moodDarknessScore - 28)) * 0.35 +
            track.emotionalIntensityScore * 0.35 +
            tempoRank(track.tempoFeel) * 18,
        );
        break;
      case "romantic_slow_burn":
        add(tempoRank(track.tempoFeel) * 22 + track.emotionalIntensityScore * 0.45 + track.upliftScore * 0.25);
        break;
      case "cinematic_arc": {
        const e = track.estimatedEnergy;
        const narrative =
          track.emotionalIntensityScore * 0.38 +
          track.moodDarknessScore * 0.22 +
          (10 - Math.abs(e - 5.5)) * 8;
        add(narrative);
        break;
      }
      case "party_build_up":
        add(track.estimatedEnergy * 8.5 + track.rhythmIntensityScore * 0.4);
        break;
      case "workout_energy_rise":
        add(track.estimatedEnergy * 9 + track.rhythmIntensityScore * 0.45 + tempoRank(track.tempoFeel) * 12);
        break;
      case "reflective_cooldown":
        add(100 - track.estimatedEnergy * 9 - tempoRank(track.tempoFeel) * 14);
        break;
      default:
        break;
    }
  }

  const sum = parts.reduce((a, b) => a + b, 0);
  return clamp(sum / parts.length, 0, 100);
}

function smoothTempoOrder(tracks: TrackAnalysis[]): TrackAnalysis[] {
  const arr = [...tracks];
  for (let i = 1; i < arr.length; i++) {
    const prev = tempoRank(arr[i - 1]!.tempoFeel);
    const cur = tempoRank(arr[i]!.tempoFeel);
    if (cur - prev >= 2) {
      for (let j = i + 1; j < Math.min(i + 4, arr.length); j++) {
        if (tempoRank(arr[j]!.tempoFeel) - prev <= 1) {
          const tmp = arr[i]!;
          arr[i] = arr[j]!;
          arr[j] = tmp;
          break;
        }
      }
    }
  }
  return arr;
}

function relaxPeakKeywords(keywordIds: string[]): boolean {
  return keywordIds.some((k) =>
    ["reflective_cooldown", "late_night_emotional", "romantic_slow_burn"].includes(k),
  );
}

function peakFitness(track: TrackAnalysis, relaxPeak: boolean): number {
  let f =
    track.estimatedEnergy * 4.2 +
    track.emotionalIntensityScore * 0.028 +
    track.rhythmIntensityScore * 0.024;
  if (!relaxPeak && track.estimatedEnergy <= 3) {
    f -= 10;
    if (track.emotionalIntensityScore >= 72) f += 6;
  }
  if (relaxPeak && track.emotionalIntensityScore > 70) {
    f += 5;
  }
  return f;
}

/** Demote weak Peak edges so Peak skews to higher energy / intensity / groove. */
function refinePeakRuns(
  phases: Phase[],
  ordered: TrackAnalysis[],
  fitness: number[],
  relaxPeak: boolean,
): void {
  const n = phases.length;
  if (n === 0) return;
  const sortedFit = [...fitness].sort((a, b) => a - b);
  const median = sortedFit[Math.floor(sortedFit.length / 2)] ?? 0;
  const thr = relaxPeak ? median * 0.55 : median * 0.92;

  let i = 0;
  while (i < n) {
    if (phases[i] !== "Peak") {
      i++;
      continue;
    }
    let j = i;
    while (j < n && phases[j] === "Peak") j++;
    let lo = i;
    let hi = j - 1;
    while (lo <= hi && fitness[lo]! < thr && !relaxPeak && ordered[lo]!.estimatedEnergy <= 4) {
      phases[lo] = "Build";
      lo++;
    }
    while (hi >= lo && fitness[hi]! < thr && !relaxPeak && ordered[hi]!.estimatedEnergy <= 4) {
      phases[hi] = "Cooldown";
      hi--;
    }
    if (relaxPeak) {
      while (
        lo <= hi &&
        fitness[lo]! < thr &&
        ordered[lo]!.estimatedEnergy <= 2 &&
        ordered[lo]!.emotionalIntensityScore < 55
      ) {
        phases[lo] = "Build";
        lo++;
      }
      while (
        hi >= lo &&
        fitness[hi]! < thr &&
        ordered[hi]!.estimatedEnergy <= 2 &&
        ordered[hi]!.emotionalIntensityScore < 55
      ) {
        phases[hi] = "Cooldown";
        hi--;
      }
    }
    i = j;
  }
}

function assignPhaseByIndex(
  i: number,
  n: number,
  thresholds: [number, number, number, number],
): Phase {
  if (n <= 1) return "Peak";
  const t = (i + 0.5) / n;
  const [a, b, c, d] = thresholds;
  if (t < a) return "Intro";
  if (t < b) return "Build";
  if (t < c) return "Peak";
  if (t < d) return "Cooldown";
  return "Outro";
}

function energyLabel(e: number): string {
  if (e <= 3) return "low";
  if (e <= 6) return "moderate";
  return "high";
}

function positionReason(track: TrackAnalysis, phase: Phase, index: number, total: number): string {
  const rel = index / Math.max(1, total - 1);
  const tempo = track.tempoFeel;
  const mood = track.estimatedMood;
  switch (phase) {
    case "Intro":
      return `Opens the set with ${tempo} pacing and a ${mood} tone so the journey can unfold without rushing.`;
    case "Build":
      return `Rising chapter: energy reads ${energyLabel(track.estimatedEnergy)} while emotional intensity deepens toward the focal band.`;
    case "Peak":
      if (track.estimatedEnergy <= 4) {
        return `Focal band — ${mood} with modest surface energy but strong emotional or rhythmic weight for this part of the arc.`;
      }
      return `Anchor moment — ${mood} at ${energyLabel(track.estimatedEnergy)} energy and a ${tempo} tempo feel to carry the high point.`;
    case "Cooldown":
      return `Controlled release at roughly ${Math.round(rel * 100)}% through the arc; groove softens while mood stays coherent.`;
    case "Outro":
      return `Landing zone: gentler ${tempo} motion and reflective flavor tags (${track.flavorTags.slice(0, 2).join(", ")}) ease the listener out.`;
    default:
      return `Placed to support smooth continuity at position ${index + 1}.`;
  }
}

/**
 * Main entry: deterministic mock sequencer. Swap implementation for model/API later.
 */
export function sequencePlaylist(tracks: TrackAnalysis[], flowKeywordIds: string[]): SequencedPlaylist {
  const { active, skippedCount } = filterTracksForSequencing(tracks);
  const activeInputTrackIds = active.map((t) => t.id);

  if (active.length === 0) {
    return {
      tracks: [],
      transitions: [],
      moodArcSummary:
        skippedCount > 0
          ? "Every track was skipped as unavailable (for example deleted or private videos) or had no title."
          : "No tracks to analyze yet.",
      rhythmArcSummary:
        skippedCount > 0
          ? "Nothing left to sequence after filtering unavailable items."
          : "Paste a playlist or try a YouTube link.",
      skippedUnavailableCount: skippedCount > 0 ? skippedCount : undefined,
      activeInputTrackIds,
    };
  }

  let keys = normalizedFlowIds(flowKeywordIds);
  if (keys.length === 0) keys = [...DEFAULT_FLOW_IDS];

  const primary = primaryFlowArchetype(keys);
  const thresholds = phaseThresholdsForArchetype(primary);

  const scored = active.map((t) => ({
    track: t,
    score: lateProgressScore(t, keys),
  }));
  scored.sort((a, b) => a.score - b.score);

  let ordered = scored.map((s) => s.track);
  ordered = smoothTempoOrder(ordered);

  const phases = ordered.map((_, i) => assignPhaseByIndex(i, ordered.length, thresholds));
  const relax = relaxPeakKeywords(keys);
  const fitness = ordered.map((t) => peakFitness(t, relax));
  refinePeakRuns(phases, ordered, fitness, relax);

  const sequenced: SequencedTrack[] = ordered.map((t, i) => ({
    ...t,
    phase: phases[i] ?? "Build",
    positionReason: positionReason(t, phases[i] ?? "Build", i, ordered.length),
  }));

  const { moodArcSummary, rhythmArcSummary } = buildArcSummaries(sequenced, keys);
  const transitions = buildTransitions(sequenced, keys);

  return {
    tracks: sequenced,
    transitions,
    moodArcSummary,
    rhythmArcSummary,
    skippedUnavailableCount: skippedCount > 0 ? skippedCount : undefined,
    activeInputTrackIds,
  };
}
