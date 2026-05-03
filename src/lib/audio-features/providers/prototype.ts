/**
 * Prototype audio feature provider.
 *
 * Wraps the deterministic `buildPrototypeAudioFeatures` helper in the async
 * `AudioFeatureProvider` interface. This is the **fallback provider** used when no
 * higher-confidence source is configured. It never calls a real API and never sets an
 * exact BPM — `bpmRange` + `tempoFeel` only.
 */

import type { NormalizedTrack } from "@/types/normalized-track";
import { buildPrototypeAudioFeatures } from "@/lib/audio-features/prototype-features";
import type {
  AudioFeatureProvider,
  AudioFeatureProviderResult,
} from "@/lib/audio-features/types";

export const prototypeProvider: AudioFeatureProvider = {
  name: "prototype",
  async getFeatures(track: NormalizedTrack): Promise<AudioFeatureProviderResult> {
    const features = buildPrototypeAudioFeatures({
      title: track.title,
      artist: track.artist,
      channel: track.channelTitle ?? null,
      seed: `${track.source}:${track.platformTrackId}`,
    });
    return {
      features,
      matchedTitle: track.title,
      matchedArtist: track.artist,
      matchConfidence: features.confidence,
    };
  },
};
