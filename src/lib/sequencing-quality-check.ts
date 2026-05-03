import type { SequencedPlaylist, SequencedTrack } from "@/types/flowlist";
import { isUnavailableForSequencing } from "@/lib/filter-tracks-for-sequencing";
import {
  isKeywordValidForType,
  MAX_FLOW_KEYWORDS,
} from "@/lib/flow-presets";
import {
  resolveStrategyFromKeywordIds,
  strategyUsesWaveMotion,
  type FlowStrategy,
} from "@/lib/flow-strategies";
import {
  strategyLandingScore,
  strategyPeakScore,
} from "@/lib/flow-strategy-effects";
import { transitionCostWithStrategy } from "@/lib/transition-cost";
import { combineResolvedFlowSemantics, type ResolvedFlowSemantics } from "@/lib/flow-semantics";
import { FLOW_HARD_CONFLICT_KEYS, flowKeywordCanonPair } from "@/lib/flow-compatibility";
import { buildArcSummaries, buildTransitions } from "@/lib/transitions";

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
  const flowSemantics = combineResolvedFlowSemantics(selectedFlowKeywordIds);

  // ---- Arc + transition blobs (strategy- and semantics-aware) ----
  const { moodArcSummary, rhythmArcSummary } = buildArcSummaries(
    result.tracks,
    playlistTypeId,
    selectedFlowKeywordIds,
    { chapters: result.chapters ?? null, softLandingMeta: result.softLandingMeta ?? null },
  );
  const transitionInsightsForQa = buildTransitions(
    result.tracks,
    playlistTypeId,
    selectedFlowKeywordIds,
    flowSemantics,
  );
  const transitionBlobForQa = transitionInsightsForQa.map((x) => x.explanation).join(" ");
  const positionBlobForQa = result.tracks.map((t) => t.positionReason).join(" ");

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
      strategyUsesWaveMotion(strategy) ||
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
    const overall = avgAdjacentCost(result.tracks, strategy, flowSemantics);
    let bad = 0;
    for (const ch of result.chapters) {
      if (ch.toIndex - ch.fromIndex < 1) continue;
      const slice = result.tracks.slice(ch.fromIndex, ch.toIndex + 1);
      const local = avgAdjacentCost(slice, strategy, flowSemantics);
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

  // ---- Energy Wave heuristics (prototype QA) ----------------------------
  const ENERGY_WAVE_ID = "mixed_mess.energy_wave";
  const hasEnergyWaveKw = selectedFlowKeywordIds.includes(ENERGY_WAVE_ID);
  if (hasEnergyWaveKw && result.tracks.length >= 20) {
    const grooveHeadlineEw = (t: SequencedTrack) => {
      const energy = Math.min(100, Math.max(0, t.estimatedEnergy * 10));
      return energy * 0.46 + t.audioFeatures.rhythmIntensity * 0.54;
    };
    const g = result.tracks.map(grooveHeadlineEw);

    let crests = 0;
    let troughs = 0;
    const db = 1.25;
    for (let i = 1; i < g.length - 1; i++) {
      const v = g[i]!;
      if (v > g[i - 1]! + db && v > g[i + 1]! + db) crests += 1;
      else if (v < g[i - 1]! - db && v < g[i + 1]! - db) troughs += 1;
    }

    const n = result.tracks.length;

    const diffs: number[] = [];
    for (let i = 0; i < g.length - 1; i++) {
      diffs.push(g[i + 1]! - g[i]!);
    }
    let pos = 0;
    let neg = 0;
    let materialMoves = 0;
    for (const d of diffs) {
      if (Math.abs(d) < 2) continue;
      materialMoves += 1;
      if (d > 0) pos += 1;
      else neg += 1;
    }
    const dirDominantShare =
      materialMoves > 0 ? Math.max(pos, neg) / materialMoves : 0;
    const nearMonotoneSlope =
      n >= 32 && materialMoves >= 18 && troughs === 0 && dirDominantShare >= 0.9;

    if (n > 40 && crests < 2) {
      issues.push(
        "Energy Wave (>40 tracks): waveform should expose at least two local crests; ordering looks too plateau-like.",
      );
    }
    if (n > 40 && troughs < 1) {
      issues.push(
        "Energy Wave (>40 tracks): expected at least one clear release trough between climbs — groove arc looks too one-directional.",
      );
    }

    if (n >= 25 && troughs === 0 && crests <= 1) {
      issues.push(
        "Energy Wave waveform looks nearly flat/monotone — crests/releases are weaker than targets for wave motion.",
      );
    }

    if (nearMonotoneSlope && crests <= 2) {
      issues.push(
        "Energy Wave sequencing is dangerously close to a single slope despite wave intent.",
      );
    }

    const reasonsBlob = positionBlobForQa;
    if (
      !strategy.flags.landingFocused &&
      /\blanding zone\b|ease(s)? the listener out|softening the landing\b/i.test(
        `${reasonsBlob} ${transitionBlobForQa}`,
      )
    ) {
      issues.push(
        "Energy Wave without a landing-focused flow still references landing-zone copy — captions should describe crests/releases instead.",
      );
    }

    if (strategy.flags.landingFocused && n >= 10) {
      const k = Math.max(2, Math.ceil(n * 0.12));
      const tail = g.slice(-k);
      const body = g.slice(0, Math.max(k, n - k));
      const tailAvg = tail.reduce((a, b) => a + b, 0) / tail.length;
      const bodyAvg = body.reduce((a, b) => a + b, 0) / body.length;
      if (tailAvg >= bodyAvg - 1.75) {
        issues.push(
          "Energy Wave + Soft Landing: final ~12–15% of groove headline should slope softer than earlier sections — sequencing did not decompress the tail strongly enough.",
        );
      }
    }
  }

  const qaCombinedLower = `${moodArcSummary} ${rhythmArcSummary} ${transitionBlobForQa} ${positionBlobForQa}`.toLowerCase();
  if (selectedFlowKeywordIds.length === 2) {
    const pairKey = flowKeywordCanonPair(selectedFlowKeywordIds[0]!, selectedFlowKeywordIds[1]!);
    if (FLOW_HARD_CONFLICT_KEYS.has(pairKey)) {
      issues.push(
        `Semantics QA: conflicting keyword pair in result pipeline (${selectedFlowKeywordIds.join(" vs ")}).`,
      );
    }
  }
  for (const frag of flowSemantics.explanationBannedPhrasesNormalized) {
    if (!frag.trim()) continue;
    if (qaCombinedLower.includes(frag)) {
      issues.push(`Semantics QA: surfaced copy contains forbidden fragment "${frag}".`);
    }
  }
  if (
    flowSemantics.noSuddenJumpsKeyword &&
    (qaCombinedLower.includes("deliberate gear-shift") ||
      qaCombinedLower.includes("deliberate gear-change") ||
      qaCombinedLower.includes("intentional whiplash"))
  ) {
    issues.push("Semantics QA: No Sudden Jumps selection contradicts transition/summary wording.");
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

function avgAdjacentCost(
  tracks: SequencedTrack[],
  strategy: FlowStrategy,
  flowSemantics: ResolvedFlowSemantics,
): number {
  if (tracks.length < 2) return 0;
  let total = 0;
  const nAdj = tracks.length - 1;
  for (let i = 1; i < tracks.length; i++) {
    total += transitionCostWithStrategy(tracks[i - 1]!, tracks[i]!, strategy, {
      position: nAdj > 0 ? i / nAdj : 0.5,
      flowSemantics,
    }).totalCost;
  }
  return total / nAdj;
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
