import type { TrackAnalysis } from "@/types/flowlist";

/** Successful Spotify metadata import held in FlowContext. */
export type SpotifyImportBundle = {
  importedUrl: string;
  playlistId: string;
  name: string;
  ownerDisplayName: string | null;
  playlistUri: string;
  playlistExternalUrl: string;
  tracks: TrackAnalysis[];
};
