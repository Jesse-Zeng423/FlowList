import type { SequencedPlaylist } from "@/types/flowlist";
import { isUnavailableForSequencing } from "@/lib/filter-tracks-for-sequencing";
import { normalizedFlowIds, primaryFlowArchetype } from "@/lib/flow-archetype";
import { buildArcSummaries } from "@/lib/transitions";

const PHASE_RANK: Record<string, number> = {
  Intro: 0,
  Build: 1,
  Peak: 2,
  Cooldown: 3,
  Outro: 4,
};

/**
 * Developer-facing checks for mock sequencing. Safe to call from the client in development.
 */
export function runSequencingQualityChecks(
  result: SequencedPlaylist,
  selectedFlowIds: string[],
  sourceTrackIds: Set<string>,
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const keys = normalizedFlowIds(selectedFlowIds);
  const primary = primaryFlowArchetype(keys);

  for (const t of result.tracks) {
    if (isUnavailableForSequencing(t)) {
      issues.push(`Track "${t.title}" should not appear: deleted/private/unavailable.`);
    }
    if (!sourceTrackIds.has(t.id)) {
      issues.push(`Track id ${t.id} is not in the active import set.`);
    }
  }

  for (let i = 1; i < result.tracks.length; i++) {
    const a = PHASE_RANK[result.tracks[i - 1]!.phase] ?? 0;
    const b = PHASE_RANK[result.tracks[i]!.phase] ?? 0;
    if (b < a) {
      issues.push(
        `Phase order is non-monotonic at index ${i}: ${result.tracks[i - 1]!.phase} → ${result.tracks[i]!.phase}.`,
      );
    }
  }

  const { moodArcSummary } = buildArcSummaries(result.tracks, keys);
  const contradictions: Array<{ archetype: string; forbidden: RegExp; reason: string }> = [
    {
      archetype: "intense_to_calm",
      forbidden: /brightness and emotional lift increase/i,
      reason: "Intense-to-calm should not claim brightness/lift increase over time.",
    },
    {
      archetype: "reflective_cooldown",
      forbidden: /brightness and emotional lift increase/i,
      reason: "Reflective cooldown should not imply a lifting brightness arc.",
    },
  ];
  for (const { archetype, forbidden, reason } of contradictions) {
    if (primary === archetype && forbidden.test(moodArcSummary)) {
      issues.push(`Flow/summary mismatch (${archetype}): ${reason}`);
    }
  }

  if (primary === "intense_to_calm") {
    const peakTracks = result.tracks.filter((t) => t.phase === "Peak");
    if (peakTracks.length) {
      const lowEnergyPeaks = peakTracks.filter((t) => t.estimatedEnergy <= 3).length;
      if (lowEnergyPeaks > peakTracks.length * 0.6) {
        issues.push(
          "Most Peak-phase tracks have very low energy under an intense-to-calm arc (expected stronger early peak).",
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Throws if mock sequencing invariants fail. For devtools / future tests; not invoked from production UI.
 */
export function assertMockSequencingInvariant(
  result: SequencedPlaylist,
  selectedFlowIds: string[],
): void {
  const ids = new Set(result.activeInputTrackIds ?? []);
  const { ok, issues } = runSequencingQualityChecks(result, selectedFlowIds, ids);
  if (!ok) {
    throw new Error(`[flowlist] Sequencing QA failed:\n${issues.join("\n")}`);
  }
}
