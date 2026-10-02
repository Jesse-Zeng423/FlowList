import { NextResponse, type NextRequest } from "next/server";

/**
 * The browser client calls this route from the app origin. Requests without an
 * Origin header remain valid for server-side and command-line verification.
 */
export function proxy(request: NextRequest) {
  if (request.method !== "POST") {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const writeRoute = request.nextUrl.pathname !== "/api/youtube/playlist";
  if ((writeRoute && origin !== request.nextUrl.origin) || (!writeRoute && origin && origin !== request.nextUrl.origin)) {
    return NextResponse.json(
      {
        error: {
          code: "CROSS_ORIGIN_FORBIDDEN",
          message: "Cross-origin playlist import requests are not allowed.",
          details: null,
        },
      },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/youtube/playlist", "/api/youtube/export", "/api/apple/library", "/api/feedback"],
};
