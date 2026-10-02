import { NextResponse } from "next/server";
import { appleDeveloperToken } from "@/lib/apple-music";
export const runtime = "nodejs";
export async function GET() {
  try {
    const token = appleDeveloperToken();
    return NextResponse.json(token ? { configured: true, token } : { configured: false }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ configured: false, error: "Apple Music signing key is invalid." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
