import { NextRequest, NextResponse } from "next/server";
import { cookieOptions, YOUTUBE_ACCESS_COOKIE, YOUTUBE_STATE_COOKIE, YOUTUBE_VERIFIER_COOKIE, youtubeOAuthConfig } from "@/lib/youtube-oauth";

export async function GET(request: NextRequest) {
  const target = new URL("/export/youtube", request.url);
  const config = youtubeOAuthConfig(request);
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(YOUTUBE_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(YOUTUBE_VERIFIER_COOKIE)?.value;
  const code = request.nextUrl.searchParams.get("code");
  const denied = request.nextUrl.searchParams.get("error");
  let token: { access_token?: string; expires_in?: number } | null = null;

  if (denied) target.searchParams.set("error", "authorization_denied");
  else if (!config || !state || !expectedState || state !== expectedState || !verifier || !code) {
    target.searchParams.set("error", "invalid_oauth_state");
  } else {
    try {
      const exchange = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: config.clientId, client_secret: config.clientSecret,
          redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: verifier,
        }),
        cache: "no-store",
      });
      if (exchange.ok) token = await exchange.json() as { access_token?: string; expires_in?: number };
    } catch { /* Report below without exposing token or upstream details. */ }
    if (!token?.access_token) target.searchParams.set("error", "token_exchange_failed");
  }

  const response = NextResponse.redirect(target);
  response.cookies.delete(YOUTUBE_STATE_COOKIE);
  response.cookies.delete(YOUTUBE_VERIFIER_COOKIE);
  if (token?.access_token) {
    response.cookies.set(YOUTUBE_ACCESS_COOKIE, token.access_token, cookieOptions(request, Math.min(3500, Math.max(60, (token.expires_in ?? 3600) - 60))));
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
