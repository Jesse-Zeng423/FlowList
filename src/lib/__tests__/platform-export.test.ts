import assert from "node:assert/strict";
import test from "node:test";
import type { SequencedTrack } from "@/types/flowlist";
import { makeAppleExportDraft, parseAppleExportDraft } from "../apple-export-draft";
import { makeYouTubeExportDraft, parseYouTubeExportDraft } from "../youtube-export-draft";

function row(source: "apple" | "youtube", id: string, type?: string): SequencedTrack {
  return { title: "Same", artist: "Artist", importMeta: { source, platformTrackId: id, platformTrackType: type } } as SequencedTrack;
}
test("YouTube draft preserves repeated video occurrences and rejects tampered IDs", () => {
  const draft = makeYouTubeExportDraft([row("youtube", "abc123DEF_-"), row("youtube", "abc123DEF_-")], "Demo");
  assert.equal(draft?.tracks.length, 2);
  assert.equal(draft?.privacy, "private");
  assert.equal(parseYouTubeExportDraft(JSON.stringify(draft))?.tracks.length, 2);
  assert.equal(parseYouTubeExportDraft(JSON.stringify({ ...draft, tracks: [{ title: "x", artist: "y", videoId: "<bad>" }] })), null);
});
test("Apple draft preserves resource type and order; rejects foreign sources", () => {
  const draft = makeAppleExportDraft([row("apple", "i.123", "library-songs"), row("apple", "222", "songs")]);
  assert.deepEqual(draft?.tracks.map(track => track.type), ["library-songs", "songs"]);
  assert.equal(parseAppleExportDraft(JSON.stringify(draft))?.tracks[0]?.id, "i.123");
  assert.equal(makeAppleExportDraft([row("youtube", "abc123DEF_-")]), null);
});
