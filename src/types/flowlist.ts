/**
 * Domain types for Flowlist. The internal "richer" model lives on `rhythm`, `mood`,
 * and `analysis`; the top-level mirror fields (`tempoFeel`, `rhythmIntensityScore`,
 * `estimatedEnergy`, ...) are kept for the existing UI which reads them directly.
 *
 * Source of analysis is always labelled — currently every track is `prototype`.
 * Replace the generator (not this type) when real audio/AI analysis is plugged in.
 */

export type TempoFeel = "slow" | "medium" | "fast";

export type ArtistConfidence = "parsed" | "channel_fallback" | "unknown";

export type Phase = "Intro" | "Build" | "Peak" | "Cooldown" | "Outro";

/** Lowercase role buckets used by the prototype analyser to suggest where a track fits. */
export type BestRole = "intro" | "build" | "peak" | "cooldown" | "outro";

/** Stable id for a track row (mock or matched catalog). */
export type TrackId = string;

/**
 * Where a playlist came from. The same string union is used both as the live
 * `playlistSource` in FlowContext and as the `source` field on a sequenced
 * result snapshot (so banners/export can read from the snapshot, not from the
 * possibly-changed live context).
 */
export type PlaylistSource = "youtube" | "manual" | "demo" | "spotify";

/** Prototype playlist “fit” from metadata heuristics (not AI). */
export type PlaylistFitLevel = "mixed" | "moderately_consistent" | "highly_consistent";

export interface PlaylistFitAnalysis {
  level: PlaylistFitLevel;
  label: string;
}

export interface SoftLandingSummaryMeta {
  endingGentlerEnergy: boolean;
  endingGentlerRhythm: boolean;
  limitedByHomogeneity: boolean;
  /** True when the closing track is among the strongest landing candidates in the set. */
  finaleIsStrongLander: boolean;
}

/**
 * Narrative role of a chapter in the overall journey arc.
 *
 * Only set when `buildMoodChapters` is used (Mixed Mess + Mood Chapters).
 * Gap-split chapters (other chaptered flows) leave this undefined.
 */
export type JourneyRole = "establish" | "deepen" | "lift" | "peak" | "contrast" | "resolve";

/**
 * One internally-coherent section of a sequenced playlist. Emitted by the
 * `chaptered` flow strategy (Mood Chapters, Dramatic Arc).
 *
 * `fromIndex` and `toIndex` are inclusive indices into `SequencedPlaylist.tracks`.
 *
 * The optional fields (`description`, `dominantMoodTags`, `tempoProfile`,
 * `journeyRole`, `roleName`) are populated only when `buildMoodChapters` runs
 * (Mixed Mess + Mood Chapters). Other chaptered flows set only the core fields.
 */
export interface SequencedChapter {
  /** Stable index, 0-based. */
  index: number;
  /** Short human label, e.g. "Chapter 2 · Warm interior". */
  label: string;
  /** First and last track index in this chapter (inclusive). */
  fromIndex: number;
  toIndex: number;
  /** Internal mood/rhythm/energy fingerprint used for the label. */
  signature: {
    avgEnergy: number;
    avgRhythm: number;
    dominantMood: string;
  };
  /** One-sentence description of this chapter's feel and purpose. */
  description?: string;
  /** 2–4 mood descriptor tags (e.g. "energetic", "warm", "melancholic"). */
  dominantMoodTags?: string[];
  /** Whether most tracks in this chapter are slow, fast, or mixed. */
  tempoProfile?: "mostly slow" | "mostly fast" | "mixed";
  /** Where this chapter sits in the narrative journey arc. */
  journeyRole?: JourneyRole;
  /**
   * Human-readable role title combining journey role + mood label,
   * e.g. "Peak — Driving".
   */
  roleName?: string;
}

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

/**
 * Where audio features came from. Today every track is `prototype`.
 *
 *  - `third_party`   — a real BPM / audio analysis provider returned a confident match
 *                      (not wired up yet).
 *  - `ai_estimated`  — produced by an LLM-style estimator with explicit fallback signal
 *                      (also not wired up yet).
 *  - `prototype`     — deterministic estimate from title/artist/channel hashing + light
 *                      keyword hints.
 *  - `unavailable`   — provider attempted but could not produce a usable answer.
 */
export type AudioFeatureSource =
  | "third_party"
  | "ai_estimated"
  | "prototype"
  | "unavailable";

export type AudioFeatureMode = "major" | "minor" | "unknown";

/**
 * Platform-neutral audio features. This is the **only** rhythm/tempo surface the
 * sequencing engine should read. Different providers (third-party, AI, prototype)
 * fill it in differently — `source` and `confidence` tell consumers how much to trust
 * the values.
 *
 * Important: `bpm` is the *only* exact-tempo field. UIs must not display a fake exact
 * BPM when only `bpmRange` is set. Use `bpmRange` and `tempoFeel` for prototype data.
 */
export interface AudioFeatures {
  /** Exact BPM. Only set by reliable providers (third_party / ai_estimated with high confidence). */
  bpm?: number;
  /** Range string like "90-110" used when an exact BPM is not known. */
  bpmRange?: string;
  /** Camelot or musical key string ("C", "F#m", ...). Optional. */
  key?: string;
  mode?: AudioFeatureMode;

  tempoFeel: TempoFeel;
  /** 0 = sparse / ambient rhythm, 100 = driving groove. */
  rhythmIntensity: number;
  /** 0 = constantly shifting groove, 100 = locked-in repetitive groove. */
  grooveStability: number;
  /** 0 = soft / round drums, 100 = hard, percussive, distorted hits. */
  beatHardness: number;
  /** 0 = not built for movement, 100 = highly danceable. */
  danceabilityFeel: number;
  /** 0 = no clear hook, 100 = explosive hook or drop. */
  hookOrDropImpact: number;

  /** 0..1 — how much the consumer should trust these features. */
  confidence: number;
  /** Provider that produced these features. */
  source: AudioFeatureSource;
}

/** Back-compat alias — older code referred to the rhythm block as `RhythmFeatures`. */
export type RhythmFeatures = AudioFeatures;

export interface MoodFeatures {
  /** 0 = bright/light mood, 100 = dark/heavy mood. */
  moodDarkness: number;
  /** 0 = cold / distant, 100 = warm / inviting. */
  emotionalWarmth: number;
  /** 0 = no melancholic colour, 100 = strongly melancholic. */
  melancholy: number;
  /** 0 = subdued, 100 = euphoric / triumphant. */
  euphoria: number;
  /** 0 = peaceful, 100 = aggressive / hostile. */
  aggression: number;
  /** 0 = anonymous, 100 = bedroom / whispered intimacy. */
  intimacy: number;
  /** 0 = small / personal, 100 = sweeping / cinematic. */
  cinematicScale: number;
  /** 0 = present-day, 100 = strongly nostalgic. */
  nostalgia: number;
  /** 0 = at rest, 100 = high tension / unresolved. */
  tension: number;
  /** 0 = unresolved, 100 = strong sense of resolution. */
  resolution: number;
}

export interface AnalysisMeta {
  /** 0 (pure noise) … 1 (high-quality model). Prototype values are intentionally low. */
  confidence: number;
  /** Free-form qualitative tags inferred from title/artist/channel. */
  tags: string[];
  /** Best phase fits this track tends to suit, lowercase as per spec. */
  bestRoles: BestRole[];
  /** Where the analysis came from — useful when AI is wired up later. */
  analysisSource: "prototype" | "ai_future";
}

export interface TrackAnalysis {
  id: TrackId;
  title: string;
  artist: string;
  /** How we chose `artist`: title parse vs channel fallback (typical on YouTube). */
  artistConfidence?: ArtistConfidence;
  album: string;
  importMeta?: TrackImportMeta;

  // ----- Top-level mirrors of the nested model (kept for UI compatibility) -----
  /** Short mood label for UI chips. */
  estimatedMood: string;
  /** 1–10 scale for display and sorting. */
  estimatedEnergy: number;
  /** Mirror of `mood.moodDarkness`. */
  moodDarknessScore: number;
  /** Composite emotion: blend of melancholy / aggression / tension. */
  emotionalIntensityScore: number;
  /** Composite uplift: euphoria + warmth − melancholy. */
  upliftScore: number;
  /** Mirror of `rhythm.tempoFeel`. */
  tempoFeel: TempoFeel;
  /** Mirror of `rhythm.rhythmIntensity`. */
  rhythmIntensityScore: number;
  /** UI-visible "flavor" tags, e.g. cinematic, romantic, nostalgic. */
  flavorTags: string[];

  // ----- New richer prototype model -----
  /**
   * Rhythm/tempo features. The sequencing engine routes all rhythm decisions through
   * this object; `source` + `confidence` say where the values came from. Today every
   * track has `source: "prototype"` until a real provider is wired up.
   */
  audioFeatures: AudioFeatures;
  mood: MoodFeatures;
  analysis: AnalysisMeta;
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

/**
 * Snapshot metadata on a `SequencedPlaylist`. Captured at sequencing time so
 * the result page can render banners / export labels from the *result*, not
 * from a possibly-changed live FlowContext.
 *
 * If any of these values drift from the live context, the result is stale and
 * the UI tells the user to regenerate.
 */
export interface SequencedPlaylistSnapshot {
  /** Where the playlist came from at sequencing time. */
  source: PlaylistSource;
  /** Human-readable label for the source banner / export ("YouTube import", ...). */
  sourceLabel: string;
  /** Imported playlist name, if any (YouTube playlist title, Spotify name, ...). */
  playlistName: string | null;
  /** Resolved playlist type label (e.g. "Mixed Mess"), or null. */
  playlistTypeLabel: string | null;
  /** Selected flow keywords with both id and label, frozen at sequencing time. */
  selectedFlowKeywords: { id: string; label: string }[];
  /** ISO timestamp when this sequence was generated. */
  generatedAt: string;
  /** Number of tracks that survived filtering and went into the sequencer. */
  trackCount: number;
  /**
   * Stable identifier for the imported source — YouTube/Spotify playlist id, or
   * a content fingerprint for manual paste. Used to detect "different playlist
   * but same source kind" drift.
   */
  importedSourceId?: string | null;
  /** External URL of the imported playlist, if any (YouTube/Spotify deep link). */
  playlistExternalUrl?: string | null;
  /**
   * Channel name (YouTube) or owner display name (Spotify) at sequencing time.
   * Used in banners so they don't depend on the live FlowContext.
   */
  sourceOwnerLabel?: string | null;
  /** Hash of the active input ids; used to detect track-set drift. */
  inputFingerprint: string;
  /** True for today's deterministic prototype sequencer. */
  isPrototype: boolean;
  /** Honest display label for analysis mode. */
  analysisMode: "prototype";
  /** Compact source summary for rhythm/BPM features. */
  audioFeatureSourceSummary: string;
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
  /** Snapshot of the playlist type / keywords that drove this run, for export & UI. */
  playlistTypeId?: string | null;
  flowKeywordIds?: string[];
  /** Heuristic: does this import look mixed vs artist-focused? */
  playlistFit?: PlaylistFitAnalysis;
  /** Honest notes for Soft Landing rhythm copy. */
  softLandingMeta?: SoftLandingSummaryMeta;
  /** Optional chapters (only set for chaptered flows like Mood Chapters). */
  chapters?: SequencedChapter[];
  /**
   * Frozen snapshot of source / type / keywords / track count taken at
   * sequencing time. Always read banners and export labels from this — never
   * from the live FlowContext — so a generated result is never mislabeled.
   */
  snapshot?: SequencedPlaylistSnapshot;
}
