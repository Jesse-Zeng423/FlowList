import assert from "node:assert/strict";
import test from "node:test";
import { buildMockTrackAnalysis } from "../parse-input";
import { buildOrderExport } from "../build-order-export";
import type { SequencedTrack } from "@/types/flowlist";

const track = buildMockTrackAnalysis({ title: "Opening Song", artist: "First Artist" }, 0, "Opening Song", "Test") as SequencedTrack;

test("copies a numbered, playable YouTube order without analysis text", () => {
  const youtubeTrack: SequencedTrack = {
    ...track,
    importMeta: {
      source: "youtube",
      externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      thumbnailUrl: null,
      platformTrackId: "dQw4w9WgXcQ",
      platformPlaylistId: "playlist",
    },
  };
  assert.equal(buildOrderExport([youtubeTrack, track]),
    "1. Opening Song — First Artist\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n2. Opening Song — First Artist");
});

test("invalid platform IDs cannot enter copied links", () => {
  const unsafe = {
    ...track,
    importMeta: {
      source: "youtube" as const,
      externalUrl: "",
      thumbnailUrl: null,
      platformTrackId: "bad?x=1",
      platformPlaylistId: "playlist",
    },
  };
  assert.equal(buildOrderExport([unsafe]), "1. Opening Song — First Artist");
});
