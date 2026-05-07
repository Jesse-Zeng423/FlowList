import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyYouTubePlaylistInput } from "../youtube-playlist-classify";

describe("classifyYouTubePlaylistInput", () => {
  it("classifies a YouTube Music playlist URL as ok", () => {
    const r = classifyYouTubePlaylistInput(
      "https://music.youtube.com/playlist?list=PLrAbcDEFghijk",
    );
    assert.equal(r.kind, "ok");
    if (r.kind === "ok") assert.equal(r.id, "PLrAbcDEFghijk");
  });

  it("classifies a www.youtube.com playlist URL as ok", () => {
    const r = classifyYouTubePlaylistInput(
      "https://www.youtube.com/playlist?list=PL1234_abc-XYZ",
    );
    assert.equal(r.kind, "ok");
  });

  it("returns video_link for a youtu.be short link", () => {
    const r = classifyYouTubePlaylistInput("https://youtu.be/dQw4w9WgXcQ");
    assert.equal(r.kind, "video_link");
    if (r.kind === "video_link") assert.equal(r.host, "youtu.be");
  });

  it("returns video_link for a /watch?v=… page with no list parameter", () => {
    const r = classifyYouTubePlaylistInput(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    assert.equal(r.kind, "video_link");
  });

  it("returns non_youtube for unrelated hosts", () => {
    const r = classifyYouTubePlaylistInput("https://evil.example.com/playlist?list=abc");
    assert.equal(r.kind, "non_youtube");
  });

  it("returns invalid_id for a list parameter with disallowed characters", () => {
    const r = classifyYouTubePlaylistInput(
      "https://www.youtube.com/playlist?list=bad id with spaces",
    );
    assert.equal(r.kind, "invalid_id");
  });

  it("returns empty for whitespace input", () => {
    const r = classifyYouTubePlaylistInput("   \n  ");
    assert.equal(r.kind, "empty");
  });

  it("strips trailing backslashes from a pasted URL", () => {
    const r = classifyYouTubePlaylistInput(
      "https://www.youtube.com/playlist?list=PLabc123\\\\",
    );
    assert.equal(r.kind, "ok");
  });
});
