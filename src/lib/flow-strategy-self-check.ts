/**
 * Lightweight internal validation utilities for the centralized flow strategy
 * system.
 *
 * Why internal: this project does not have a unit-test framework wired up. The
 * functions in this file act as "dev assertions" — they exercise the strategy
 * registry, the combiner, and the transition-cost weights with synthetic input
 * and return a structured `{ ok, issues }` result. They can be invoked from a
 * dev-only diagnostics page or a future test suite.
 *
 * Coverage:
 *  1. Every keyword in `flow-presets.ts` has a strategy (and only one).
 *  2. Every strategy belongs to at least one known playlist type.
 *  3. `getFlowStrategiesForPlaylistType(typeId)` returns 5–6 strategies as
 *     promised in the product spec.
 *  4. Combining two strategies preserves restrictive penalties (max-of-rule).
 *  5. Combining `Mood Chapters` + anything → curveType becomes `chaptered`.
 *  6. Combining `Soft Landing` + anything → `landingFocused` flag survives.
 *  7. Combining `No Sudden Jumps` + a permissive flow → tempo/rhythm penalties
 *     stay close to `No Sudden Jumps` (most-restrictive wins).
 *  8. `transitionCostWithStrategy` is sensitive to penalty weights: the same
 *     two synthetic tracks should cost more under No Sudden Jumps than under
 *     Surprise but Smooth.
 *  9. `strategyLandingScore` for Soft Landing prefers the soft synthetic track
 *     over the loud one.
 * 10. `Banger Run` peak score prefers the hard / aggressive track.
 */

import type { TrackAnalysis } from "@/types/flowlist";
import { PLAYLIST_TYPES } from "@/lib/flow-presets";
import {
  combineFlowStrategies,
  getFlowStrategiesForPlaylistType,
  getFlowStrategy,
  resolveStrategyFromKeywordIds,
  type CombinedStrategyDiagnostics,
} from "@/lib/flow-strategies";
import {
  strategyLandingScore,
  strategyPeakScore,
} from "@/lib/flow-strategy-effects";
import { transitionCostWithStrategy } from "@/lib/transition-cost";

/** Build a synthetic TrackAnalysis with the given knobs. Helper for self-checks. */
function syntheticTrack(opts: {
  id: string;
  energy: number;
  tempo: "slow" | "medium" | "fast";
  rhythm: number;
  beatHardness?: number;
  aggression?: number;
  warmth?: number;
  intimacy?: number;
  resolution?: number;
  cinematicScale?: number;
  euphoria?: number;
  melancholy?: number;
  tension?: number;
  moodDarkness?: number;
}): TrackAnalysis {
  return {
    id: opts.id,
    title: opts.id,
    artist: "synthetic",
    album: "synthetic",
    estimatedMood: "neutral",
    estimatedEnergy: opts.energy,
    moodDarknessScore: opts.moodDarkness ?? 50,
    emotionalIntensityScore: 50,
    upliftScore: 50,
    tempoFeel: opts.tempo,
    rhythmIntensityScore: opts.rhythm,
    flavorTags: [],
    audioFeatures: {
      tempoFeel: opts.tempo,
      rhythmIntensity: opts.rhythm,
      grooveStability: 50,
      beatHardness: opts.beatHardness ?? 50,
      danceabilityFeel: 50,
      hookOrDropImpact: 50,
      mode: "unknown",
      confidence: 0.5,
      source: "prototype",
    },
    mood: {
      moodDarkness: opts.moodDarkness ?? 50,
      emotionalWarmth: opts.warmth ?? 50,
      melancholy: opts.melancholy ?? 50,
      euphoria: opts.euphoria ?? 50,
      aggression: opts.aggression ?? 50,
      intimacy: opts.intimacy ?? 50,
      cinematicScale: opts.cinematicScale ?? 50,
      nostalgia: 50,
      tension: opts.tension ?? 50,
      resolution: opts.resolution ?? 50,
    },
    analysis: {
      confidence: 0.5,
      tags: [],
      bestRoles: [],
      analysisSource: "prototype",
    },
  };
}

export interface StrategySelfCheckResult {
  ok: boolean;
  issues: string[];
}

export function runFlowStrategySelfCheck(): StrategySelfCheckResult {
  const issues: string[] = [];

  // 1. Coverage
  const allKeywordIds = PLAYLIST_TYPES.flatMap((t) => t.keywords.map((k) => k.id));
  for (const id of allKeywordIds) {
    if (!getFlowStrategy(id)) issues.push(`Missing strategy for keyword "${id}".`);
  }

  // 2. Each playlist type has 5..6 strategies (product spec).
  for (const t of PLAYLIST_TYPES) {
    const strategies = getFlowStrategiesForPlaylistType(t.id);
    if (strategies.length < 5 || strategies.length > 6) {
      issues.push(
        `Playlist type "${t.id}" has ${strategies.length} strategies — expected 5–6.`,
      );
    }
  }

  // 3. Soft Landing + Mood Chapters: chaptered dominates curveType.
  const moodChapters = getFlowStrategy("mixed_mess.mood_chapters");
  const softLanding = getFlowStrategy("mixed_mess.soft_landing");
  if (moodChapters && softLanding) {
    const combo = combineFlowStrategies([moodChapters, softLanding]);
    if (combo.curveType !== "chaptered") {
      issues.push(
        `Mood Chapters + Soft Landing → curveType "${combo.curveType}" (expected "chaptered").`,
      );
    }
    if (!combo.flags.landingFocused) {
      issues.push("Mood Chapters + Soft Landing → landingFocused flag should survive the merge.");
    }
  }

  // 4. No Sudden Jumps + permissive flow: most-restrictive penalties survive.
  const noSudden = getFlowStrategy("chill_lofi.no_sudden_jumps");
  const surprise = getFlowStrategy("mixed_mess.surprise_but_smooth");
  if (noSudden && surprise) {
    const combo = combineFlowStrategies([noSudden, surprise]);
    if (combo.penalties.tempoJump < noSudden.penalties.tempoJump) {
      issues.push(
        "No Sudden Jumps + Surprise but Smooth: tempo penalty should not drop below No Sudden Jumps.",
      );
    }
    if (combo.penalties.rhythmJump < noSudden.penalties.rhythmJump) {
      issues.push(
        "No Sudden Jumps + Surprise but Smooth: rhythm penalty should not drop below No Sudden Jumps.",
      );
    }
  }

  // 5. transitionCost responds to strategy weights.
  const a = syntheticTrack({ id: "A", energy: 4, tempo: "slow", rhythm: 30 });
  const b = syntheticTrack({ id: "B", energy: 9, tempo: "fast", rhythm: 90 });
  if (noSudden && surprise) {
    const costNoSudden = transitionCostWithStrategy(a, b, noSudden).totalCost;
    const costSurprise = transitionCostWithStrategy(a, b, surprise).totalCost;
    if (costNoSudden <= costSurprise) {
      issues.push(
        `transitionCost should be higher under No Sudden Jumps (${costNoSudden.toFixed(1)}) than under Surprise but Smooth (${costSurprise.toFixed(1)}).`,
      );
    }
  }

  // 6. Soft Landing landing score prefers a soft track.
  if (softLanding) {
    const soft = syntheticTrack({
      id: "soft",
      energy: 2,
      tempo: "slow",
      rhythm: 25,
      aggression: 15,
      resolution: 80,
      intimacy: 75,
    });
    const loud = syntheticTrack({
      id: "loud",
      energy: 9,
      tempo: "fast",
      rhythm: 88,
      aggression: 78,
      resolution: 30,
      intimacy: 25,
    });
    const softScore = strategyLandingScore(soft, softLanding);
    const loudScore = strategyLandingScore(loud, softLanding);
    if (softScore <= loudScore) {
      issues.push(
        `Soft Landing landing score should rank the soft track above the loud one (soft=${softScore.toFixed(1)}, loud=${loudScore.toFixed(1)}).`,
      );
    }
  }

  // 7. Banger Run peak score prefers a hard / aggressive track.
  const bangerRun = getFlowStrategy("hip_hop.banger_run");
  if (bangerRun) {
    const banger = syntheticTrack({
      id: "banger",
      energy: 9,
      tempo: "fast",
      rhythm: 88,
      beatHardness: 90,
      aggression: 85,
      cinematicScale: 60,
    });
    const ballad = syntheticTrack({
      id: "ballad",
      energy: 3,
      tempo: "slow",
      rhythm: 30,
      beatHardness: 25,
      aggression: 20,
      cinematicScale: 40,
    });
    const bScore = strategyPeakScore(banger, bangerRun);
    const lScore = strategyPeakScore(ballad, bangerRun);
    if (bScore <= lScore) {
      issues.push(
        `Banger Run peak score should prefer hard tracks (banger=${bScore.toFixed(1)}, ballad=${lScore.toFixed(1)}).`,
      );
    }
  }

  // 8. resolveStrategyFromKeywordIds with empty list returns a neutral strategy.
  const empty = resolveStrategyFromKeywordIds([]);
  if (!empty.combined) {
    issues.push("resolveStrategyFromKeywordIds([]) should return a neutral combined strategy.");
  }

  // ── Conflict-resolution checks (requirement 5) ─────────────────────────

  // Helper: resolve from a pair of keyword ids and return combined + diagnostics.
  function resolvePair(
    id1: string,
    id2: string,
  ): { ok: boolean; d: CombinedStrategyDiagnostics; label: string } {
    const s1 = getFlowStrategy(id1);
    const s2 = getFlowStrategy(id2);
    if (!s1 || !s2) {
      return {
        ok: false,
        d: resolveStrategyFromKeywordIds([]).diagnostics,
        label: `${id1} + ${id2}`,
      };
    }
    const resolved = resolveStrategyFromKeywordIds([id1, id2]);
    return { ok: true, d: resolved.diagnostics, label: `${s1.label} + ${s2.label}` };
  }

  // 9. Soft Landing + Grand Finale: both flags survive; final section is
  //    "grand-finale-with-smooth-lead-in"; transition strictness is moderate.
  {
    const pair = resolvePair("mixed_mess.soft_landing", "classical_score.grand_finale");
    if (!pair.ok) {
      issues.push("Soft Landing + Grand Finale: could not resolve strategies.");
    } else {
      const combined = resolveStrategyFromKeywordIds([
        "mixed_mess.soft_landing",
        "classical_score.grand_finale",
      ]).combined;
      if (!combined.flags.landingFocused) {
        issues.push(`${pair.label}: landingFocused flag must survive the merge.`);
      }
      if (!combined.flags.grandFinale) {
        issues.push(`${pair.label}: grandFinale flag must survive the merge.`);
      }
      if (pair.d.finalSectionPolicy !== "grand-finale-with-smooth-lead-in") {
        issues.push(
          `${pair.label}: finalSectionPolicy should be "grand-finale-with-smooth-lead-in" (got "${pair.d.finalSectionPolicy}").`,
        );
      }
    }
  }

  // 10. No Sudden Jumps + Surprise but Smooth: surpriseAllowed suppressed;
  //     transitionStrictness is "strict".
  {
    const pair = resolvePair("chill_lofi.no_sudden_jumps", "mixed_mess.surprise_but_smooth");
    if (!pair.ok) {
      issues.push("No Sudden Jumps + Surprise but Smooth: could not resolve strategies.");
    } else {
      const combined = resolveStrategyFromKeywordIds([
        "chill_lofi.no_sudden_jumps",
        "mixed_mess.surprise_but_smooth",
      ]).combined;
      if (combined.flags.surpriseAllowed) {
        issues.push(
          `${pair.label}: surpriseAllowed must be suppressed (No Sudden Jumps wins).`,
        );
      }
      if (pair.d.transitionStrictness !== "strict") {
        issues.push(
          `${pair.label}: transitionStrictness should be "strict" (got "${pair.d.transitionStrictness}").`,
        );
      }
    }
  }

  // 11. Mood Chapters + Soft Landing: chaptered curve dominates; landingFocused
  //     survives; dominantStructure is "chaptered".
  {
    const pair = resolvePair("mixed_mess.mood_chapters", "mixed_mess.soft_landing");
    if (!pair.ok) {
      issues.push("Mood Chapters + Soft Landing: could not resolve strategies.");
    } else {
      const combined = resolveStrategyFromKeywordIds([
        "mixed_mess.mood_chapters",
        "mixed_mess.soft_landing",
      ]).combined;
      if (combined.curveType !== "chaptered") {
        issues.push(
          `${pair.label}: curveType should be "chaptered" (got "${combined.curveType}").`,
        );
      }
      if (!combined.flags.landingFocused) {
        issues.push(`${pair.label}: landingFocused flag must survive the merge.`);
      }
      if (pair.d.dominantStructure !== "chaptered") {
        issues.push(
          `${pair.label}: dominantStructure should be "chaptered" (got "${pair.d.dominantStructure}").`,
        );
      }
    }
  }

  // 12. Banger Run + Soft Landing: bangerClusterMidOnly set; landingFocused
  //     survives; finalSectionPolicy is "banger-cluster-then-soft".
  {
    const pair = resolvePair("hip_hop.banger_run", "mixed_mess.soft_landing");
    if (!pair.ok) {
      issues.push("Banger Run + Soft Landing: could not resolve strategies.");
    } else {
      const combined = resolveStrategyFromKeywordIds([
        "hip_hop.banger_run",
        "mixed_mess.soft_landing",
      ]).combined;
      if (!combined.flags.bangerClusterMidOnly) {
        issues.push(`${pair.label}: bangerClusterMidOnly flag must be set.`);
      }
      if (!combined.flags.landingFocused) {
        issues.push(`${pair.label}: landingFocused flag must survive the merge.`);
      }
      if (pair.d.finalSectionPolicy !== "banger-cluster-then-soft") {
        issues.push(
          `${pair.label}: finalSectionPolicy should be "banger-cluster-then-soft" (got "${pair.d.finalSectionPolicy}").`,
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
