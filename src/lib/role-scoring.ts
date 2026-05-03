/**
 * Flow-aware role scoring for the prototype sequencer.
 *
 *   getIntroScore(track, type, keywords)    — fitness as the playlist *opener*.
 *   getPeakScore(track, type, keywords)     — fitness as a Peak slot.
 *   getLandingScore(track, type, keywords)  — fitness as the *closer* (Outro band).
 *   getBridgeScore(a, b, type, keywords)    — relative fit of B following A.
 *
 * All four resolve the chosen `FlowStrategy` (combining 1–2 keywords) and then
 * delegate to `flow-strategy-effects` for the actual maths. Adding a new
 * keyword does **not** require touching this file.
 */

import type { TrackAnalysis } from "@/types/flowlist";
import { resolveStrategyFromKeywordIds } from "@/lib/flow-strategies";
import {
  strategyIntroScore,
  strategyLandingScore,
  strategyPeakScore,
} from "@/lib/flow-strategy-effects";
import { transitionCostWithStrategy } from "@/lib/transition-cost";

export function getIntroScore(
  track: TrackAnalysis,
  _playlistTypeId: string | null,
  flowKeywordIds: string[],
): number {
  void _playlistTypeId;
  const { combined } = resolveStrategyFromKeywordIds(flowKeywordIds);
  return strategyIntroScore(track, combined);
}

export function getPeakScore(
  track: TrackAnalysis,
  _playlistTypeId: string | null,
  flowKeywordIds: string[],
): number {
  void _playlistTypeId;
  const { combined } = resolveStrategyFromKeywordIds(flowKeywordIds);
  return strategyPeakScore(track, combined);
}

export function getLandingScore(
  track: TrackAnalysis,
  _playlistTypeId: string | null,
  flowKeywordIds: string[],
): number {
  void _playlistTypeId;
  const { combined } = resolveStrategyFromKeywordIds(flowKeywordIds);
  return strategyLandingScore(track, combined);
}

/** Bigger = better. Uses transitionCost (strategy-aware) as the basis. */
export function getBridgeScore(
  a: TrackAnalysis,
  b: TrackAnalysis,
  _playlistTypeId: string | null,
  flowKeywordIds: string[],
): number {
  void _playlistTypeId;
  const { combined } = resolveStrategyFromKeywordIds(flowKeywordIds);
  return -transitionCostWithStrategy(a, b, combined).totalCost;
}
