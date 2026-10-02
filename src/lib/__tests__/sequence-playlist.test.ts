import assert from "node:assert/strict";
import test from "node:test";
import { PLAYLIST_TYPES } from "../flow-presets";
import { buildMockTrackAnalysis } from "../parse-input";
import { sequencePlaylist } from "../sequence-playlist";
import { resolveStrategyFromKeywordIds } from "../flow-strategies";
import { strategyLandingScore, strategyPeakScore, strategyLateScore } from "../flow-strategy-effects";
import { combineResolvedFlowSemantics } from "../flow-semantics";
import { optimizeSequence } from "../optimize-sequence";
import { transitionCostWithStrategy } from "../transition-cost";
import { runFlowStrategySelfCheck } from "../flow-strategy-self-check";

const tracks = Array.from({ length: 24 }, (_, i) => {
  const t = buildMockTrackAnalysis({ title: `Song ${i}`, artist: `Artist ${i % 4}` }, i, `Song ${i}`, "Test");
  const level = (i * 7) % 24 / 23;
  t.estimatedEnergy = 1 + level * 9;
  t.audioFeatures.rhythmIntensity = level * 100;
  t.audioFeatures.tempoFeel = level < 0.33 ? "slow" : level < 0.67 ? "medium" : "fast";
  return t;
});
const ids = (ts: typeof tracks) => ts.map(t => t.id).sort();

for (const type of PLAYLIST_TYPES) {
  for (let a = 0; a < type.keywords.length; a++) {
    for (let b = a; b < type.keywords.length; b++) {
      const keys = [type.keywords[a]!.id, ...(a === b ? [] : [type.keywords[b]!.id])];
      test(`preserves entries, input and determinism: ${keys.join(" + ")}`, () => {
        const before = JSON.stringify(tracks);
        const first = sequencePlaylist(tracks, type.id, keys);
        const second = sequencePlaylist(tracks, type.id, keys);
        assert.deepEqual(ids(first.tracks), ids(tracks));
        assert.deepEqual(first.tracks, second.tracks);
        assert.equal(JSON.stringify(tracks), before);
        assert.equal(first.transitions.length, tracks.length - 1);
      });
    }
  }
}

test("registry conflict contracts", () => assert.deepEqual(runFlowStrategySelfCheck().issues, []));

test("empty, short and repeated occurrences survive structural transforms", () => {
  for (const type of PLAYLIST_TYPES) for (const key of type.keywords) {
    for (const n of [0, 1, 2, 3, 5, 8]) {
      const input = Array.from({ length: n }, (_, i) => tracks[i % 3]!);
      assert.deepEqual(ids(sequencePlaylist(input, type.id, [key.id]).tracks), ids(input), `${key.id}, n=${n}`);
    }
  }
});

test("soft landing and grand finale keep their strongest closer", () => {
  for (const key of ["mixed_mess.soft_landing", "classical_score.grand_finale"]) {
    const strategy = resolveStrategyFromKeywordIds([key]).combined;
    const score = key.endsWith("soft_landing") ? strategyLandingScore : strategyPeakScore;
    const result = sequencePlaylist(tracks, key.split(".")[0]!, [key]);
    assert.equal(score(result.tracks.at(-1)!, strategy), Math.max(...tracks.map(t => score(t, strategy))));
  }
});

test("rising and falling energy follow opposite directions", () => {
  const rise = sequencePlaylist(tracks, "rock_alt", ["rock_alt.guitar_energy_rise"]).tracks;
  const fall = sequencePlaylist(tracks, "classical_score", ["classical_score.storm_to_serenity"]).tracks;
  const avg = (xs: typeof tracks) => xs.reduce((s, t) => s + t.estimatedEnergy, 0) / xs.length;
  assert.ok(avg(rise.slice(-6)) > avg(rise.slice(0, 6)) + 3);
  assert.ok(avg(fall.slice(0, 6)) > avg(fall.slice(-6)) + 3);
});

test("continuity optimization reduces harsh cuts, including loop re-entry", () => {
  for (const key of ["chill_lofi.no_sudden_jumps", "chill_lofi.calm_loop"]) {
    const strategy = resolveStrategyFromKeywordIds([key]).combined;
    // Isolate transition quality from endpoint preferences.
    const neutral = { ...strategy, preferredOpening: undefined, preferredEnding: undefined };
    const cost = (ts: typeof tracks) => ts.reduce((s, t, i) => i === 0 && !strategy.flags.loopBack ? s
      : s + transitionCostWithStrategy(ts[(i + ts.length - 1) % ts.length]!, t, neutral, { position: i / (ts.length - 1) }).totalCost, 0);
    const out = optimizeSequence(tracks, neutral, combineResolvedFlowSemantics([key]));
    assert.ok(cost(out) < cost(tracks) * 0.8);
  }
});

test("optimizer cannot move tracks between emotional chapters", () => {
  const key = "mixed_mess.mood_chapters";
  const strategy = resolveStrategyFromKeywordIds([key]).combined;
  const ranges = [{ fromIndex: 0, toIndex: 11 }, { fromIndex: 12, toIndex: 23 }];
  const out = optimizeSequence(tracks, strategy, combineResolvedFlowSemantics([key]), ranges);
  assert.deepEqual(ids(out.slice(0, 12)), ids(tracks.slice(0, 12)));
  assert.deepEqual(ids(out.slice(12)), ids(tracks.slice(12)));
});

test("0.5 is a real progression weight outside wave strategies", () => {
  const strategy = { ...resolveStrategyFromKeywordIds(["pop_dance.feel_good_rise"]).combined, progression: { warmth: 0.5 } };
  assert.equal(strategyLateScore(tracks[0]!, strategy), tracks[0]!.mood.emotionalWarmth);
});

test("energy wave contains repeated rises and releases", () => {
  const out = sequencePlaylist(tracks, "mixed_mess", ["mixed_mess.energy_wave"]).tracks;
  const groove = out.map(t => t.estimatedEnergy * 4.6 + t.audioFeatures.rhythmIntensity * 0.54);
  let crests = 0;
  for (let i = 1; i < groove.length - 1; i++) {
    if (groove[i]! > groove[i - 1]! && groove[i]! > groove[i + 1]!) crests++;
  }
  assert.ok(crests >= 2);
  assert.ok(groove.some((v, i) => i > 0 && v < groove[i - 1]! - 15));
});

test("strongest bangers remain one uninterrupted run", () => {
  const key = "hip_hop.banger_run";
  const strategy = resolveStrategyFromKeywordIds([key]).combined;
  const strongest = new Set([...tracks].sort((a, b) => strategyPeakScore(b, strategy) - strategyPeakScore(a, strategy))
    .slice(0, Math.round(tracks.length * 0.35)).map(t => t.id));
  const out = sequencePlaylist(tracks, "hip_hop", [key]).tracks;
  const positions = out.flatMap((t, i) => strongest.has(t.id) ? [i] : []);
  assert.equal(positions.at(-1)! - positions[0]! + 1, positions.length);
});

test("300-track deep import remains complete", () => {
  const input = Array.from({ length: 300 }, (_, i) => ({ ...tracks[i % tracks.length]!, id: `large-${i}` }));
  const out = sequencePlaylist(input, "mixed_mess", ["mixed_mess.energy_wave", "mixed_mess.soft_landing"]);
  assert.deepEqual(ids(out.tracks), ids(input));
});
