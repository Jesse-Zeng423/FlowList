import type { TrackAnalysis } from "@/types/flowlist";

export type YoutubeImportBundle = {
  importedUrl: string;
  playlistId: string;
  name: string;
  channelTitle: string | null;
  externalUrl: string;
  tracks: TrackAnalysis[];
  truncated: boolean;
  importLimit: number | null;
};
