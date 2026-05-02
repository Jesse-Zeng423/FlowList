/**
 * Extract Spotify playlist ID from common URL shapes and spotify: URIs.
 * Does not validate that the ID exists on Spotify.
 */
export function extractSpotifyPlaylistId(raw: string): string | null {
  const firstLine =
    raw
      .trim()
      .split(/\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? raw.trim();

  const uriMatch = /^spotify:playlist:([a-zA-Z0-9]+)\s*$/i.exec(firstLine);
  if (uriMatch) return uriMatch[1] ?? null;

  try {
    const u = new URL(firstLine);
    if (!u.hostname.toLowerCase().endsWith("spotify.com")) return null;
    const m = u.pathname.match(/\/(?:intl-[a-z0-9-]+\/)?playlist\/([a-zA-Z0-9]+)/i);
    return m?.[1] ?? null;
  } catch {
    const loose = firstLine.match(/(?:open\.)?spotify\.com\/(?:intl-[a-z0-9-]+\/)?playlist\/([a-zA-Z0-9]+)/i);
    return loose?.[1] ?? null;
  }
}
