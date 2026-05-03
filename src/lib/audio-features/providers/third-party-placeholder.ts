/**
 * Placeholder for a future third-party BPM / audio-feature provider.
 *
 * **This provider does not call any real API.** It exists so the rest of the
 * pipeline (`get-audio-features.ts`) can already be written against the production
 * shape — when a real provider is wired up later, only this file needs to change.
 *
 * Possible future implementations:
 *   - Reverse-search a public BPM database by `(title, artist)`.
 *   - Use a self-hosted audio analysis service.
 *
 * Until that work is funded, calling this provider always returns `source:
 * "unavailable"` with `matchConfidence: 0`. A warning is included so the pipeline can
 * surface "lookup not configured" notes in dev logs without throwing.
 */

import type { NormalizedTrack } from "@/types/normalized-track";
import type { AudioFeatures } from "@/types/flowlist";
import type {
  AudioFeatureProvider,
  AudioFeatureProviderResult,
} from "@/lib/audio-features/types";

const UNAVAILABLE_FEATURES: AudioFeatures = {
  // No BPM, no key, no rhythm features at all.
  tempoFeel: "medium",
  rhythmIntensity: 0,
  grooveStability: 0,
  beatHardness: 0,
  danceabilityFeel: 0,
  hookOrDropImpact: 0,
  mode: "unknown",
  confidence: 0,
  source: "unavailable",
};

export const thirdPartyPlaceholderProvider: AudioFeatureProvider = {
  name: "third-party-placeholder",
  async getFeatures(track: NormalizedTrack): Promise<AudioFeatureProviderResult> {
    void track;
    return {
      features: UNAVAILABLE_FEATURES,
      matchConfidence: 0,
      warnings: [
        "Third-party audio feature lookup is not configured yet — falling back to prototype estimates.",
      ],
    };
  },
};
