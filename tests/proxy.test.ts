import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { config, proxy } from "../src/proxy";

const route = "http://localhost:3000/api/youtube/playlist";

test("proxy applies to the YouTube playlist import route", () => {
  assert.equal(config.matcher, "/api/youtube/playlist");
});

test("proxy rejects cross-origin YouTube playlist POST requests", async () => {
  const response = proxy(
    new NextRequest(route, {
      method: "POST",
      headers: { origin: "https://cross-origin.example" },
    }),
  );
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "CROSS_ORIGIN_FORBIDDEN");
});

test("proxy allows same-origin and origin-less YouTube playlist POST requests", () => {
  const sameOrigin = proxy(
    new NextRequest(route, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  const noOrigin = proxy(new NextRequest(route, { method: "POST" }));
  assert.equal(sameOrigin.status, 200);
  assert.equal(noOrigin.status, 200);
});
