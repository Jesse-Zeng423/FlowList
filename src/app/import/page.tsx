"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  ExternalLink,
  FileText,
  ListVideo,
  Loader2,
  Music2,
  PlayCircle,
} from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { FlowStepper } from "@/components/flow-stepper";
import { HelpButton, SourceChoiceCard, StepHeader } from "@/components/flow-ui";
import { WorkflowActionBar } from "@/components/workflow-action-bar";
import { useFlow } from "@/components/flow-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseImportApiResponse } from "@/lib/import-api-response";
import { normalizedTracksToTrackAnalyses } from "@/lib/normalized-to-track-analysis";
import { spotifyRowsToTrackAnalyses } from "@/lib/spotify-map-tracks";
import { isApiErrorPayload } from "@/types/api";
import type { SpotifyPlaylistImportResponse } from "@/types/spotify-api";
import {
  isYoutubeApiErrorPayload,
  type YoutubeImportLimit,
  type YoutubePlaylistImportResponse,
} from "@/types/youtube-api";
import { cn } from "@/lib/utils";

type ImportMode = "youtube" | "manual" | "demo";

const IMPORT_DEPTH_OPTIONS: Array<{ value: YoutubeImportLimit; label: string }> = [
  { value: 100, label: "100" },
  { value: 200, label: "200" },
  { value: 300, label: "300" },
];

export default function PlaylistPage() {
  const router = useRouter();
  const {
    playlistRaw,
    setPlaylistRaw,
    loadDemoPlaylist,
    loadYouTubePlaylist,
    loadSpotifyPlaylistExperimental,
    playlistSource,
    youtubeImport,
    youtubeImportLimit,
    setYoutubeImportLimit,
    spotifyImport,
    resolvedTracks,
  } = useFlow();

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("youtube");
  const demoLoadedFromQuery = useRef(false);
  const canContinue = resolvedTracks.length > 0;

  useEffect(() => {
    if (demoLoadedFromQuery.current || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    const timer = window.setTimeout(() => {
      if (demoLoadedFromQuery.current) return;
      demoLoadedFromQuery.current = true;
      setImportMode("demo");
      loadDemoPlaylist();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDemoPlaylist]);

  async function handleYouTubeImport() {
    setYoutubeError(null);
    setYoutubeBusy(true);
    try {
      const res = await fetch("/api/youtube/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl.trim(), importLimit: youtubeImportLimit }),
      });
      const parsed = await parseImportApiResponse<YoutubePlaylistImportResponse>(res);
      if (!parsed.ok) {
        if (parsed.reason === "invalid_json") {
          setYoutubeError(
            `Could not parse JSON from server (HTTP ${parsed.status}). First bytes: ${parsed.rawSnippet}${parsed.truncated ? "..." : ""}`,
          );
        } else {
          setYoutubeError(
            `Unexpected response from server (HTTP ${parsed.status}). Check the Network tab or server logs.`,
          );
        }
        return;
      }

      if (isYoutubeApiErrorPayload(parsed.data)) {
        const { message, details, code } = parsed.data.error;
        const parts = [message, details].filter((part): part is string => Boolean(part && part.trim()));
        parts.push(`[${code}]`);
        setYoutubeError(parts.join(" "));
        return;
      }

      const data = parsed.data;
      if (
        typeof data !== "object" ||
        data === null ||
        !("ok" in data) ||
        data.ok !== true ||
        !("playlist" in data) ||
        !("tracks" in data)
      ) {
        setYoutubeError(
          `Unexpected response from server (HTTP ${res.status}). Check the Network tab or server logs.`,
        );
        return;
      }

      const tracks = normalizedTracksToTrackAnalyses(data.tracks);
      loadYouTubePlaylist({
        importedUrl: youtubeUrl.trim(),
        playlistId: data.playlist.id,
        name: data.playlist.title,
        channelTitle: data.playlist.channelTitle,
        externalUrl: data.playlist.externalUrl,
        tracks,
        truncated: data.playlist.truncated,
        importLimit: data.playlist.importLimit,
        fetchedItemSlots: data.playlist.fetchedItemSlots,
        skippedMissingVideoId: data.playlist.skippedMissingVideoId,
        youtubeReportedTotalItems: data.playlist.youtubeReportedTotalItems,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setYoutubeError(
        `Request failed before a response was received: ${message}. If the dev server is running, check terminal logs for [flowlist:youtube-import].`,
      );
    } finally {
      setYoutubeBusy(false);
    }
  }

  async function handleSpotifyExperimentalImport() {
    setSpotifyError(null);
    setSpotifyBusy(true);
    try {
      const res = await fetch("/api/spotify/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: spotifyUrl.trim() }),
      });
      const parsed = await parseImportApiResponse<SpotifyPlaylistImportResponse>(res);
      if (!parsed.ok) {
        setSpotifyError("Network error. YouTube and manual paste still work.");
        return;
      }
      const data = parsed.data;
      if (isApiErrorPayload(data)) {
        setSpotifyError(data.error.message);
        return;
      }
      if (
        typeof data !== "object" ||
        data === null ||
        !("ok" in data) ||
        data.ok !== true ||
        !("playlist" in data) ||
        !("tracks" in data)
      ) {
        setSpotifyError("Network error. YouTube and manual paste still work.");
        return;
      }
      const tracks = spotifyRowsToTrackAnalyses(data.tracks, data.playlist.id);
      loadSpotifyPlaylistExperimental({
        importedUrl: spotifyUrl.trim(),
        playlistId: data.playlist.id,
        name: data.playlist.name,
        ownerDisplayName: data.playlist.ownerDisplayName,
        playlistUri: data.playlist.uri,
        playlistExternalUrl: data.playlist.externalUrl,
        tracks,
      });
    } catch {
      setSpotifyError("Network error. YouTube and manual paste still work.");
    } finally {
      setSpotifyBusy(false);
    }
  }

  return (
    <AppFrame contentClassName="max-w-[42rem]">
      <div className="flow-page-in flex flex-1 flex-col gap-4 pb-3">
        <FlowStepper current={0} />
        <StepHeader
          title="Bring in your playlist"
          subtitle="Paste a YouTube Music or YouTube playlist link to begin."
          help={
            <HelpButton label="How does Flowlist use my playlist?" title="How does Flowlist use my playlist?">
              Flowlist reads playlist metadata, estimates mood and rhythm patterns, and creates a
              prototype listening order. It does not stream, download, or analyze audio.
            </HelpButton>
          }
        />

        <section className="grid grid-cols-3 gap-2.5">
          <SourceChoiceCard label="YouTube Link" icon={ListVideo} selected={importMode === "youtube"} onSelect={() => setImportMode("youtube")} />
          <SourceChoiceCard label="Manual Paste" icon={FileText} selected={importMode === "manual"} onSelect={() => setImportMode("manual")} />
          <SourceChoiceCard label="Demo" icon={PlayCircle} selected={importMode === "demo"} onSelect={() => setImportMode("demo")} />
        </section>

        {importMode === "youtube" ? (
          <section className="table-panel rounded-xl p-4">
            <div className="space-y-2">
              <Label htmlFor="youtube-url" className="text-white/76">
                Playlist URL
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="youtube-url"
                  type="url"
                  value={youtubeUrl}
                  onChange={(event) => {
                    setYoutubeError(null);
                    setYoutubeUrl(event.target.value);
                  }}
                  placeholder="https://music.youtube.com/playlist?list=..."
                  className="h-10 min-w-0 flex-1 rounded-lg border border-white/12 bg-black/25 px-3 text-sm text-foreground outline-none placeholder:text-white/32 focus-visible:border-[#668f7d]"
                />
                <Button type="button" disabled={youtubeBusy || !youtubeUrl.trim()} className="h-10 rounded-lg px-4" onClick={handleYouTubeImport}>
                  {youtubeBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                  {youtubeBusy ? "Importing..." : "Import"}
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs text-white/48">Import depth</span>
              {IMPORT_DEPTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={youtubeImportLimit === option.value}
                  onClick={() => setYoutubeImportLimit(option.value)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs transition-colors",
                    youtubeImportLimit === option.value
                      ? "border-[#568573]/65 bg-[#285341]/35 text-[#e5eee7]"
                      : "border-white/12 bg-black/15 text-white/54 hover:text-white/74",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {youtubeError ? (
              <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-100">
                {youtubeError} Check that the playlist is public, try manual paste, or use the demo playlist.
              </p>
            ) : null}
            {playlistSource === "youtube" && youtubeImport ? (
              <div className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-50/90">
                <p className="flex items-center gap-1.5 font-medium text-emerald-100">
                  <BadgeCheck className="size-3.5" />
                  {youtubeImport.name} · {youtubeImport.tracks.length} tracks ready
                </p>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-emerald-100/70">Import details</summary>
                  <p className="mt-1.5 leading-relaxed">
                    Read {youtubeImport.fetchedItemSlots} playlist rows with a {youtubeImport.importLimit}-track cap.
                    {youtubeImport.truncated ? " More tracks exist beyond this selected depth." : ""}
                    {youtubeImport.skippedMissingVideoId > 0
                      ? ` Skipped ${youtubeImport.skippedMissingVideoId} unavailable row(s).`
                      : ""}
                  </p>
                  <a
                    href={youtubeImport.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-emerald-100 underline-offset-4 hover:underline"
                  >
                    Open on YouTube
                    <ExternalLink className="size-3" />
                  </a>
                </details>
              </div>
            ) : null}
          </section>
        ) : null}

        {importMode === "manual" ? (
          <section className="table-panel rounded-xl p-4">
            <Label htmlFor="manual-tracks" className="text-white/76">
              Tracks, one per line
            </Label>
            <Textarea
              id="manual-tracks"
              value={playlistRaw}
              onChange={(event) => setPlaylistRaw(event.target.value)}
              placeholder={"Tame Impala - The Less I Know The Better\nRadiohead - Daydreaming"}
              className="mt-2 min-h-[112px] resize-none rounded-lg border-white/12 bg-black/25 text-sm text-foreground placeholder:text-white/32"
            />
            <p className="mt-2 text-xs text-white/44">
              {playlistSource === "manual" && playlistRaw.trim()
                ? `${resolvedTracks.length} track${resolvedTracks.length === 1 ? "" : "s"} ready.`
                : "Example: Artist - Song"}
            </p>
          </section>
        ) : null}

        {importMode === "demo" ? (
          <section className="table-panel flex flex-col items-start gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flow-display text-lg font-semibold text-[#fbf2e2]">Demo playlist</p>
              <p className="mt-1 text-xs text-white/50">Load mixed sample tracks and preview a full sequence.</p>
            </div>
            <Button type="button" className="rounded-lg px-5" onClick={loadDemoPlaylist}>
              {playlistSource === "demo" ? <BadgeCheck className="size-4" /> : null}
              {playlistSource === "demo" ? "Demo loaded" : "Load demo"}
            </Button>
          </section>
        ) : null}

        <details className="text-xs text-white/42">
          <summary className="cursor-pointer inline-flex items-center gap-1 hover:text-white/64">
            <Music2 className="size-3.5" />
            Experimental legacy Spotify import
          </summary>
          <div className="table-panel mt-2 rounded-xl p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={spotifyUrl}
                onChange={(event) => {
                  setSpotifyError(null);
                  setSpotifyUrl(event.target.value);
                }}
                placeholder="https://open.spotify.com/playlist/..."
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/12 bg-black/25 px-3 text-sm text-foreground outline-none"
              />
              <Button type="button" variant="outline" disabled={spotifyBusy || !spotifyUrl.trim()} className="rounded-lg" onClick={handleSpotifyExperimentalImport}>
                {spotifyBusy ? "Importing..." : "Import"}
              </Button>
            </div>
            {spotifyError ? <p className="mt-2 text-amber-100">{spotifyError}</p> : null}
            {playlistSource === "spotify" && spotifyImport ? (
              <p className="mt-2 text-white/64">{spotifyImport.name} · {spotifyImport.tracks.length} tracks ready</p>
            ) : null}
          </div>
        </details>

        <WorkflowActionBar
          left={
            <Link href="/" className="text-sm text-white/52 hover:text-white/78">
              Back
            </Link>
          }
          note={canContinue ? `${resolvedTracks.length} tracks ready` : "Import, paste, or load a demo to continue."}
          right={
            <Button type="button" disabled={!canContinue} size="lg" className="rounded-lg px-5" onClick={() => canContinue && router.push("/playlist-type")}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </AppFrame>
  );
}
