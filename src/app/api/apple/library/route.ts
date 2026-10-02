import { NextRequest, NextResponse } from "next/server";
import { APPLE_API, appleDeveloperToken, isAppleTrackResource } from "@/lib/apple-music";
import { readBoundedJson } from "@/lib/read-bounded-json";
export const runtime = "nodejs";
const ID = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_TRACKS = 300;
function fail(error: string, status: number) { return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: NextRequest) {
  let developerToken: string | null;
  try { developerToken = appleDeveloperToken(); } catch { return fail("Apple Music signing key is invalid.", 503); }
  if (!developerToken) return fail("Apple Music is not configured.", 503);
  const userToken = request.headers.get("Music-User-Token");
  if (!userToken || userToken.length > 4096 || /[^A-Za-z0-9._~-]/.test(userToken)) return fail("Connect Apple Music first.", 401);
  let input: Record<string, unknown>;
  try {
    const value = await readBoundedJson(request, 35000);
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("Invalid request.", 400);
    input = value as Record<string, unknown>;
  } catch { return fail("Invalid request body.", 400); }
  const headers = { Authorization: `Bearer ${developerToken}`, "Music-User-Token": userToken, "Content-Type": "application/json" };
  try {
    if (input.action === "list") {
      const playlists: Array<{ id: string; name: string }> = [];
      for (let offset = 0; offset < 500; offset += 100) {
        const response = await fetch(`${APPLE_API}/v1/me/library/playlists?limit=100&offset=${offset}`, { headers, cache: "no-store" });
        if (!response.ok) return fail(`Apple Music could not list playlists (HTTP ${response.status}).`, response.status === 401 || response.status === 403 ? 401 : 502);
        const data = await response.json() as { data?: Array<{ id?: string; attributes?: { name?: string } }>; next?: string };
        for (const row of data.data ?? []) if (row.id && row.attributes?.name) playlists.push({ id: row.id, name: row.attributes.name });
        if (!data.next) break;
      }
      return NextResponse.json({ ok: true, playlists }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action === "tracks") {
      const id = input.playlistId;
      if (typeof id !== "string" || !ID.test(id)) return fail("Invalid playlist.", 400);
      const rows: Array<{ id: string; type: string; title: string; artist: string; album: string; url: string; durationMs: number | null }> = [];
      for (let offset = 0; offset < MAX_TRACKS; offset += 100) {
        const response = await fetch(`${APPLE_API}/v1/me/library/playlists/${encodeURIComponent(id)}/tracks?limit=100&offset=${offset}`, { headers, cache: "no-store" });
        if (!response.ok) return fail(`Apple Music could not read playlist tracks (HTTP ${response.status}).`, response.status === 401 || response.status === 403 ? 401 : 502);
        const data = await response.json() as { data?: Array<{ id?: string; type?: string; attributes?: { name?: string; artistName?: string; albumName?: string; url?: string; durationInMillis?: number } }>; next?: string };
        for (const row of data.data ?? []) {
          if (!isAppleTrackResource(row) || !row.attributes?.name) continue;
          const attributes = row.attributes;
          rows.push({ id: row.id, type: row.type, title: attributes.name!, artist: attributes.artistName || "Unknown artist", album: attributes.albumName || "Apple Music", url: attributes.url || "", durationMs: attributes.durationInMillis ?? null });
        }
        if (!data.next) break;
      }
      return NextResponse.json({ ok: true, tracks: rows, truncated: rows.length >= MAX_TRACKS }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action === "create") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const tracks = input.tracks;
      if (!name || name.length > 120 || !Array.isArray(tracks) || tracks.length < 1 || tracks.length > MAX_TRACKS || !tracks.every(isAppleTrackResource)) return fail("Review the playlist name and tracks.", 400);
      // Apple supports sending the full ordered track relationship in the creation request.
      // One write avoids leaving an empty or half-populated playlist after a partial loop.
      const response = await fetch(`${APPLE_API}/v1/me/library/playlists`, { method: "POST", headers, body: JSON.stringify({ attributes: { name, description: "Sequenced with Flowlist" }, relationships: { tracks: { data: tracks } } }), cache: "no-store" });
      if (!response.ok) return fail(`Apple Music could not create the playlist (HTTP ${response.status}).`, response.status === 401 || response.status === 403 ? 401 : 502);
      const data = await response.json() as { data?: Array<{ id?: string }> };
      const id = data.data?.[0]?.id;
      return id ? NextResponse.json({ ok: true, playlistId: id }, { headers: { "Cache-Control": "no-store" } }) : fail("Apple Music returned no playlist ID. Check your library before retrying.", 502);
    }
    return fail("Unknown action.", 400);
  } catch { return fail("Apple Music request failed. Try again.", 502); }
}
