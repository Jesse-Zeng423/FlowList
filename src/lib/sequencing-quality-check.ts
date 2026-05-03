import type { SequencedPlaylist, SequencedTrack } from "@/types/flowlist";
import { isUnavailableForSequencing } from "@/lib/filter-tracks-for-sequencing";
import {
  isKeywordValidForType,
  MAX_FLOW_KEYWORDS,
} from "@/lib/flow-presets";
import {
  resolveStrategyFromKeywordIds,
  type FlowStrategy,
} from "@/lib/flow-strategies";
import {
  strategyLandingScore,
  strategyPeakScore,
} from "@/lib/flow-strategy-effects";
import { transitionCostWithStrategy } from "@/lib/transition-cost";
import { buildArcSummaries } from "@/lib/transitions";

const PHASE_RANK: Record<string, number> = {
  Intro: 0,
  Build: 1,
  Peak: 2,
  Cooldown: 3,
  Outro: 4,
};

/**
 * Strategy-aware sequencing quality checks. Returns a list of issues; in dev,
 * `assertMockSequencingInvariant` throws when issues exist.
 *
 * Checks:
 *  - Keywords belong to the playlist type, max-keywords cap.
 *  - No deleted/private items leaked through.
 *  - Result tracks are subset of active source ids.
 *  - Audio-feature honesty (only reliable providers may set exact bpm).
 *  - Phase order is monotonic for non-chaptered flows.
 *  - Flow / summary contradictions for the high-level curve.
 *  - Peak phase scoring sanity (median test, relaxed for stability/landing flows).
 *  - Soft Landing / Acoustic Landing / Cooldown Set / Gentle Fade finale checks.
 *  - Grand Finale: final section beats early section on cinematic + peak.
 *  - No Sudden Jumps / Hypnotic Pulse / Focus Flow: extreme tempo/energy/rhythm
 *    deltas are rare unless unavoidable.
 *  - Mood Chapters: each chapter is internally smoother than the playlist average.
 *  - Cluster-run flows: the cluster contains the strongest banger candidates.
 *  - Calm flows shouldn't accidentally close on aggressive tracks.
 */
export function runSequencingQualityChecks(
  result: SequencedPlaylist,
  playlistTypeId: string | null,
  selectedFlowKeywordIds: string[],
  sourceTrackIds: Set<string>,
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];

  // ---- Selection validity ----
  if (!playlistTypeId) {
    issues.push("No playlist type was selected when sequencing ran.");
  }
  if (selectedFlowKeywordIds.length === 0) {
    issues.push("No flow keywords were selected when sequencing ran.");
  }
  if (selectedFlowKeywordIds.length > MAX_FLOW_KEYWORDS) {
    issues.push(`More than ${MAX_FLOW_KEYWORDS} flow keywords were selected.`);
  }
  if (playlistTypeId) {
    for (const id of selectedFlowKeywordIds) {
      if (!isKeywordValidForType(id, playlistTypeId)) {
        issues.push(`Flow keyword "${id}" does not belong to playlist type "${playlistTypeId}".`);
      }
    }
  }

  const { combined: strategy } = resolveStrategyFromKeywordIds(selectedFlowKeywordIds);

  // ---- Per-track honesty ----
  for (const t of result.tracks) {
    if (isUnavailableForSequencing(t)) {
      issues.push(`Track "${t.title}" should not appear: deleted/private/unavailable.`);
    }
    if (!sourceTrackIds.has(t.id)) {
      issues.push(`Track id ${t.id} is not in the active import set.`);
    }
    const af = t.audioFeatures;
    const reliable = af.source === "third_party" || af.source === "ai_estimated";
    if (typeof af.bpm === "number" && !reliable) {
      issues.push(
        `Track "${t.title}" has an exact BPM but source is "${af.source}" — only reliable providers may set bpm.`,
      );
    }
    if (af.source === "prototype" && !af.bpmRange && !af.tempoFeel) {
      issues.push(
        `Prototype track "${t.title}" has neither bpmRange nor tempoFeel — sequencing has no rhythm signal.`,
      );
    }
  }

  // ---- Phase monotonicity (only for non-chaptered flows) ----
  if (!strategy.flags.chaptered && strategy.curveType !== "chaptered") {
    for (let i = 1; i < result.tracks.length; i++) {
      const a = PHASE_RANK[result.tracks[i - 1]!.phase] ?? 0;
      const b = PHASE_RANK[result.tracks[i]!.phase] ?? 0;
      if (b < a) {
        issues.push(
          `Phase order is non-monotonic at index ${i}: ${result.tracks[i - 1]!.phase} → ${result.tracks[i]!.phase}.`,
        );
      }
    }
  }

  // ---- Flow / summary contradictions ----
  const { moodArcSummary } = buildArcSummaries(
    result.tracks,
    playlistTypeId,
    selectedFlowKeywordIds,
    { chapters: result.chapters ?? null, softLandingMeta: result.softLandingMeta ?? null },
  );
  const contradictions: Array<{
    test: (s: FlowStrategy) => boolean;
    forbidden: RegExp;
    reason: string;
  }> = [
    {
      test: (s) => s.curveType === "linear-fall" || s.curveType === "landing-focused",
      forbidden: /(brightness and emotional lift|generally strengthens toward)/i,
      reason: "Falling / landing flows should not claim a rising back-half.",
    },
    {
      test: (s) => s.curveType === "stability-focused",
      forbidden: /strong(er)? (peak|push|climb)/i,
      reason: "Stability-focused flows should not promise a strong climb or peak.",
    },
  ];
  for (const c of contradictions) {
    if (c.test(strategy) && c.forbidden.test(moodArcSummary)) {
      issues.push(`Flow/summary mismatch: ${c.reason}`);
    }
  }

  // ---- Peak scoring sanity ----
  const peakTracks = result.tracks.filter((t) => t.phase === "Peak");
  if (peakTracks.length) {
    const peakScores = peakTracks.map((t) => strategyPeakScore(t, strategy));
    const allScores = result.tracks.map((t) => strategyPeakScore(t, strategy));
    const sorted = [...allScores].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const lowPeaks = peakScores.filter((s) => s < median * 0.7).length;
    const relaxPeak =
      strategy.curveType === "stability-focused" ||
      strategy.curveType === "landing-focused" ||
      !!strategy.preferredPeak?.mood?.some((m) => /intimate|tension|reflective/i.test(m));
    if (!relaxPeak && lowPeaks > peakTracks.length * 0.6) {
      issues.push(
        "Most Peak-phase tracks have low peakScore for this flow; expected stronger peaks.",
      );
    }
  }

  if (strategy.curveType === "linear-fall") {
    const energyPeaks = peakTracks.filter((t) => t.estimatedEnergy <= 3).length;
    if (peakTracks.length && energyPeaks > peakTracks.length * 0.6) {
      issues.push(
        "Most Peak-phase tracks have very low energy under a falling arc (expected stronger early peak).",
      );
    }
  }

  // ---- Landing finale sanity (any landing-focused strategy) ----
  if (strategy.flags.landingFocused && result.tracks.length >= 2) {
    const last = result.tracks[result.tracks.length - 1]!;
    const landingScores = result.tracks.map((t) => strategyLandingScore(t, strategy));
    const lastScore = strategyLandingScore(last, strategy);
    const bestScore = Math.max(...landingScores);
    const betterCandidates = landingScores.filter((s) => s > lastScore + 8).length;
    if (last.audioFeatures.rhythmIntensity > 70 && betterCandidates > 0) {
      issues.push(
        `Landing finale "${last.title}" has high rhythm intensity (${last.audioFeatures.rhythmIntensity}) and ${betterCandidates} better landing candidates exist.`,
      );
    }
    if (lastScore < bestScore - 25 && betterCandidates > 1) {
      issues.push(
        `Landing finale lands ${(bestScore - lastScore).toFixed(0)} points below the best landing candidate.`,
      );
    }
  }

  // ---- Grand Finale: final section beats early section ----
  if (strategy.flags.grandFinale && result.tracks.length >= 6) {
    const n = result.tracks.length;
    const k = Math.max(2, Math.floor(n * 0.2));
    const head = result.tracks.slice(0, k);
    const tail = result.tracks.slice(-k);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const tailPeak = avg(tail.map((t) => strategyPeakScore(t, strategy)));
    const headPeak = avg(head.map((t) => strategyPeakScore(t, strategy)));
    const tailCinema = avg(tail.map((t) => t.mood.cinematicScale));
    const headCinema = avg(head.map((t) => t.mood.cinematicScale));
    if (tailPeak < headPeak + 3 && tailCinema < headCinema + 4) {
      issues.push(
        "Grand Finale: final section is not visibly bigger than the early section in peak/cinematic scores.",
      );
    }
  }

  // ---- Stability-focused: extreme jumps should be rare ----
  if (strategy.curveType === "stability-focused" && result.tracks.length >= 4) {
    let extreme = 0;
    for (let i = 1; i < result.tracks.length; i++) {
      const a = result.tracks[i - 1]!;
      const b = result.tracks[i]!;
      const tempoStep = Math.abs(rank(a) - rank(b));
      const eDelta = Math.abs(a.estimatedEnergy - b.estimatedEnergy);
      const rDelta = Math.abs(a.audioFeatures.rhythmIntensity - b.audioFeatures.rhythmIntensity);
      if (tempoStep >= 2 || eDelta >= 4 || rDelta >= 35) extreme += 1;
    }
    const ratio = extreme / Math.max(1, result.tracks.length - 1);
    if (ratio > 0.18) {
      issues.push(
        `Stability-focused flow has too many extreme transitions (${extreme} of ${result.tracks.length - 1}, ~${Math.round(ratio * 100)}%).`,
      );
    }
  }

  // ---- Mood Chapters: chapters should be internally smoother ----
  if (
    (strategy.flags.chaptered || strategy.curveType === "chaptered") &&
    result.chapters &&
    result.chapters.length >= 2 &&
    result.tracks.length >= 6
  ) {
    const overall = avgAdjacentCost(result.tracks, strategy);
    let bad = 0;
    for (const ch of result.chapters) {
      if (ch.toIndex - ch.fromIndex < 1) continue;
      const slice = result.tracks.slice(ch.fromIndex, ch.toIndex + 1);
      const local = avgAdjacentCost(slice, strategy);
      if (local > overall * 1.05) bad += 1;
    }
    if (bad > Math.ceil(result.chapters.length / 2)) {
      issues.push(
        "Mood Chapters: most chapters are internally rougher than the playlist as a whole.",
      );
    }
  }

  // ---- Cluster-run: cluster should contain the strongest banger candidates ----
  if (strategy.flags.clusterRun && result.tracks.length >= 8) {
    const peakScores = result.tracks.map((t) => strategyPeakScore(t, strategy));
    const sorted = peakScores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    const top = sorted.slice(0, Math.max(3, Math.round(result.tracks.length * 0.35)));
    const minIdx = Math.min(...top.map((t) => t.i));
    const maxIdx = Math.max(...top.map((t) => t.i));
    const span = maxIdx - minIdx;
    if (span > Math.round(result.tracks.length * 0.7)) {
      issues.push(
        "Cluster-run flow: the strongest peak tracks are spread too widely across the playlist instead of forming a cluster.",
      );
    }
  }

  // ---- Calm flows shouldn't close on aggressive tracks ----
  const calmCurves = new Set(["stability-focused", "linear-fall", "landing-focused"]);
  if (
    calmCurves.has(strategy.curveType) &&
    !strategy.flags.grandFinale &&
    result.tracks.length >= 2
  ) {
    const last = result.tracks[result.tracks.length - 1]!;
    if (last.mood.aggression >= 70 && last.audioFeatures.rhythmIntensity >= 70) {
      issues.push(
        `Calm flow but final track "${last.title}" lands on high aggression and rhythm.`,
      );
    }
  }

  return { ok: issues.length === 0, issues };
}

function rank(t: SequencedTrack): number {
  return t.audioFeatures.tempoFeel === "slow"
    ? 0
    : t.audioFeatures.tempoFeel === "medium"
      ? 1
      : 2;
}

function avgAdjacentCost(tracks: SequencedTrack[], strategy: FlowStrategy): number {
  if (tracks.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < tracks.length; i++) {
    total += transitionCostWithStrategy(tracks[i - 1]!, tracks[i]!, strategy).totalCost;
  }
  return total / (tracks.length - 1);
}

/**
 * Throws if prototype sequencing invariants fail. For devtools / future tests; not
 * invoked from production UI.
 */
export function assertMockSequencingInvariant(
  result: SequencedPlaylist,
  playlistTypeId: string | null,
  selectedFlowKeywordIds: string[],
): void {
  const ids = new Set(result.activeInputTrackIds ?? []);
  const { ok, issues } = runSequencingQualityChecks(
    result,
    playlistTypeId,
    selectedFlowKeywordIds,
    ids,
  );
  if (!ok) {
    throw new Error(`[flowlist] Sequencing QA failed:\n${issues.join("\n")}`);
  }
}
