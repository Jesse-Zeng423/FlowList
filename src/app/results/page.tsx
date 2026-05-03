"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Layers3,
  ListMusic,
  Music2,
  Sparkles,
  Waves,
} from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type {
  AudioFeatures,
  JourneyRole,
  Phase,
  SequencedChapter,
  SequencedPlaylistSnapshot,
  SequencedTrack,
  TrackAnalysis,
  TransitionInsight,
} from "@/types/flowlist";
import { cn } from "@/lib/utils";

const PHASE_ORDER: Phase[] = ["Intro", "Build", "Peak", "Cooldown", "Outro"];

function phaseFightsMoodRibbon(role: JourneyRole | null | undefined, phase: Phase): boolean {
  if (!role) return false;
  if (
    role === "resolve" &&
    (phase === "Peak" || phase === "Intro" || phase === "Build")
  )
    return true;
  return false;
}

/** Honest one-liner for audio-feature provenance. Never claim audio analysis. */
function audioFeatureSourceLabel(f: AudioFeatures): string {
  switch (f.source) {
    case "third_party":
      return "Audio features: third-party lookup";
    case "ai_estimated":
      return "Audio features: AI estimate";
    case "unavailable":
      return "Audio features: unavailable";
    case "prototype":
    default:
      return "Audio features: prototype estimate";
  }
}

/** Format BPM honestly: exact only for reliable sources, range otherwise. */
function bpmDisplay(f: AudioFeatures): string | null {
  const reliable = f.source === "third_party" || f.source === "ai_estimated";
  if (reliable && typeof f.bpm === "number" && Number.isFinite(f.bpm)) {
    return `BPM ${Math.round(f.bpm)}`;
  }
  if (f.bpmRange) return `BPM range ${f.bpmRange}`;
  return null;
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatGeneratedAt(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function phaseBadgeClass(phase: SequencedTrack["phase"]) {
  switch (phase) {
    case "Intro":
      return "border-sky-400/40 bg-sky-500/15 text-sky-100";
    case "Build":
      return "border-violet-400/40 bg-violet-500/15 text-violet-100";
    case "Peak":
      return "border-amber-400/40 bg-amber-500/15 text-amber-100";
    case "Cooldown":
      return "border-emerald-400/35 bg-emerald-500/12 text-emerald-100";
    case "Outro":
      return "border-white/25 bg-white/10 text-zinc-100";
    default:
      return "";
  }
}

function ArtistLine({ track }: { track: TrackAnalysis }) {
  const conf = track.artistConfidence ?? "parsed";
  if (conf === "channel_fallback") {
    return (
      <p className="truncate text-xs text-muted-foreground">
        <span className="font-medium text-muted-foreground/90">Source channel · </span>
        {track.artist}
      </p>
    );
  }
  if (conf === "unknown") {
    return <p className="text-xs text-muted-foreground">Artist unknown</p>;
  }
  return <p className="truncate text-xs text-muted-foreground">{track.artist}</p>;
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

interface DisplayGroup {
  id: string;
  label: string;
  subtitle: string;
  tags: string[];
  tracks: SequencedTrack[];
  startIndex: number;
  avgEnergy: number;
  avgRhythm: number;
  accent: string;
  moodJourneyRibbon: string | null;
  moodJourneyRole: JourneyRole | null;
}

function chapterGroups(tracks: SequencedTrack[], chapters: SequencedChapter[]): DisplayGroup[] {
  return chapters.map((chapter, index) => {
    const slice = tracks.slice(chapter.fromIndex, chapter.toIndex + 1);
    const moodTitle =
      chapter.signature.dominantMood ||
      chapter.label.replace(/^Chapter \d+\s*[·.]?\s*/i, "").trim();
    const ribbon = chapter.roleName ?? null;
    return {
      id: `chapter-${chapter.index}`,
      label: moodTitle || chapter.label,
      subtitle:
        chapter.description ??
        `${
          moodTitle ? `${moodTitle} arc` : "This arc"
        } — clustered from prototype similarity, then sequenced locally for smooth continuity.`,
      tags: chapter.dominantMoodTags ?? [chapter.signature.dominantMood],
      tracks: slice,
      startIndex: chapter.fromIndex,
      avgEnergy: chapter.signature.avgEnergy,
      avgRhythm: chapter.signature.avgRhythm,
      accent: ["violet", "sky", "amber", "emerald", "fuchsia", "rose"][index % 6] ?? "violet",
      moodJourneyRibbon: ribbon,
      moodJourneyRole: chapter.journeyRole ?? null,
    };
  });
}

function phaseGroups(tracks: SequencedTrack[]): DisplayGroup[] {
  const groups: Array<DisplayGroup | null> = PHASE_ORDER.map((phase, index) => {
    const firstIndex = tracks.findIndex((track) => track.phase === phase);
    const slice = tracks.filter((track) => track.phase === phase);
    if (slice.length === 0) return null;
    return {
      id: `phase-${phase}`,
      label: phase,
      subtitle:
        phase === "Intro"
          ? "Opening cards that establish the world."
          : phase === "Build"
            ? "The sequence gathers motion and emotional direction."
            : phase === "Peak"
              ? "The highest-energy or most intense run."
              : phase === "Cooldown"
                ? "The journey starts settling into softer motion."
                : "The landing point for the sequence.",
      tags: [phase],
      tracks: slice,
      startIndex: firstIndex,
      avgEnergy: avg(slice.map((track) => track.estimatedEnergy)),
      avgRhythm: avg(slice.map((track) => track.rhythmIntensityScore)),
      accent: ["sky", "violet", "amber", "emerald", "zinc"][index] ?? "violet",
      moodJourneyRibbon: null,
      moodJourneyRole: null,
    };
  });
  return groups.filter((group): group is DisplayGroup => group !== null);
}

function buildGroups(tracks: SequencedTrack[], chapters?: SequencedChapter[]): DisplayGroup[] {
  if (chapters && chapters.length > 0) return chapterGroups(tracks, chapters);
  const grouped = phaseGroups(tracks);
  return grouped.length > 0
    ? grouped
    : [
        {
          id: "ordered",
          label: "Ordered spread",
          subtitle: "The generated sequence in listening order.",
          tags: ["ordered"],
          tracks,
          startIndex: 0,
          avgEnergy: avg(tracks.map((track) => track.estimatedEnergy)),
          avgRhythm: avg(tracks.map((track) => track.rhythmIntensityScore)),
          accent: "violet",
          moodJourneyRibbon: null,
          moodJourneyRole: null,
        },
      ];
}

function sourceDisplay(snapshot: SequencedPlaylistSnapshot | null) {
  if (!snapshot) return "Source snapshot";
  if (snapshot.source === "youtube") return "YouTube Music metadata";
  if (snapshot.source === "spotify") return "Spotify experimental";
  if (snapshot.source === "demo") return "Demo playlist";
  return snapshot.sourceLabel;
}

function energyBehavior(groups: DisplayGroup[]) {
  if (groups.length < 2) return "Energy behavior is shown in the grouped spread below.";
  const first = groups[0]!.avgEnergy;
  const last = groups[groups.length - 1]!.avgEnergy;
  const peak = Math.max(...groups.map((group) => group.avgEnergy));
  if (last > first + 1.2) return "Energy rises toward the later spread.";
  if (first > last + 1.2) return "Energy settles toward the landing.";
  if (peak > first + 1 && peak > last + 1) return "Energy forms a central peak before resolving.";
  return "Energy stays relatively even across the spread.";
}

function buildExportText(args: {
  tracks: SequencedTrack[];
  transitions: TransitionInsight[];
  moodArc: string;
  rhythmArc: string;
  playlistFitLabel: string | null;
  groups: DisplayGroup[];
  snapshot: SequencedPlaylistSnapshot | null;
}) {
  const { tracks, transitions, moodArc, rhythmArc, playlistFitLabel, groups, snapshot } = args;
  const lines: string[] = [];
  lines.push("Flowlist — sequenced order (mock analysis / prototype sequencing)");
  if (snapshot) {
    lines.push(`Playlist: ${snapshot.playlistName ?? "Untitled playlist"}`);
    lines.push(`Source: ${sourceDisplay(snapshot)}`);
    if (snapshot.sourceOwnerLabel) lines.push(`Source owner/channel: ${snapshot.sourceOwnerLabel}`);
    if (snapshot.playlistTypeLabel) lines.push(`Playlist type: ${snapshot.playlistTypeLabel}`);
    if (playlistFitLabel) lines.push(`Playlist fit: ${playlistFitLabel}`);
    lines.push(
      `Flow: ${
        snapshot.selectedFlowKeywords.length
          ? snapshot.selectedFlowKeywords.map((keyword) => keyword.label).join(" · ")
          : "(none)"
      }`,
    );
    lines.push(`Generated at: ${snapshot.generatedAt}`);
  }
  lines.push("Prototype sequencing based on metadata and estimated mood/rhythm.");
  lines.push("No audio is streamed or downloaded.");
  lines.push("");
  lines.push("Mood arc:", moodArc);
  lines.push("Rhythm arc:", rhythmArc);
  lines.push("");

  const groupByStart = new Map(groups.map((group) => [group.startIndex, group]));
  tracks.forEach((track, index) => {
    const group = groupByStart.get(index);
    if (group) lines.push(`-- ${group.label} (${group.tracks.length} tracks) --`);
    const credit =
      track.artistConfidence === "channel_fallback"
        ? `Source channel: ${track.artist}`
        : track.artistConfidence === "unknown"
          ? "Artist unknown"
          : track.artist;
    lines.push(`${index + 1}. ${track.title} — ${credit}`);
    lines.push(
      `   Phase: ${track.phase} · Energy: ${track.estimatedEnergy}/10 · Rhythm: ${track.rhythmIntensityScore}/100 · Tempo: ${track.tempoFeel}`,
    );
    const bpm = bpmDisplay(track.audioFeatures);
    if (bpm) lines.push(`   ${bpm}`);
    lines.push(`   ${audioFeatureSourceLabel(track.audioFeatures)}`);
    lines.push(`   Why here: ${track.positionReason}`);
    const transition = transitions[index - 1];
    if (transition) lines.push(`   Transition in: ${transition.explanation}`);
    lines.push("");
  });
  return lines.join("\n");
}

function MetricBars({ groups }: { groups: DisplayGroup[] }) {
  const maxSize = Math.max(...groups.map((group) => group.tracks.length), 1);
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-4 shadow-2xl shadow-black/25 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
            spread metrics
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-base font-semibold">
            <BarChart3 className="size-4 text-violet-200" />
            Energy / rhythm movement
          </h2>
        </div>
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-300/80" />
            Energy
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-violet-300/80" />
            Rhythm
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {[
          { key: "energy", label: "Energy", color: "from-amber-300/80 to-amber-500/30" },
          { key: "rhythm", label: "Rhythm", color: "from-violet-300/80 to-fuchsia-500/30" },
        ].map((metric) => (
          <div key={metric.key} className="grid grid-cols-[4rem_1fr] items-center gap-3">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <div className="flex h-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {groups.map((group, index) => {
                const value = metric.key === "energy" ? group.avgEnergy * 10 : group.avgRhythm;
                const width = Math.max(0.8, group.tracks.length / maxSize);
                return (
                  <div
                    key={`${metric.key}-${group.id}`}
                    className="group relative min-w-10 border-r border-black/30 last:border-r-0"
                    style={{ flexGrow: width }}
                  >
                    <div
                      className={cn(
                        "absolute bottom-0 left-0 right-0 origin-bottom rounded-t-xl bg-gradient-to-t opacity-85 shadow-[0_0_18px_rgba(168,85,247,0.14)]",
                        metric.color,
                      )}
                      style={{
                        height: `${Math.max(8, value)}%`,
                        animation: "result-bar-grow 650ms ease-out both",
                        animationDelay: `${index * 70}ms`,
                      }}
                    />
                    <span className="absolute inset-x-0 top-1 text-center text-[9px] text-muted-foreground">
                      {groups.length === 1 ? "All" : `Ch ${index + 1}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChapterOverview({ groups, hasChapters }: { groups: DisplayGroup[]; hasChapters: boolean }) {
  if (groups.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Layers3 className="size-4 text-violet-200" />
          {hasChapters ? "Chapter overview" : "Phase overview"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {hasChapters ? "Grouped by mood/rhythm similarity" : "Grouped by sequence phase"}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group, index) => (
          <article
            key={group.id}
            className="flow-page-in rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20 backdrop-blur-xl"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-100/60">
                  {hasChapters ? `Chapter ${index + 1}` : "Phase"}
                </p>
                {hasChapters && group.moodJourneyRibbon ? (
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200/90">
                    {group.moodJourneyRibbon}
                  </p>
                ) : null}
                <h3 className="mt-1 text-sm font-semibold text-foreground">{group.label}</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] text-muted-foreground">
                {group.tracks.length} tracks
              </span>
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {group.subtitle}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {group.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="border-white/10 bg-white/[0.03] text-[10px] font-normal text-muted-foreground"
                >
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>Energy {(group.avgEnergy * 10).toFixed(0)}</span>
              <span>Rhythm {group.avgRhythm.toFixed(0)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TrackCard({
  track,
  absoluteIndex,
  transition,
  moodJourneyRibbon,
  moodJourneyRole,
}: {
  track: SequencedTrack;
  absoluteIndex: number;
  transition: TransitionInsight | undefined;
  moodJourneyRibbon: string | null;
  moodJourneyRole: JourneyRole | null;
}) {
  const bpm = bpmDisplay(track.audioFeatures);
  const hidePhaseBadge =
    Boolean(moodJourneyRibbon) && phaseFightsMoodRibbon(moodJourneyRole, track.phase);
  const mutedPhaseBadge = Boolean(moodJourneyRibbon);

  return (
    <article className="rounded-[1.25rem] border border-white/10 bg-black/35 p-3 shadow-lg shadow-black/20 backdrop-blur-sm">
      <div className="flex gap-3">
        {track.importMeta?.thumbnailUrl ? (
          <Image
            src={track.importMeta.thumbnailUrl}
            alt={track.album}
            width={44}
            height={44}
            unoptimized
            className="size-11 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
            <Music2 className="size-4 text-white/35" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-[10px] font-medium tabular-nums text-muted-foreground">
                  {String(absoluteIndex + 1).padStart(2, "0")}
                </p>
                {moodJourneyRibbon ? (
                  <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-200/90">
                    {moodJourneyRibbon}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                {track.importMeta?.externalUrl ? (
                  <a
                    href={track.importMeta.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-violet-200 hover:underline"
                  >
                    {track.title}
                  </a>
                ) : (
                  track.title
                )}
              </p>
              <ArtistLine track={track} />
            </div>
            {!hidePhaseBadge ? (
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 border text-[10px] font-medium",
                  phaseBadgeClass(track.phase),
                  mutedPhaseBadge ? "opacity-70" : "",
                )}
              >
                {track.phase}
              </Badge>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="bg-white/5 text-[10px] font-normal text-foreground/90">
              Energy {track.estimatedEnergy}/10
            </Badge>
            <Badge variant="secondary" className="bg-white/5 text-[10px] font-normal text-foreground/90">
              Tempo {track.tempoFeel}
            </Badge>
            <Badge variant="secondary" className="bg-white/5 text-[10px] font-normal text-foreground/90">
              Rhythm {track.rhythmIntensityScore}
            </Badge>
            {bpm ? (
              <Badge variant="secondary" className="bg-white/5 text-[10px] font-normal text-foreground/90">
                {bpm}
              </Badge>
            ) : null}
            {track.importMeta?.durationMs != null && track.importMeta.durationMs > 0 ? (
              <Badge variant="outline" className="border-white/10 text-[10px] font-normal text-muted-foreground">
                {formatDuration(track.importMeta.durationMs)}
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="border-white/10 text-[10px] font-normal text-muted-foreground"
              title={`Confidence ${(track.audioFeatures.confidence * 100).toFixed(0)}%`}
            >
              {audioFeatureSourceLabel(track.audioFeatures)}
            </Badge>
          </div>
          {transition ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/70">Transition in: </span>
              {transition.explanation}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/70">Why here: </span>
            {track.positionReason}
          </p>
        </div>
      </div>
    </article>
  );
}

function EmptyState({
  stale,
}: {
  stale: boolean;
}) {
  return (
    <AppFrame contentClassName="max-w-4xl">
      <div className="flow-page-in flex flex-1 flex-col items-start justify-center gap-4 pb-8">
        <div className="rounded-[1.75rem] border border-white/10 bg-black/35 p-5 shadow-2xl shadow-black/25 backdrop-blur-xl">
          <h1 className="text-2xl font-semibold tracking-tight">
            {stale ? "Your playlist or flow settings changed." : "No sequence generated yet."}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {stale
              ? "Generate a new sequence to see updated results."
              : "Start sequencing to import a playlist, choose a flow, and deal a curated spread."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={stale ? "/flow" : "/playlist"}
              className={cn(buttonVariants({ variant: "default" }), "rounded-full no-underline")}
            >
              {stale ? "Generate new sequence" : "Start sequencing"}
            </Link>
            <Link
              href="/playlist"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "rounded-full bg-white/10 no-underline",
              )}
            >
              Back to import
            </Link>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

export default function ResultsPage() {
  const { result, resultIsStale, reset } = useFlow();
  const [copied, setCopied] = useState(false);

  const groups = useMemo(
    () => (result ? buildGroups(result.tracks, result.chapters) : []),
    [result],
  );

  const exportText = useMemo(() => {
    if (!result) return "";
    return buildExportText({
      tracks: result.tracks,
      transitions: result.transitions,
      moodArc: result.moodArcSummary,
      rhythmArc: result.rhythmArcSummary,
      playlistFitLabel: result.playlistFit?.label ?? null,
      groups,
      snapshot: result.snapshot ?? null,
    });
  }, [groups, result]);

  const transitionByToIndex = useMemo(() => {
    const map = new Map<number, TransitionInsight>();
    for (const transition of result?.transitions ?? []) map.set(transition.toIndex, transition);
    return map;
  }, [result?.transitions]);

  const handleCopy = async () => {
    if (!exportText) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    if (!exportText) return;
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowlist-sequence.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!result) return <EmptyState stale={resultIsStale} />;

  if (result.tracks.length === 0) {
    return (
      <AppFrame contentClassName="max-w-4xl">
        <div className="flow-page-in flex flex-1 flex-col items-start justify-center gap-4 pb-8">
          <div className="rounded-[1.75rem] border border-amber-500/30 bg-amber-500/10 p-5 text-amber-50/95">
            <h1 className="text-2xl font-semibold tracking-tight">No usable tracks to sequence.</h1>
            <p className="mt-2 text-sm text-amber-100/80">
              Try another playlist or paste tracks manually.
            </p>
            <Link
              href="/playlist"
              className={cn(buttonVariants({ variant: "default" }), "mt-4 rounded-full no-underline")}
            >
              Back to import
            </Link>
          </div>
        </div>
      </AppFrame>
    );
  }

  const {
    tracks,
    moodArcSummary,
    rhythmArcSummary,
    skippedUnavailableCount,
    playlistFit,
    snapshot,
    chapters,
  } = result;
  const generatedAt = formatGeneratedAt(snapshot?.generatedAt);
  const hasChapters = Boolean(chapters && chapters.length > 0);
  const snapshotFlowLabels = snapshot?.selectedFlowKeywords.map((keyword) => keyword.label) ?? [];

  return (
    <AppFrame contentClassName="max-w-7xl">
      <div className="flow-page-in flex flex-1 flex-col gap-7 pb-10">
        {resultIsStale ? (
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-50/95">
            Your playlist or flow settings changed. Generate a new sequence to see updated results.
          </div>
        ) : null}

        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/35 p-5 shadow-2xl shadow-black/35 backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(167,139,250,0.18),transparent_45%)]" />
          <div className="relative grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div className="space-y-4">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/80">
                <Sparkles className="size-3.5" />
                Final dealt spread
              </p>
              <div>
                <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  {snapshot?.playlistName ?? "Your sequence"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Prototype sequencing based on metadata and estimated mood/rhythm. No audio is
                  streamed or downloaded.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-emerald-300/25 bg-emerald-500/10 text-emerald-100">
                  {sourceDisplay(snapshot ?? null)}
                </Badge>
                {snapshot?.playlistTypeLabel ? (
                  <Badge variant="outline" className="border-violet-300/25 bg-violet-500/10 text-violet-100">
                    {snapshot.playlistTypeLabel}
                  </Badge>
                ) : null}
                {snapshotFlowLabels.map((label) => (
                  <Badge key={label} variant="outline" className="border-white/15 bg-white/[0.04] text-muted-foreground">
                    {label}
                  </Badge>
                ))}
                {playlistFit ? (
                  <Badge variant="outline" className="border-sky-300/20 bg-sky-500/10 text-sky-100">
                    {playlistFit.label}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="border-amber-300/20 bg-amber-500/10 text-amber-100">
                  Prototype sequencing
                </Badge>
                <Badge variant="outline" className="border-white/15 bg-white/[0.04] text-muted-foreground">
                  Estimated mood/rhythm
                </Badge>
                <Badge variant="outline" className="border-white/15 bg-white/[0.04] text-muted-foreground">
                  {snapshot?.audioFeatureSourceSummary ?? "BPM ranges approximate"}
                </Badge>
                {snapshot?.source === "demo" ? (
                  <Badge variant="outline" className="border-violet-300/25 bg-violet-500/10 text-violet-100">
                    Demo / mock data
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
                sequence receipt
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Tracks</dt>
                  <dd className="font-medium text-foreground">{snapshot?.trackCount ?? tracks.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Generated</dt>
                  <dd className="font-medium text-foreground">{generatedAt ?? "Just now"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Snapshot</dt>
                  <dd className="font-medium text-foreground">Source locked</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Mode</dt>
                  <dd className="font-medium text-foreground">
                    {snapshot?.analysisMode === "prototype" ? "Prototype" : "Prototype"}
                  </dd>
                </div>
              </dl>
              {snapshot?.playlistExternalUrl ? (
                <a
                  href={snapshot.playlistExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-violet-200 underline-offset-4 hover:underline"
                >
                  Open source playlist
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          </div>
        </section>

        {skippedUnavailableCount != null && skippedUnavailableCount > 0 ? (
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-50/95">
            Some unavailable YouTube videos were skipped.
          </div>
        ) : null}

        <section className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Waves className="size-4 text-violet-200" />
              Mood arc
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{moodArcSummary}</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4 text-amber-200" />
              Rhythm arc
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{rhythmArcSummary}</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="size-4 text-emerald-200" />
              Energy behavior
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{energyBehavior(groups)}</p>
          </div>
        </section>

        <MetricBars groups={groups} />
        <ChapterOverview groups={groups} hasChapters={hasChapters} />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <ListMusic className="size-4 text-violet-200" />
              Dealt track spread
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-white/15 bg-white/5"
                onClick={handleCopy}
              >
                {copied ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy sequence"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-white/15 bg-white/5"
                onClick={handleDownload}
              >
                <Download className="size-4" />
                Export as text
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {groups.map((group, groupIndex) => (
              <details
                key={group.id}
                open={groupIndex < 2}
                className="rounded-[1.75rem] border border-white/10 bg-black/25 p-4 shadow-xl shadow-black/20 backdrop-blur-xl"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
                        {hasChapters ? `Chapter ${groupIndex + 1}` : "Phase section"}
                      </p>
                      {hasChapters && group.moodJourneyRibbon ? (
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/90">
                          {group.moodJourneyRibbon}
                        </p>
                      ) : null}
                      <h3 className="mt-1 text-base font-semibold text-foreground">{group.label}</h3>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                        {group.subtitle}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-[10px] text-muted-foreground">
                        {group.tracks.length} tracks
                      </Badge>
                      <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-[10px] text-muted-foreground">
                        Energy {(group.avgEnergy * 10).toFixed(0)}
                      </Badge>
                      <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-[10px] text-muted-foreground">
                        Rhythm {group.avgRhythm.toFixed(0)}
                      </Badge>
                    </div>
                  </div>
                </summary>
                <Separator className="my-3 bg-white/10" />
                <div className="grid gap-2 xl:grid-cols-2">
                  {group.tracks.map((track, localIndex) => {
                    const absoluteIndex = group.startIndex + localIndex;
                    return (
                      <TrackCard
                        key={`${track.id}-${absoluteIndex}`}
                        track={track}
                        absoluteIndex={absoluteIndex}
                        transition={transitionByToIndex.get(absoluteIndex)}
                        moodJourneyRibbon={group.moodJourneyRibbon}
                        moodJourneyRole={group.moodJourneyRole}
                      />
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap justify-between gap-3 border-t border-white/10 pt-6">
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => reset()}>
            Reset session
          </Button>
          <Link
            href="/flow"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <FileText className="size-3.5" />
            Adjust flow keywords
          </Link>
        </div>
      </div>
    </AppFrame>
  );
}
