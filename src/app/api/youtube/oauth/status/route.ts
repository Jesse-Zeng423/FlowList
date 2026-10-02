import { NextRequest, NextResponse } from "next/server";
import { YOUTUBE_ACCESS_COOKIE, youtubeOAuthConfig } from "@/lib/youtube-oauth";

export async function GET(request: NextRequest) {
  return NextResponse.json({ configured: !!youtubeOAuthConfig(request), authorized: !!request.cookies.get(YOUTUBE_ACCESS_COOKIE)?.value }, { headers: { "Cache-Control": "no-store" } });
}
