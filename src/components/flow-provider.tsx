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
import { DEFAULT_FLOW_IDS } from "@/lib/flow-options";
import {
  classifyPlaylistInput,
  resolveManualTracksFromText,
  type PlaylistInputKind,
} from "@/lib/parse-input";
import { sequencePlaylist } from "@/lib/sequence-playlist";
import { SAMPLE_PLAYLIST_TEXT } from "@/lib/sample-playlist";

export type PlaylistSource = "user" | "demo";

const ALBUM_USER = "Imported playlist (mock analysis)";
const ALBUM_DEMO = "Demo playlist (mock analysis)";

export type FlowContextValue = {
  playlistRaw: string;
  setPlaylistRaw: (v: string) => void;
  loadDemoPlaylist: () => void;
  playlistSource: PlaylistSource;
  playlistInputKind: PlaylistInputKind;
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
  const [playlistSource, setPlaylistSource] = useState<PlaylistSource>("user");
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([...DEFAULT_FLOW_IDS]);
  const [result, setResult] = useState<SequencedPlaylist | null>(null);

  const setPlaylistRaw = useCallback((v: string) => {
    setPlaylistSource("user");
    setPlaylistRawState(v);
  }, []);

  const loadDemoPlaylist = useCallback(() => {
    setPlaylistSource("demo");
    setPlaylistRawState(SAMPLE_PLAYLIST_TEXT);
  }, []);

  const playlistInputKind = useMemo(() => classifyPlaylistInput(playlistRaw), [playlistRaw]);

  const resolvedTracks = useMemo(() => {
    if (playlistInputKind !== "manual") return [];
    const album = playlistSource === "demo" ? ALBUM_DEMO : ALBUM_USER;
    return resolveManualTracksFromText(playlistRaw, album);
  }, [playlistRaw, playlistInputKind, playlistSource]);

  const toggleFlow = useCallback((id: string) => {
    setSelectedFlowIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const runSequence = useCallback(() => {
    const next = sequencePlaylist(resolvedTracks, selectedFlowIds);
    setResult(next);
    return next;
  }, [resolvedTracks, selectedFlowIds]);

  const reset = useCallback(() => {
    setPlaylistRawState("");
    setPlaylistSource("user");
    setSelectedFlowIds([...DEFAULT_FLOW_IDS]);
    setResult(null);
  }, []);

  const value = useMemo<FlowContextValue>(
    () => ({
      playlistRaw,
      setPlaylistRaw,
      loadDemoPlaylist,
      playlistSource,
      playlistInputKind,
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
      loadDemoPlaylist,
      playlistSource,
      playlistInputKind,
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
