import {
  extractYouTubePlaylistId,
  sanitizeYouTubePlaylistUrlInput,
} from "@/lib/youtube-playlist-id";

/**
 * Discriminated classification of YouTube/YouTube Music playlist input.
 *
 * Built on top of the existing `extractYouTubePlaylistId` so we keep one
 * source of truth for the regex/host rules, but expose a richer outcome the
 * route can use to render a tailored error (e.g. "that's a single-video link,
 * paste a playlist URL instead").
 */

const PLAYLIST_ID_RE = /^[a-zA-Z0-9_-]+$/;

const YOUTUBE_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export type YouTubePlaylistClassification =
  | { kind: "ok"; id: string }
  | { kind: "video_link"; host: "youtu.be" | "youtube.com" }
  | { kind: "non_youtube"; host: string }
  | { kind: "missing_list" }
  | { kind: "invalid_id" }
  | { kind: "empty" };

function firstNonEmptyLine(raw: string): string {
  const sanitized = sanitizeYouTubePlaylistUrlInput(raw);
  return (
    sanitized
      .split(/\n/)
      .map((l) => sanitizeYouTubePlaylistUrlInput(l))
      .find(Boolean) ?? sanitized
  );
}

export function classifyYouTubePlaylistInput(
  raw: string,
): YouTubePlaylistClassification {
  const line = firstNonEmptyLine(raw);
  if (!line) return { kind: "empty" };

  let host: string | null = null;
  let listParam: string | null = null;
  let pathname: string | null = null;
  try {
    const u = new URL(line);
    host = u.hostname.toLowerCase();
    listParam = u.searchParams.get("list");
    pathname = u.pathname;
  } catch {
    // Fall back to the legacy regex-based extractor; it handles bare list= strings.
    const id = extractYouTubePlaylistId(line);
    if (id) return { kind: "ok", id };
    return { kind: "missing_list" };
  }

  if (host && !YOUTUBE_HOSTS.has(host)) {
    return { kind: "non_youtube", host };
  }

  if (listParam) {
    const id = sanitizeYouTubePlaylistUrlInput(listParam)
      .replace(/\\+$/g, "")
      .trim();
    if (!id) return { kind: "missing_list" };
    if (!PLAYLIST_ID_RE.test(id)) return { kind: "invalid_id" };
    return { kind: "ok", id };
  }

  // No `list` param. Distinguish "video shortlink" from "no playlist on a watch page".
  if (host === "youtu.be" && pathname && pathname.length > 1) {
    return { kind: "video_link", host: "youtu.be" };
  }
  if (
    pathname === "/watch" ||
    (host === "music.youtube.com" && pathname === "/watch")
  ) {
    return { kind: "video_link", host: "youtube.com" };
  }
  return { kind: "missing_list" };
}
