"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SequencedPlaylist, TrackAnalysis } from "@/types/flowlist";
import type { SpotifyImportBundle } from "@/types/spotify-import-state";
import type { YoutubeImportBundle } from "@/types/youtube-import-state";
import { DEFAULT_FLOW_IDS } from "@/lib/flow-options";
import {
  classifyPlaylistInput,
  resolveManualTracksFromText,
  type PlaylistInputKind,
} from "@/lib/parse-input";
import { sequencePlaylist } from "@/lib/sequence-playlist";
import { runSequencingQualityChecks } from "@/lib/sequencing-quality-check";
import { SAMPLE_PLAYLIST_TEXT } from "@/lib/sample-playlist";

export type PlaylistSource = "youtube" | "manual" | "demo" | "spotify";

const ALBUM_USER = "Imported playlist (mock analysis)";
const ALBUM_DEMO = "Demo playlist (mock analysis)";

export type FlowContextValue = {
  playlistRaw: string;
  /** Manual paste text only (clears YouTube/Spotify imports; sets source to manual). */
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
  spotifyImport: SpotifyImportBundle | null;
  selectedFlowIds: string[];
  setSelectedFlowIds: (v: string[]) => void;
  toggleFlow: (id: string) => void;
  result: SequencedPlaylist | null;
  setResult: (v: SequencedPlaylist | null) => void;
  resolvedTracks: TrackAnalysis[];
  runSequence: () => SequencedPlaylist;
  reset: () => void;
};

const FlowContext = createContext<FlowContextValue | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [playlistRaw, setPlaylistRawState] = useState("");
  const [playlistSource, setPlaylistSource] = useState<PlaylistSource>("manual");
  const [youtubeImport, setYoutubeImport] = useState<YoutubeImportBundle | null>(null);
  const [spotifyImport, setSpotifyImport] = useState<SpotifyImportBundle | null>(null);
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([...DEFAULT_FLOW_IDS]);
  const [result, setResult] = useState<SequencedPlaylist | null>(null);

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

  const toggleFlow = useCallback((id: string) => {
    setSelectedFlowIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const runSequence = useCallback(() => {
    const next = sequencePlaylist(resolvedTracks, selectedFlowIds);
    if (process.env.NODE_ENV === "development" && next.activeInputTrackIds?.length) {
      const qa = runSequencingQualityChecks(next, selectedFlowIds, new Set(next.activeInputTrackIds));
      if (!qa.ok) {
        console.warn("[flowlist:sequencing-qa]", qa.issues);
      }
    }
    setResult(next);
    return next;
  }, [resolvedTracks, selectedFlowIds]);

  const reset = useCallback(() => {
    setPlaylistRawState("");
    setPlaylistSource("manual");
    setYoutubeImport(null);
    setSpotifyImport(null);
    setSelectedFlowIds([...DEFAULT_FLOW_IDS]);
    setResult(null);
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
      spotifyImport,
      selectedFlowIds,
      setSelectedFlowIds,
      toggleFlow,
      result,
      setResult,
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
      spotifyImport,
      selectedFlowIds,
      result,
      resolvedTracks,
      runSequence,
      reset,
      toggleFlow,
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
