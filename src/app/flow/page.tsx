"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { FlowCard } from "@/components/flow-keyword-cards";
import { FlowStepper } from "@/components/flow-stepper";
import { WorkflowActionBar } from "@/components/workflow-action-bar";
import { useFlow } from "@/components/flow-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_FLOW_KEYWORDS } from "@/lib/flow-presets";
import {
  isRecommendedPairing,
  resolveHardConflict,
  softTensionAgainstSelected,
} from "@/lib/flow-compatibility";
import { cn } from "@/lib/utils";

export default function FlowPage() {
  const router = useRouter();
  const {
    selectedFlowKeywordIds,
    toggleFlowKeyword,
    playlistTypeId,
    availableFlowKeywords,
    isReadyToSequence,
    sequenceBlocker,
    resolvedTracks,
    playlistSource,
    youtubeImport,
    spotifyImport,
  } = useFlow();

  const showKeywordPicker = Boolean(playlistTypeId);
  const selectedKeywords = useMemo(
    () => selectedFlowKeywordIds.map((id) => availableFlowKeywords.find((kw) => kw.id === id)).filter(Boolean),
    [selectedFlowKeywordIds, availableFlowKeywords],
  );

  if (resolvedTracks.length === 0) {
    return (
      <AppFrame contentClassName="max-w-3xl">
        <div className="flow-page-in flex flex-1 flex-col gap-6 pb-24">
          <FlowStepper current={2} />
          <div className="rounded-[1.75rem] border border-amber-500/35 bg-amber-500/10 p-6 text-sm leading-relaxed text-amber-50/95">
            <p className="text-lg font-semibold tracking-tight text-amber-50">Import a playlist first.</p>
            <p className="mt-2 text-amber-100/85">Add tracks on the import page, then define your playlist type.</p>
            <Link href="/import" className={cn(buttonVariants({ size: "lg" }), "mt-6 inline-flex rounded-full no-underline")}>
              Go to Import
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </AppFrame>
    );
  }

  if (!playlistTypeId) {
    return (
      <AppFrame contentClassName="max-w-3xl">
        <div className="flow-page-in flex flex-1 flex-col gap-6 pb-24">
          <FlowStepper current={2} />
          <div className="rounded-[1.75rem] border border-amber-500/35 bg-amber-500/10 p-6 text-sm leading-relaxed text-amber-50/95">
            <p className="text-lg font-semibold tracking-tight text-amber-50">Choose a playlist type first.</p>
            <p className="mt-2 text-amber-100/85">
              Flow keywords are tailored to the musical world — pick Mixed Mess or another genre before shaping the journey.
            </p>
            <Link
              href="/playlist-type"
              className={cn(buttonVariants({ size: "lg" }), "mt-6 inline-flex rounded-full no-underline")}
            >
              Choose playlist type
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
        <FlowStepper current={2} />

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
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200/70">
                Step 3 · Choose Flow Keywords
              </p>
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                How should the journey move?
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Choose up to 2 flow directions. Some combinations conflict and can’t be selected together.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedFlowKeywordIds.length}/{MAX_FLOW_KEYWORDS} selected
            </p>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-black/25 p-3 shadow-xl shadow-black/20 backdrop-blur-xl">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
              Selected movement
            </p>
            {selectedKeywords.length === 0 ? (
              <p className="text-sm text-muted-foreground">Choose up to 2 flow cards.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {selectedKeywords.map((kw, index) =>
                  kw ? (
                    <button
                      key={kw.id}
                      type="button"
                      onClick={() => toggleFlowKeyword(kw.id)}
                      className={cn(
                        "min-w-36 rounded-2xl border border-violet-200/35 bg-violet-500/15 px-3 py-3 text-left shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5",
                        index === 0 ? "-rotate-2" : "rotate-2",
                      )}
                    >
                      <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-violet-100/60">
                        dealt
                      </span>
                      <span className="mt-2 block text-sm font-medium text-violet-50">{kw.label}</span>
                    </button>
                  ) : null,
                )}
              </div>
            )}
          </div>

          {!showKeywordPicker ? (
            <p className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-muted-foreground">
              Pick a playlist type on the previous step to see flow options tailored to it.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {availableFlowKeywords.map((kw, index) => {
                const checked = selectedFlowKeywordIds.includes(kw.id);
                const hard = checked ? null : resolveHardConflict(kw.id, selectedFlowKeywordIds);
                const conflictLabel = hard
                  ? availableFlowKeywords.find((candidate) => candidate.id === hard.labelId)?.label ?? null
                  : null;
                const trayHasPick = selectedFlowKeywordIds.length >= 1;
                const tensionHint =
                  trayHasPick && !checked && !hard
                    ? softTensionAgainstSelected(kw.id, selectedFlowKeywordIds)
                    : null;
                const pairsWell =
                  trayHasPick && !checked && !hard ? isRecommendedPairing(kw.id, selectedFlowKeywordIds) : false;
                const disabled =
                  !checked && (selectedFlowKeywordIds.length >= MAX_FLOW_KEYWORDS || Boolean(hard));
                return (
                  <FlowCard
                    key={kw.id}
                    keyword={kw}
                    index={index}
                    selected={checked}
                    disabled={disabled}
                    conflictLabel={conflictLabel}
                    conflictMessage={hard?.message ?? null}
                    tensionHint={tensionHint}
                    pairsWell={pairsWell}
                    onSelect={() => {
                      if (!disabled || checked) toggleFlowKeyword(kw.id);
                    }}
                  />
                );
              })}
            </div>
          )}
        </section>

        <WorkflowActionBar
          left={
            <Link
              href="/playlist-type"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back
            </Link>
          }
          note={sequenceBlocker}
          right={
            <Button
              type="button"
              disabled={!isReadyToSequence}
              size="lg"
              className="rounded-full px-6"
              onClick={() => isReadyToSequence && router.push("/analyze")}
            >
              Deal the sequence
              <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </AppFrame>
  );
}
