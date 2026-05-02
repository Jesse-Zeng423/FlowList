import type { Phase, SequencedPlaylist, SequencedTrack, TrackAnalysis } from "@/types/flowlist";
import { FLOW_KEYWORDS } from "@/lib/flow-options";
import { buildArcSummaries, buildTransitions } from "@/lib/transitions";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function tempoRank(t: TrackAnalysis["tempoFeel"]): number {
  return t === "slow" ? 0 : t === "medium" ? 1 : 2;
}

/** Normalize keyword ids; unknown ids ignored. */
function normalizedKeywords(ids: string[]): string[] {
  const valid = new Set(FLOW_KEYWORDS.map((k) => k.id));
  return ids.filter((id) => valid.has(id));
}

/**
 * Combine selected flows into a 0–100 "desired progression" score per track.
 * Higher score → should appear later in the playlist (after sorting ascending by a derived key we invert as needed).
 *
 * We compute `lateProgress` where higher = later in set. Sort ascending on `lateProgress` gives dark→light when
 * lateProgress correlates with lightness.
 */
function lateProgressScore(track: TrackAnalysis, keywordIds: string[]): number {
  let keys = normalizedKeywords(keywordIds);
  if (keys.length === 0) {
    keys = ["dark_to_light", "cinematic_arc"];
  }

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
        const ideal = 5.5;
        const bell = 100 - Math.abs(e - ideal) * 14;
        add(bell * 0.45 + track.emotionalIntensityScore * 0.35 + track.moodDarknessScore * 0.2);
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

function assignPhases(n: number): Phase[] {
  if (n === 0) return [];
  const phases: Phase[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (t < 0.2) phases.push("Intro");
    else if (t < 0.45) phases.push("Build");
    else if (t < 0.7) phases.push("Peak");
    else if (t < 0.88) phases.push("Cooldown");
    else phases.push("Outro");
  }
  return phases;
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
      return `Rising chapter: energy reads ${energyLabel(track.estimatedEnergy)} while emotional intensity deepens toward the peak.`;
    case "Peak":
      return `Anchor moment — ${mood} at ${energyLabel(track.estimatedEnergy)} energy and a ${tempo} tempo feel to carry the emotional high point.`;
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
  if (tracks.length === 0) {
    return {
      tracks: [],
      transitions: [],
      moodArcSummary: "No tracks to analyze yet.",
      rhythmArcSummary: "Paste a playlist or try a Spotify link (demo mode uses mock tracks).",
    };
  }

  const keys = normalizedKeywords(flowKeywordIds);
  const scored = tracks.map((t) => ({
    track: t,
    score: lateProgressScore(t, keys),
  }));
  scored.sort((a, b) => a.score - b.score);

  let ordered = scored.map((s) => s.track);
  ordered = smoothTempoOrder(ordered);

  const phases = assignPhases(ordered.length);
  const sequenced: SequencedTrack[] = ordered.map((t, i) => ({
    ...t,
    phase: phases[i] ?? "Build",
    positionReason: positionReason(t, phases[i] ?? "Build", i, ordered.length),
  }));

  const { moodArcSummary, rhythmArcSummary } = buildArcSummaries(sequenced, keys);
  const transitions = buildTransitions(sequenced, keys);

  return { tracks: sequenced, transitions, moodArcSummary, rhythmArcSummary };
}
