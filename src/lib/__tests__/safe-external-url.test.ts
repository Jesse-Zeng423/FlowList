import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  safeExternalUrl,
  SPOTIFY_LINK_HOSTS,
  YOUTUBE_IMAGE_HOSTS,
} from "../api/safe-external-url";

describe("safeExternalUrl", () => {
  it("returns the URL when scheme is https and host is allowlisted", () => {
    const r = safeExternalUrl(
      "https://open.spotify.com/track/abc123",
      SPOTIFY_LINK_HOSTS,
    );
    assert.equal(r, "https://open.spotify.com/track/abc123");
  });

  it("returns null for javascript: scheme", () => {
    const r = safeExternalUrl("javascript:alert(1)", SPOTIFY_LINK_HOSTS);
    assert.equal(r, null);
  });

  it("returns null for http:// (downgrade attack)", () => {
    const r = safeExternalUrl(
      "http://open.spotify.com/track/abc",
      SPOTIFY_LINK_HOSTS,
    );
    assert.equal(r, null);
  });

  it("returns null for foreign hosts", () => {
    const r = safeExternalUrl("https://evil.example.com/", SPOTIFY_LINK_HOSTS);
    assert.equal(r, null);
  });

  it("accepts a subdomain of an allowlisted suffix host", () => {
    // YOUTUBE_IMAGE_HOSTS includes 'ytimg.com' as the umbrella host.
    const r = safeExternalUrl(
      "https://i.ytimg.com/vi/abc/default.jpg",
      YOUTUBE_IMAGE_HOSTS,
    );
    assert.equal(r, "https://i.ytimg.com/vi/abc/default.jpg");
  });

  it("returns null for malformed input", () => {
    assert.equal(safeExternalUrl("not a url", SPOTIFY_LINK_HOSTS), null);
    assert.equal(safeExternalUrl("", SPOTIFY_LINK_HOSTS), null);
    assert.equal(safeExternalUrl(null, SPOTIFY_LINK_HOSTS), null);
    assert.equal(safeExternalUrl(undefined, SPOTIFY_LINK_HOSTS), null);
  });

  it("rejects URLs with embedded control characters", () => {
    const r = safeExternalUrl(
      "https://open.spotify.com/track/abc\nX-Injected: 1",
      SPOTIFY_LINK_HOSTS,
    );
    assert.equal(r, null);
  });
});
