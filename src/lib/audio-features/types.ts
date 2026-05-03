/**
 * Audio feature provider contracts.
 *
 * Each provider implements `getFeatures(NormalizedTrack) -> Promise<AudioFeatureProviderResult>`.
 * The pipeline in `get-audio-features.ts` walks providers in priority order and falls
 * back to the prototype provider when none of them return a confident match.
 */

import type { AudioFeatures } from "@/types/flowlist";
import type { NormalizedTrack } from "@/types/normalized-track";

export interface AudioFeatureProviderResult {
  /** The actual rhythm/tempo features the sequencer should consume. */
  features: AudioFeatures;
  /** Title the provider matched on, when applicable (third-party DBs etc.). */
  matchedTitle?: string;
  /** Artist the provider matched on, when applicable. */
  matchedArtist?: string;
  /** 0..1 — how confident the provider is that this row matches the input track. */
  matchConfidence: number;
  /** Optional, user-friendly notes (e.g. "third-party lookup is not configured"). */
  warnings?: string[];
}

export interface AudioFeatureProvider {
  /** Stable identifier for diagnostics ("prototype", "third-party-placeholder", ...). */
  name: string;
  getFeatures(track: NormalizedTrack): Promise<AudioFeatureProviderResult>;
}
