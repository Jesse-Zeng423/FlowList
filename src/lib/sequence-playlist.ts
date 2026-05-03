/**
 * Strategy-driven prototype sequencer.
 *
 * High-level pipeline:
 *
 *   1. Filter unavailable tracks (deleted/private/missing video id).
 *   2. Resolve the `FlowStrategy` from selected flow keywords (1–2 → combined).
 *   3. Sort tracks by `strategyLateScore` (the strategy's late-progress curve).
 *   4. Apply curve-specific reshape:
 *        - wave             → split into ascending waves
 *        - cluster-run      → cluster strongest peak tracks contiguously
 *        - landing-focused  → soft-landing tail + finale guarantee
 *        - chaptered        → assign chapters by mood/rhythm signature
 *        - grand-finale     → ensure the cinematic peak closes the playlist
 *        - loop             → place the lowest-cost re-entry track last
 *   5. Smoothing pass on tempo (intensity-aware).
 *   6. Index-based phase assignment using strategy thresholds.
 *   7. Refine peak runs against `strategyPeakScore`.
 *   8. Build per-track explanations + arc summaries from the strategy.
 */

import type {
  JourneyRole,
  Phase,
  PlaylistFitLevel,
  PlaylistSource,
  SequencedChapter,
  SequencedPlaylist,
  SequencedPlaylistSnapshot,
  SequencedTrack,
  SoftLandingSummaryMeta,
  TrackAnalysis,
} from "@/types/flowlist";
import { filterTracksForSequencing } from "@/lib/filter-tracks-for-sequencing";
import {
  DEFAULT_DEMO_FLOW_KEYWORD_IDS,
  DEFAULT_DEMO_PLAYLIST_TYPE,
  getFlowKeyword,
  getPlaylistTypeLabel,
} from "@/lib/flow-presets";
import {
  resolveStrategyFromKeywordIds,
  type FlowStrategy,
} from "@/lib/flow-strategies";
import {
  phaseThresholdsForStrategy,
  strategyLandingScore,
  strategyLateScore,
  strategyPeakScore,
  tempoRank,
} from "@/lib/flow-strategy-effects";
import { analyzePlaylistFit } from "@/lib/playlist-fit-analysis";
import { buildMoodChapters } from "@/lib/mood-chapters";
import { transitionCostWithStrategy } from "@/lib/transition-cost";
import { buildArcSummaries, buildTransitions } from "@/lib/transitions";

// ---------------------------------------------------------------------------
// Smoothing — tempo + rhythm-intensity aware
// ---------------------------------------------------------------------------

function smoothTempoOrder(tracks: TrackAnalysis[], smoothing: number): TrackAnalysis[] {
  if (smoothing <= 0) return [...tracks];
  const arr = [...tracks];
  const windowSize = Math.min(arr.length, Math.max(2, Math.round(2 + smoothing * 2)));
  const passes = Math.max(1, Math.round(smoothing));
  const tempoJumpThreshold = smoothing >= 1.6 ? 1 : 2;

  for (let p = 0; p < passes; p++) {
    for (let i = 1; i < arr.length; i++) {
      const prev = tempoRank(arr[i - 1]!.audioFeatures.tempoFeel);
      const cur = tempoRank(arr[i]!.audioFeatures.tempoFeel);
      if (cur - prev >= tempoJumpThreshold + 1) {
        for (let j = i + 1; j < Math.min(i + windowSize + 1, arr.length); j++) {
          if (tempoRank(arr[j]!.audioFeatures.tempoFeel) - prev <= tempoJumpThreshold) {
            const tmp = arr[i]!;
            arr[i] = arr[j]!;
            arr[j] = tmp;
            break;
          }
        }
      }
    }
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Curve-specific reshape helpers
// ---------------------------------------------------------------------------

/** Re-shape ordered (low → high) into rise/fall waves. */
function shapeIntoWaves(tracks: TrackAnalysis[]): TrackAnalysis[] {
  const n = tracks.length;
  if (n < 6) return [...tracks];
  const numWaves = n >= 14 ? 3 : 2;
  const chunks: TrackAnalysis[][] = Array.from({ length: numWaves }, () => []);
  for (let i = 0; i < n; i++) {
    const w = i % numWaves;
    chunks[w]!.push(tracks[i]!);
  }
  const out: TrackAnalysis[] = [];
  for (const c of chunks) {
    if (c.length === 0) continue;
    const ascending = [...c];
    const half = Math.ceil(ascending.length / 2);
    const up = ascending.slice(0, half);
    const down = ascending.slice(half).reverse();
    out.push(...up, ...down);
  }
  return out;
}

/**
 * Cluster the strongest peak-fit tracks into a single contiguous run inside
 * the playlist (positions ~30%–70% by default; pushed later if `lateLift`).
 */
function clusterRunReorder(
  tracks: TrackAnalysis[],
  strategy: FlowStrategy,
): TrackAnalysis[] {
  const n = tracks.length;
  if (n < 6) return [...tracks];
  const scored = tracks.map((t) => ({ t, s: strategyPeakScore(t, strategy) }));
  // Cluster size = roughly 30–45% of the playlist, at least 3.
  const clusterSize = Math.max(3, Math.round(n * 0.35));
  const cluster = [...scored].sort((a, b) => b.s - a.s).slice(0, clusterSize);
  const clusterIds = new Set(cluster.map((c) => c.t.id));
  const rest = tracks.filter((t) => !clusterIds.has(t.id));

  // Place the cluster around the focal band.
  //   • bangerClusterMidOnly (Banger Run + Soft Landing conflict): cluster must
  //     stay ≤ 50% through the playlist so the soft tail owns the ending.
  //   • Grand Finale alone: focal=0.65 (late).
  //   • Default: focal=0.42 (mid-late).
  const focal = strategy.flags.bangerClusterMidOnly
    ? 0.35
    : strategy.flags.grandFinale
      ? 0.65
      : 0.42;
  const maxStart = strategy.flags.bangerClusterMidOnly
    ? Math.floor(n * 0.5) - clusterSize   // cluster must END before 60%
    : n - clusterSize;
  const startIdx = Math.min(maxStart, Math.max(0, Math.round(n * focal)));

  // Sort cluster ascending by peak score so the strongest banger lands at the
  // back of the cluster (or the very end for grand-finale).
  const clusterOrdered = cluster
    .map((c) => c.t)
    .sort((a, b) => strategyPeakScore(a, strategy) - strategyPeakScore(b, strategy));

  // Sort rest by a generic "late" score so calmer tracks frame the cluster.
  const restOrdered = rest.sort(
    (a, b) => strategyLateScore(a, strategy) - strategyLateScore(b, strategy),
  );

  const head = restOrdered.slice(0, startIdx);
  const tail = restOrdered.slice(startIdx);
  return [...head, ...clusterOrdered, ...tail];
}

/** Soft-landing tail: bring the highest landing-score tracks to the back. */
function applySoftLandingTail(
  ordered: TrackAnalysis[],
  strategy: FlowStrategy,
): TrackAnalysis[] {
  if (ordered.length < 3) return ordered;
  const n = ordered.length;
  const k = Math.max(2, Math.ceil(n * 0.1));
  const scored = ordered.map((t) => ({ t, q: strategyLandingScore(t, strategy) }));
  const byQ = [...scored].sort((a, b) => b.q - a.q);
  const poolIds = new Set(byQ.slice(0, k).map((x) => x.t.id));
  const head = ordered.filter((t) => !poolIds.has(t.id));
  const poolTracks = byQ
    .slice(0, k)
    .map((x) => x.t)
    .sort((a, b) => strategyLandingScore(a, strategy) - strategyLandingScore(b, strategy));
  return [...head, ...poolTracks];
}

function swapTailForSofterRhythm(
  ordered: TrackAnalysis[],
  strategy: FlowStrategy,
): TrackAnalysis[] {
  const arr = [...ordered];
  const n = arr.length;
  const tailPivot = Math.max(3, Math.floor(n * 0.9));
  for (let i = tailPivot; i < n; i++) {
    const cur = arr[i]!;
    if (cur.audioFeatures.rhythmIntensity < 52 && cur.estimatedEnergy <= 5) continue;
    const curScore = strategyLandingScore(cur, strategy);
    for (let j = Math.floor(n * 0.15); j < tailPivot; j++) {
      const cand = arr[j]!;
      const candScore = strategyLandingScore(cand, strategy);
      if (candScore > curScore + 12) {
        arr[i] = cand;
        arr[j] = cur;
        break;
      }
    }
  }
  return arr;
}

function softenFinalStretchForLanding(
  ordered: TrackAnalysis[],
  strategy: FlowStrategy,
): TrackAnalysis[] {
  const arr = [...ordered];
  const n = arr.length;
  const tailPivot = Math.max(3, Math.floor(n * 0.9));
  for (let i = tailPivot; i < n; i++) {
    const cur = arr[i]!;
    if (cur.audioFeatures.rhythmIntensity < 56 && cur.estimatedEnergy <= 6) continue;
    const curScore = strategyLandingScore(cur, strategy);
    for (let j = Math.floor(n * 0.12); j < tailPivot; j++) {
      const cand = arr[j]!;
      const candScore = strategyLandingScore(cand, strategy);
      if (
        candScore > curScore + 10 &&
        cand.audioFeatures.rhythmIntensity < cur.audioFeatures.rhythmIntensity - 5 &&
        tempoRank(cand.audioFeatures.tempoFeel) <= tempoRank(cur.audioFeatures.tempoFeel)
      ) {
        arr[i] = cand;
        arr[j] = cur;
        break;
      }
    }
  }
  return arr;
}

function ensureStrongestLandingFinale(
  ordered: TrackAnalysis[],
  strategy: FlowStrategy,
): TrackAnalysis[] {
  const arr = [...ordered];
  const n = arr.length;
  if (n < 2) return arr;
  const best = [...arr].sort(
    (a, b) => strategyLandingScore(b, strategy) - strategyLandingScore(a, strategy),
  )[0]!;
  const last = arr[n - 1]!;
  if (last.id === best.id) return arr;
  const bestIdx = arr.findIndex((t) => t.id === best.id);
  if (bestIdx < 0) return arr;
  arr[bestIdx] = last;
  arr[n - 1] = best;
  return arr;
}

function softenTailWithinLastChapter(
  ordered: TrackAnalysis[],
  lastRange: ChapterRange,
  strategy: FlowStrategy,
): void {
  const n = ordered.length;
  const lo = lastRange.fromIndex;
  const hi = lastRange.toIndex;
  if (hi - lo + 1 < 2 || n === 0) return;
  const k = Math.max(2, Math.ceil(n * 0.1));
  const tailStart = Math.max(lo, n - k);

  for (let i = hi; i > tailStart; i--) {
    const cur = ordered[i]!;
    if (cur.audioFeatures.rhythmIntensity < 52 && cur.estimatedEnergy <= 6) continue;
    const curLanding = strategyLandingScore(cur, strategy);
    const curRhythm = cur.audioFeatures.rhythmIntensity;
    let bestSwap = -1;
    let bestCandLanding = curLanding;

    for (let j = lo; j < i; j++) {
      const cand = ordered[j]!;
      const cq = strategyLandingScore(cand, strategy);
      const candRhythm = cand.audioFeatures.rhythmIntensity;

      const lowerGrooveNeeded = candRhythm <= curRhythm - 10;
      const betterLand = cq >= curLanding + 8 || (cq >= curLanding && candRhythm <= curRhythm - 22);
      if ((lowerGrooveNeeded && cq >= curLanding + 6) || betterLand) {
        if (bestSwap === -1 || cq > bestCandLanding + (candRhythm <= curRhythm ? 8 : -4)) {
          bestSwap = j;
          bestCandLanding = cq;
          if (
            cq > curLanding + 18 &&
            candRhythm < curRhythm - 14 &&
            tempoRank(cand.audioFeatures.tempoFeel) <= tempoRank(cur.audioFeatures.tempoFeel) + 1
          )
            break;
        }
      }
    }
    if (bestSwap !== -1) {
      const tmp = ordered[i]!;
      ordered[i] = ordered[bestSwap]!;
      ordered[bestSwap] = tmp;
    }
  }
}

/**
 * Highest landing-score tracks should close the resolving chapter — without stealing
 * from earlier chapters (Mood Chapter blocks stay intact).
 */
function ensureStrongestLandingInLastChapter(
  ordered: TrackAnalysis[],
  lastRange: ChapterRange,
  strategy: FlowStrategy,
): void {
  const lo = lastRange.fromIndex;
  const hi = lastRange.toIndex;
  if (hi <= lo || ordered.length === 0) return;

  let bestIdx = hi;
  let bestQ = strategyLandingScore(ordered[hi]!, strategy);
  for (let i = lo; i < hi; i++) {
    const q = strategyLandingScore(ordered[i]!, strategy);
    if (q > bestQ) {
      bestQ = q;
      bestIdx = i;
    }
  }
  if (bestIdx === hi) return;
  const last = ordered[hi]!;
  ordered[hi] = ordered[bestIdx]!;
  ordered[bestIdx] = last;
}

function reorderClosingChapterForSoftLanding(
  ordered: TrackAnalysis[],
  lastRange: ChapterRange,
  strategy: FlowStrategy,
): void {
  const lo = lastRange.fromIndex;
  const hi = lastRange.toIndex;
  if (hi <= lo) return;
  const slice = ordered.slice(lo, hi + 1);

  slice.sort((a, b) => {
    const qa = strategyLandingScore(a, strategy);
    const qb = strategyLandingScore(b, strategy);
    if (qa !== qb) return qa - qb;
    const ra = b.audioFeatures.rhythmIntensity - a.audioFeatures.rhythmIntensity;
    if (ra !== 0) return ra;
    return tempoRank(a.audioFeatures.tempoFeel) - tempoRank(b.audioFeatures.tempoFeel);
  });

  for (let offset = 0; offset < slice.length; offset++) {
    ordered[lo + offset] = slice[offset]!;
  }
}

/** Grand finale: the cinematic peak closes the set. */
function ensureGrandFinaleClose(
  ordered: TrackAnalysis[],
  strategy: FlowStrategy,
): TrackAnalysis[] {
  const arr = [...ordered];
  const n = arr.length;
  if (n < 2) return arr;
  const best = [...arr].sort(
    (a, b) => strategyPeakScore(b, strategy) - strategyPeakScore(a, strategy),
  )[0]!;
  if (arr[n - 1]!.id === best.id) return arr;
  const bestIdx = arr.findIndex((t) => t.id === best.id);
  if (bestIdx < 0) return arr;
  // Swap the strongest peak track to the end.
  const last = arr[n - 1]!;
  arr[bestIdx] = last;
  arr[n - 1] = best;
  return arr;
}

/**
 * Loop close: pick the closing track that's cheapest to transition back to the
 * opener, holding the rest of the order roughly the same.
 */
function arrangeForLoopClose(
  ordered: TrackAnalysis[],
  strategy: FlowStrategy,
): TrackAnalysis[] {
  const arr = [...ordered];
  const n = arr.length;
  if (n < 4) return arr;
  const opener = arr[0]!;
  let bestIdx = n - 1;
  let bestCost = transitionCostWithStrategy(arr[n - 1]!, opener, strategy).totalCost;
  for (let i = 2; i < n - 1; i++) {
    const c = transitionCostWithStrategy(arr[i]!, opener, strategy).totalCost;
    if (c < bestCost) {
      bestCost = c;
      bestIdx = i;
    }
  }
  if (bestIdx === n - 1) return arr;
  const candidate = arr[bestIdx]!;
  arr.splice(bestIdx, 1);
  arr.push(candidate);
  return arr;
}

// ---------------------------------------------------------------------------
// Chapter assignment (chaptered curve)
// ---------------------------------------------------------------------------

interface ChapterRange {
  fromIndex: number;
  toIndex: number; // inclusive
}

function chapterCount(n: number): number {
  if (n <= 8) return 2;
  if (n <= 14) return 3;
  if (n <= 22) return 4;
  if (n <= 32) return 5;
  return 6;
}

/**
 * Greedy chapter assignment: split contiguous runs by the largest internal
 * transition costs. The order is *not* changed — chapters are just labels on
 * top of an already-good ordering.
 */
function assignChapters(
  ordered: TrackAnalysis[],
  strategy: FlowStrategy,
): { chapters: SequencedChapter[]; ranges: ChapterRange[] } {
  const n = ordered.length;
  const target = Math.min(n, chapterCount(n));
  if (target <= 1) {
    return {
      chapters: [chapterFromRange(ordered, 0, n - 1, 0)],
      ranges: [{ fromIndex: 0, toIndex: n - 1 }],
    };
  }

  // Compute costs at each gap.
  const gapCosts: { idx: number; cost: number }[] = [];
  for (let i = 1; i < n; i++) {
    const c = transitionCostWithStrategy(ordered[i - 1]!, ordered[i]!, strategy).totalCost;
    gapCosts.push({ idx: i, cost: c });
  }

  // Pick the (target-1) largest gaps as chapter boundaries.
  const boundaryIndices = [...gapCosts]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, target - 1)
    .map((g) => g.idx)
    .sort((a, b) => a - b);

  const ranges: ChapterRange[] = [];
  let start = 0;
  for (const b of boundaryIndices) {
    ranges.push({ fromIndex: start, toIndex: b - 1 });
    start = b;
  }
  ranges.push({ fromIndex: start, toIndex: n - 1 });

  const chapters: SequencedChapter[] = ranges.map((r, i) =>
    chapterFromRange(ordered, r.fromIndex, r.toIndex, i),
  );
  return { chapters, ranges };
}

function chapterFromRange(
  ordered: TrackAnalysis[],
  from: number,
  to: number,
  index: number,
): SequencedChapter {
  const slice = ordered.slice(from, to + 1);
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avgEnergy = avg(slice.map((t) => t.estimatedEnergy));
  const avgRhythm = avg(slice.map((t) => t.audioFeatures.rhythmIntensity));
  const avgDarkness = avg(slice.map((t) => t.mood.moodDarkness));
  const avgWarmth = avg(slice.map((t) => t.mood.emotionalWarmth));
  const avgIntimacy = avg(slice.map((t) => t.mood.intimacy));
  const avgEuphoria = avg(slice.map((t) => t.mood.euphoria));
  const avgTension = avg(slice.map((t) => t.mood.tension));

  const dominant = chapterMoodLabel({
    avgEnergy,
    avgRhythm,
    avgDarkness,
    avgWarmth,
    avgIntimacy,
    avgEuphoria,
    avgTension,
  });
  return {
    index,
    label: `Chapter ${index + 1} · ${dominant}`,
    fromIndex: from,
    toIndex: to,
    signature: {
      avgEnergy,
      avgRhythm,
      dominantMood: dominant,
    },
  };
}

function chapterMoodLabel(s: {
  avgEnergy: number;
  avgRhythm: number;
  avgDarkness: number;
  avgWarmth: number;
  avgIntimacy: number;
  avgEuphoria: number;
  avgTension: number;
}): string {
  if (s.avgEuphoria > 60 && s.avgEnergy > 6) return "Bright lift";
  if (s.avgIntimacy > 60 && s.avgEnergy < 5) return "Warm interior";
  if (s.avgTension > 60 && s.avgDarkness > 55) return "Tension";
  if (s.avgDarkness > 60 && s.avgWarmth < 45) return "Shadowed";
  if (s.avgWarmth > 60 && s.avgEnergy >= 5) return "Warm motion";
  if (s.avgEnergy >= 7 && s.avgRhythm >= 60) return "Driving";
  if (s.avgEnergy <= 3 && s.avgRhythm < 45) return "Hush";
  if (s.avgEuphoria > 50) return "Lift";
  return "Drift";
}

// ---------------------------------------------------------------------------
// Phase assignment + refinement
// ---------------------------------------------------------------------------

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

/**
 * Demote weak Peak slots when their `peakScore` is well below the playlist's
 * median. Only demotes — never promotes — to keep the strategy's broad shape.
 */
function refinePeakRuns(
  phases: Phase[],
  ordered: TrackAnalysis[],
  peakScores: number[],
  strategy: FlowStrategy,
): void {
  const n = phases.length;
  if (n === 0) return;

  // Strategies where Peak is allowed to be quiet/emotional.
  const relaxPeak =
    strategy.curveType === "stability-focused" ||
    strategy.curveType === "landing-focused" ||
    !!strategy.preferredPeak?.mood?.some((m) => /intimate|tension|reflective/i.test(m));
  const clusterPeak = !!strategy.flags.clusterRun;

  const sortedFit = [...peakScores].sort((a, b) => a - b);
  const median = sortedFit[Math.floor(sortedFit.length / 2)] ?? 0;
  const thr = clusterPeak ? median * 1.05 : relaxPeak ? median * 0.55 : median * 0.92;

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
    while (lo <= hi && peakScores[lo]! < thr && !relaxPeak && ordered[lo]!.estimatedEnergy <= 4) {
      phases[lo] = "Build";
      lo++;
    }
    while (hi >= lo && peakScores[hi]! < thr && !relaxPeak && ordered[hi]!.estimatedEnergy <= 4) {
      phases[hi] = "Cooldown";
      hi--;
    }
    if (relaxPeak) {
      while (
        lo <= hi &&
        peakScores[lo]! < thr &&
        ordered[lo]!.estimatedEnergy <= 2 &&
        ordered[lo]!.emotionalIntensityScore < 55
      ) {
        phases[lo] = "Build";
        lo++;
      }
      while (
        hi >= lo &&
        peakScores[hi]! < thr &&
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

// ---------------------------------------------------------------------------
// Per-track explanation
// ---------------------------------------------------------------------------

function energyLabel(e: number): string {
  if (e <= 3) return "low";
  if (e <= 6) return "moderate";
  return "high";
}

function positionReason(
  track: TrackAnalysis,
  prev: TrackAnalysis | null,
  phase: Phase,
  index: number,
  total: number,
  strategy: FlowStrategy,
  chapterLabel: string | null,
): string {
  const tempo = track.audioFeatures.tempoFeel;
  const r = track.audioFeatures.rhythmIntensity;
  const transitionFragment = prev
    ? transitionCostWithStrategy(prev, track, strategy, {
        position: total > 1 ? index / (total - 1) : 0.5,
      }).reasons[0]
    : null;

  const chapterPrefix = chapterLabel ? `${chapterLabel}. ` : "";

  switch (phase) {
    case "Intro":
      return `${chapterPrefix}Opens the set with ${tempo} pacing, rhythm intensity ${r}/100, and a ${track.estimatedMood} tone so the journey can unfold without rushing.`;
    case "Build":
      return `${chapterPrefix}Rising chapter — energy reads ${energyLabel(track.estimatedEnergy)}, tension ${track.mood.tension}/100, leaning the listener toward the focal band.${transitionFragment ? ` ${transitionFragment}` : ""}`;
    case "Peak":
      if (strategy.flags.grandFinale) {
        return `${chapterPrefix}Grand-finale anchor — cinematic scale ${track.mood.cinematicScale}/100, energy ${energyLabel(track.estimatedEnergy)}, tension ${track.mood.tension}/100.`;
      }
      if (track.estimatedEnergy <= 4) {
        return `${chapterPrefix}Focal band — ${track.estimatedMood} with modest surface energy but emotional weight (intensity ${track.emotionalIntensityScore}/100, cinematic scale ${track.mood.cinematicScale}/100).`;
      }
      return `${chapterPrefix}Anchor moment — beat hardness ${track.audioFeatures.beatHardness}/100, rhythm intensity ${r}/100, and a ${tempo} tempo feel carry the high point.`;
    case "Cooldown": {
      const groove = r >= 60 ? "Groove is still present, but " : "";
      const rel = total > 1 ? Math.round((index / (total - 1)) * 100) : 0;
      return `${chapterPrefix}${groove}Controlled release at ~${rel}% through the arc — energy ${energyLabel(track.estimatedEnergy)}, rhythm ${r}/100, resolution ${track.mood.resolution}/100.`;
    }
    case "Outro":
      return `${chapterPrefix}Landing zone — ${tempo} motion, rhythm ${r}/100, intimacy ${track.mood.intimacy}/100, resolution ${track.mood.resolution}/100. Eases the listener out.`;
    default:
      return `${chapterPrefix}Placed to support smooth continuity at position ${index + 1}.`;
  }
}

// ---------------------------------------------------------------------------
// Soft-landing meta
// ---------------------------------------------------------------------------

function computeSoftLandingMeta(
  sequenced: SequencedTrack[],
  strategy: FlowStrategy,
  fitLevel: PlaylistFitLevel,
): SoftLandingSummaryMeta | undefined {
  if (!strategy.flags.landingFocused) return undefined;
  const n = sequenced.length;
  if (n < 4) {
    return {
      endingGentlerEnergy: false,
      endingGentlerRhythm: false,
      limitedByHomogeneity: true,
      finaleIsStrongLander: n >= 1,
    };
  }
  const k = Math.max(2, Math.ceil(n * 0.1));
  const head = sequenced.slice(0, k);
  const tail = sequenced.slice(-k);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const eHead = avg(head.map((t) => t.estimatedEnergy));
  const eTail = avg(tail.map((t) => t.estimatedEnergy));
  const rHead = avg(head.map((t) => t.audioFeatures.rhythmIntensity));
  const rTail = avg(tail.map((t) => t.audioFeatures.rhythmIntensity));
  const endingGentlerEnergy = eTail < eHead - 0.35;
  const endingGentlerRhythm = rTail < rHead - 4;
  const last = sequenced[n - 1]!;
  const bestQ = Math.max(...sequenced.map((t) => strategyLandingScore(t, strategy)));
  const finaleIsStrongLander = strategyLandingScore(last, strategy) >= bestQ - 10;
  const homogeneous = fitLevel !== "mixed";
  const limitedByHomogeneity = homogeneous
    ? !(endingGentlerRhythm && endingGentlerEnergy && finaleIsStrongLander)
    : !endingGentlerRhythm && !endingGentlerEnergy;
  return {
    endingGentlerEnergy,
    endingGentlerRhythm,
    limitedByHomogeneity,
    finaleIsStrongLander,
  };
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

interface SequenceInput {
  tracks: TrackAnalysis[];
  playlistTypeId: string | null;
  flowKeywordIds: string[];
}

function withDefaults(input: SequenceInput): SequenceInput {
  if (input.playlistTypeId && input.flowKeywordIds.length > 0) return input;
  return {
    tracks: input.tracks,
    playlistTypeId: input.playlistTypeId ?? DEFAULT_DEMO_PLAYLIST_TYPE,
    flowKeywordIds:
      input.flowKeywordIds.length > 0 ? input.flowKeywordIds : [...DEFAULT_DEMO_FLOW_KEYWORD_IDS],
  };
}

export interface SequencePlaylistOptions {
  /** Imported playlist title — used by playlist-fit analysis and snapshot. */
  playlistTitle?: string | null;
  /** Where the playlist came from. Frozen onto the result snapshot. */
  source?: PlaylistSource;
  /** Stable id for the imported source (YouTube/Spotify playlist id, or null). */
  importedSourceId?: string | null;
  /** External URL of the imported playlist (YouTube/Spotify deep link). */
  playlistExternalUrl?: string | null;
  /** Owner / channel label (YouTube channel title or Spotify owner display name). */
  sourceOwnerLabel?: string | null;
}

const SOURCE_LABELS: Record<PlaylistSource, string> = {
  youtube: "YouTube import",
  spotify: "Spotify (experimental)",
  manual: "Manual paste",
  demo: "Demo playlist",
};

/** Stable input fingerprint used to detect "result is for the same input". */
export function computeInputFingerprint(input: {
  source: PlaylistSource;
  importedSourceId?: string | null;
  trackIds: readonly string[];
  playlistTypeId: string | null;
  flowKeywordIds: readonly string[];
}): string {
  const orderedKeywords = [...input.flowKeywordIds].sort();
  return JSON.stringify({
    s: input.source,
    p: input.importedSourceId ?? null,
    t: input.playlistTypeId ?? null,
    k: orderedKeywords,
    n: input.trackIds.length,
    // First and last 4 ids only — enough to detect track-set drift without
    // making the fingerprint massive on large playlists.
    h: input.trackIds.slice(0, 4),
    z: input.trackIds.slice(-4),
  });
}

function buildSnapshot(args: {
  source: PlaylistSource;
  playlistName: string | null;
  playlistTypeId: string | null;
  flowKeywordIds: string[];
  trackIds: string[];
  importedSourceId?: string | null;
  playlistExternalUrl?: string | null;
  sourceOwnerLabel?: string | null;
}): SequencedPlaylistSnapshot {
  const selectedFlowKeywords = args.flowKeywordIds.map((id) => ({
    id,
    label: getFlowKeyword(id)?.label ?? id,
  }));
  return {
    source: args.source,
    sourceLabel: SOURCE_LABELS[args.source],
    playlistName: args.playlistName,
    playlistTypeLabel: getPlaylistTypeLabel(args.playlistTypeId),
    selectedFlowKeywords,
    generatedAt: new Date().toISOString(),
    trackCount: args.trackIds.length,
    importedSourceId: args.importedSourceId ?? null,
    playlistExternalUrl: args.playlistExternalUrl ?? null,
    sourceOwnerLabel: args.sourceOwnerLabel ?? null,
    isPrototype: true,
    analysisMode: "prototype",
    audioFeatureSourceSummary: "Prototype estimates · BPM ranges approximate",
    inputFingerprint: computeInputFingerprint({
      source: args.source,
      importedSourceId: args.importedSourceId ?? null,
      trackIds: args.trackIds,
      playlistTypeId: args.playlistTypeId,
      flowKeywordIds: args.flowKeywordIds,
    }),
  };
}

export function sequencePlaylist(
  tracks: TrackAnalysis[],
  playlistTypeId: string | null,
  flowKeywordIds: string[],
  options?: SequencePlaylistOptions,
): SequencedPlaylist {
  const input = withDefaults({ tracks, playlistTypeId, flowKeywordIds });

  // ---- Resolve strategy (includes conflict resolution) ----
  // Done early so we can log diagnostics before any heavy work.
  const { combined: earlyStrategy, diagnostics: earlyDiag } = resolveStrategyFromKeywordIds(
    input.flowKeywordIds,
  );
  void earlyStrategy; // resolved again below after active filtering
  if (process.env.NODE_ENV === "development" && earlyDiag.conflictNotes.length > 0) {
    console.info(
      "[flowlist:strategy-conflict]",
      `"${earlyDiag.dominantCurveType}" | structure:${earlyDiag.dominantStructure} | landing:${earlyDiag.finalSectionPolicy} | transitions:${earlyDiag.transitionStrictness}`,
      earlyDiag.conflictNotes,
    );
  }
  void earlyDiag;

  const { active, skippedCount } = filterTracksForSequencing(input.tracks);
  const activeInputTrackIds = active.map((t) => t.id);
  const playlistFit = analyzePlaylistFit(active, {
    playlistTitle: options?.playlistTitle ?? null,
  });

  const source: PlaylistSource = options?.source ?? "manual";
  const snapshot = buildSnapshot({
    source,
    playlistName: options?.playlistTitle ?? null,
    playlistTypeId: input.playlistTypeId,
    flowKeywordIds: input.flowKeywordIds,
    trackIds: activeInputTrackIds,
    importedSourceId: options?.importedSourceId ?? null,
    playlistExternalUrl: options?.playlistExternalUrl ?? null,
    sourceOwnerLabel: options?.sourceOwnerLabel ?? null,
  });

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
      playlistTypeId: input.playlistTypeId,
      flowKeywordIds: input.flowKeywordIds,
      playlistFit,
      snapshot,
    };
  }

  // ---- Resolve strategy ----
  const { combined: strategy, parts } = resolveStrategyFromKeywordIds(input.flowKeywordIds);
  void parts;

  // ---- Ordering ----
  const curve = strategy.curveType;
  let ordered: TrackAnalysis[];
  let chapterRanges: ChapterRange[] | null = null;
  let chapters: SequencedChapter[] | undefined;

  // Mood Chapters takes a chapter-first approach: cluster tracks by feature
  // similarity, order tracks within each chapter, then arrange chapters into a
  // narrative journey arc. Other chaptered flows still use the legacy gap-split.
  const isMoodChapters = input.flowKeywordIds.includes("mixed_mess.mood_chapters");

  if (isMoodChapters) {
    // ---- Mood Chapters: cluster-first pipeline ----
    const moodResult = buildMoodChapters(active, strategy);
    ordered = moodResult.orderedTracks;
    chapters = moodResult.chapters;
    chapterRanges = moodResult.ranges;

    // Light smoothing across chapter boundaries (don't over-smooth internal order).
    ordered = smoothTempoOrder(ordered, Math.min(0.8, strategy.smoothing * 0.6));

    if (
      strategy.flags.landingFocused &&
      chapterRanges &&
      chapterRanges.length > 0
    ) {
      const lastRg = chapterRanges[chapterRanges.length - 1]!;
      reorderClosingChapterForSoftLanding(ordered, lastRg, strategy);
      softenTailWithinLastChapter(ordered, lastRg, strategy);
      ensureStrongestLandingInLastChapter(ordered, lastRg, strategy);
      ordered = smoothTempoOrder(
        ordered,
        Math.min(1.05, Math.max(0.75, strategy.smoothing * 0.78)),
      );
    }

    if (process.env.NODE_ENV === "development" && !moodResult.validation.ok) {
      console.warn("[flowlist:mood-chapters-validation]", moodResult.validation.warnings);
    }
  } else {
    // ---- Standard pipeline ----

    // Primary ordering: late-progress score under strategy.
    const scored = active.map((t) => ({ track: t, score: strategyLateScore(t, strategy) }));
    scored.sort((a, b) => a.score - b.score);
    ordered = scored.map((s) => s.track);

    // Light tempo smoothing pass.
    ordered = smoothTempoOrder(ordered, strategy.smoothing);

    // Curve-specific reshape.
    if (curve === "wave") {
      ordered = shapeIntoWaves(ordered);
      ordered = smoothTempoOrder(ordered, Math.max(0.6, strategy.smoothing * 0.6));
    }

    if (curve === "cluster-run" || strategy.flags.clusterRun) {
      ordered = clusterRunReorder(ordered, strategy);
    }

    if (curve === "landing-focused" || strategy.flags.landingFocused) {
      ordered = applySoftLandingTail(ordered, strategy);
      ordered = swapTailForSofterRhythm(ordered, strategy);
      ordered = softenFinalStretchForLanding(ordered, strategy);
      ordered = smoothTempoOrder(ordered, Math.max(1.15, strategy.smoothing * 0.95));
      ordered = ensureStrongestLandingFinale(ordered, strategy);
    }

    if (strategy.flags.grandFinale) {
      ordered = ensureGrandFinaleClose(ordered, strategy);
    }

    if (strategy.flags.loopBack) {
      ordered = arrangeForLoopClose(ordered, strategy);
    }

    // Gap-split chapters for other chaptered flows (e.g. Dramatic Arc).
    if (curve === "chaptered" || strategy.flags.chaptered) {
      const out = assignChapters(ordered, strategy);
      chapters = out.chapters;
      chapterRanges = out.ranges;
    }
  }

  // ---- Phase assignment ----
  const thresholds = phaseThresholdsForStrategy(strategy);
  let phases: Phase[];
  if (chapterRanges && chapters) {
    phases = assignPhasesFromChapters(
      ordered.length,
      chapters,
      isMoodChapters ? "mood-journey" : "local-band",
    );
  } else {
    phases = ordered.map((_, i) => assignPhaseByIndex(i, ordered.length, thresholds));
    const peakScores = ordered.map((t) => strategyPeakScore(t, strategy));
    refinePeakRuns(phases, ordered, peakScores, strategy);
  }

  // ---- Build sequenced tracks ----
  const sequenced: SequencedTrack[] = ordered.map((t, i) => {
    const chapterLabel = chapterRanges && chapters ? chapterLabelForIndex(i, chapterRanges, chapters) : null;
    return {
      ...t,
      phase: phases[i] ?? "Build",
      positionReason: positionReason(
        t,
        i > 0 ? ordered[i - 1]! : null,
        phases[i] ?? "Build",
        i,
        ordered.length,
        strategy,
        chapterLabel,
      ),
    };
  });

  const softLandingMeta = computeSoftLandingMeta(sequenced, strategy, playlistFit.level);

  const { moodArcSummary, rhythmArcSummary } = buildArcSummaries(
    sequenced,
    input.playlistTypeId,
    input.flowKeywordIds,
    { softLandingMeta, chapters: chapters ?? null },
  );
  const transitions = buildTransitions(sequenced, input.playlistTypeId, input.flowKeywordIds);

  return {
    tracks: sequenced,
    transitions,
    moodArcSummary,
    rhythmArcSummary,
    skippedUnavailableCount: skippedCount > 0 ? skippedCount : undefined,
    activeInputTrackIds,
    playlistTypeId: input.playlistTypeId,
    flowKeywordIds: input.flowKeywordIds,
    playlistFit,
    softLandingMeta,
    chapters,
    snapshot,
  };
}

// ---------------------------------------------------------------------------
// Chapter helpers (phase mapping per chapter)
// ---------------------------------------------------------------------------

type ChapterPhaseMode = "local-band" | "mood-journey";

/** Map Mood Chapters narrative role + local position → phase (avoid Peak in resolve arcs). */
function phaseForMoodJourneyRole(
  localPos: number,
  role: JourneyRole,
  isFirstChapter: boolean,
): Phase {
  switch (role) {
    case "establish":
      if (isFirstChapter && localPos < 0.28) return "Intro";
      if (localPos < 0.9) return "Build";
      return "Cooldown";
    case "deepen":
      if (localPos < 0.4) return "Build";
      if (localPos < 0.7) return "Peak";
      return "Cooldown";
    case "lift":
      if (localPos < 0.22) return "Build";
      if (localPos < 0.76) return "Peak";
      return "Cooldown";
    case "peak":
      if (localPos < 0.12) return "Build";
      if (localPos < 0.8) return "Peak";
      if (localPos < 0.94) return "Cooldown";
      return "Outro";
    case "contrast":
      if (localPos < 0.36) return "Build";
      if (localPos < 0.65) return "Peak";
      if (localPos < 0.88) return "Cooldown";
      return "Outro";
    case "resolve":
      if (localPos < 0.22) return "Build";
      if (localPos < 0.8) return "Cooldown";
      return "Outro";
  }
}

/**
 * Chaptered flows: assign per-track phases. Mood Chapters use journey roles so
 * UI phases align with narrative arcs rather than conflicting labels like
 * "Resolution / Phase: Build" across an entire resolving chapter.
 */
function assignPhasesFromChapters(
  n: number,
  chaptersMeta: SequencedChapter[],
  mode: ChapterPhaseMode,
): Phase[] {
  const out: Phase[] = new Array(n).fill("Build") as Phase[];
  const total = chaptersMeta.length;
  const useRoles = mode === "mood-journey";

  for (let ci = 0; ci < total; ci++) {
    const chapter = chaptersMeta[ci]!;
    const len = chapter.toIndex - chapter.fromIndex + 1;
    const isFirstChapter = ci === 0;
    const isLastChapter = ci === total - 1;
    const journeyRole = chapter.journeyRole;

    for (let j = chapter.fromIndex; j <= chapter.toIndex; j++) {
      const localPos = len > 1 ? (j - chapter.fromIndex) / (len - 1) : 0.5;

      let phase: Phase;
      if (useRoles && journeyRole) {
        phase = phaseForMoodJourneyRole(localPos, journeyRole, isFirstChapter);

        /** Last resolving chapter stays away from a kinetic Peak badge. */
        if (isLastChapter && phase === "Peak" && journeyRole !== "peak") {
          phase = localPos >= 0.74 ? "Outro" : "Cooldown";
        }
      } else {
        /** Gap-split Dramatic Arc: mini banding inside each labelled chapter window. */
        if (isFirstChapter && localPos < 0.4) phase = "Intro";
        else if (isLastChapter && localPos > 0.7) phase = "Outro";
        else if (isLastChapter && localPos > 0.4) phase = "Cooldown";
        else if (!isLastChapter && ci >= total - 2 && localPos > 0.6) phase = "Cooldown";
        else if (Math.abs(ci - (total - 1) / 2) <= 0.6 && localPos >= 0.3 && localPos <= 0.7)
          phase = "Peak";
        else phase = "Build";
      }

      out[j] = phase;
    }
  }
  return out;
}

function chapterLabelForIndex(
  trackIndex: number,
  ranges: ChapterRange[],
  chapters: SequencedChapter[],
): string | null {
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]!;
    if (trackIndex >= r.fromIndex && trackIndex <= r.toIndex) {
      return chapters[i]?.label ?? null;
    }
  }
  return null;
}
