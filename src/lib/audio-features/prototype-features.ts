/**
 * Synchronous prototype feature builder.
 *
 * Used in two places:
 *  1. The sync path inside `prototype-analysis.ts` (where the rest of the
 *     `TrackAnalysis` is also built).
 *  2. The async `prototypeProvider.getFeatures(...)` exposed for the future
 *     provider-pipeline interface.
 *
 * Output is **deterministic** for a given `(title, artist, channel, seed)` — same inputs
 * always produce the same scores. Confidence is intentionally modest (0.35–0.65) so
 * this never gets confused with a real third-party BPM source. Exact `bpm` is never
 * set; downstream consumers must use `bpmRange` / `tempoFeel` for prototype rows.
 */

import type { AudioFeatures, TempoFeel } from "@/types/flowlist";

const FEATURE_VERSION = "v2";

function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pseudoRandomInt(seed: string, salt: string, max: number): number {
  if (max <= 0) return 0;
  return fnv1a(`${seed}::${FEATURE_VERSION}::${salt}`) % (max + 1);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

interface RhythmHints {
  fast: boolean;
  slow: boolean;
  drop: boolean;
  hooky: boolean;
  acoustic: boolean;
  cinematic: boolean;
  intimate: boolean;
  aggressive: boolean;
}

const FAST_RE = /\b(fast|speed|run|race|riot|sprint|highway)\b/i;
const SLOW_RE = /\b(slow|stillness|whisper|hush|quiet|sleep|drift|interlude)\b/i;
const DROP_RE = /\b(drop|bass|trap|edm|festival|rave|dubstep|hardstyle)\b/i;
const HOOKY_RE = /\b(remix|edit|version|rmx|club\s*mix|extended|radio\s*edit)\b/i;
const ACOUSTIC_RE = /\b(acoustic|piano|unplugged|live\s+session|stripped|orchestral)\b/i;
const CINEMATIC_RE = /\b(theme|score|trailer|epic|prelude|finale|requiem|symphony|movement|interlude)\b/i;
const INTIMATE_RE = /\b(love|heart|alone|kiss|touch|miss|home|stay|close|skin)\b/i;
const AGGRESSIVE_RE = /\b(rage|war|fight|burn|kill|enemy|destroy|monster|savage|murder)\b/i;

function extractRhythmHints(haystack: string): RhythmHints {
  return {
    fast: FAST_RE.test(haystack),
    slow: SLOW_RE.test(haystack),
    drop: DROP_RE.test(haystack),
    hooky: HOOKY_RE.test(haystack),
    acoustic: ACOUSTIC_RE.test(haystack),
    cinematic: CINEMATIC_RE.test(haystack),
    intimate: INTIMATE_RE.test(haystack),
    aggressive: AGGRESSIVE_RE.test(haystack),
  };
}

/**
 * Map a (tempoFeel, rhythmIntensity) pair to a coarse BPM **range** — never an exact
 * BPM. The range buckets are intentionally wide because we have no audio data.
 */
export function bpmRangeForPrototype(
  tempoFeel: TempoFeel,
  rhythmIntensity: number,
): string {
  if (tempoFeel === "slow") return rhythmIntensity < 50 ? "60-80" : "75-100";
  if (tempoFeel === "medium") return rhythmIntensity < 50 ? "85-105" : "100-125";
  return rhythmIntensity < 50 ? "115-135" : "130-160";
}

export interface PrototypeFeatureInput {
  title: string;
  artist: string;
  /** YouTube channel name when known — used as an extra hint source. */
  channel?: string | null;
  /** Optional stable seed override (e.g. "youtube:videoId:0"). */
  seed?: string;
}

/**
 * Build the rhythm/tempo `AudioFeatures` for one track. Sync, deterministic, and
 * never sets an exact `bpm` — only `bpmRange` + `tempoFeel`. `source` is always
 * `"prototype"`.
 */
export function buildPrototypeAudioFeatures(input: PrototypeFeatureInput): AudioFeatures {
  const baseSeed = input.seed ?? `${input.title}|${input.artist}|${input.channel ?? ""}`;
  const haystack = `${input.title} ${input.artist} ${input.channel ?? ""}`.toLowerCase();
  const hints = extractRhythmHints(haystack);

  let tempoIdx = pseudoRandomInt(baseSeed, "tempo", 2);
  if (hints.fast) tempoIdx = Math.min(2, tempoIdx + 1);
  if (hints.slow || hints.acoustic) tempoIdx = Math.max(0, tempoIdx - 1);
  const tempoFeel: TempoFeel = tempoIdx === 0 ? "slow" : tempoIdx === 1 ? "medium" : "fast";

  let rhythmIntensity = 18 + pseudoRandomInt(baseSeed, "ri", 70);
  if (tempoFeel === "fast") rhythmIntensity += 10;
  if (tempoFeel === "slow") rhythmIntensity -= 10;
  if (hints.drop) rhythmIntensity += 12;
  if (hints.aggressive) rhythmIntensity += 6;
  if (hints.intimate || hints.acoustic) rhythmIntensity -= 10;
  rhythmIntensity = clamp(rhythmIntensity, 5, 95);

  let grooveStability = 35 + pseudoRandomInt(baseSeed, "gs", 55);
  if (hints.cinematic) grooveStability -= 10;
  if (hints.drop) grooveStability += 8;
  if (hints.acoustic) grooveStability -= 6;
  grooveStability = clamp(grooveStability, 5, 95);

  let beatHardness = 25 + pseudoRandomInt(baseSeed, "bh", 60);
  if (hints.aggressive) beatHardness += 16;
  if (hints.drop) beatHardness += 12;
  if (hints.intimate || hints.cinematic || hints.acoustic) beatHardness -= 14;
  beatHardness = clamp(beatHardness, 5, 95);

  let danceabilityFeel = 30 + pseudoRandomInt(baseSeed, "df", 60);
  if (tempoFeel === "fast") danceabilityFeel += 12;
  if (tempoFeel === "slow") danceabilityFeel -= 12;
  if (hints.drop) danceabilityFeel += 14;
  if (hints.cinematic || hints.acoustic) danceabilityFeel -= 18;
  danceabilityFeel = clamp(danceabilityFeel, 5, 95);

  let hookOrDropImpact = 20 + pseudoRandomInt(baseSeed, "hi", 60);
  if (hints.drop || hints.hooky) hookOrDropImpact += 18;
  if (hints.cinematic) hookOrDropImpact += 8;
  if (hints.intimate || hints.acoustic) hookOrDropImpact -= 12;
  hookOrDropImpact = clamp(hookOrDropImpact, 5, 95);

  // Confidence: starts modest, bumped by clear rhythm-related hints.
  let confidence = 0.4;
  const rhythmHintCount =
    Number(hints.fast) +
    Number(hints.slow) +
    Number(hints.drop) +
    Number(hints.acoustic) +
    Number(hints.aggressive);
  if (rhythmHintCount > 0) confidence += Math.min(rhythmHintCount, 3) * 0.07;
  confidence = Number(clamp(confidence, 0.35, 0.65).toFixed(2));

  return {
    bpmRange: bpmRangeForPrototype(tempoFeel, rhythmIntensity),
    mode: "unknown",
    tempoFeel,
    rhythmIntensity,
    grooveStability,
    beatHardness,
    danceabilityFeel,
    hookOrDropImpact,
    confidence,
    source: "prototype",
  };
}
