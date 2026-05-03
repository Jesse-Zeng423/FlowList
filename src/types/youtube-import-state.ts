import type { TrackAnalysis } from "@/types/flowlist";
import type { YoutubeImportLimit } from "@/types/youtube-api";

export type YoutubeImportBundle = {
  importedUrl: string;
  playlistId: string;
  name: string;
  channelTitle: string | null;
  externalUrl: string;
  tracks: TrackAnalysis[];
  truncated: boolean;
  importLimit: YoutubeImportLimit;
  fetchedItemSlots: number;
  skippedMissingVideoId: number;
  youtubeReportedTotalItems: number | null;
};
