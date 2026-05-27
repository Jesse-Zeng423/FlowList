import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 Node-runtime proxy (formerly known as `middleware.ts`).
 * Adds a cheap origin guard to the unauthenticated `/api/*` routes:
 *
 *   - Browser same-origin POSTs include an `Origin` header that matches `Host`.
 *   - Cross-origin attempts (a competitor's page, abuse scripts) carry a
 *     foreign `Origin` and get rejected before they hit the route handler.
 *   - `curl` and direct nav with no `Origin` are allowed through — these are
 *     legitimate (uptime probes, manual testing). The route still does its own
 *     validation; this is defense-in-depth.
 *
 * Distributed rate limiting is intentionally NOT implemented here — Vercel
 * serverless invocations don't share memory across cold starts, so a naive
 * in-process token bucket is broken. Wire `@upstash/ratelimit` + Vercel KV
 * when the project takes that dep.
 */

export const config = {
  matcher: ["/api/:path*"],
};

export function proxy(req: NextRequest): NextResponse {
  if (req.method !== "POST") return NextResponse.next();

  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.next();

  const host = req.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }

  if (!host || !originHost || originHost !== host) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "BLOCKED_ORIGIN",
          message: "Cross-origin requests are not accepted on this endpoint.",
          details: null,
        },
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  }

  return NextResponse.next();
}
