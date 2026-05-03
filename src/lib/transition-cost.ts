/**
 * Strategy-aware track-to-track transition cost.
 *
 *   transitionCost(a, b, playlistTypeId, flowKeywordIds)
 *     -> { totalCost, reasons }
 *
 * `totalCost` is bigger when the cut feels harsher. Penalty weights come
 * from the resolved `FlowStrategy` (see `flow-strategies.ts`), so:
 *
 *  - Hypnotic Pulse / No Sudden Jumps / Focus Flow → tempo / rhythm jumps cost ~10x more.
 *  - Surprise but Smooth / Chaos to Coherence / Genre Bridge → softer base penalties.
 *  - Soft Landing / Cooldown Set → late high rhythm is taxed extra.
 *  - Banger Run → sustained-banger pairs are *discounted*.
 *  - Genre Bridge → mid-distance transitions get a small discount when at least one
 *                   compatibility dimension (tempo / warmth / nostalgia / rhythm) is shared.
 *
 * The function still returns specific feature-driven reason fragments, never
 * generic copy.
 *
 * Optional `position` (0..1 normalized index of `b` in the playlist) lets the
 * function apply position-aware penalties — e.g. `lateHighRhythm` only fires
 * when `b` actually sits in the back stretch. Callers that don't have a
 * position pass `undefined`.
 */

import type { TempoFeel, TrackAnalysis } from "@/types/flowlist";
import {
  resolveStrategyFromKeywordIds,
  type FlowStrategy,
} from "@/lib/flow-strategies";

function tempoRank(t: TempoFeel): number {
  return t === "slow" ? 0 : t === "medium" ? 1 : 2;
}

export interface TransitionCostResult {
  totalCost: number;
  reasons: string[];
}

export interface TransitionCostOptions {
  /** Normalized position (0..1) of the *destination* track. */
  position?: number;
}

/**
 * Strategy-explicit version. Prefer this from inside the sequencing engine
 * where the resolved strategy is already in scope.
 */
export function transitionCostWithStrategy(
  a: TrackAnalysis,
  b: TrackAnalysis,
  strategy: FlowStrategy,
  opts?: TransitionCostOptions,
): TransitionCostResult {
  // ---- raw deltas -----------------------------------------------------
  const eDelta = b.estimatedEnergy - a.estimatedEnergy;
  const tempoDelta = tempoRank(b.audioFeatures.tempoFeel) - tempoRank(a.audioFeatures.tempoFeel);
  const rDelta = b.audioFeatures.rhythmIntensity - a.audioFeatures.rhythmIntensity;
  const gDelta = b.audioFeatures.grooveStability - a.audioFeatures.grooveStability;
  const dDelta = b.mood.moodDarkness - a.mood.moodDarkness;
  const wDelta = b.mood.emotionalWarmth - a.mood.emotionalWarmth;
  const aggDelta = b.mood.aggression - a.mood.aggression;
  const intDelta = b.mood.intimacy - a.mood.intimacy;
  const cinDelta = b.mood.cinematicScale - a.mood.cinematicScale;
  const moodPolarity =
    Math.abs(b.mood.melancholy - a.mood.melancholy) + Math.abs(b.mood.euphoria - a.mood.euphoria);

  // ---- strategy weights / penalties ----------------------------------
  const P = strategy.penalties;
  // Translate 0..10 penalty values into per-unit multipliers.
  // For most dimensions a "penalty=4" should land in the same ballpark as
  // the previous hand-tuned constants.
  const pTempo = (P.tempoJump ?? 4) * 2.4; // 4 → 9.6, 10 → 24
  const pEnergy = (P.energyJump ?? 4) * 0.45; // 4 → 1.8
  const pRhythm = (P.rhythmJump ?? 4) * 0.085; // 4 → 0.34
  const pAgg = (P.aggressionJump ?? 4) * 0.085;
  const pMood = (P.moodWhiplash ?? 3) * 0.06;

  let cost = 0;
  cost += Math.abs(eDelta) * pEnergy;
  cost += Math.abs(tempoDelta) * pTempo;
  cost += Math.abs(rDelta) * pRhythm;
  cost += Math.abs(gDelta) * 0.12;
  cost += Math.abs(dDelta) * pMood;
  cost += Math.abs(wDelta) * pMood;
  cost += Math.abs(aggDelta) * pAgg;
  cost += Math.abs(intDelta) * 0.22;
  cost += Math.abs(cinDelta) * 0.1;
  if (moodPolarity > 60) cost += (moodPolarity - 60) * pMood * 1.4;

  // ---- specific, non-generic reasons ---------------------------------
  const reasons: string[] = [];

  if (tempoDelta === 0) {
    reasons.push(
      `Both tracks keep a ${a.audioFeatures.tempoFeel} tempo feel, so the transition stays grounded.`,
    );
  } else if (Math.abs(tempoDelta) === 1) {
    reasons.push(
      `Tempo nudges from ${a.audioFeatures.tempoFeel} to ${b.audioFeatures.tempoFeel} — a controlled step.`,
    );
  } else {
    if (Math.abs(dDelta) < 12) {
      reasons.push(
        `Tempo changes from ${a.audioFeatures.tempoFeel} to ${b.audioFeatures.tempoFeel}; this jump is cushioned by similar mood darkness.`,
      );
    } else {
      reasons.push(
        `Tempo changes from ${a.audioFeatures.tempoFeel} to ${b.audioFeatures.tempoFeel} — a deliberate gear-shift in the arc.`,
      );
    }
  }

  if (Math.abs(rDelta) >= 18) {
    reasons.push(
      rDelta < 0
        ? `Rhythm intensity drops from ${a.audioFeatures.rhythmIntensity} to ${b.audioFeatures.rhythmIntensity}, softening the landing.`
        : `Rhythm intensity rises from ${a.audioFeatures.rhythmIntensity} to ${b.audioFeatures.rhythmIntensity}, lifting the energy.`,
    );
  }

  if (Math.abs(eDelta) >= 2) {
    reasons.push(
      eDelta > 0
        ? `Energy steps up (${a.estimatedEnergy} → ${b.estimatedEnergy}).`
        : `Energy eases down (${a.estimatedEnergy} → ${b.estimatedEnergy}).`,
    );
  }

  if (wDelta >= 18 && aggDelta <= -10) {
    reasons.push("Emotional warmth rises while aggression falls, matching a softer direction.");
  } else if (wDelta <= -18 && aggDelta >= 10) {
    reasons.push("Warmth recedes while aggression climbs, leaning into a harder colour.");
  }

  if (Math.abs(aggDelta) >= 30) {
    reasons.push(
      `Aggression contrast is sharp (${a.mood.aggression} → ${b.mood.aggression}) — a deliberate gear-change.`,
    );
  }

  if (Math.abs(intDelta) >= 25) {
    reasons.push(
      intDelta > 0
        ? `Intimacy deepens (${a.mood.intimacy} → ${b.mood.intimacy}), pulling the listener closer.`
        : `Intimacy steps back (${a.mood.intimacy} → ${b.mood.intimacy}), opening more space.`,
    );
  }

  if (Math.abs(cinDelta) >= 25) {
    reasons.push(
      cinDelta > 0
        ? "Cinematic scale expands across the cut, widening the room."
        : "Cinematic scale contracts, pulling the room in.",
    );
  }

  if (Math.abs(rDelta) < 8 && tempoDelta === 0 && Math.abs(eDelta) <= 1) {
    reasons.push("Energy and groove stay close, so continuity carries the cut.");
  }

  // ---- behaviour-flag bumps ------------------------------------------
  if (strategy.flags.surpriseAllowed) {
    // Reward when at least one compatibility dimension is preserved.
    const sharedTempo = tempoDelta === 0;
    const sharedRhythm = Math.abs(rDelta) < 18;
    const sharedWarmth = Math.abs(wDelta) < 18;
    const sharedNostalgia =
      Math.abs(b.mood.nostalgia - a.mood.nostalgia) < 18;
    const sharedDimensions =
      (sharedTempo ? 1 : 0) +
      (sharedRhythm ? 1 : 0) +
      (sharedWarmth ? 1 : 0) +
      (sharedNostalgia ? 1 : 0);
    if (sharedDimensions >= 1) {
      cost *= 0.85;
    } else {
      cost *= 1.2;
      reasons.push(
        "Surprise is bigger here — no shared tempo, warmth, or rhythm bridge to soften the cut.",
      );
    }
  }

  if (strategy.flags.bridgeMode) {
    // Mid-distance transitions are useful bridges; reward them slightly.
    if (Math.abs(rDelta) >= 12 && Math.abs(rDelta) <= 28 && Math.abs(eDelta) <= 3) {
      cost *= 0.9;
    }
  }

  if (strategy.flags.momentumRequired) {
    // Avoid stalls — penalize "two slow / low-energy in a row".
    if (
      a.estimatedEnergy <= 4 &&
      b.estimatedEnergy <= 4 &&
      a.audioFeatures.rhythmIntensity < 50 &&
      b.audioFeatures.rhythmIntensity < 50
    ) {
      cost += 6;
    }
  }

  if (strategy.flags.clusterRun) {
    // Two consecutive bangers are great — discount the cut.
    if (a.mood.aggression >= 60 && b.mood.aggression >= 60 && tempoDelta === 0) {
      cost *= 0.8;
      reasons.push(
        "Both tracks stay in banger territory — hard beats and aggression hold across the cut.",
      );
    }
  }

  // Position-aware penalties (only when caller provided a position).
  if (typeof opts?.position === "number") {
    const pos = opts.position;
    const lateHigh = P.lateHighRhythm ?? 0;
    if (lateHigh > 0 && pos >= 0.7 && b.audioFeatures.rhythmIntensity > 60) {
      cost += lateHigh * (b.audioFeatures.rhythmIntensity - 60) * 0.06;
    }
    const earlySpike = P.earlyEnergySpike ?? 0;
    if (earlySpike > 0 && pos <= 0.3 && b.estimatedEnergy >= 7) {
      cost += earlySpike * (b.estimatedEnergy - 6) * 1.1;
    }
  }

  // Soft-landing direction reward.
  if (strategy.flags.landingFocused) {
    if (rDelta < -8 && eDelta <= 0) {
      reasons.push(
        "Both rhythm intensity and energy ease — matching the soft-landing direction.",
      );
    }
  }

  return { totalCost: cost, reasons };
}

/**
 * Backwards-compatible signature. Resolves the strategy from the keyword ids
 * and forwards. Existing call sites keep working.
 */
export function transitionCost(
  a: TrackAnalysis,
  b: TrackAnalysis,
  _playlistTypeId: string | null,
  flowKeywordIds: string[],
  opts?: TransitionCostOptions,
): TransitionCostResult {
  void _playlistTypeId;
  const { combined } = resolveStrategyFromKeywordIds(flowKeywordIds);
  return transitionCostWithStrategy(a, b, combined, opts);
}
