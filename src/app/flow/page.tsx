"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  ArrowRight,
  Check,
  Crown,
  Flame,
  Layers3,
  Lock,
  Moon,
  Music2,
  Shuffle,
  Sparkles,
  Waves,
  Zap,
} from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { FlowStepper } from "@/components/flow-stepper";
import { WorkflowActionBar } from "@/components/workflow-action-bar";
import { useFlow } from "@/components/flow-provider";
import { Button } from "@/components/ui/button";
import {
  MAX_FLOW_KEYWORDS,
  PLAYLIST_TYPES,
  type FlowKeyword,
  type PlaylistType,
  type PlaylistTypeId,
} from "@/lib/flow-presets";
import { analyzePlaylistFit } from "@/lib/playlist-fit-analysis";
import { resolveStrategyFromKeywordIds } from "@/lib/flow-strategies";
import { cn } from "@/lib/utils";

const TYPE_ICON_BY_ID: Partial<Record<PlaylistTypeId, typeof Layers3>> = {
  mixed_mess: Layers3,
  hip_hop: Flame,
  rnb_soul: Moon,
  pop_dance: Sparkles,
  rock_alt: Zap,
  electronic_club: Waves,
  classical_score: Crown,
  jazz_blues: Music2,
  chill_lofi: Moon,
};

const FLOW_ICONS = [Waves, Shuffle, Sparkles, Flame, Moon, Zap] as const;

const SHORT_TYPE_DESCRIPTIONS: Record<PlaylistTypeId, string> = {
  mixed_mess: "Mixed artists, moods, and energy jumps.",
  hip_hop: "Bars, beats, flex, darkness, and momentum.",
  rnb_soul: "Smooth vocals, intimacy, heartbreak, and warmth.",
  pop_dance: "Hooks, lift, bounce, and bright momentum.",
  rock_alt: "Guitars, tension, release, and anthem moments.",
  electronic_club: "Pulse, drops, loops, and dancefloor energy.",
  classical_score: "Movement, drama, grandeur, and resolution.",
  jazz_blues: "Groove, warmth, smoke, and late-night motion.",
  chill_lofi: "Soft texture, calm pacing, and low-disruption flow.",
};

const EXPLICIT_CONFLICTS: Record<string, Record<string, string>> = {
  "classical_score.storm_to_serenity": {
    "classical_score.grand_finale": "Pulls the ending in the opposite direction.",
  },
  "classical_score.grand_finale": {
    "classical_score.storm_to_serenity": "Pulls the ending in the opposite direction.",
  },
};

function conflictFor(candidateId: string, selectedIds: string[]) {
  for (const selectedId of selectedIds) {
    const explicit = EXPLICIT_CONFLICTS[selectedId]?.[candidateId];
    if (explicit) return { labelId: selectedId, message: explicit };

    const diagnostics = resolveStrategyFromKeywordIds([selectedId, candidateId]).diagnostics;
    const hardConflict = diagnostics.conflictNotes.find((note) =>
      /suppressed|overrides|opposite|precedence/i.test(note),
    );
    if (hardConflict) {
      return { labelId: selectedId, message: "Conflicts with selected movement." };
    }
  }
  return null;
}

function TypeCard({
  type,
  selected,
  onSelect,
}: {
  type: PlaylistType;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = TYPE_ICON_BY_ID[type.id] ?? Layers3;
  const recommended = type.id === "mixed_mess";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative min-h-32 overflow-hidden rounded-[1.25rem] border p-3 text-left shadow-xl shadow-black/15 backdrop-blur-xl transition-all duration-300",
        selected
          ? "-translate-y-1 border-violet-200/55 bg-violet-500/15 shadow-[0_0_40px_rgba(139,92,246,0.23)]"
          : "border-white/10 bg-white/[0.045] hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07]",
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(167,139,250,0.18),transparent_48%)] opacity-80" />
      <div className="relative flex h-full flex-col">
        <div className="mb-4 flex items-start justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
            type
          </span>
          <Icon className="size-4 text-violet-100/75" />
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-foreground">{type.label}</h3>
            {recommended ? (
              <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-100">
                Recommended
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {SHORT_TYPE_DESCRIPTIONS[type.id]}
          </p>
        </div>
        <div className="mt-auto pt-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              selected ? "text-violet-100" : "text-muted-foreground",
            )}
          >
            {selected ? <Check className="size-3.5" /> : null}
            {selected ? "Selected deck world" : "Choose this world"}
          </span>
        </div>
      </div>
    </button>
  );
}

function FlowCard({
  keyword,
  index,
  selected,
  disabled,
  conflictLabel,
  conflictMessage,
  onSelect,
}: {
  keyword: FlowKeyword;
  index: number;
  selected: boolean;
  disabled: boolean;
  conflictLabel: string | null;
  conflictMessage: string | null;
  onSelect: () => void;
}) {
  const Icon = FLOW_ICONS[index % FLOW_ICONS.length] ?? Waves;
  const conflict = Boolean(conflictMessage);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "group relative min-h-36 overflow-hidden rounded-[1.25rem] border p-3 text-left shadow-xl shadow-black/15 backdrop-blur-xl transition-all duration-300",
        selected
          ? "-translate-y-1 rotate-[-1deg] border-violet-200/55 bg-violet-500/15 shadow-[0_0_40px_rgba(139,92,246,0.22)]"
          : conflict
            ? "cursor-not-allowed border-white/5 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(139,92,246,0.05))] opacity-70"
            : disabled
              ? "cursor-not-allowed border-white/5 bg-black/20 opacity-50"
              : "border-white/10 bg-white/[0.045] hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07]",
      )}
    >
      {conflict ? (
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.06)_0px,rgba(255,255,255,0.06)_1px,transparent_1px,transparent_10px)]" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(167,139,250,0.16),transparent_48%)] opacity-80" />
      )}
      <div className="relative flex h-full flex-col">
        <div className="mb-4 flex items-start justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
            flow
          </span>
          {conflict ? <Lock className="size-4 text-muted-foreground" /> : <Icon className="size-4 text-violet-100/75" />}
        </div>

        {conflict ? (
          <div className="mt-auto space-y-2">
            <p className="text-sm font-semibold text-foreground/80">Card locked</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {conflictLabel ? `Conflicts with ${conflictLabel}.` : conflictMessage}
            </p>
            {conflictMessage && conflictMessage !== "Conflicts with selected movement." ? (
              <p className="text-[11px] text-amber-100/80">{conflictMessage}</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold tracking-tight text-foreground">{keyword.label}</h3>
              <p className="max-h-10 overflow-hidden text-xs leading-relaxed text-muted-foreground">
                {keyword.description}
              </p>
            </div>
            <div className="mt-auto pt-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  selected ? "text-violet-100" : "text-muted-foreground",
                )}
              >
                {selected ? <Check className="size-3.5" /> : null}
                {selected ? "In movement tray" : disabled ? "Max 2 selected" : "Select movement"}
              </span>
            </div>
          </>
        )}
      </div>
    </button>
  );
}

export default function FlowPage() {
  const router = useRouter();
  const {
    selectedFlowKeywordIds,
    toggleFlowKeyword,
    playlistTypeId,
    setPlaylistTypeId,
    availableFlowKeywords,
    isReadyToSequence,
    sequenceBlocker,
    resolvedTracks,
    playlistSource,
    youtubeImport,
    spotifyImport,
    importedPlaylistName,
  } = useFlow();

  const showKeywordPicker = Boolean(playlistTypeId);
  const selectedKeywords = useMemo(
    () => selectedFlowKeywordIds.map((id) => availableFlowKeywords.find((kw) => kw.id === id)).filter(Boolean),
    [selectedFlowKeywordIds, availableFlowKeywords],
  );

  const playlistFitPreview = useMemo(
    () => analyzePlaylistFit(resolvedTracks, { playlistTitle: importedPlaylistName }),
    [resolvedTracks, importedPlaylistName],
  );

  const mixedMessFitHint =
    playlistTypeId === "mixed_mess" &&
    (playlistFitPreview.level === "moderately_consistent" ||
      playlistFitPreview.level === "highly_consistent");

  return (
    <AppFrame contentClassName="max-w-6xl">
      <div className="flow-page-in flex flex-1 flex-col gap-5 pb-24">
        <FlowStepper current={playlistTypeId ? 2 : 1} />

        {resolvedTracks.length === 0 ? (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            No tracks loaded.{" "}
            <Link href="/playlist" className="font-medium underline underline-offset-2">
              Add a YouTube playlist, manual lines, or the demo on the import page
            </Link>
            .
          </p>
        ) : (
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
        )}

        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 px-3 py-2.5 text-sm leading-relaxed text-violet-50/95">
          <p className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-200" />
            <span>
              Flowlist works best with messy playlists: mixed genres, mood shifts, and strange
              transitions give the sequencer more room to create a meaningful journey. Already
              perfectly consistent playlists may not change much — the magic happens when there is
              chaos to organize.
            </span>
          </p>
        </div>

        <section id="type" className="space-y-3 scroll-mt-8">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200/70">
              Step 2 · Define Playlist Type
            </p>
            <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              What kind of playlist is this?
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Pick the musical world you’re working with. This helps Flowlist choose the right
              sequencing logic.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-sm leading-relaxed text-amber-50/95">
            <span className="font-medium text-amber-100">Not sure? Choose Mixed Mess.</span>{" "}
            It’s the best showcase for Flowlist’s sequencing strength.
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

        <section id="keywords" className="space-y-3 scroll-mt-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200/70">
                Step 3 · Choose Flow Keywords
              </p>
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                How should the journey move?
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Choose up to 2 flow directions. Some combinations conflict and can’t be selected
                together.
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
              Pick a playlist type above to see flow options tailored to it.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {availableFlowKeywords.map((kw, index) => {
                const checked = selectedFlowKeywordIds.includes(kw.id);
                const conflict = checked ? null : conflictFor(kw.id, selectedFlowKeywordIds);
                const conflictLabel = conflict
                  ? availableFlowKeywords.find((candidate) => candidate.id === conflict.labelId)?.label ?? null
                  : null;
                const disabled =
                  !checked && (selectedFlowKeywordIds.length >= MAX_FLOW_KEYWORDS || Boolean(conflict));
                return (
                  <FlowCard
                    key={kw.id}
                    keyword={kw}
                    index={index}
                    selected={checked}
                    disabled={disabled}
                    conflictLabel={conflictLabel}
                    conflictMessage={conflict?.message ?? null}
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
              href="/playlist"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Edit import
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
              Shuffle the journey
              <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </AppFrame>
  );
}
