"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  ExternalLink,
  FileText,
  Loader2,
  ListVideo,
  Music2,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { FlowStepper } from "@/components/flow-stepper";
import { WorkflowActionBar } from "@/components/workflow-action-bar";
import { useFlow } from "@/components/flow-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizedTracksToTrackAnalyses } from "@/lib/normalized-to-track-analysis";
import { spotifyRowsToTrackAnalyses } from "@/lib/spotify-map-tracks";
import type { SpotifyPlaylistImportResponse } from "@/types/spotify-api";
import {
  isYoutubeApiErrorPayload,
  type YoutubeImportLimit,
  type YoutubePlaylistImportResponse,
} from "@/types/youtube-api";
import { cn } from "@/lib/utils";

type ImportMode = "youtube" | "manual" | "demo";

const IMPORT_DEPTH_OPTIONS: Array<{
  value: YoutubeImportLimit;
  label: string;
  description: string;
}> = [
  { value: 100, label: "Quick scan", description: "100 tracks" },
  { value: 200, label: "Standard", description: "200 tracks" },
  { value: 300, label: "Deep sequence", description: "300 tracks" },
];

function truncationMessage(limit: YoutubeImportLimit) {
  if (limit === 100) {
    return "This playlist has more tracks than the selected import depth. Flowlist imported the first 100 tracks for a quick scan.";
  }
  if (limit === 300) {
    return "This playlist has more tracks than the selected import depth. Flowlist imported the first 300 tracks for deep sequencing.";
  }
  return "This playlist has more tracks than the selected import depth. Flowlist imported the first 200 tracks for standard sequencing.";
}

function importDepthCardinalityNote(bundle: {
  truncated: boolean;
  importLimit: YoutubeImportLimit;
  tracks: unknown[];
  fetchedItemSlots: number;
  skippedMissingVideoId: number;
  youtubeReportedTotalItems: number | null;
}): Array<{ title: string; body: string }> {
  const notes: Array<{ title: string; body: string }> = [];
  const n = bundle.tracks.length;

  if (bundle.skippedMissingVideoId > 0) {
    notes.push({
      title: "Skipped playlist rows",
      body: `${bundle.skippedMissingVideoId} playlist row(s) lacked a playable video ID (private, deleted, or placeholder entries tend to behave this way). Flowlist imported ${n} playable video${n === 1 ? "" : "s"}.`,
    });
  }

  if (!bundle.truncated && n < bundle.importLimit) {
    const hint =
      bundle.youtubeReportedTotalItems != null &&
      bundle.youtubeReportedTotalItems === n + bundle.skippedMissingVideoId
        ? `YouTube lists ${bundle.youtubeReportedTotalItems} item(s) total for this playlist, matching playable imports plus skipped rows.`
        : `Flowlist fetched up to ${bundle.importLimit} slots and read ${bundle.fetchedItemSlots} contiguous playlist rows before hitting the playlist end — this isn’t truncation from hitting your chosen depth.`;
    notes.push({
      title: "Fewer tracks than selected depth",
      body: `${hint} Imported ${n} usable video${n === 1 ? "" : "s"} with your ${bundle.importLimit}-track (${bundle.importLimit === 100 ? "quick" : bundle.importLimit === 300 ? "deep" : "standard"}) cap.`,
    });
  }

  if (!bundle.truncated && n === bundle.importLimit && bundle.skippedMissingVideoId > 0) {
    notes.push({
      title: "Depth-filled but incomplete",
      body: `The run filled your ${bundle.importLimit}-track cap with playlist rows (${bundle.fetchedItemSlots} slots read), though ${bundle.skippedMissingVideoId} of those lacked playable IDs.`,
    });
  }

  return notes;
}

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
  const [importMode, setImportMode] = useState<ImportMode>(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
      return "demo";
    }
    return "youtube";
  });
  const demoLoadedFromQuery = useRef(false);

  const ytCardinalityNotes = useMemo(
    () => (youtubeImport != null ? importDepthCardinalityNote(youtubeImport) : []),
    [youtubeImport],
  );

  const youtubeReady = playlistSource === "youtube" && Boolean(youtubeImport);
  const spotifyReady = playlistSource === "spotify" && Boolean(spotifyImport);
  const canContinue = resolvedTracks.length > 0;

  useEffect(() => {
    if (demoLoadedFromQuery.current) return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      loadDemoPlaylist();
      demoLoadedFromQuery.current = true;
    }
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
        fetchedItemSlots: data.playlist.fetchedItemSlots,
        skippedMissingVideoId: data.playlist.skippedMissingVideoId,
        youtubeReportedTotalItems: data.playlist.youtubeReportedTotalItems,
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
    <AppFrame contentClassName="max-w-5xl">
      <div className="flow-page-in flex flex-1 flex-col gap-5 pb-24">
        <FlowStepper current={0} />

        <section className="space-y-2">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-violet-200" />
            Step 1 · Import Playlist
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Start with the chaos
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The more uneven the playlist, the more room Flowlist has to shape a journey.
          </p>
        </section>

        <section className="grid gap-2 sm:grid-cols-3">
          {[
            { id: "youtube" as const, label: "YouTube Link", icon: ListVideo },
            { id: "manual" as const, label: "Manual Paste", icon: FileText },
            { id: "demo" as const, label: "Demo", icon: PlayCircle },
          ].map((mode) => {
            const Icon = mode.icon;
            const active = importMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setImportMode(mode.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-2xl border px-3 py-3 text-left shadow-lg shadow-black/15 transition-all",
                  active
                    ? "border-violet-200/45 bg-violet-500/15"
                    : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon className="size-4 text-violet-100/80" />
                  {mode.label}
                </span>
              </button>
            );
          })}
        </section>

        <section className="grid gap-4">
          {importMode === "youtube" ? (
            <div className="group rounded-[1.5rem] border border-red-300/15 bg-gradient-to-br from-red-500/10 via-white/[0.04] to-black/30 p-4 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-100/60">
                  source
                </p>
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                  <ListVideo className="size-4 text-red-200/90" />
                  YouTube Music / YouTube
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Paste a public playlist link and Flowlist imports metadata for prototype sequencing.
                </p>
              </div>
              {youtubeReady ? <BadgeCheck className="size-5 text-emerald-200" /> : null}
            </div>

            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-foreground">Import depth</Label>
                <p className="text-xs text-muted-foreground">Larger imports may take longer to analyze.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {IMPORT_DEPTH_OPTIONS.map((option) => {
                  const checked = youtubeImportLimit === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={checked}
                      className={cn(
                        "rounded-2xl border px-3 py-2 text-left transition-all",
                        checked
                          ? "border-violet-200/45 bg-violet-500/15 text-violet-50"
                          : "border-white/10 bg-black/25 text-muted-foreground hover:border-white/20 hover:bg-white/[0.04]",
                      )}
                      onClick={() => setYoutubeImportLimit(option.value)}
                    >
                      <span className="block text-xs font-medium">{option.label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
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
                  className="h-11 w-full min-w-0 rounded-2xl border border-white/10 bg-black/45 px-4 py-2 font-mono text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground/60 focus-visible:border-violet-300/50 focus-visible:ring-2 focus-visible:ring-violet-400/25"
                />
              </div>
              <Button
                type="button"
                disabled={youtubeBusy || !youtubeUrl.trim()}
                className="shrink-0 gap-2 rounded-full px-5 sm:mb-0.5"
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
              <div className="mt-3 rounded-2xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-100/95">
                {youtubeError}{" "}
                <span className="text-red-200/85">
                  Check that the playlist is public, try manual paste, or use the demo playlist.
                </span>
              </div>
            ) : null}
            {youtubeReady && youtubeImport ? (
              <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-50/95">
                <p className="font-medium text-emerald-100">{youtubeImport.name}</p>
                <p className="text-xs text-emerald-100/85">
                  {youtubeImport.channelTitle ? `${youtubeImport.channelTitle} · ` : null}
                  {youtubeImport.tracks.length} video{youtubeImport.tracks.length === 1 ? "" : "s"}{" "}
                  imported from YouTube metadata.
                </p>
                <p className="mt-2 text-[11px] text-emerald-100/85">
                  Import pagination cap applied:{" "}
                  {youtubeImport.importLimit === 100
                    ? "Quick scan (100 playlist slots)."
                    : youtubeImport.importLimit === 300
                      ? "Deep sequence (300 playlist slots)."
                      : "Standard (200 playlist slots)."}
                  {" "}
                  Read {youtubeImport.fetchedItemSlots} row
                  {youtubeImport.fetchedItemSlots === 1 ? "" : "s"} before the API run stopped.
                </p>
                {youtubeImport.truncated ? (
                  <div className="mt-3 rounded-xl border border-amber-500/35 bg-black/35 px-3 py-2.5 text-xs leading-relaxed text-amber-50/95">
                    <p className="font-medium text-amber-100">
                      {truncationMessage(youtubeImport.importLimit)}
                    </p>
                    <p className="mt-1.5 text-amber-100/80">
                      Large playlists take longer to analyze and may use more API quota.
                      Full-library sequencing will be added later.
                    </p>
                  </div>
                ) : null}
                {ytCardinalityNotes.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {ytCardinalityNotes.map((note) => (
                      <div
                        key={note.title}
                        className="rounded-xl border border-sky-500/35 bg-black/35 px-3 py-2.5 text-xs leading-relaxed text-sky-50/95"
                      >
                        <p className="font-medium text-sky-100">{note.title}</p>
                        <p className="mt-1 text-sky-100/85">{note.body}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
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
          </div>
          ) : null}

          {importMode === "manual" ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
                    source
                  </p>
                  <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
                    <FileText className="size-4 text-violet-200/90" />
                    Manual paste
                  </h2>
                </div>
                {playlistSource === "manual" && playlistRaw.trim() ? (
                  <BadgeCheck className="size-5 text-emerald-200" />
                ) : null}
              </div>
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                One track per line. Try Artist - Song, Song - Artist, or Artist, Song.
              </p>
              <Textarea
                id="manual-tracks"
                value={playlistRaw}
                onChange={(e) => setPlaylistRaw(e.target.value)}
                placeholder={`The Less I Know The Better - Tame Impala\nRadiohead, Daydreaming`}
                className={cn(
                  "min-h-[180px] resize-y rounded-2xl border-white/10 bg-black/45 font-mono text-sm text-foreground",
                  "placeholder:text-muted-foreground/60",
                )}
              />
              {(playlistSource === "youtube" || playlistSource === "spotify") && (
                <p className="mt-2 text-xs text-amber-200/90">
                  Typing here clears the active YouTube or Spotify import and switches to manual-only
                  tracks.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {playlistSource === "manual" && playlistRaw.trim()
                  ? `${resolvedTracks.length} track${resolvedTracks.length === 1 ? "" : "s"} from your lines · mock sequencing only`
                  : playlistSource === "demo"
                    ? `${resolvedTracks.length} demo track${resolvedTracks.length === 1 ? "" : "s"} · mock sequencing only`
                    : playlistSource === "manual"
                      ? "Type or paste lines above (only your text is used)."
                      : null}
              </p>
            </div>
          ) : null}

          {importMode === "demo" ? (
            <div className="rounded-[1.5rem] border border-violet-300/20 bg-violet-500/10 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
                    source
                  </p>
                  <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
                    <PlayCircle className="size-4 text-violet-200/90" />
                    Demo playlist
                  </h2>
                </div>
                {playlistSource === "demo" ? <BadgeCheck className="size-5 text-emerald-200" /> : null}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Fixed sample tracks. Loads with Mixed Mess and a pair of showcase flows so you can
                see the prototype journey quickly.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-5 rounded-full border-violet-300/25 bg-black/30"
                onClick={loadDemoPlaylist}
              >
                Load demo
              </Button>
            </div>
          ) : null}
        </section>

        <details className="rounded-[1.25rem] border border-sky-300/15 bg-sky-500/5 p-3 text-sm text-sky-50/90">
          <summary className="cursor-pointer text-sm font-medium text-sky-100">
            Why messy playlists work best
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="font-medium text-sky-100">Where Flowlist shines</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  "Mixed artists",
                  "Big mood swings",
                  "Strange transitions",
                  "Random saved tracks",
                  "Everything I like lately",
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-sky-200/15 bg-black/20 px-2 py-0.5 text-xs text-sky-50/85"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-xs leading-relaxed text-sky-100/75">
              Long mixed playlists usually show the biggest before/after difference. Already
              consistent playlists may still benefit more subtly.
            </div>
          </div>
        </details>

        <details className="rounded-[1.25rem] border border-amber-500/20 bg-amber-500/5 p-3 opacity-95">
          <summary className="cursor-pointer text-sm font-medium text-amber-100">
            Experimental legacy: Spotify import
          </summary>
          <div className="mt-3 space-y-3">
          <div className="mb-3 flex items-center gap-2">
            <Music2 className="size-4 text-amber-200" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Experimental legacy: Spotify import
            </h2>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Kept for compatibility. If it fails, use YouTube Music or manual paste. No OAuth, no
            Spotify Audio Features — metadata only.
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
                className="h-10 w-full min-w-0 rounded-2xl border border-white/10 bg-black/40 px-3 py-1 font-mono text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={spotifyBusy || !spotifyUrl.trim()}
              className="shrink-0 rounded-full border-amber-500/30 bg-black/30"
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
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground/90">
              <p className="font-medium">{spotifyImport.name}</p>
              <p className="text-xs text-muted-foreground">
                {spotifyImport.ownerDisplayName ? `By ${spotifyImport.ownerDisplayName} · ` : null}
                {spotifyImport.tracks.length} track{spotifyImport.tracks.length === 1 ? "" : "s"}{" "}
                (experimental).
              </p>
            </div>
          ) : null}
          </div>
        </details>

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

        <WorkflowActionBar
          left={
            <Link
              href="/"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back
            </Link>
          }
          right={
            <Button
              type="button"
              className="rounded-full px-5"
              disabled={!canContinue}
              onClick={() => canContinue && router.push("/flow")}
            >
              Next: Define your playlist
              <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </AppFrame>
  );
}
