<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Audio feature architecture

Flowlist has a small **audio feature provider** subsystem in `src/lib/audio-features/`.
Sequencing logic should read all rhythm/tempo information from `track.audioFeatures`,
**never** from ad-hoc fields scattered across modules.

## Important constraints

- **No real BPM/audio API is wired up yet.** YouTube Data API does not provide BPM.
- Flowlist currently uses **prototype** audio feature estimates — deterministic
  hashing of `(title, artist, channelTitle)` plus a small set of keyword hints.
- **No audio is streamed, downloaded, or analyzed.**
- The codebase is *prepared* for a future third-party / AI provider; see
  `src/lib/audio-features/providers/third-party-placeholder.ts`.

## Modules

- `audio-features/types.ts` — `AudioFeatureProvider`, `AudioFeatureProviderResult`.
- `audio-features/prototype-features.ts` — sync deterministic builder used by both
  the in-line analysis pipeline and the async prototype provider.
- `audio-features/providers/prototype.ts` — async provider wrapper.
- `audio-features/providers/third-party-placeholder.ts` — returns
  `source: "unavailable"` with a "not configured yet" warning. **Do not call any
  third-party API from this file** until the product team approves a provider.
- `audio-features/get-audio-features.ts` — pipeline. Currently always returns
  prototype features. Flip `ENABLE_THIRD_PARTY` and replace the placeholder when a
  real provider is ready.
- `audio-features/index.ts` — public re-exports; import from `@/lib/audio-features`.

## What is exact-BPM-honest UX

- `source === "third_party"` or `"ai_estimated"` may show **exact BPM** when
  `audioFeatures.bpm` is set.
- `source === "prototype"` shows only `audioFeatures.bpmRange` and `tempoFeel`.
- The result page enforces this in `bpmDisplay(...)`; sequencing-quality-check
  enforces it as a dev-mode invariant.

## Switching to a real provider later

1. Implement `AudioFeatureProvider` for the real source in a new file under
   `src/lib/audio-features/providers/`.
2. Wire it into `get-audio-features.ts` ahead of the prototype fallback.
3. Set `audioFeatures.source = "third_party"` and `bpm` only when match confidence
   is high.
4. Switch `normalizedTracksToTrackAnalyses` to async + `Promise.all(getAudioFeatures(...))`
   so the import pipeline can await real lookups. The current sync path (using
   `buildPrototypeAudioFeatures` directly) should remain only as a fallback.

# Flow strategy architecture

Every flow keyword is a **`FlowStrategy`** — a single source of truth that drives
every part of the sequencer. There must be **no scattered `if (keywordId === ...)`
branches** anywhere outside the strategy registry.

## Modules

- `src/lib/flow-strategies.ts` — registry + types. Defines `FlowStrategy`,
  `FlowCurveType`, `FlowPriorityWeights`, `FlowPenalties`, `FlowProgressionTargets`,
  `FlowBehaviorFlags`. Exposes `getFlowStrategy`, `getFlowStrategiesForPlaylistType`,
  `combineFlowStrategies`, and `resolveStrategyFromKeywordIds`.
- `src/lib/flow-strategy-effects.ts` — pure helpers used by sequencing:
  `strategyLateScore`, `strategyIntroScore`, `strategyPeakScore`,
  `strategyLandingScore`, `phaseThresholdsForStrategy`, `featureValue`.
- `src/lib/transition-cost.ts` — strategy-aware transition cost:
  `transitionCostWithStrategy(a, b, strategy, { position? })` is the canonical API,
  `transitionCost(a, b, type, keywords, opts)` is the legacy wrapper.
- `src/lib/role-scoring.ts` — keyword-id wrappers around the helpers above (kept
  for backwards compat with the existing call sites).
- `src/lib/sequence-playlist.ts` — pipeline that resolves the combined strategy,
  scores tracks via `strategyLateScore`, applies curve-specific reshape (wave /
  cluster-run / landing-focused / chaptered / grand-finale / loop), then phases.
- `src/lib/transitions.ts` — strategy-aware mood/rhythm summaries and per-cut
  explanations (uses `transitionCostWithStrategy`'s reasons).
- `src/lib/sequencing-quality-check.ts` — strategy-driven dev validations.
- `src/lib/flow-strategy-self-check.ts` — internal "unit-test-style" assertions
  exercised manually (no test framework wired up yet). Runs registry coverage,
  combine semantics, and synthetic transition-cost / role-score checks.

## Strategy shape

```ts
type FlowStrategy = {
  id, label, playlistTypeIds, description,
  curveType: "linear-rise" | "linear-fall" | "wave" | "chaptered" | "peak-centered"
           | "landing-focused" | "contrast-to-resolution" | "stability-focused"
           | "cluster-run" | "loop",
  priorityWeights: { transitionSmoothness, energyProgression, rhythmProgression,
                     moodProgression, varietyPreservation, chapterCoherence,
                     peakStrength, landingStrength, genreBridge,
                     surpriseTolerance },     // 0..10
  penalties: { tempoJump, energyJump, rhythmJump, aggressionJump,
               moodWhiplash, lateHighRhythm?, earlyEnergySpike? }, // 0..10
  preferredOpening?, preferredPeak?, preferredEnding?,
  progression: { energy?, rhythm?, beatHardness?, hookOrDropImpact?, ... },  // -1..1
  flags: { chaptered?, clusterRun?, landingFocused?, grandFinale?, loop?,
           bridgeMode?, surpriseAllowed?, momentumRequired?, loopBack? },
  explanationTone: "journey" | "club" | "cinematic" | "intimate" | "focused"
                  | "dramatic" | "playful",
  smoothing: number,
};
```

## Combining two keywords

`combineFlowStrategies(a, b)`:

- **weights** are averaged.
- **penalties** are taken as the *max* (most-restrictive wins). Adding No Sudden
  Jumps to a permissive flow keeps the high tempo/rhythm penalties.
- **flags** are OR-merged. Mood Chapters + Soft Landing → both `chaptered` and
  `landingFocused` survive.
- **curveType** uses a priority list:
  `chaptered > cluster-run > landing-focused > stability-focused > peak-centered
  > wave > loop > linear-rise > linear-fall > contrast-to-resolution`.
- **progression** values are averaged per-feature.
- **preferred opening/peak/ending** are taken from the first strategy that
  defines them.
- **smoothing** is averaged.

## Adding a new flow keyword

1. Add the `FlowKeyword` (UI label, description) to `flow-presets.ts`.
2. Add a matching `FlowStrategy` to the `STRATEGIES` array in
   `flow-strategies.ts`.
3. Done — sequencing, role scoring, transition cost, summaries, and quality
   checks pick it up automatically. **Do not add new `if (keywordId === ...)`
   branches anywhere else.**

## Validation

Run `runFlowStrategySelfCheck()` from `flow-strategy-self-check.ts` to verify:

- every keyword has exactly one strategy,
- each playlist type exposes 5–6 strategies,
- combine semantics (chaptered dominance, restrictive penalties, flag survival),
- transition cost is sensitive to penalty weights,
- role scoring picks the expected synthetic track for landing / peak.

`runSequencingQualityChecks(result, type, keywords, sourceIds)` adds
result-aware checks: phase monotonicity, soft-landing finale, grand-finale
contrast, cluster-run cohesion, mood-chapters internal smoothness, etc.
