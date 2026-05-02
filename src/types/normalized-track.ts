import type { ArtistConfidence } from "@/types/flowlist";

/**
 * Platform-neutral import row (YouTube primary; Spotify maps into the same shape for sequencing).
 */

export type NormalizedTrackSource = "youtube" | "spotify";

export interface NormalizedTrack {
  id: string;
  source: NormalizedTrackSource;
  rawTitle: string;
  title: string;
  artist: string;
  artistConfidence?: ArtistConfidence;
  album: string | null;
  channelTitle: string;
  thumbnailUrl: string | null;
  externalUrl: string;
  platformTrackId: string;
  platformPlaylistId: string;
  /** Present for Spotify rows; YouTube may omit until duration exposed on items. */
  durationMs?: number;
  /** ISO string when API provides it */
  publishedAt?: string | null;
}
