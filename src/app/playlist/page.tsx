"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizedTracksToTrackAnalyses } from "@/lib/normalized-to-track-analysis";
import { spotifyRowsToTrackAnalyses } from "@/lib/spotify-map-tracks";
import type { SpotifyPlaylistImportResponse } from "@/types/spotify-api";
import {
  isYoutubeApiErrorPayload,
  type YoutubePlaylistImportResponse,
} from "@/types/youtube-api";
import { cn } from "@/lib/utils";

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
    spotifyImport,
    resolvedTracks,
  } = useFlow();

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

  const youtubeReady = playlistSource === "youtube" && Boolean(youtubeImport);
  const spotifyReady = playlistSource === "spotify" && Boolean(spotifyImport);
  const canContinue = resolvedTracks.length > 0;

  async function handleYouTubeImport() {
    setYoutubeError(null);
    setYoutubeBusy(true);
    try {
      const res = await fetch("/api/youtube/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        setYoutubeError(
          `Could not parse JSON from server (HTTP ${res.status}). First bytes: ${text.slice(0, 160)}${text.length > 160 ? "…" : ""}`,
        );
        return;
      }

      if (isYoutubeApiErrorPayload(parsed)) {
        const { message, details, code } = parsed.error;
        const parts = [message, details].filter((p): p is string => Boolean(p && p.trim()));
        parts.push(`[${code}]`);
        setYoutubeError(parts.join(" "));
        return;
      }

      const data = parsed as YoutubePlaylistImportResponse;
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
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setYoutubeError(
        `Request failed before a response was received: ${msg}. If the dev server is running, check terminal logs for [flowlist:youtube-import].`,
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
      const data = (await res.json()) as SpotifyPlaylistImportResponse;
      if (!data.ok) {
        setSpotifyError(data.error.message);
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
    <AppFrame>
      <div className="flex flex-1 flex-col gap-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Import</h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Turn your YouTube Music or YouTube playlist into a smoother listening journey. Flowlist
            reorders by emotional flow, rhythm continuity, and energy — using mock analysis for
            now (no audio download or playback).
          </p>
        </div>

        <section className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-5 shadow-sm shadow-black/20">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Import from YouTube Music / YouTube
            </h2>
            <p className="text-sm text-muted-foreground">
              Paste a public playlist link and Flowlist will import playlist metadata to build a
              smoother emotional and rhythmic sequence.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="youtube-url" className="text-foreground">
                Playlist URL
              </Label>
              <input
                id="youtube-url"
                type="url"
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeError(null);
                  setYoutubeUrl(e.target.value);
                }}
                placeholder="https://music.youtube.com/playlist?list=…"
                className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-black/40 px-3 py-1 font-mono text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
            <Button
              type="button"
              disabled={youtubeBusy || !youtubeUrl.trim()}
              className="shrink-0 gap-2 rounded-full sm:mb-0.5"
              onClick={handleYouTubeImport}
            >
              {youtubeBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Importing…
                </>
              ) : (
                "Import playlist"
              )}
            </Button>
          </div>
          {youtubeError ? (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-100/95">
              {youtubeError}{" "}
              <span className="text-red-200/85">
                Check that the playlist is public, try manual paste, or use the demo playlist.
              </span>
            </div>
          ) : null}
          {youtubeReady && youtubeImport ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-50/95">
              <p className="font-medium text-emerald-100">{youtubeImport.name}</p>
              <p className="text-xs text-emerald-100/85">
                {youtubeImport.channelTitle ? `${youtubeImport.channelTitle} · ` : null}
                {youtubeImport.tracks.length} video{youtubeImport.tracks.length === 1 ? "" : "s"}{" "}
                imported from YouTube metadata.
                {youtubeImport.truncated ? (
                  <span className="block pt-1 text-amber-200/95">
                    First {youtubeImport.importLimit ?? 100} items only — playlist was truncated.
                  </span>
                ) : null}
              </p>
              <a
                href={youtubeImport.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-200 underline-offset-4 hover:underline"
              >
                Open on YouTube
                <ExternalLink className="size-3" />
              </a>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Paste tracks manually
          </h2>
          <p className="text-sm text-muted-foreground">
            One track per line. Supported shapes include{" "}
            <span className="font-mono text-foreground/80">Artist - Song</span>,{" "}
            <span className="font-mono text-foreground/80">Song - Artist</span>, and{" "}
            <span className="font-mono text-foreground/80">Artist, Song</span>.
          </p>
          <Textarea
            id="manual-tracks"
            value={playlistRaw}
            onChange={(e) => setPlaylistRaw(e.target.value)}
            placeholder={`The Less I Know The Better - Tame Impala\nRadiohead, Daydreaming`}
            className={cn(
              "min-h-[180px] resize-y border-white/10 bg-black/40 font-mono text-sm text-foreground",
              "placeholder:text-muted-foreground/60",
            )}
          />
          {(playlistSource === "youtube" || playlistSource === "spotify") && (
            <p className="text-xs text-amber-200/90">
              Typing here clears the active YouTube or Spotify import and switches to manual-only
              tracks.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {playlistSource === "manual" && playlistRaw.trim()
              ? `${resolvedTracks.length} track${resolvedTracks.length === 1 ? "" : "s"} from your lines · mock sequencing only`
              : playlistSource === "demo"
                ? `${resolvedTracks.length} demo track${resolvedTracks.length === 1 ? "" : "s"} · mock sequencing only`
                : playlistSource === "manual"
                  ? "Type or paste lines above (only your text is used)."
                  : null}
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Try demo playlist — mock data</p>
            <p className="text-xs text-muted-foreground">
              Fixed sample tracks for testing sequencing only.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/15 bg-white/5"
            onClick={loadDemoPlaylist}
          >
            Load demo
          </Button>
        </div>

        <section className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 opacity-95">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Experimental: Spotify import
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Spotify playlist access may be restricted by platform rules. If it fails, use YouTube
            Music or manual paste. No OAuth, no Audio Features — metadata only.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="spotify-url" className="text-foreground">
                Spotify playlist URL
              </Label>
              <input
                id="spotify-url"
                type="url"
                value={spotifyUrl}
                onChange={(e) => {
                  setSpotifyError(null);
                  setSpotifyUrl(e.target.value);
                }}
                placeholder="https://open.spotify.com/playlist/…"
                className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-black/40 px-3 py-1 font-mono text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={spotifyBusy || !spotifyUrl.trim()}
              className="shrink-0 border-amber-500/30 bg-black/30"
              onClick={handleSpotifyExperimentalImport}
            >
              {spotifyBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Importing…
                </>
              ) : (
                "Import (experimental)"
              )}
            </Button>
          </div>
          {spotifyError ? (
            <div className="rounded-lg border border-amber-500/35 bg-black/30 px-3 py-2 text-sm text-amber-100/95">
              {spotifyError}{" "}
              <span className="text-muted-foreground">
                YouTube and manual import are unaffected.
              </span>
            </div>
          ) : null}
          {spotifyReady && spotifyImport ? (
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground/90">
              <p className="font-medium">{spotifyImport.name}</p>
              <p className="text-xs text-muted-foreground">
                {spotifyImport.ownerDisplayName ? `By ${spotifyImport.ownerDisplayName} · ` : null}
                {spotifyImport.tracks.length} track{spotifyImport.tracks.length === 1 ? "" : "s"}{" "}
                (experimental).
              </p>
            </div>
          ) : null}
        </section>

        <p className="text-center text-xs text-muted-foreground">
          Active:{" "}
          <span className="text-foreground/90">
            {playlistSource === "youtube"
              ? "YouTube import"
              : playlistSource === "spotify"
                ? "Experimental Spotify"
                : playlistSource === "demo"
                  ? "Demo playlist"
                  : "Manual paste"}
          </span>
          {canContinue
            ? ` · ${resolvedTracks.length} track${resolvedTracks.length === 1 ? "" : "s"} ready`
            : ""}
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-8">
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back
          </Link>
          <Button
            type="button"
            variant="outline"
            className="border-white/15 bg-white/5"
            disabled={!canContinue}
            onClick={() => canContinue && router.push("/flow")}
          >
            Continue to flow
          </Button>
        </div>
      </div>
    </AppFrame>
  );
}
