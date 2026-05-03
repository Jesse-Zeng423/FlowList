/**
 * Public surface of the audio feature subsystem. Import from here in app code:
 *
 *   import { getAudioFeatures, buildPrototypeAudioFeatures } from "@/lib/audio-features";
 */

export { getAudioFeatures } from "@/lib/audio-features/get-audio-features";
export {
  buildPrototypeAudioFeatures,
  bpmRangeForPrototype,
} from "@/lib/audio-features/prototype-features";
export { prototypeProvider } from "@/lib/audio-features/providers/prototype";
export { thirdPartyPlaceholderProvider } from "@/lib/audio-features/providers/third-party-placeholder";
export type {
  AudioFeatureProvider,
  AudioFeatureProviderResult,
} from "@/lib/audio-features/types";
