import { NextRequest, NextResponse } from "next/server";
import { YOUTUBE_ACCESS_COOKIE } from "@/lib/youtube-oauth";
import { InvalidJsonBodyError, readBoundedJson, RequestBodyTooLargeError } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
const BASE = "https://www.googleapis.com/youtube/v3";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,80}$/;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function youtube(path: string, token: string, init?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
}

/** Confirm the exact next slot before writing; this makes retry after a lost response safe. */
async function itemAt(playlistId: string, index: number, token: string): Promise<{ videoId: string | null; total: number }> {
  let pageToken: string | undefined;
  let offset = 0;
  do {
    const query = new URLSearchParams({ part: "snippet", playlistId, maxResults: "50" });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await youtube(`/playlistItems?${query}`, token);
    if (!response.ok) throw new Error(`LIST_${response.status}`);
    const data = await response.json() as { items?: Array<{ snippet?: { resourceId?: { videoId?: string } } }>; nextPageToken?: string };
    const items = data.items ?? [];
    if (index < offset + items.length) {
      return { videoId: items[index - offset]?.snippet?.resourceId?.videoId ?? "", total: offset + items.length };
    }
    offset += items.length;
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { videoId: null, total: offset };
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(YOUTUBE_ACCESS_COOKIE)?.value;
  if (!token) return fail("Connect your YouTube account again.", 401);
  let body: unknown;
  try { body = await readBoundedJson(request, 4096); }
  catch (error) {
    return fail(error instanceof RequestBodyTooLargeError ? "Request is too large." : error instanceof InvalidJsonBodyError ? "Invalid JSON." : "Could not read request.", 400);
  }
  if (!body || typeof body !== "object") return fail("Invalid request.", 400);
  const input = body as Record<string, unknown>;

  try {
    if (input.action === "create") {
      const title = typeof input.title === "string" ? input.title.trim() : "";
      const privacy = input.privacy;
      if (!title || title.length > 120 || !["private", "unlisted", "public"].includes(String(privacy))) return fail("Choose a title and privacy setting.", 400);
      const response = await youtube("/playlists?part=snippet,status", token, {
        method: "POST", body: JSON.stringify({ snippet: { title, description: "Sequenced with Flowlist" }, status: { privacyStatus: privacy } }),
      });
      if (!response.ok) return fail(response.status === 401 ? "YouTube authorization expired." : `YouTube could not create the playlist (HTTP ${response.status}).`, response.status === 401 ? 401 : 502);
      const data = await response.json() as { id?: string };
      if (!data.id || !PLAYLIST_ID.test(data.id)) return fail("YouTube returned an invalid playlist ID.", 502);
      return NextResponse.json({ ok: true, playlistId: data.id, url: `https://www.youtube.com/playlist?list=${data.id}` }, { headers: { "Cache-Control": "no-store" } });
    }

    if (input.action === "append") {
      const playlistId = input.playlistId;
      const videoId = input.videoId;
      const index = input.index;
      if (typeof playlistId !== "string" || !PLAYLIST_ID.test(playlistId) || typeof videoId !== "string" || !VIDEO_ID.test(videoId) || !Number.isInteger(index) || (index as number) < 0 || (index as number) >= 300) return fail("Invalid video, playlist, or position.", 400);
      const existing = await itemAt(playlistId, index as number, token);
      if (existing.videoId) {
        if (existing.videoId === videoId) return NextResponse.json({ ok: true, alreadyAdded: true });
        return fail("Playlist order changed outside Flowlist. Review it before resuming.", 409);
      }
      if (index !== existing.total) return fail("Playlist order changed outside Flowlist. Review it before resuming.", 409);
      const response = await youtube("/playlistItems?part=snippet", token, {
        method: "POST",
        body: JSON.stringify({ snippet: { playlistId, position: index, resourceId: { kind: "youtube#video", videoId } } }),
      });
      if (!response.ok) return fail(response.status === 401 ? "YouTube authorization expired." : `Could not add video ${index as number + 1} (HTTP ${response.status}). You can retry without duplicating completed tracks.`, response.status === 401 ? 401 : 502);
      return NextResponse.json({ ok: true, alreadyAdded: false }, { headers: { "Cache-Control": "no-store" } });
    }
    return fail("Unknown export action.", 400);
  } catch {
    return fail("YouTube did not respond. The current progress is saved; retry to continue.", 502);
  }
}
