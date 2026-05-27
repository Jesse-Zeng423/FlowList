# Flowlist — Comprehensive Code Review

**Reviewer:** Senior architect (Next.js / TypeScript / Tailwind / Vercel / YouTube API / security)
**Branch:** `claude/silly-bassi-31d8f1`
**Commit base:** `c37a6b1`
**Date:** 2026-05-06

The codebase is in genuinely good shape — small surface area, clean separation between API routes and client code, no `dangerouslySetInnerHTML`, no client-side secrets, no DB / auth / payments to mishandle. The findings below are real but mostly *hardening* items, not "this is broken in production."

Severity legend: **Critical** = exploitable or data-loss · **High** = likely to bite in real traffic · **Medium** = correctness / maintainability gap · **Low** = polish.

---

## 1. Findings at a glance

| # | Area | Severity | Title |
|---|------|---------|-------|
| 1 | API / DoS | **High** | No request-body size limit on import routes |
| 2 | API / DoS | **High** | Spotify route has no pagination cap |
| 3 | API / Resilience | **High** | No upstream `fetch` timeout / `AbortSignal` |
| 4 | Security | **High** | Outbound URLs (`externalUrl`) are not scheme-validated before being rendered as `<a href>` |
| 5 | API / Best practice | Medium | YouTube key handed off via query string; should use `X-Goog-Api-Key` header |
| 6 | API / Resilience | Medium | No upstream rate-limit / retry-after handling for Google quota errors beyond a single 429 mapping |
| 7 | API / Resilience | Medium | No retry/back-off for transient `5xx` from upstreams |
| 8 | API / Best practice | Medium | No edge-side rate limiting or CSRF / origin check on the route |
| 9 | Security | Medium | No security headers (CSP, Referrer-Policy, X-Content-Type-Options, Permissions-Policy) |
| 10 | Next.js | Medium | `next/image` set to `unoptimized` for every track thumbnail |
| 11 | Next.js | Medium | `useSearchParams` read via `window.location.search` instead of the App Router hook |
| 12 | Best practice | Medium | Server logs JSON-stringify untrusted strings without size limits |
| 13 | Best practice | Medium | Spotify route does not call `safeEvalJSON` style guard the YouTube route uses |
| 14 | Tooling | Medium | `shadcn` CLI listed under `dependencies` instead of `devDependencies` |
| 15 | Best practice | Low | `console.log` in dev path uses `console.log` not `console.debug` |
| 16 | Best practice | Low | URL validation for YouTube allows `youtu.be` host but `youtu.be` does not carry `?list=` |
| 17 | Best practice | Low | No `Cache-Control` header on API responses |
| 18 | Best practice | Low | Inconsistent error-shape between YouTube and Spotify routes |
| 19 | Quality | Low | No automated tests despite a hand-rolled `flow-strategy-self-check.ts` |
| 20 | Docs | Low | README claims "No real AI API calls" but does not document the Spotify env vars in `.env.example` |

---

## 2. Findings in detail

### 2.1 API & Fallback

#### F1. No request-body size limit on import routes (**High**)
**Where:** [src/app/api/youtube/playlist/route.ts:296-306](src/app/api/youtube/playlist/route.ts:296), [src/app/api/spotify/playlist/route.ts:122-128](src/app/api/spotify/playlist/route.ts:122)

Both routes call `await req.json()` without bounding the body size. A single client can POST a multi-megabyte JSON document and force Next.js to buffer and parse it before any validation runs. Since these endpoints are unauthenticated and publicly reachable, this is a cheap denial-of-service vector on Vercel (you pay for the wasted compute) and a memory-pressure risk on a long-running Node process.

**Fix:**
```ts
// guard the content length cheaply, before json() runs.
const len = Number(req.headers.get("content-length") ?? 0);
if (!Number.isFinite(len) || len > 8 * 1024) {
  return errorJson("INVALID_URL", "Body too large.", null, 413);
}
```
Even better, read the raw text with `req.text()`, slice to a known cap, and `JSON.parse` yourself so a hostile `Transfer-Encoding: chunked` body cannot bypass the header check. The legitimate body is `< 1 KB`.

---

#### F2. Spotify route has no pagination cap (**High**)
**Where:** [src/app/api/spotify/playlist/route.ts:181-211](src/app/api/spotify/playlist/route.ts:181)

The YouTube route correctly caps total imports at `importLimit ∈ {100, 200, 300}`. The Spotify route loops `while (true)` and pages `?limit=100&offset=…` until `offset >= total`. A 50,000-track public playlist (they exist) would burn 500 sequential round trips from your server, hold every track in memory, and serialize the whole thing back to the browser.

**Fix:** Apply the same `importLimit` discipline used on YouTube:
```ts
const SPOTIFY_IMPORT_CAP = 300;
while (allItems.length < SPOTIFY_IMPORT_CAP) {
  const remaining = SPOTIFY_IMPORT_CAP - allItems.length;
  const pageSize = Math.min(100, remaining);
  // …
}
```
Return a `truncated` boolean so the UI mirrors the YouTube experience.

---

#### F3. No upstream `fetch` timeout / `AbortSignal` (**High**)
**Where:** [src/app/api/youtube/playlist/route.ts:192](src/app/api/youtube/playlist/route.ts:192), [src/app/api/spotify/playlist/route.ts:60](src/app/api/spotify/playlist/route.ts:60), [src/app/api/spotify/playlist/route.ts:83](src/app/api/spotify/playlist/route.ts:83)

`fetch(url, { cache: "no-store" })` has no timeout. If `googleapis.com` or `accounts.spotify.com` hangs (which both routinely do during partial outages), the route holds a Vercel function slot open for the full platform timeout (10 s on hobby, 60 s on Pro) per request. A handful of slow requests can chew through your concurrency.

**Fix:** Add `AbortSignal.timeout(...)`:
```ts
const res = await fetch(url, {
  cache: "no-store",
  signal: AbortSignal.timeout(8_000),
});
```
For paginated routes, budget a *total* deadline shared across all upstream calls, not 8 s per call:
```ts
const overallDeadline = AbortSignal.timeout(20_000);
// reuse this signal in every page fetch
```
Translate `AbortError` into the existing `YOUTUBE_API_NETWORK_ERROR` / `SPOTIFY_ERROR` shape so the client UX is consistent.

---

#### F4. Outbound URLs rendered as `<a href>` are not scheme-validated (**High**)
**Where:**
- Server-side construction is safe: [src/app/api/youtube/playlist/route.ts:447](src/app/api/youtube/playlist/route.ts:447), [route.ts:383](src/app/api/youtube/playlist/route.ts:383) build URLs from a regex-validated playlistId/videoId.
- But the **Spotify** path passes `tr.external_urls?.spotify` straight through without scheme validation: [src/app/api/spotify/playlist/route.ts:218](src/app/api/spotify/playlist/route.ts:218), and the client renders it: [src/app/results/page.tsx:482](src/app/results/page.tsx:482), [page.tsx:841](src/app/results/page.tsx:841).
- Same exposure on YouTube `thumbnailUrl` ([src/app/api/youtube/playlist/route.ts:457](src/app/api/youtube/playlist/route.ts:457) → [src/app/results/page.tsx:454](src/app/results/page.tsx:454)) — but that one is constrained by `next.config.ts` `remotePatterns`, so the risk surface is the link/anchor only.

If Spotify's own API ever returns (or is induced to return) a `external_urls.spotify` value that is not `https://open.spotify.com/...`, the user clicks a malicious URL. Today's allowlist on `next/image` does not protect anchor `href`s.

**Fix:** Validate every URL that ends up as an `<a href>` against a known-safe scheme + host, server-side:
```ts
function safeExternalUrl(raw: string | null | undefined, allowedHosts: string[]): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (!allowedHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) return null;
    return u.toString();
  } catch {
    return null;
  }
}
```
Apply to both `external_urls.spotify` and any future field that may flow into a link.

---

#### F5. YouTube key handed off via query string (Medium)
**Where:** [src/app/api/youtube/playlist/route.ts:344-349](src/app/api/youtube/playlist/route.ts:344)

`?key=…` works but ends up in *every* logging surface — Vercel access logs, fetch error stacks, third-party HTTP middleboxes. The route already strips the key from log strings, but the moment a future maintainer logs the raw `Error.cause`, the key leaks. Google explicitly recommends headers:

**Fix:**
```ts
const res = await fetch(`${YT}/playlists?${q({ part, id })}`, {
  headers: { "X-Goog-Api-Key": key, "X-Goog-User-Project": "" },
  signal: AbortSignal.timeout(8_000),
  cache: "no-store",
});
```
Then `q({ part, id })` no longer needs to thread `key` and `redactGoogleUrl` becomes obsolete (you can delete it).

---

#### F6. Quota / 429 handling is single-shot (Medium)
**Where:** [src/app/api/youtube/playlist/route.ts:243-256](src/app/api/youtube/playlist/route.ts:243)

You map quota reasons to a friendly 429 message, but you do not honor `Retry-After`, expose it to the client, or retry transient quota bursts (Google occasionally returns `userRateLimitExceeded` for a single bucket; the next call succeeds).

**Fix:**
- For `userRateLimitExceeded`: one bounded retry with 250 ms jittered back-off before failing.
- Always forward `Retry-After` to the client: `errorJson(..., { retryAfterSeconds })` (the Spotify error type already supports this — mirror it on YouTube).

---

#### F7. No retry/back-off for transient 5xx (Medium)
Same root cause as F6. `googleapis.com` returns occasional `503` during regional fail-over. A single retry with jittered back-off (200 ms, then 600 ms) eliminates the user-visible failure for almost all of these. Cap at 2 retries to bound latency.

---

#### F8. No edge rate-limiting / origin check on the public route (Medium)
**Where:** Both API routes.

The endpoints are unauthenticated POSTs from any origin. With one bash loop a competitor can drain your YouTube quota (10,000 units/day) in a couple of minutes — `playlistItems.list` at depth 300 = 6 × 1 unit + 1 × 1 unit = ~7 quota units per request, but the practical ceiling is set by network, not quota.

**Fix (cheap version, no infra):**
- Validate `Origin` and `Sec-Fetch-Site === "same-origin"` to reject naive `curl` traffic. Easy to bypass with crafted headers, but stops opportunistic abuse.
- Add Vercel's [Edge Rate Limit](https://vercel.com/docs/edge-network/rate-limiting) or implement a tiny in-memory token bucket in middleware keyed by `X-Forwarded-For` (good enough for a hobby app; not suitable for distributed deployments).

**Fix (proper version):** Move to a Vercel KV-backed rate limiter (e.g. [@upstash/ratelimit](https://github.com/upstash/ratelimit)) inside `middleware.ts` matching `/api/*`.

---

### 2.2 Security

#### F9. No security headers (Medium)
There is no `next.config.ts` `headers()` block, no `middleware.ts` adding security headers, and no meta-CSP. For a public-facing app on Vercel you want at least:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (Vercel sets a weak default; override).
- `Content-Security-Policy` — start in `report-only` mode while you find issues. `default-src 'self'; img-src 'self' https://i.ytimg.com https://i9.ytimg.com https://img.youtube.com https://i.scdn.co https://mosaic.scdn.co https://image-cdn-ak.spotifycdn.com https://image-cdn-fa.spotifycdn.com data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'`. (Tailwind v4 + `next/font` may need `'unsafe-inline'` for `<style>`; Next.js `script-src` will require nonces if you ever drop `'unsafe-inline'`.)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`

**Fix:** add to [next.config.ts](next.config.ts):
```ts
async headers() {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        // Start with Content-Security-Policy-Report-Only in production until tested.
      ],
    },
  ];
}
```

---

#### F12. Server logs JSON-stringify user-controlled strings without size limits (Medium)
**Where:** [src/app/api/youtube/playlist/route.ts:42](src/app/api/youtube/playlist/route.ts:42), [route.ts:103](src/app/api/youtube/playlist/route.ts:103)

`devLog` and `logYoutubeFetchFailure` call `JSON.stringify(fields)` on objects that include user-supplied values (the playlist URL after sanitization, the playlistId). For the URL specifically you only log `inputLength` not the URL itself — good. But `googleMessage` and `googleReason` are logged verbatim. Google's error messages can contain attacker-controlled fragments of the request (e.g. echoed playlistId). If you ever pipe these to a downstream log processor without escaping, you risk log-injection / log-forging (a `\n[flowlist:youtube-import] FAKE LOG ENTRY` sequence injected via a crafted playlistId).

**Fix:**
- Truncate every string field to ~256 chars before logging.
- Replace newlines and control chars: `value.replace(/[\r\n -]/g, " ")`.
- Use a structured logger (`pino`, `winston`) where the JSON serializer escapes by design, instead of hand-rolled `console.log(JSON.stringify(...))`.

---

#### F13. Spotify route does not handle non-JSON bodies as carefully as YouTube (Medium)
**Where:** [src/app/api/spotify/playlist/route.ts:79-98](src/app/api/spotify/playlist/route.ts:79)

`spotifyFetch` reads `await response.text()` then `JSON.parse(text)` swallowing errors. If Spotify returns HTML (auth interstitial, captcha) you log nothing and return `SPOTIFY_ERROR (status)`. The YouTube path captures a `_parseNote` snippet ([src/app/api/youtube/playlist/route.ts:198](src/app/api/youtube/playlist/route.ts:198)) — mirror that here so prod-debugging is possible.

---

### 2.3 Next.js conventions

#### F10. `next/image` set to `unoptimized` for every thumbnail (Medium)
**Where:** [src/app/results/page.tsx:458](src/app/results/page.tsx:458)

`unoptimized` skips Vercel's image optimization pipeline. For a 200-track import this means 200 raw `i.ytimg.com` JPEGs hit the client at full resolution. `next.config.ts` already lists every host under `images.remotePatterns`, which is exactly what's required to *enable* optimization — so removing `unoptimized` is the change.

If you keep `unoptimized` because of cost concerns on Vercel, document that decision; otherwise:
```tsx
<Image
  src={track.importMeta.thumbnailUrl}
  alt={track.album}
  width={44}
  height={44}
  sizes="44px"
  className="size-11 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
/>
```

---

#### F11. `useSearchParams` read via `window.location.search` (Medium)
**Where:** [src/app/import/page.tsx:118-138](src/app/import/page.tsx:118)

Both the `useState` initializer and the `useEffect` parse `window.location.search` directly. The App Router ships `useSearchParams()` for exactly this. Direct `window.location` reads:
- Force the component to be `"use client"` (it already is, but you lose the option to ever hydrate it with a server-known initial value).
- Don't react to `router.replace` style param changes.
- Behave unpredictably with `<Link prefetch>`.

**Fix:** wrap in `<Suspense>` (Next 16 makes this mandatory for `useSearchParams`) and use the hook:
```tsx
const params = useSearchParams();
const isDemo = params.get("demo") === "1";
```

---

### 2.4 Maintainability / Quality

#### F14. `shadcn` is in `dependencies`, not `devDependencies` (Medium)
**Where:** [package.json:14](package.json:14)

`shadcn` is a CLI scaffolding tool, not a runtime library. Keeping it under `dependencies` ships its (large) `node_modules` subtree to the production bundle node-runtime, increases cold-start time on Vercel, and means a CVE in `shadcn` becomes a production dependency for you.

**Fix:** move it to `devDependencies` (and the same for any other build-only tools that crept into `dependencies` over time).

---

#### F15. `console.log` in dev path (Low)
**Where:** [src/app/api/youtube/playlist/route.ts:42](src/app/api/youtube/playlist/route.ts:42)

`devLog` uses `console.log`. Use `console.debug` so users with `process.env.DEBUG`-style filtering (or eslint's `no-console` configured with `allow: ["warn", "error", "debug"]`) can filter it out without losing real warnings/errors.

---

#### F16. URL validation allows `youtu.be` but `youtu.be` URLs don't have `?list=` (Low)
**Where:** [src/lib/youtube-playlist-id.ts:27](src/lib/youtube-playlist-id.ts:27)

`youtu.be/<videoId>` is a video shortlink, not a playlist link. Listing it in `hostnameOk` is harmless (the `?list=` extraction will fail and you fall through), but it confuses the rejection message ("could not read a playlist id from list=…") for users who paste a video URL. Either:
- Drop `youtu.be` from `hostnameOk`, or
- Detect `youtu.be` and return a tailored error: "That looks like a single-video link. Paste the playlist URL instead."

---

#### F17. No `Cache-Control` headers on API responses (Low)
Both routes return `NextResponse.json(...)` without explicit cache directives. Vercel's CDN won't cache them anyway because they are POSTs, but explicitly adding `Cache-Control: no-store` is good hygiene and stops shared proxies (e.g. corporate VPNs, school networks) from caching error responses. Particularly relevant for the error responses where intermediaries might cache a `429` longer than you intend.

---

#### F18. Inconsistent error shape between routes (Low)
- YouTube: `{ error: { code, message, details } }` ([src/types/youtube-api.ts:15](src/types/youtube-api.ts:15))
- Spotify: `{ ok: false, error: { code, message, retryAfterSeconds? } }` ([src/types/spotify-api.ts:15](src/types/spotify-api.ts:15))

A single `ApiErrorPayload` type would simplify the client error rendering ([src/app/import/page.tsx:164-184](src/app/import/page.tsx:164)) and make adding a third provider painless. Pick one shape (the Spotify discriminated-union form is friendlier for TypeScript narrowing) and move both endpoints to it.

---

#### F19. No automated tests despite a hand-rolled self-check (Low)
[src/lib/flow-strategy-self-check.ts](src/lib/flow-strategy-self-check.ts) and [src/lib/sequencing-quality-check.ts](src/lib/sequencing-quality-check.ts) are clearly intended to act as unit tests but rely on dev-mode `console.warn` execution. `vitest` is the canonical pick for Next 16 + TypeScript and would let CI gate merges on:
- the strategy registry invariants you already check by hand,
- the URL validators (especially after F4 / F16 changes),
- the YouTube + Spotify error mapping.

This is a small lift (1–2 hours) and pays for itself the first time someone changes `combineFlowStrategies` and the rule about chaptered dominance silently regresses.

---

#### F20. README does not document the Spotify env vars in `.env.example` (Low)
**Where:** [.env.example](.env.example), [README.md](README.md)

`.env.example` lists only `YOUTUBE_API_KEY`, but the Spotify route reads `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` ([src/app/api/spotify/playlist/route.ts:55-56](src/app/api/spotify/playlist/route.ts:55)) and the README correctly says they're required for the experimental Spotify import. A new contributor running the Spotify path locally will get a `MISSING_ENV` error and have to grep the source.

**Fix:** add (commented as optional) to `.env.example`:
```bash
# Optional: experimental Spotify import.
# Create at https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

---

## 3. Things the project gets right (worth keeping)

- **API key never reaches the client.** `runtime = "nodejs"`, server-only, `process.env.YOUTUBE_API_KEY` read inside the route handler, log redaction in place.
- **No `dangerouslySetInnerHTML`, `eval`, or `new Function`** anywhere in `src/`.
- **Strict TypeScript** (`strict: true`) plus `noEmit` for typecheck-only — no `any` leaks observed in core modules.
- **Result freshness model is excellent.** [src/components/flow-provider.tsx:289-327](src/components/flow-provider.tsx:289) derives staleness instead of pushing it through an effect — exactly the right pattern in React 19.
- **All 3 `target="_blank"` anchors carry `rel="noopener noreferrer"`** ([src/app/import/page.tsx:427](src/app/import/page.tsx:427), [src/app/results/page.tsx:484](src/app/results/page.tsx:484), [page.tsx:843](src/app/results/page.tsx:843)).
- **Production error responses do not leak stack traces** ([src/app/api/youtube/playlist/route.ts:31-38](src/app/api/youtube/playlist/route.ts:31)). `clientCatchAllFailureDetails` returns a fixed banner in prod.
- **`importLimit` is properly validated against an allowlist** ([src/app/api/youtube/playlist/route.ts:130-143](src/app/api/youtube/playlist/route.ts:130)) — invalid values fall back to a safe default rather than rejecting.
- **`AGENTS.md` documents the architectural rule** ("no scattered `if (keywordId === ...)` branches") — this is the kind of guardrail that survives team turnover.

---

## 4. Recommended fix order

1. **Today (security / DoS):** F1 (body limit), F2 (Spotify pagination cap), F3 (fetch timeout), F4 (URL scheme validation).
2. **This week (security hardening):** F5 (header-based API key), F8 (rate limiting / origin check), F9 (security headers), F12 (log sanitization).
3. **Next sprint (resilience):** F6 (`Retry-After`), F7 (transient retry), F11 (use `useSearchParams`).
4. **When convenient (polish):** F10, F13–F20.

Each fix in section 1 is < 30 lines of code. Sections 2 and 3 each take a half-day if you stage the CSP carefully (use `Content-Security-Policy-Report-Only` first).

---

## 5. Suggested follow-ups beyond this review

- **Add `vitest` and a CI workflow** that runs `tsc --noEmit`, `eslint`, `vitest`, and `next build` on every PR.
- **Document the audio-feature provider contract in `.env.example`** so the day someone wires up a real BPM provider, the env var name is decided.
- **Consider an `/api/health` route** that pings YouTube with a `videos.list?id=…` of a known-good public ID and returns 200/503. Lets uptime monitors page you when your key is revoked / quota is exhausted *before* a user hits it.
- **`X-Robots-Tag: noindex`** on the API routes — they should never end up in a search index.

— end of review —
