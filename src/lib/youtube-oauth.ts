import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

export const YOUTUBE_ACCESS_COOKIE = "flowlist_yt_access";
export const YOUTUBE_STATE_COOKIE = "flowlist_yt_state";
export const YOUTUBE_VERIFIER_COOKIE = "flowlist_yt_verifier";

export function youtubeOAuthConfig(request: NextRequest) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  // OAuth responses must return to this deployment, never an arbitrary origin.
  try { if (new URL(redirectUri).origin !== request.nextUrl.origin) return null; }
  catch { return null; }
  return { clientId, clientSecret, redirectUri };
}

export function oauthRandom(): string {
  return randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function cookieOptions(request: NextRequest, maxAge: number) {
  return {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
