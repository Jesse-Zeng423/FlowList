import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readBoundedJson } from "../api/read-json-body";

function makeRequest(body: string, contentLength?: string): Request {
  const headers = new Headers();
  if (contentLength != null) headers.set("content-length", contentLength);
  return new Request("https://example.test/api/x", {
    method: "POST",
    headers,
    body,
  });
}

describe("readBoundedJson", () => {
  it("parses a small JSON body", async () => {
    const r = await readBoundedJson<{ url: string }>(
      makeRequest('{"url":"https://x"}', "20"),
      8 * 1024,
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.body.url, "https://x");
  });

  it("rejects when Content-Length is missing", async () => {
    const r = await readBoundedJson(makeRequest('{"url":"x"}'));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "MISSING_LENGTH");
  });

  it("rejects when Content-Length exceeds the cap", async () => {
    const r = await readBoundedJson(makeRequest('{"url":"x"}', "9999999"), 1024);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "BODY_TOO_LARGE");
  });

  it("rejects when actual body length exceeds the cap (chunked-style attack)", async () => {
    const big = "{".padEnd(2048, "x") + "}";
    // Lie about Content-Length: claim it's small while sending a large body.
    const r = await readBoundedJson(makeRequest(big, "5"), 1024);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "BODY_TOO_LARGE");
  });

  it("rejects invalid JSON", async () => {
    const r = await readBoundedJson(makeRequest("not json", "8"));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "INVALID_JSON");
  });
});
