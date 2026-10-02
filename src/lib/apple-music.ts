import { createPrivateKey, sign } from "node:crypto";

export function appleDeveloperToken(): string | null {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID?.trim();
  const keyId = process.env.APPLE_MUSIC_KEY_ID?.trim();
  const key = process.env.APPLE_MUSIC_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!teamId || !keyId || !key) return null;
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const content = `${encode({ alg: "ES256", kid: keyId })}.${encode({ iss: teamId, iat: now, exp: now + 3600 })}`;
  const signature = sign("sha256", Buffer.from(content), { key: createPrivateKey(key), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${content}.${signature}`;
}

export const APPLE_API = "https://api.music.apple.com";
export type AppleTrackResource = { id: string; type: "library-songs" | "songs" | "library-music-videos" | "music-videos"; attributes?: { name?: string; artistName?: string; albumName?: string; url?: string; durationInMillis?: number } };
export function isAppleTrackResource(value: unknown): value is AppleTrackResource {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(row.id) && ["library-songs", "songs", "library-music-videos", "music-videos"].includes(String(row.type));
}
