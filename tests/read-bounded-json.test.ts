import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readBoundedJson,
  RequestBodyTooLargeError,
} from "../src/lib/read-bounded-json";

function jsonRequest(body: string, headers?: HeadersInit) {
  return new Request("http://localhost/api/import", {
    method: "POST",
    headers,
    body,
  });
}

test("readBoundedJson accepts small JSON when Content-Length is missing", async () => {
  const request = jsonRequest(JSON.stringify({ url: "https://example.test/playlist" }));
  assert.equal(request.headers.get("content-length"), null);
  assert.deepEqual(await readBoundedJson(request, 128), {
    url: "https://example.test/playlist",
  });
});

test("readBoundedJson rejects a declared oversized request early", async () => {
  const request = jsonRequest("{}", { "Content-Length": "2048" });
  await assert.rejects(readBoundedJson(request, 128), RequestBodyTooLargeError);
});

test("readBoundedJson rejects an oversized streamed body without Content-Length", async () => {
  const request = jsonRequest(JSON.stringify({ url: "x".repeat(256) }));
  assert.equal(request.headers.get("content-length"), null);
  await assert.rejects(readBoundedJson(request, 64), RequestBodyTooLargeError);
});

test("readBoundedJson caps UTF-8 encoded bytes rather than string characters", async () => {
  const request = jsonRequest(JSON.stringify("é"));
  await assert.rejects(readBoundedJson(request, 3), RequestBodyTooLargeError);
});
