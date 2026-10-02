import { NextRequest, NextResponse } from "next/server";
import { cookieOptions, oauthRandom, pkceChallenge, YOUTUBE_STATE_COOKIE, YOUTUBE_VERIFIER_COOKIE, youtubeOAuthConfig } from "@/lib/youtube-oauth";

export async function GET(request: NextRequest) {
  const config = youtubeOAuthConfig(request);
  if (!config) return NextResponse.redirect(new URL("/export/youtube?error=not_configured", request.url));
  const state = oauthRandom();
  const verifier = oauthRandom();
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", config.clientId);
  auth.searchParams.set("redirect_uri", config.redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.force-ssl");
  auth.searchParams.set("access_type", "online");
  auth.searchParams.set("state", state);
  auth.searchParams.set("code_challenge", pkceChallenge(verifier));
  auth.searchParams.set("code_challenge_method", "S256");
  const response = NextResponse.redirect(auth);
  response.cookies.set(YOUTUBE_STATE_COOKIE, state, cookieOptions(request, 600));
  response.cookies.set(YOUTUBE_VERIFIER_COOKIE, verifier, cookieOptions(request, 600));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
