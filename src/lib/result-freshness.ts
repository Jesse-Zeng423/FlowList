import type { PlaylistSource, SequencedPlaylistSnapshot } from "@/types/flowlist";

export type RegenerateMissingPiece = "tracks" | "playlistType" | "flowKeywords";

/**
 * Normalize flow keyword ids for stable set comparison (order-independent).
 */
export function normalizeFlowKeywordIds(ids: readonly string[]): string[] {
  const uniq = new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean));
  return [...uniq].sort((a, b) => a.localeCompare(b));
}

export function normalizeImportedSourceId(id: string | null | undefined): string | null {
  const s = typeof id === "string" ? id.trim() : "";
  return s.length > 0 ? s : null;
}

export function canRegenerateFromCurrentState(state: {
  resolvedTrackCount: number;
  playlistTypeId: string | null;
  selectedFlowKeywordIds: readonly string[];
}): { canRegenerate: boolean; missing: RegenerateMissingPiece[] } {
  const missing: RegenerateMissingPiece[] = [];
  if (state.resolvedTrackCount === 0) missing.push("tracks");
  if (!state.playlistTypeId?.trim()) missing.push("playlistType");
  if (state.selectedFlowKeywordIds.length === 0) missing.push("flowKeywords");
  return { canRegenerate: missing.length === 0, missing };
}

export type ResultFreshnessReason =
  | "no-result"
  | "missing-current-tracks"
  | "missing-snapshot"
  | "source-changed"
  | "playlist-id-changed"
  | "playlist-type-changed"
  | "keywords-changed"
  | "track-count-changed"
  | "track-set-changed";

export interface LiveFingerprintInputs {
  source: PlaylistSource;
  importedSourceId: string | null;
  /** Effective playlist type id after sequencing defaults — matches snapshot. */
  playlistTypeId: string | null;
  activeTrackCount: number;
  normalizedKeywordIds: readonly string[];
}

/**
 * Decide whether `storedSnapshot` still describes the user's current sequencing inputs.
 * Compares the precomputed fingerprints first; on mismatch, attributes a coarse reason.
 */
export function getResultFreshnessStatus(args: {
  liveFingerprint: string;
  live: LiveFingerprintInputs;
  snapshot: SequencedPlaylistSnapshot | null | undefined;
  hasStoredResult: boolean;
}): { isFresh: boolean; reason?: ResultFreshnessReason } {
  const { liveFingerprint, live, snapshot, hasStoredResult } = args;

  if (!hasStoredResult) {
    return { isFresh: true, reason: "no-result" };
  }

  if (!snapshot?.inputFingerprint) {
    return { isFresh: false, reason: "missing-snapshot" };
  }

  if (live.activeTrackCount === 0) {
    return { isFresh: false, reason: "missing-current-tracks" };
  }

  if (snapshot.inputFingerprint === liveFingerprint) {
    return { isFresh: true };
  }

  const snapKeywords = normalizeFlowKeywordIds(snapshot.selectedFlowKeywords.map((k) => k.id));
  const kwA = live.normalizedKeywordIds.join("\0");
  const kwB = snapKeywords.join("\0");

  if (live.source !== snapshot.source) {
    return { isFresh: false, reason: "source-changed" };
  }
  if (normalizeImportedSourceId(live.importedSourceId) !== normalizeImportedSourceId(snapshot.importedSourceId)) {
    return { isFresh: false, reason: "playlist-id-changed" };
  }

  const liveType = live.playlistTypeId?.trim() ?? null;

  if (snapshot.playlistTypeId !== undefined && liveType !== (snapshot.playlistTypeId ?? null)) {
    return { isFresh: false, reason: "playlist-type-changed" };
  }
  if (kwA !== kwB) {
    return { isFresh: false, reason: "keywords-changed" };
  }
  if (live.activeTrackCount !== snapshot.trackCount) {
    return { isFresh: false, reason: "track-count-changed" };
  }

  return { isFresh: false, reason: "track-set-changed" };
}
