/**
 * Real chapter-building for Mood Chapters (mixed_mess.mood_chapters).
 *
 * Unlike the legacy `assignChapters` (which just labels a gap-split of an
 * already-ordered sequence), this module:
 *
 *  1. Clusters tracks by feature similarity using k-means on 12 mood/rhythm
 *     features (prototype values — no real audio analysis).
 *  2. Orders tracks inside each cluster with a greedy nearest-neighbour
 *     algorithm driven by `transitionCostWithStrategy`, minimising internal
 *     whiplash.
 *  3. Assigns each cluster a narrative journey role (establish → deepen →
 *     lift/peak → contrast → resolve) using an exhaustive role-fit search.
 *  4. Orders clusters into the journey arc.
 *  5. Returns a flat ordered track list + rich chapter metadata ready for the
 *     sequencer.
 *
 * The algorithm is deterministic: k-means uses a seeded LCG, three restarts are
 * tried, and the run with the lowest within-cluster sum of squares is kept.
 *
 * All track features are estimated (prototype). Labels say "mock analysis".
 */

import type {
  JourneyRole,
  SequencedChapter,
  TempoFeel,
  TrackAnalysis,
} from "@/types/flowlist";
import type { FlowStrategy } from "@/lib/flow-strategies";
import { transitionCostWithStrategy } from "@/lib/transition-cost";

/** Prefer analysed tempo; preserves behaviour if only the legacy mirror is set. */
function tempoFeelForChaptering(t: TrackAnalysis): TempoFeel {
  return t.audioFeatures.tempoFeel ?? t.tempoFeel;
}

// ---------------------------------------------------------------------------
// Feature extraction — 12 dimensions, all normalised 0..1
// ---------------------------------------------------------------------------

const DIM = 12;
type Vec = number[]; // fixed-length DIM array

function trackVec(t: TrackAnalysis): Vec {
  const tf = tempoFeelForChaptering(t);
  const tempo = tf === "slow" ? 0.0 : tf === "medium" ? 0.5 : 1.0;
  return [
    t.mood.moodDarkness / 100,
    t.mood.emotionalWarmth / 100,
    t.mood.melancholy / 100,
    t.mood.euphoria / 100,
    t.mood.aggression / 100,
    t.mood.intimacy / 100,
    t.mood.cinematicScale / 100,
    tempo,
    t.audioFeatures.rhythmIntensity / 100,
    t.audioFeatures.danceabilityFeel / 100,
    t.audioFeatures.beatHardness / 100,
    t.estimatedEnergy / 10,
  ];
}

function sqDist(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < DIM; i++) s += (a[i]! - b[i]!) ** 2;
  return s;
}

function vecMean(vecs: Vec[]): Vec {
  const out: number[] = new Array(DIM).fill(0);
  for (const v of vecs) for (let i = 0; i < DIM; i++) out[i]! += v[i]!;
  return out.map((x) => x / vecs.length);
}

// ---------------------------------------------------------------------------
// K-means (k-means++ init, deterministic LCG)
// ---------------------------------------------------------------------------

function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function kMeansOnce(vecs: Vec[], k: number, rand: () => number): number[] {
  const n = vecs.length;

  // k-means++ initialisation
  const centerIdxs: number[] = [Math.floor(rand() * n)];
  while (centerIdxs.length < k) {
    const d2 = vecs.map((v) => {
      let minD = Infinity;
      for (const ci of centerIdxs) {
        const d = sqDist(v, vecs[ci]!);
        if (d < minD) minD = d;
      }
      return minD;
    });
    const total = d2.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i]!;
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    if (centerIdxs.includes(chosen)) chosen = Math.floor(rand() * n);
    centerIdxs.push(chosen);
  }

  const centers: Vec[] = centerIdxs.map((i) => [...vecs[i]!]);
  let labels: number[] = new Array(n).fill(0);

  for (let iter = 0; iter < 25; iter++) {
    const newLabels = vecs.map((v) => {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = sqDist(v, centers[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    });

    if (newLabels.every((l, i) => l === labels[i])) break;
    labels = newLabels;

    for (let c = 0; c < k; c++) {
      const clusterVecs = vecs.filter((_, i) => labels[i] === c);
      if (clusterVecs.length > 0) centers[c] = vecMean(clusterVecs);
    }
  }

  return labels;
}

function clusterInertia(vecs: Vec[], labels: number[], k: number): number {
  const groups: Vec[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < vecs.length; i++) groups[labels[i]!]!.push(vecs[i]!);
  const centroids = groups.map((g) => (g.length > 0 ? vecMean(g) : new Array(DIM).fill(0)));
  return vecs.reduce((s, v, i) => s + sqDist(v, centroids[labels[i]!]!), 0);
}

/**
 * Run k-means 3 times with different seeds; keep the lowest-inertia result.
 * Then merge any singleton clusters into their nearest non-singleton neighbour
 * so every chapter has ≥ 2 tracks.
 */
function clusterTracks(vecs: Vec[], k: number): number[] {
  if (vecs.length <= k) return vecs.map((_, i) => Math.min(i, k - 1));

  let bestLabels: number[] = [];
  let bestInertia = Infinity;
  for (let trial = 0; trial < 3; trial++) {
    const rand = makeLcg(42 + trial * 997);
    const labels = kMeansOnce(vecs, k, rand);
    const inertia = clusterInertia(vecs, labels, k);
    if (inertia < bestInertia) {
      bestInertia = inertia;
      bestLabels = labels;
    }
  }

  // Merge singleton clusters into nearest neighbour.
  for (let _attempt = 0; _attempt < k * 2; _attempt++) {
    const counts: number[] = new Array(k).fill(0);
    for (const l of bestLabels) counts[l]!++;
    const singletonCluster = counts.findIndex((c) => c === 1);
    if (singletonCluster === -1) break;

    const singletonIdx = bestLabels.findIndex((l) => l === singletonCluster);
    if (singletonIdx === -1) break;

    // Compute centroids of non-singleton clusters.
    const groups: Vec[][] = Array.from({ length: k }, () => []);
    for (let i = 0; i < vecs.length; i++) {
      if (i !== singletonIdx) groups[bestLabels[i]!]!.push(vecs[i]!);
    }
    const centroids = groups.map((g) => (g.length > 0 ? vecMean(g) : null));

    let nearestCluster = -1;
    let nearestD = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === singletonCluster || !centroids[c]) continue;
      const d = sqDist(vecs[singletonIdx]!, centroids[c]!);
      if (d < nearestD) {
        nearestD = d;
        nearestCluster = c;
      }
    }
    if (nearestCluster !== -1) bestLabels[singletonIdx] = nearestCluster;
    else break;
  }

  return bestLabels;
}

// ---------------------------------------------------------------------------
// Within-chapter ordering — greedy nearest-neighbour by transition cost
// ---------------------------------------------------------------------------

/**
 * Start from the "most central" track (lowest summed transition cost to all
 * others), then greedily visit the nearest unvisited track.
 */
function orderChapterTracks(tracks: TrackAnalysis[], strategy: FlowStrategy): TrackAnalysis[] {
  if (tracks.length <= 2) return [...tracks];

  const n = tracks.length;
  // Find start: track with lowest total transition cost to all others.
  const totalCosts = tracks.map((t, i) => {
    let total = 0;
    for (let j = 0; j < n; j++) {
      if (j !== i) total += transitionCostWithStrategy(t, tracks[j]!, strategy).totalCost;
    }
    return total;
  });
  const startIdx = totalCosts.indexOf(Math.min(...totalCosts));

  const visited = new Set<number>([startIdx]);
  const result: TrackAnalysis[] = [tracks[startIdx]!];

  while (result.length < n) {
    const last = result[result.length - 1]!;
    let bestNext = -1;
    let bestCost = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      const cost = transitionCostWithStrategy(last, tracks[j]!, strategy).totalCost;
      if (cost < bestCost) {
        bestCost = cost;
        bestNext = j;
      }
    }
    if (bestNext === -1) break;
    visited.add(bestNext);
    result.push(tracks[bestNext]!);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Chapter signature helpers
// ---------------------------------------------------------------------------

interface ChapterSig {
  energy: number;
  rhythm: number;
  darkness: number;
  warmth: number;
  euphoria: number;
  intimacy: number;
  aggression: number;
  tension: number;
  resolution: number;
  melancholy: number;
  cinematicScale: number;
  /** Share of tracks with slow tempo feel (0–1); helps name tempo colour. */
  slowTempoShare: number;
}

function chapterSig(tracks: TrackAnalysis[]): ChapterSig {
  const avg = (fn: (t: TrackAnalysis) => number) =>
    tracks.reduce((s, t) => s + fn(t), 0) / tracks.length;
  const slowShare =
    tracks.filter((t) => tempoFeelForChaptering(t) === "slow").length /
    Math.max(1, tracks.length);
  return {
    energy: avg((t) => t.estimatedEnergy),
    rhythm: avg((t) => t.audioFeatures.rhythmIntensity),
    darkness: avg((t) => t.mood.moodDarkness),
    warmth: avg((t) => t.mood.emotionalWarmth),
    euphoria: avg((t) => t.mood.euphoria),
    intimacy: avg((t) => t.mood.intimacy),
    aggression: avg((t) => t.mood.aggression),
    tension: avg((t) => t.mood.tension),
    resolution: avg((t) => t.mood.resolution),
    melancholy: avg((t) => t.mood.melancholy),
    cinematicScale: avg((t) => t.mood.cinematicScale),
    slowTempoShare: slowShare,
  };
}

/**
 * Candidate chapter titles ranked by similarity to prototype features + journey role.
 * Names are deliberately varied so k-means clusters don't collapse to duplicate labels.
 */
const MOOD_TITLE_RULES: Array<{
  name: string;
  score: (s: ChapterSig, role: JourneyRole) => number;
}> = [
  {
    name: "Bright Momentum",
    score: (s, role) =>
      (role === "lift" ? 12 : role === "peak" ? 8 : 0) +
      s.euphoria * 0.08 +
      Math.max(0, s.energy - 5.2) * 2.05 +
      s.warmth * 0.02 +
      Math.min(s.rhythm, 74) * 0.036 -
      s.darkness * 0.03,
  },
  {
    name: "Pop Lift",
    score: (s, role) =>
      (role === "lift" ? 14 : role === "peak" ? 8 : role === "establish" ? 5 : -2) +
      s.euphoria * 0.065 +
      s.rhythm * 0.04 +
      Math.min(s.aggression, 72) * 0.035 -
      Math.max(0, s.darkness - 55) * 0.05,
  },
  {
    name: "High-Groove Peak",
    score: (s, role) =>
      (role === "peak" ? 26 : role === "lift" ? 10 : role === "contrast" ? 4 : -6) +
      s.rhythm * 0.11 +
      s.energy * 1.06 -
      Math.max(0, s.slowTempoShare - 0.55) * 14,
  },
  {
    name: "Midnight Drift",
    score: (s, role) =>
      (role === "deepen" || role === "contrast" ? 10 : role === "resolve" ? 4 : -2) +
      s.darkness * 0.08 +
      s.melancholy * 0.05 +
      Math.min(s.slowTempoShare, 1) * 22 -
      s.euphoria * 0.04,
  },
  {
    name: "Soft Emotional Drift",
    score: (s, role) =>
      (role === "deepen" || role === "resolve" ? 14 : role === "contrast" ? 8 : -3) +
      s.intimacy * 0.07 +
      s.melancholy * 0.055 +
      s.resolution * 0.04 -
      Math.max(0, s.energy - 6.8) * 1.8,
  },
  {
    name: "Warm Interior",
    score: (s, role) =>
      (role === "establish" || role === "resolve" ? 10 : role === "deepen" ? 5 : -2) +
      s.intimacy * 0.08 +
      s.warmth * 0.07 +
      Math.max(0, 5.8 - s.energy) * 1.2 -
      Math.max(0, s.aggression - 58) * 0.05,
  },
  {
    name: "Soft Resolution",
    score: (s, role) =>
      (role === "resolve" ? 38 : role === "contrast" ? 6 : -8) +
      s.resolution * 0.11 +
      s.warmth * 0.05 +
      s.intimacy * 0.05 -
      s.rhythm * 0.04,
  },
  {
    name: "Gentle Landing",
    score: (s, role) =>
      (role === "resolve" ? 18 : role === "establish" ? 4 : -6) +
      s.slowTempoShare * 30 +
      s.resolution * 0.08 +
      Math.max(0, 7 - s.energy) * 3.8 -
      s.rhythm * 0.05,
  },
  {
    name: "Shadowed Reflection",
    score: (s, role) =>
      (role === "contrast" ? 16 : role === "deepen" ? 8 : role === "resolve" ? 3 : -1) +
      s.darkness * 0.07 +
      s.melancholy * 0.06 +
      (100 - s.warmth) * 0.02 -
      s.euphoria * 0.05,
  },
  {
    name: "Tension Coil",
    score: (s, role) =>
      (role === "peak" ? 12 : role === "contrast" ? 22 : role === "deepen" ? 14 : -2) +
      s.tension * 0.09 +
      s.aggression * 0.04 +
      s.cinematicScale * 0.03,
  },
  {
    name: "Quiet Core",
    score: (s, role) =>
      (role === "establish" || role === "resolve" ? 7 : role === "deepen" ? 4 : -6) +
      Math.max(0, 7 - s.energy) * 5.8 +
      (100 - s.rhythm) * 0.05 +
      s.slowTempoShare * 16,
  },
  {
    name: "Silver Afterglow",
    score: (s, role) =>
      (role === "resolve" || role === "contrast" ? 9 : role === "deepen" ? 7 : -2) +
      s.resolution * 0.065 +
      s.warmth * 0.05 +
      s.intimacy * 0.04 -
      s.aggression * 0.035,
  },
  {
    name: "Smoke & Pulse",
    score: (s, role) =>
      (role === "peak" || role === "lift" ? 6 : role === "establish" ? 3 : -4) +
      Math.min(s.rhythm, 75) * 0.065 +
      s.darkness * 0.035 +
      s.energy * 0.82,
  },
  {
    name: "Neon Glide",
    score: (s, role) =>
      (role === "lift" ? 14 : role === "peak" ? 9 : role === "establish" ? 4 : -1) +
      s.euphoria * 0.055 +
      s.rhythm * 0.065 -
      Math.max(0, s.darkness - 72) * 0.08,
  },
  {
    name: "Steel Motion",
    score: (s, role) =>
      (role === "peak" ? 10 : role === "lift" ? 11 : role === "contrast" ? 5 : -2) +
      s.aggression * 0.09 +
      s.rhythm * 0.065 +
      s.energy * 0.92,
  },
  {
    name: "Velvet Fade",
    score: (s, role) =>
      (role === "resolve" || role === "contrast" ? 12 : role === "deepen" ? 10 : -1) +
      (100 - s.rhythm) * 0.046 +
      s.intimacy * 0.07 +
      s.warmth * 0.04,
  },
];

function rankChapterTitleCandidates(sig: ChapterSig, role: JourneyRole): { name: string; score: number }[] {
  return MOOD_TITLE_RULES.map((r) => ({ name: r.name, score: r.score(sig, role) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Assign a unique stylistic chapter title per journey section (preferred over repeating "Drift").
 */
function distinctChapterTitles(
  chapterData: readonly { sig: ChapterSig; role: JourneyRole }[],
): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  let fallbackOrdinal = 0;
  const fallbacks = [
    "Northern Drift",
    "Pacific Drift",
    "Signal Drift",
    "Harbor Drift",
    "Ribbon Drift",
    "Tapestry Drift",
  ];

  for (let ci = 0; ci < chapterData.length; ci++) {
    const { sig, role } = chapterData[ci]!;
    const ranked = rankChapterTitleCandidates(sig, role);
    const pickExisting = ranked.find((c) => !used.has(c.name));
    if (pickExisting) {
      used.add(pickExisting.name);
      out.push(pickExisting.name);
      continue;
    }
    const fb = fallbacks[fallbackOrdinal % fallbacks.length]!;
    fallbackOrdinal++;
    let name = fb;
    let suf = 2;
    while (used.has(name)) {
      name = `${fb} · ${suf}`;
      suf++;
    }
    used.add(name);
    out.push(name);
  }
  return out;
}

function journeyRoleRibbon(role: JourneyRole): string {
  switch (role) {
    case "establish":
      return "Opening arc";
    case "deepen":
      return "Deepening arc";
    case "lift":
      return "Rising arc";
    case "peak":
      return "Peak arc";
    case "contrast":
      return "Contrast arc";
    case "resolve":
      return "Resolution arc";
  }
}

function dominantMoodTags(sig: ChapterSig): string[] {
  const tags: string[] = [];
  if (sig.energy >= 7) tags.push("energetic");
  else if (sig.energy <= 3) tags.push("gentle");
  if (sig.darkness > 60) tags.push("dark");
  else if (sig.warmth > 60) tags.push("warm");
  if (sig.euphoria > 60) tags.push("euphoric");
  if (sig.intimacy > 60) tags.push("intimate");
  if (sig.aggression > 60) tags.push("aggressive");
  if (sig.tension > 60) tags.push("tense");
  if (sig.melancholy > 55) tags.push("melancholic");
  if (sig.cinematicScale > 65) tags.push("cinematic");
  if (sig.rhythm > 70) tags.push("driving");
  if (sig.resolution > 65) tags.push("resolved");
  return tags.slice(0, 4);
}

function tempoProfile(tracks: TrackAnalysis[]): "mostly slow" | "mostly fast" | "mixed" {
  if (tracks.length === 0) return "mixed";
  const slow = tracks.filter((t) => tempoFeelForChaptering(t) === "slow").length / tracks.length;
  const fast = tracks.filter((t) => tempoFeelForChaptering(t) === "fast").length / tracks.length;
  if (slow >= 0.6) return "mostly slow";
  if (fast >= 0.6) return "mostly fast";
  return "mixed";
}

// ---------------------------------------------------------------------------
// Journey arc ordering — exhaustive role-fit search
// ---------------------------------------------------------------------------

const JOURNEY_ARCS: Record<number, JourneyRole[]> = {
  2: ["establish", "resolve"],
  3: ["establish", "peak", "resolve"],
  4: ["establish", "deepen", "peak", "resolve"],
  5: ["establish", "deepen", "peak", "contrast", "resolve"],
  6: ["establish", "deepen", "lift", "peak", "contrast", "resolve"],
};

function roleScore(sig: ChapterSig, role: JourneyRole): number {
  switch (role) {
    case "establish":
      return 10 - Math.abs(sig.energy - 5) * 0.8
        + sig.warmth * 0.03
        - sig.aggression * 0.03
        + (sig.intimacy > 45 ? 2 : 0)
        - (sig.rhythm > 75 ? 3 : 0);
    case "deepen":
      return sig.energy * 0.6
        + sig.tension * 0.04
        + (sig.melancholy > 40 ? 2 : 0)
        - (sig.energy < 3 ? 4 : 0);
    case "lift":
      return sig.energy * 0.7
        + sig.euphoria * 0.05
        + sig.rhythm * 0.02
        - (sig.darkness > 65 ? 3 : 0);
    case "peak":
      return sig.energy * 1.2
        + sig.rhythm * 0.04
        + Math.max(sig.aggression, sig.euphoria) * 0.04;
    case "contrast":
      return sig.darkness * 0.05
        + sig.tension * 0.04
        + sig.melancholy * 0.04
        - sig.euphoria * 0.03
        - sig.energy * 0.2;
    case "resolve":
      return (10 - sig.energy) * 0.8
        + sig.intimacy * 0.05
        + sig.warmth * 0.04
        + sig.resolution * 0.05
        - sig.aggression * 0.05
        - sig.rhythm * 0.025;
  }
}

/**
 * Exhaustive permutation search over cluster→role assignment.
 * Safe for k ≤ 6 (6! = 720 permutations).
 */
function orderChaptersForJourney(
  clusters: TrackAnalysis[][],
): { orderedClusters: TrackAnalysis[][]; roles: JourneyRole[] } {
  const k = clusters.length;
  const roles = JOURNEY_ARCS[k] ?? JOURNEY_ARCS[4]!;

  if (k === 1) return { orderedClusters: clusters, roles: ["peak"] };

  const sigs = clusters.map(chapterSig);
  const indices = clusters.map((_, i) => i);
  let bestPerm = [...indices];
  let bestScore = -Infinity;

  function permute(arr: number[], start: number): void {
    if (start === arr.length) {
      let score = 0;
      for (let i = 0; i < arr.length; i++) {
        score += roleScore(sigs[arr[i]!]!, roles[i]!);
      }
      if (score > bestScore) {
        bestScore = score;
        bestPerm = [...arr];
      }
      return;
    }
    for (let i = start; i < arr.length; i++) {
      const tmp = arr[start]!;
      arr[start] = arr[i]!;
      arr[i] = tmp;
      permute(arr, start + 1);
      const tmp2 = arr[start]!;
      arr[start] = arr[i]!;
      arr[i] = tmp2;
    }
  }
  permute(indices, 0);

  return {
    orderedClusters: bestPerm.map((i) => clusters[i]!),
    roles,
  };
}

// ---------------------------------------------------------------------------
// Journey descriptions — mood title stays on `label`; ribbon is narrative role only.
// ---------------------------------------------------------------------------

function roleDescription(role: JourneyRole, sig: ChapterSig): string {
  const e = sig.energy.toFixed(1);
  switch (role) {
    case "establish":
      return `Opening section that introduces the playlist's world. Avg energy ${e}/10.`;
    case "deepen":
      return `The journey deepens — intensity and mood complexity build. Avg energy ${e}/10.`;
    case "lift":
      return `Energy lifts and momentum builds toward the peak. Avg energy ${e}/10.`;
    case "peak":
      return `The highest-energy or most intense section of the journey. Avg energy ${e}/10.`;
    case "contrast":
      return `A contrasting passage — darker or more introspective before the resolution. Avg energy ${e}/10.`;
    case "resolve":
      return `The journey settles — softer, more intimate, and resolved. Avg energy ${e}/10.`;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface MoodChapterValidation {
  ok: boolean;
  warnings: string[];
}

function validateChapters(
  clusters: TrackAnalysis[][],
  strategy: FlowStrategy,
  allTracks: TrackAnalysis[],
): MoodChapterValidation {
  const warnings: string[] = [];

  // 1. Minimum 2 tracks per chapter.
  for (let i = 0; i < clusters.length; i++) {
    if (clusters[i]!.length < 2) {
      warnings.push(
        `Chapter ${i + 1} has only ${clusters[i]!.length} track (ideally ≥ 2).`,
      );
    }
  }

  // 2. No avoidable extreme rhythm jumps within a chapter (> 45 units adjacent).
  for (let i = 0; i < clusters.length; i++) {
    const ch = clusters[i]!;
    for (let j = 1; j < ch.length; j++) {
      const jump = Math.abs(
        ch[j]!.audioFeatures.rhythmIntensity - ch[j - 1]!.audioFeatures.rhythmIntensity,
      );
      if (jump > 45) {
        warnings.push(
          `Chapter ${i + 1}: rhythm jump of ${jump.toFixed(0)} between positions ${j} and ${j + 1}.`,
        );
      }
    }
  }

  // 3. Each chapter should be more coherent than the whole-playlist average.
  const allCosts: number[] = [];
  for (let i = 1; i < allTracks.length; i++) {
    allCosts.push(
      transitionCostWithStrategy(allTracks[i - 1]!, allTracks[i]!, strategy).totalCost,
    );
  }
  const globalAvg =
    allCosts.length > 0 ? allCosts.reduce((a, b) => a + b, 0) / allCosts.length : 0;

  for (let ci = 0; ci < clusters.length; ci++) {
    const ch = clusters[ci]!;
    if (ch.length < 2) continue;
    const internalCosts: number[] = [];
    for (let j = 1; j < ch.length; j++) {
      internalCosts.push(
        transitionCostWithStrategy(ch[j - 1]!, ch[j]!, strategy).totalCost,
      );
    }
    const chAvg = internalCosts.reduce((a, b) => a + b, 0) / internalCosts.length;
    if (chAvg > globalAvg * 1.4) {
      warnings.push(
        `Chapter ${ci + 1}: internal avg transition cost (${chAvg.toFixed(1)}) exceeds global avg (${globalAvg.toFixed(1)}) by > 40%.`,
      );
    }
  }

  return { ok: warnings.length === 0, warnings };
}

// ---------------------------------------------------------------------------
// Chapter count
// ---------------------------------------------------------------------------

function moodChapterCount(n: number): number {
  if (n < 8) return 2;
  if (n < 20) return 3;
  if (n < 50) return 4;
  if (n < 75) return 5;
  return 6;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ChapterRange {
  fromIndex: number;
  toIndex: number;
}

export interface MoodChapterBuildResult {
  /**
   * Flat ordered track list — replaces the `ordered` array in the sequencer.
   * Tracks are grouped by cluster and the clusters are in journey-arc order.
   */
  orderedTracks: TrackAnalysis[];
  /** Rich chapter metadata with indices into `orderedTracks`. */
  chapters: SequencedChapter[];
  /** Parallel range list for `assignPhasesFromChapters`. */
  ranges: ChapterRange[];
  /** Validation warnings for dev-mode logging. */
  validation: MoodChapterValidation;
}

/**
 * Build internally-coherent chapters from a flat track list.
 *
 * This is the replacement for the legacy gap-split `assignChapters` when the
 * user has selected Mixed Mess + Mood Chapters.  All other chaptered flows
 * continue to use the gap-split approach.
 *
 * Features used: moodDarkness, emotionalWarmth, melancholy, euphoria,
 * aggression, intimacy, cinematicScale, tempoFeel, rhythmIntensity,
 * danceabilityFeel, beatHardness, estimatedEnergy.  All are prototype
 * estimates — result is labelled "mock analysis".
 */
export function buildMoodChapters(
  tracks: TrackAnalysis[],
  strategy: FlowStrategy,
): MoodChapterBuildResult {
  const n = tracks.length;

  if (n === 0) {
    return { orderedTracks: [], chapters: [], ranges: [], validation: { ok: true, warnings: [] } };
  }

  const k = Math.min(moodChapterCount(n), Math.max(1, n));

  // 1. Cluster tracks by feature similarity.
  const vecs = tracks.map(trackVec);
  const labels = clusterTracks(vecs, k);

  const rawClusters: TrackAnalysis[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < tracks.length; i++) rawClusters[labels[i]!]!.push(tracks[i]!);
  const nonEmptyClusters = rawClusters.filter((c) => c.length > 0);

  // 2. Order tracks within each cluster (greedy TSP via transition cost).
  const orderedClusters = nonEmptyClusters.map((c) => orderChapterTracks(c, strategy));

  // 3. Order clusters into journey arc.
  const { orderedClusters: journeyClusters, roles } = orderChaptersForJourney(orderedClusters);

  // 4. Flatten + build chapter metadata.
  const orderedTracks: TrackAnalysis[] = [];
  const chapters: SequencedChapter[] = [];
  const ranges: ChapterRange[] = [];

  const chapterSigsRoles = journeyClusters.map((clusterTrs, idx) => ({
    sig: chapterSig(clusterTrs),
    role: roles[idx] ?? ("peak" as JourneyRole),
  }));
  const moodTitles = distinctChapterTitles(chapterSigsRoles);

  for (let i = 0; i < journeyClusters.length; i++) {
    const clusterTrs = journeyClusters[i]!;
    const role = roles[i] ?? "peak";
    const from = orderedTracks.length;
    orderedTracks.push(...clusterTrs);
    const to = orderedTracks.length - 1;

    const sig = chapterSigsRoles[i]!.sig;
    const moodLabel = moodTitles[i]!;

    ranges.push({ fromIndex: from, toIndex: to });
    chapters.push({
      index: i,
      label: `Chapter ${i + 1} · ${moodLabel}`,
      fromIndex: from,
      toIndex: to,
      signature: {
        avgEnergy: sig.energy,
        avgRhythm: sig.rhythm,
        dominantMood: moodLabel,
      },
      description: roleDescription(role, sig),
      dominantMoodTags: dominantMoodTags(sig),
      tempoProfile: tempoProfile(clusterTrs),
      journeyRole: role,
      roleName: journeyRoleRibbon(role),
    });
  }

  // 5. Validate and return.
  const validation = validateChapters(journeyClusters, strategy, tracks);

  return { orderedTracks, chapters, ranges, validation };
}
