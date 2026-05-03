"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  PlaylistSource,
  SequencedPlaylist,
  TrackAnalysis,
} from "@/types/flowlist";
import type { SpotifyImportBundle } from "@/types/spotify-import-state";
import type { YoutubeImportBundle } from "@/types/youtube-import-state";
import type { YoutubeImportLimit } from "@/types/youtube-api";
import {
  classifyPlaylistInput,
  resolveManualTracksFromText,
  type PlaylistInputKind,
} from "@/lib/parse-input";
import { filterTracksForSequencing } from "@/lib/filter-tracks-for-sequencing";
import {
  getResultFreshnessStatus,
  normalizeFlowKeywordIds,
} from "@/lib/result-freshness";
import {
  computeLiveSequencingFingerprint,
  sequencingDefaultsForFingerprint,
  sequencePlaylist,
} from "@/lib/sequence-playlist";
import { runSequencingQualityChecks } from "@/lib/sequencing-quality-check";
import { SAMPLE_PLAYLIST_TEXT } from "@/lib/sample-playlist";
import {
  DEFAULT_DEMO_FLOW_KEYWORD_IDS,
  DEFAULT_DEMO_PLAYLIST_TYPE,
  MAX_FLOW_KEYWORDS,
  getFlowKeywordsForType,
  isKeywordValidForType,
  type FlowKeyword,
  type PlaylistTypeId,
} from "@/lib/flow-presets";

export type { PlaylistSource };

const ALBUM_USER = "Imported playlist (mock analysis)";
const ALBUM_DEMO = "Demo playlist (mock analysis)";

export type FlowContextValue = {
  playlistRaw: string;
  setPlaylistRaw: (v: string) => void;
  loadManualTracks: (text: string) => void;
  loadDemoPlaylist: () => void;
  loadYouTubePlaylist: (bundle: YoutubeImportBundle) => void;
  loadSpotifyPlaylistExperimental: (bundle: SpotifyImportBundle) => void;
  playlistSource: PlaylistSource;
  playlistInputKind: PlaylistInputKind;
  importedPlaylistName: string | null;
  importedTracks: TrackAnalysis[] | null;
  youtubeImport: YoutubeImportBundle | null;
  /** Selected YouTube import depth for playlistItems pagination. */
  youtubeImportLimit: YoutubeImportLimit;
  setYoutubeImportLimit: (limit: YoutubeImportLimit) => void;
  spotifyImport: SpotifyImportBundle | null;
  /** What kind of playlist the user is importing — drives the flow keyword pool. */
  playlistTypeId: PlaylistTypeId | null;
  setPlaylistTypeId: (id: PlaylistTypeId | null) => void;
  /** Currently selected flow keyword ids (must be 0–MAX_FLOW_KEYWORDS, all from playlistTypeId). */
  selectedFlowKeywordIds: string[];
  setSelectedFlowKeywordIds: (ids: string[]) => void;
  toggleFlowKeyword: (id: string) => void;
  /** Subset of FlowKeyword[] that the UI should show for the active playlist type. */
  availableFlowKeywords: FlowKeyword[];
  /** True iff the user has picked a type and 1–MAX_FLOW_KEYWORDS valid keywords. */
  isReadyToSequence: boolean;
  /** Reason the user can't proceed yet, or null. */
  sequenceBlocker: string | null;
  result: SequencedPlaylist | null;
  setResult: (v: SequencedPlaylist | null) => void;
  /**
   * True when the user previously had a generated result that was cleared
   * because their playlist source / tracks / type / keywords changed. The
   * results page uses this to show a "settings changed" copy instead of
   * silently redirecting.
   */
  resultIsStale: boolean;
  resolvedTracks: TrackAnalysis[];
  runSequence: () => SequencedPlaylist | null;
  reset: () => void;
};

const FlowContext = createContext<FlowContextValue | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [playlistRaw, setPlaylistRawState] = useState("");
  const [playlistSource, setPlaylistSource] = useState<PlaylistSource>("manual");
  const [youtubeImport, setYoutubeImport] = useState<YoutubeImportBundle | null>(null);
  const [youtubeImportLimit, setYoutubeImportLimit] = useState<YoutubeImportLimit>(200);
  const [spotifyImport, setSpotifyImport] = useState<SpotifyImportBundle | null>(null);
  const [playlistTypeId, setPlaylistTypeIdState] = useState<PlaylistTypeId | null>(null);
  const [selectedFlowKeywordIds, setSelectedFlowKeywordIdsState] = useState<string[]>([]);
  /**
   * Internal state. **Do not** read this directly outside the provider — read
   * the derived `result` value below, which hides the result whenever its
   * snapshot has drifted from the current live input.
   */
  const [storedResult, setStoredResult] = useState<SequencedPlaylist | null>(null);

  const setPlaylistRaw = useCallback((v: string) => {
    setPlaylistSource("manual");
    setPlaylistRawState(v);
    setYoutubeImport(null);
    setSpotifyImport(null);
  }, []);

  const loadManualTracks = useCallback((text: string) => {
    setPlaylistRaw(text);
  }, [setPlaylistRaw]);

  const loadYouTubePlaylist = useCallback((bundle: YoutubeImportBundle) => {
    setYoutubeImport(bundle);
    setSpotifyImport(null);
    setPlaylistSource("youtube");
    setPlaylistRawState("");
  }, []);

  const loadSpotifyPlaylistExperimental = useCallback((bundle: SpotifyImportBundle) => {
    setSpotifyImport(bundle);
    setYoutubeImport(null);
    setPlaylistSource("spotify");
    setPlaylistRawState("");
  }, []);

  const loadDemoPlaylist = useCallback(() => {
    setYoutubeImport(null);
    setSpotifyImport(null);
    setPlaylistSource("demo");
    setPlaylistRawState(SAMPLE_PLAYLIST_TEXT);
    // Showcase Flowlist's strength on chaotic playlists.
    setPlaylistTypeIdState(DEFAULT_DEMO_PLAYLIST_TYPE);
    setSelectedFlowKeywordIdsState([...DEFAULT_DEMO_FLOW_KEYWORD_IDS]);
  }, []);

  const setPlaylistTypeId = useCallback((id: PlaylistTypeId | null) => {
    setPlaylistTypeIdState(id);
    setSelectedFlowKeywordIdsState((prev) => {
      if (!id) return [];
      // Drop any keywords that don't belong to the new type.
      return prev.filter((k) => isKeywordValidForType(k, id));
    });
  }, []);

  const setSelectedFlowKeywordIds = useCallback((ids: string[]) => {
    setSelectedFlowKeywordIdsState(ids.slice(0, MAX_FLOW_KEYWORDS));
  }, []);

  const toggleFlowKeyword = useCallback((id: string) => {
    setSelectedFlowKeywordIdsState((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_FLOW_KEYWORDS) return prev;
      return [...prev, id];
    });
  }, []);

  const playlistInputKind = useMemo(() => classifyPlaylistInput(playlistRaw), [playlistRaw]);

  const resolvedTracks = useMemo(() => {
    if (playlistSource === "youtube" && youtubeImport) {
      return youtubeImport.tracks;
    }
    if (playlistSource === "spotify" && spotifyImport) {
      return spotifyImport.tracks;
    }
    if (
      (playlistSource === "manual" || playlistSource === "demo") &&
      playlistInputKind === "manual"
    ) {
      const album = playlistSource === "demo" ? ALBUM_DEMO : ALBUM_USER;
      return resolveManualTracksFromText(playlistRaw, album);
    }
    return [];
  }, [playlistRaw, playlistInputKind, playlistSource, youtubeImport, spotifyImport]);

  const importedPlaylistName = useMemo(() => {
    if (playlistSource === "youtube" && youtubeImport) return youtubeImport.name;
    if (playlistSource === "spotify" && spotifyImport) return spotifyImport.name;
    return null;
  }, [playlistSource, youtubeImport, spotifyImport]);

  const importedTracks = useMemo(() => {
    if (playlistSource === "youtube" || playlistSource === "spotify") {
      return resolvedTracks.length > 0 ? resolvedTracks : null;
    }
    return null;
  }, [playlistSource, resolvedTracks]);

  const availableFlowKeywords = useMemo(
    () => getFlowKeywordsForType(playlistTypeId),
    [playlistTypeId],
  );

  const sequenceBlocker = useMemo<string | null>(() => {
    if (resolvedTracks.length === 0) return "Import or paste a playlist first.";
    if (!playlistTypeId) return "Pick what kind of playlist this is.";
    if (selectedFlowKeywordIds.length === 0) {
      return "Pick at least one flow keyword.";
    }
    if (selectedFlowKeywordIds.length > MAX_FLOW_KEYWORDS) {
      return `Pick at most ${MAX_FLOW_KEYWORDS} flow keywords.`;
    }
    for (const id of selectedFlowKeywordIds) {
      if (!isKeywordValidForType(id, playlistTypeId)) {
        return "Selected flow keywords no longer match the playlist type.";
      }
    }
    return null;
  }, [resolvedTracks.length, playlistTypeId, selectedFlowKeywordIds]);

  const isReadyToSequence = sequenceBlocker === null;

  const importedSourceId = useMemo<string | null>(() => {
    if (playlistSource === "youtube") return youtubeImport?.playlistId ?? null;
    if (playlistSource === "spotify") return spotifyImport?.playlistId ?? null;
    return null;
  }, [playlistSource, youtubeImport, spotifyImport]);

  const playlistExternalUrl = useMemo<string | null>(() => {
    if (playlistSource === "youtube") return youtubeImport?.externalUrl ?? null;
    if (playlistSource === "spotify") return spotifyImport?.playlistExternalUrl ?? null;
    return null;
  }, [playlistSource, youtubeImport, spotifyImport]);

  const sourceOwnerLabel = useMemo<string | null>(() => {
    if (playlistSource === "youtube") return youtubeImport?.channelTitle ?? null;
    if (playlistSource === "spotify") return spotifyImport?.ownerDisplayName ?? null;
    return null;
  }, [playlistSource, youtubeImport, spotifyImport]);

  const runSequence = useCallback((): SequencedPlaylist | null => {
    if (sequenceBlocker !== null) return null;
    const next = sequencePlaylist(resolvedTracks, playlistTypeId, selectedFlowKeywordIds, {
      playlistTitle: importedPlaylistName,
      source: playlistSource,
      importedSourceId,
      playlistExternalUrl,
      sourceOwnerLabel,
    });
    if (process.env.NODE_ENV === "development" && next.activeInputTrackIds?.length) {
      const qa = runSequencingQualityChecks(
        next,
        playlistTypeId,
        selectedFlowKeywordIds,
        new Set(next.activeInputTrackIds),
      );
      if (!qa.ok) {
        console.warn("[flowlist:sequencing-qa]", qa.issues);
      }
    }
    setStoredResult(next);
    return next;
  }, [
    resolvedTracks,
    playlistTypeId,
    selectedFlowKeywordIds,
    sequenceBlocker,
    importedPlaylistName,
    playlistSource,
    importedSourceId,
    playlistExternalUrl,
    sourceOwnerLabel,
  ]);

  /**
   * Stale-result detection — implemented as a *derived value* during render,
   * not via an effect that calls `setState`.
   *
   * Whenever the live fingerprint diverges from the snapshot frozen onto
   * `storedResult`, the public `result` becomes `null` so the results page
   * never renders a sequence mislabeled as a new source. `resultIsStale` flips
   * to `true` so the page can show a clear "settings changed" message instead
   * of a blank state.
   *
   * Once the user runs a fresh sequence, the new `storedResult` snapshot
   * matches the live fingerprint and the result reappears automatically.
   */
  const freshnessState = useMemo(() => {
    const { active } = filterTracksForSequencing(resolvedTracks);
    const eff = sequencingDefaultsForFingerprint(playlistTypeId, selectedFlowKeywordIds);
    const liveFingerprint = computeLiveSequencingFingerprint({
      source: playlistSource,
      importedSourceId,
      tracks: resolvedTracks,
      playlistTypeId,
      flowKeywordIds: selectedFlowKeywordIds,
    });

    const freshness = getResultFreshnessStatus({
      liveFingerprint,
      hasStoredResult: storedResult !== null,
      snapshot: storedResult?.snapshot,
      live: {
        source: playlistSource,
        importedSourceId: importedSourceId ?? null,
        playlistTypeId: eff.playlistTypeId,
        activeTrackCount: active.length,
        normalizedKeywordIds: normalizeFlowKeywordIds(eff.flowKeywordIds),
      },
    });

    const resultIsStale = Boolean(storedResult) && !freshness.isFresh;
    return {
      liveFingerprint,
      freshness,
      resultIsStale,
      derivedResult: resultIsStale ? null : storedResult,
    };
  }, [
    storedResult,
    resolvedTracks,
    playlistSource,
    importedSourceId,
    playlistTypeId,
    selectedFlowKeywordIds,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const snap = storedResult?.snapshot;
    if (!snap || freshnessState.freshness.isFresh) return;
    console.debug("[result freshness]", {
      reason: freshnessState.freshness.reason,
      liveFingerprint: freshnessState.liveFingerprint,
      snapshotFingerprint: snap.inputFingerprint,
    });
  }, [
    storedResult,
    freshnessState.freshness.isFresh,
    freshnessState.freshness.reason,
    freshnessState.liveFingerprint,
  ]);

  const resultIsStale = freshnessState.resultIsStale;
  const result = freshnessState.derivedResult;

  /**
   * Public setter: callers can still force-replace or clear the result. A
   * non-null replacement implicitly resets the stale flag because its snapshot
   * matches the live input (it was just generated).
   */
  const setResult = useCallback((v: SequencedPlaylist | null) => {
    setStoredResult(v);
  }, []);

  const reset = useCallback(() => {
    setPlaylistRawState("");
    setPlaylistSource("manual");
    setYoutubeImport(null);
    setSpotifyImport(null);
    setYoutubeImportLimit(200);
    setPlaylistTypeIdState(null);
    setSelectedFlowKeywordIdsState([]);
    setStoredResult(null);
  }, []);

  const value = useMemo<FlowContextValue>(
    () => ({
      playlistRaw,
      setPlaylistRaw,
      loadManualTracks,
      loadDemoPlaylist,
      loadYouTubePlaylist,
      loadSpotifyPlaylistExperimental,
      playlistSource,
      playlistInputKind,
      importedPlaylistName,
      importedTracks,
      youtubeImport,
      youtubeImportLimit,
      setYoutubeImportLimit,
      spotifyImport,
      playlistTypeId,
      setPlaylistTypeId,
      selectedFlowKeywordIds,
      setSelectedFlowKeywordIds,
      toggleFlowKeyword,
      availableFlowKeywords,
      isReadyToSequence,
      sequenceBlocker,
      result,
      setResult,
      resultIsStale,
      resolvedTracks,
      runSequence,
      reset,
    }),
    [
      playlistRaw,
      setPlaylistRaw,
      loadManualTracks,
      loadDemoPlaylist,
      loadYouTubePlaylist,
      loadSpotifyPlaylistExperimental,
      playlistSource,
      playlistInputKind,
      importedPlaylistName,
      importedTracks,
      youtubeImport,
      youtubeImportLimit,
      spotifyImport,
      playlistTypeId,
      setPlaylistTypeId,
      selectedFlowKeywordIds,
      setSelectedFlowKeywordIds,
      toggleFlowKeyword,
      availableFlowKeywords,
      isReadyToSequence,
      sequenceBlocker,
      result,
      setResult,
      resultIsStale,
      resolvedTracks,
      runSequence,
      reset,
    ],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow() {
  const ctx = useContext(FlowContext);
  if (!ctx) {
    throw new Error("useFlow must be used within FlowProvider");
  }
  return ctx;
}
