"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { TypeCard } from "@/components/flow-type-cards";
import { FlowStepper } from "@/components/flow-stepper";
import { WorkflowActionBar } from "@/components/workflow-action-bar";
import { useFlow } from "@/components/flow-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { PLAYLIST_TYPES, type PlaylistTypeId } from "@/lib/flow-presets";
import { analyzePlaylistFit } from "@/lib/playlist-fit-analysis";
import { cn } from "@/lib/utils";

export default function PlaylistTypePage() {
  const router = useRouter();
  const {
    resolvedTracks,
    playlistTypeId,
    setPlaylistTypeId,
    importedPlaylistName,
    playlistSource,
    youtubeImport,
    spotifyImport,
  } = useFlow();

  const playlistFitPreview = useMemo(
    () => analyzePlaylistFit(resolvedTracks, { playlistTitle: importedPlaylistName }),
    [resolvedTracks, importedPlaylistName],
  );

  const mixedMessFitHint =
    playlistTypeId === "mixed_mess" &&
    (playlistFitPreview.level === "moderately_consistent" ||
      playlistFitPreview.level === "highly_consistent");

  if (resolvedTracks.length === 0) {
    return (
      <AppFrame contentClassName="max-w-3xl">
        <div className="flow-page-in flex flex-1 flex-col gap-6 pb-24">
          <FlowStepper current={1} />
          <div className="rounded-[1.75rem] border border-amber-500/35 bg-amber-500/10 p-6 text-sm leading-relaxed text-amber-50/95">
            <p className="text-lg font-semibold tracking-tight text-amber-50">Import a playlist first.</p>
            <p className="mt-2 text-amber-100/85">
              Flowlist needs tracks from YouTube, manual paste, or the demo before you can describe the playlist
              world.
            </p>
            <Link
              href="/import"
              className={cn(buttonVariants({ size: "lg" }), "mt-6 inline-flex rounded-full no-underline")}
            >
              Go to Import
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame contentClassName="max-w-6xl">
      <div className="flow-page-in flex flex-1 flex-col gap-5 pb-24">
        <FlowStepper current={1} />

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          {playlistSource === "youtube" && youtubeImport ? (
            <p>
              <span className="font-medium text-emerald-200/95">
                Imported from YouTube Music / YouTube metadata
              </span>{" "}
              — {youtubeImport.name} ({youtubeImport.tracks.length} items). Mock sequencing only.
            </p>
          ) : playlistSource === "spotify" && spotifyImport ? (
            <p>
              <span className="font-medium text-amber-200/95">Experimental Spotify import</span> —{" "}
              {spotifyImport.name} ({spotifyImport.tracks.length} tracks).
            </p>
          ) : playlistSource === "manual" ? (
            <p>
              <span className="font-medium text-foreground">Using manually pasted tracks</span> —{" "}
              {resolvedTracks.length} track{resolvedTracks.length === 1 ? "" : "s"}.
            </p>
          ) : playlistSource === "demo" ? (
            <p>
              <span className="font-medium text-violet-200/95">Demo playlist — mock data</span> —{" "}
              {resolvedTracks.length} track{resolvedTracks.length === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 px-3 py-2.5 text-sm leading-relaxed text-violet-50/95">
          <p className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-200" />
            <span>
              Flowlist works best with messy playlists: mixed genres, mood shifts, and strange transitions give the
              sequencer more room to create a meaningful journey. Already perfectly consistent playlists may not change
              much — the magic happens when there is chaos to organize.
            </span>
          </p>
        </div>

        <section className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200/70">
              Step 2 · Define Playlist Type
            </p>
            <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              What kind of playlist is this?
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Pick the musical world you’re working with. This helps Flowlist choose the right sequencing logic.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-sm leading-relaxed text-amber-50/95">
            <span className="font-medium text-amber-100">Not sure? Choose Mixed Mess.</span> It’s the best showcase for
            Flowlist’s sequencing strength.
          </div>
          <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-sm leading-relaxed text-sky-50/95">
            <span className="font-medium text-sky-100">Playlist fit: </span>
            {playlistFitPreview.label}
            {mixedMessFitHint
              ? ". This looks fairly consistent, so changes may be more subtle."
              : ". This is a helpful preview, not a warning."}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {PLAYLIST_TYPES.map((pt) => {
              const checked = pt.id === playlistTypeId;
              return (
                <TypeCard
                  key={pt.id}
                  type={pt}
                  selected={checked}
                  onSelect={() => setPlaylistTypeId(checked ? null : (pt.id as PlaylistTypeId))}
                />
              );
            })}
          </div>
        </section>

        <WorkflowActionBar
          left={
            <Link
              href="/import"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back to import
            </Link>
          }
          note={!playlistTypeId ? "Pick a playlist type to continue." : null}
          right={
            <Button
              type="button"
              disabled={!playlistTypeId}
              size="lg"
              className="rounded-full px-6"
              onClick={() => playlistTypeId && router.push("/flow")}
            >
              Next: Choose flow
              <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </AppFrame>
  );
}
