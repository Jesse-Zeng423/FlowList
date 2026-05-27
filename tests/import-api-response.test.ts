import assert from "node:assert/strict";
import { test } from "node:test";
import { parseImportApiResponse } from "../src/lib/import-api-response";

test("parseImportApiResponse returns parsed JSON", async () => {
  const parsed = await parseImportApiResponse<{ ok: true }>(
    new Response('{"ok":true}', { status: 200 }),
  );
  assert.deepEqual(parsed, { ok: true, data: { ok: true }, status: 200 });
});

test("parseImportApiResponse handles invalid JSON", async () => {
  const parsed = await parseImportApiResponse(new Response("{", { status: 502 }));
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, "invalid_json");
});

test("parseImportApiResponse handles HTML response bodies safely", async () => {
  const parsed = await parseImportApiResponse(
    new Response("<!doctype html><title>Error</title>", { status: 502 }),
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.reason, "invalid_json");
    assert.match(parsed.rawSnippet, /doctype html/);
  }
});

test("parseImportApiResponse handles empty response bodies safely", async () => {
  const parsed = await parseImportApiResponse(new Response(null, { status: 204 }));
  assert.deepEqual(parsed, {
    ok: false,
    reason: "empty",
    status: 204,
    rawSnippet: "",
    truncated: false,
  });
});
