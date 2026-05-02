const PLAYLIST_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** Trim, strip trailing backslashes (common paste glitch), trim again. */
export function sanitizeYouTubePlaylistUrlInput(raw: string): string {
  return raw
    .trim()
    .replace(/\\+$/g, "")
    .trim();
}

function firstNonEmptyLine(raw: string): string {
  const sanitized = sanitizeYouTubePlaylistUrlInput(raw);
  return (
    sanitized
      .split(/\n/)
      .map((l) => sanitizeYouTubePlaylistUrlInput(l))
      .find(Boolean) ?? sanitized
  );
}

function hostnameOk(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "www.youtube.com" ||
    h === "youtube.com" ||
    h === "m.youtube.com" ||
    h === "music.youtube.com" ||
    h === "youtu.be"
  );
}

/**
 * Extract YouTube / YouTube Music playlist ID from the `list` query parameter.
 * Extra params (e.g. &si=...) are ignored by URL parsing / regex boundary.
 */
export function extractYouTubePlaylistId(raw: string): string | null {
  const line = firstNonEmptyLine(raw);
  if (!line) return null;

  try {
    const u = new URL(line);
    if (!hostnameOk(u.hostname)) return null;
    const list = u.searchParams.get("list");
    if (!list) return null;
    const id = sanitizeYouTubePlaylistUrlInput(list).replace(/\\+$/g, "").trim();
    if (!id || !PLAYLIST_ID_RE.test(id)) return null;
    return id;
  } catch {
    const m = line.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (!m?.[1]) return null;
    const id = m[1].replace(/\\+$/g, "").trim();
    if (!PLAYLIST_ID_RE.test(id)) return null;
    return id;
  }
}

export function looksLikeYouTubePlaylistUrl(raw: string): boolean {
  return extractYouTubePlaylistId(raw) !== null;
}
