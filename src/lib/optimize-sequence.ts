/** Constrained, deterministic refinement of the strategy's structural seed.
 * Scores both position fit and neighbouring cuts; never moves tracks across chapters.
 * Uses occurrence indices, so repeated tracks remain separate playlist entries.
 */
import type { TrackAnalysis } from "@/types/flowlist";
import { featureValue, strategyPeakScore, type FeatureKey } from "@/lib/flow-strategy-effects";
import { strategyUsesWaveMotion, type FlowStrategy } from "@/lib/flow-strategies";
import { transitionCostWithStrategy } from "@/lib/transition-cost";
import type { ResolvedFlowSemantics } from "@/lib/flow-semantics";

export function optimizeSequence(
  seed: TrackAnalysis[],
  strategy: FlowStrategy,
  semantics: ResolvedFlowSemantics,
  chapters?: readonly { fromIndex: number; toIndex: number }[] | null,
): TrackAnalysis[] {
  const n = seed.length;
  if (n < 2) return [...seed];
  const order = seed.map((_, i) => i);
  const structured = strategyUsesWaveMotion(strategy) || strategy.flags.clusterRun ||
    strategy.curveType === "peak-centered" || !!chapters?.length;
  const stable = strategy.curveType === "stability-focused" || strategy.curveType === "loop";
  const features = (Object.entries(strategy.progression) as [FeatureKey, number][])
    .filter(([, weight]) => weight !== 0);
  const ranges = new Map(features.map(([key]) => {
    const values = seed.map(t => featureValue(t, key));
    return [key, { min: Math.min(...values), max: Math.max(...values) }];
  }));
  const band = (name: string) => name === "low" ? 18 : name === "high" ? 80 : 50;
  const slot = (trackIndex: number, position: number) => {
    const track = seed[trackIndex]!;
    const progress = position / (n - 1);
    let cost = 0;
    for (const [key, weight] of features) {
      const range = ranges.get(key)!;
      // The seed owns waves, peak blocks and chapter narrative. For directional
      // flows match each feature independently, rather than collapsing moods.
      const target = structured ? featureValue(seed[position]!, key)
        : range.min + (range.max - range.min) * (weight > 0 ? progress : 1 - progress);
      const priority = key === "energy" ? strategy.priorityWeights.energyProgression
        : ["rhythm", "beatHardness", "danceability", "grooveStability", "hookOrDropImpact"].includes(key)
          ? strategy.priorityWeights.rhythmProgression : strategy.priorityWeights.moodProgression;
      cost += Math.abs(featureValue(track, key) - target) * Math.abs(weight) * priority / 5;
    }
    if (structured) {
      cost += Math.abs(track.estimatedEnergy - seed[position]!.estimatedEnergy) * 8;
      cost += Math.abs(track.audioFeatures.rhythmIntensity - seed[position]!.audioFeatures.rhythmIntensity) * 0.6;
    }
    for (const [preference, strength] of [
      [strategy.preferredOpening, Math.max(0, 1 - progress * 5)],
      [strategy.preferredEnding, Math.max(0, progress * 5 - 4)],
    ] as const) {
      if (preference?.energy) cost += Math.abs(featureValue(track, "energy") - band(preference.energy)) * strength;
      if (preference?.rhythm) cost += Math.abs(featureValue(track, "rhythm") - band(preference.rhythm)) * strength;
    }
    return cost * (stable ? 0.25 : 1);
  };
  const edge = (destination: number) => {
    if (destination === 0 && !strategy.flags.loopBack) return 0;
    const prev = (destination + n - 1) % n;
    return transitionCostWithStrategy(seed[order[prev]!]!, seed[order[destination]!]!, strategy, {
      position: destination / (n - 1), flowSemantics: semantics,
    }).totalCost * strategy.priorityWeights.transitionSmoothness / 5;
  };
  const group = order.map(i => chapters?.findIndex(c => i >= c.fromIndex && i <= c.toIndex) ?? 0);
  const peakSlots = new Set(order.slice().sort((a, b) => strategyPeakScore(seed[b]!, strategy) - strategyPeakScore(seed[a]!, strategy))
    .slice(0, Math.min(n - 2, Math.max(1, Math.round(n * 0.35)))));
  const lockedEnd = strategy.flags.landingFocused || strategy.flags.grandFinale;
  // Bounded local search: O(n * window * passes), with only affected edges scored.
  const window = Math.min(n, 24);
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < Math.min(n, i + window); j++) {
        const tailStart = n - Math.max(2, Math.ceil(n * 0.1));
        if (strategy.flags.landingFocused && (i >= tailStart) !== (j >= tailStart)) continue;
        if (strategy.flags.clusterRun && peakSlots.has(order[i]!) !== peakSlots.has(order[j]!)) continue;
        if (group[i] !== group[j] || (lockedEnd && j === n - 1)) continue;
        // Preserve structural bands, including an unbroken banger run and waves.
        if (structured && Math.abs(seed[i]!.estimatedEnergy - seed[j]!.estimatedEnergy) > 1.5) continue;
        const edges = [...new Set([i, j, (i + 1) % n, (j + 1) % n])];
        const before = slot(order[i]!, i) + slot(order[j]!, j) + edges.reduce((s, k) => s + edge(k), 0);
        [order[i], order[j]] = [order[j]!, order[i]!];
        const after = slot(order[i]!, i) + slot(order[j]!, j) + edges.reduce((s, k) => s + edge(k), 0);
        if (after < before - 1e-8) changed = true;
        else [order[i], order[j]] = [order[j]!, order[i]!];
      }
    }
    if (!changed) break;
  }
  return order.map(i => seed[i]!);
}
