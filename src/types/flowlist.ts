/**
 * Domain types for Flowlist. Replace mock-filled fields with API/model output later.
 */

export type TempoFeel = "slow" | "medium" | "fast";

export type ArtistConfidence = "parsed" | "channel_fallback" | "unknown";

export type Phase = "Intro" | "Build" | "Peak" | "Cooldown" | "Outro";

/** Stable id for a track row (mock or matched catalog). */
export type TrackId = string;

/** Optional metadata from YouTube or experimental Spotify import (no audio analysis). */
export interface TrackImportMeta {
  source: "youtube" | "spotify";
  externalUrl: string;
  thumbnailUrl: string | null;
  platformTrackId: string;
  platformPlaylistId: string;
  rawTitle?: string;
  channelTitle?: string;
  durationMs?: number;
}

export interface TrackAnalysis {
  id: TrackId;
  title: string;
  artist: string;
  /** How we chose `artist`: title parse vs channel fallback (typical on YouTube). */
  artistConfidence?: ArtistConfidence;
  album: string;
  importMeta?: TrackImportMeta;
  /** Short mood label for UI chips. */
  estimatedMood: string;
  /** 1–10 scale for display and sorting. */
  estimatedEnergy: number;
  /** 0 = very dark / heavy mood, 100 = bright / light mood. */
  moodDarknessScore: number;
  /** 0 = subdued, 100 = emotionally intense. */
  emotionalIntensityScore: number;
  /** 0 = melancholic / heavy, 100 = uplifting. */
  upliftScore: number;
  tempoFeel: TempoFeel;
  /** 0 = sparse / ambient rhythm, 100 = driving groove. */
  rhythmIntensityScore: number;
  /** e.g. cinematic, romantic, nostalgic — used in copy and future models. */
  flavorTags: string[];
}

export interface SequencedTrack extends TrackAnalysis {
  phase: Phase;
  /** Why this track sits at this index in the journey. */
  positionReason: string;
}

export interface TransitionInsight {
  fromIndex: number;
  toIndex: number;
  explanation: string;
}

export interface SequencedPlaylist {
  tracks: SequencedTrack[];
  transitions: TransitionInsight[];
  /** Human-readable arc for header summary. */
  moodArcSummary: string;
  rhythmArcSummary: string;
  /** YouTube/manual rows removed before sequencing (deleted/private/empty). */
  skippedUnavailableCount?: number;
  /** Ids passed into the sequencer after filtering; for dev quality checks. */
  activeInputTrackIds?: string[];
}

export interface FlowKeywordDefinition {
  id: string;
  label: string;
  description: string;
}
