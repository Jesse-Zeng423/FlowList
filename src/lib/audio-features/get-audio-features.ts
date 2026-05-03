/**
 * Audio feature pipeline.
 *
 * Today's behaviour:
 *   - Skip the third-party placeholder (it's deliberately not wired up).
 *   - Always return prototype features.
 *
 * Future behaviour (when a real provider is plugged in):
 *   1. Try the third-party / AI-estimated provider.
 *   2. If they return `source: "unavailable"` *or* `matchConfidence` is too low,
 *      fall back to the prototype provider.
 *
 * The function is async on purpose — third-party lookups are I/O-bound. The current
 * synchronous track-analysis pipeline calls `buildPrototypeAudioFeatures` directly
 * to keep things simple; once a real provider is configured, switch
 * `normalizedTracksToTrackAnalyses` to async + `Promise.all` and route through
 * `getAudioFeatures` instead.
 */

import type { NormalizedTrack } from "@/types/normalized-track";
import { prototypeProvider } from "@/lib/audio-features/providers/prototype";
import { thirdPartyPlaceholderProvider } from "@/lib/audio-features/providers/third-party-placeholder";
import type { AudioFeatureProviderResult } from "@/lib/audio-features/types";

const ENABLE_THIRD_PARTY = false;
/** Below this match confidence we should not trust an external provider. */
const MIN_REAL_PROVIDER_CONFIDENCE = 0.6;

export async function getAudioFeatures(
  track: NormalizedTrack,
): Promise<AudioFeatureProviderResult> {
  if (ENABLE_THIRD_PARTY) {
    const real = await thirdPartyPlaceholderProvider.getFeatures(track);
    if (
      real.features.source !== "unavailable" &&
      real.matchConfidence >= MIN_REAL_PROVIDER_CONFIDENCE
    ) {
      return real;
    }
    // Fall through to prototype with the warning(s) preserved.
    const proto = await prototypeProvider.getFeatures(track);
    return {
      ...proto,
      warnings: [...(real.warnings ?? []), ...(proto.warnings ?? [])],
    };
  }

  return prototypeProvider.getFeatures(track);
}
