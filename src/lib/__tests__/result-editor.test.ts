import assert from "node:assert/strict";
import test from "node:test";
import { moveOccurrence, orderedOccurrences } from "../result-editor";

test("moving duplicate occurrences preserves both and respects endpoint locks", () => {
  const songs = ["same", "middle", "same"];
  const moved = moveOccurrence([0, 1, 2], 2, -1, { first: false, last: false });
  assert.deepEqual(moved, [0, 2, 1]);
  assert.deepEqual(orderedOccurrences(songs, moved), ["same", "same", "middle"]);
  assert.deepEqual(moveOccurrence(moved, 0, 1, { first: true, last: false }), moved);
  assert.deepEqual(moveOccurrence(moved, 1, 1, { first: false, last: true }), moved);
});
