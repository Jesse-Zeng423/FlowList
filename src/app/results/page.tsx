"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ListMusic,
  Waves,
} from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { canRegenerateFromCurrentState } from "@/lib/result-freshness";
import { playResultReady } from "@/lib/sound-effects";
import { cn } from "@/lib/utils";
import type {
  AudioFeatures,
  SequencedChapter,
  SequencedPlaylistSnapshot,
  SequencedTrack,
  TrackAnalysis,
  TransitionInsight,
} from "@/types/flowlist";

function audioFeatureSourceLabel(features: AudioFeatures): string {
  switch (features.source) {
    case "third_party":
      return "Third-party lookup";
    case "ai_estimated":
      return "AI estimate";
    case "unavailable":
      return "Unavailable";
    case "prototype":
    default:
      return "Prototype estimate";
  }
}

function bpmDisplay(features: AudioFeatures): string | null {
  const reliable = features.source === "third_party" || features.source === "ai_estimated";
  if (reliable && typeof features.bpm === "number" && Number.isFinite(features.bpm)) {
    return `BPM ${Math.round(features.bpm)}`;
  }
  return features.bpmRange ? `BPM range ${features.bpmRange}` : null;
}

function formatGeneratedAt(value: string | undefined) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sourceDisplay(snapshot: SequencedPlaylistSnapshot | null) {
  if (!snapshot) return "Source snapshot";
  if (snapshot.source === "youtube") return "YouTube Music metadata";
  if (snapshot.source === "spotify") return "Spotify experimental";
  if (snapshot.source === "demo") return "Demo playlist";
  return snapshot.sourceLabel;
}

function ArtistLine({ track }: { track: TrackAnalysis }) {
  if (track.artistConfidence === "channel_fallback") {
    return (
      <span className="truncate text-xs text-white/50">
        <span className="font-medium text-white/62">Source channel</span> · {track.artist}
      </span>
    );
  }
  return (
    <span className="truncate text-xs text-white/50">
      {track.artistConfidence === "unknown" ? "Artist unknown" : track.artist}
    </span>
  );
}

interface OrderGroup {
  id: string;
  label: string | null;
  role: string | null;
  tracks: SequencedTrack[];
  startIndex: number;
}

function buildOrderGroups(tracks: SequencedTrack[], chapters?: SequencedChapter[]): OrderGroup[] {
  if (!chapters?.length) {
    return [
      {
        id: "order",
        label: null,
        role: null,
        tracks,
        startIndex: 0,
      },
    ];
  }
  return chapters.map((chapter) => {
    const chapterTracks = tracks.slice(chapter.fromIndex, chapter.toIndex + 1);
    return {
      id: `chapter-${chapter.index}`,
      label: chapter.label,
      role: chapter.roleName ?? null,
      tracks: chapterTracks,
      startIndex: chapter.fromIndex,
    };
  });
}

function buildExportText({
  tracks,
  transitions,
  snapshot,
}: {
  tracks: SequencedTrack[];
  transitions: TransitionInsight[];
  snapshot: SequencedPlaylistSnapshot | null;
}) {
  const lines = ["Flowlist - sequenced order (prototype sequencing)"];
  if (snapshot) {
    lines.push(`Playlist: ${snapshot.playlistName ?? "Untitled playlist"}`);
    lines.push(`Source: ${sourceDisplay(snapshot)}`);
    if (snapshot.playlistTypeLabel) lines.push(`Playlist type: ${snapshot.playlistTypeLabel}`);
    lines.push(`Flow: ${snapshot.selectedFlowKeywords.map((keyword) => keyword.label).join(" / ") || "(none)"}`);
    lines.push(`Generated at: ${snapshot.generatedAt}`);
  }
  lines.push("Estimated mood/rhythm. BPM ranges approximate.");
  lines.push("No audio is streamed or downloaded.");
  lines.push("");
  tracks.forEach((track, index) => {
    const artist =
      track.artistConfidence === "channel_fallback"
        ? `Source channel: ${track.artist}`
        : track.artistConfidence === "unknown"
          ? "Artist unknown"
          : track.artist;
    lines.push(`${index + 1}. ${track.title} - ${artist}`);
    const bpm = bpmDisplay(track.audioFeatures);
    lines.push(
      `   ${track.phase} / Energy ${track.estimatedEnergy} / Rhythm ${track.rhythmIntensityScore} / ${track.tempoFeel} tempo${bpm ? ` / ${bpm}` : ""}`,
    );
    lines.push(`   Why here: ${track.positionReason}`);
    const transition = transitions.find((item) => item.toIndex === index);
    if (transition) lines.push(`   Transition: ${transition.explanation}`);
    lines.push("");
  });
  return lines.join("\n");
}

function TrackRow({
  track,
  position,
  transition,
}: {
  track: SequencedTrack;
  position: number;
  transition?: TransitionInsight;
}) {
  const bpm = bpmDisplay(track.audioFeatures);
  return (
    <article className="border-b border-white/7 py-2.5 last:border-b-0">
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-start">
        <span className="pt-0.5 text-right font-mono text-xs text-white/32">
          {String(position + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#faf1e2]">
            {track.importMeta?.externalUrl ? (
              <a
                href={track.importMeta.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#cadcd3] hover:underline"
              >
                {track.title}
              </a>
            ) : (
              track.title
            )}
          </p>
          <ArtistLine track={track} />
          <p className="mt-1 text-[11px] text-white/43">
            Energy {track.estimatedEnergy} · Rhythm {track.rhythmIntensityScore} · {track.tempoFeel} tempo
            {bpm ? ` · ${bpm}` : ""}
          </p>
        </div>
        <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-auto sm:justify-end">
          <Badge variant="outline" className="border-white/12 bg-white/[0.04] text-[10px] font-normal text-white/60">
            {track.phase}
          </Badge>
          {track.semanticPhaseRibbon ? (
            <Badge variant="outline" className="border-[#779e8e]/28 bg-[#245343]/20 text-[10px] font-normal text-[#d5e2da]">
              {track.semanticPhaseRibbon}
            </Badge>
          ) : null}
        </div>
      </div>
      <details className="group ml-11 mt-1.5 text-xs text-white/48">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-white/42 hover:text-white/68">
          <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
          Why here{transition ? " / Transition" : ""}
        </summary>
        <div className="mt-2 space-y-1.5 rounded-lg bg-black/18 px-3 py-2 leading-relaxed">
          <p>
            <span className="font-medium text-white/66">Why here: </span>
            {track.positionReason}
          </p>
          {transition ? (
            <p>
              <span className="font-medium text-white/66">Transition: </span>
              {transition.explanation}
            </p>
          ) : null}
          <p className="text-white/38">{audioFeatureSourceLabel(track.audioFeatures)}</p>
        </div>
      </details>
    </article>
  );
}

function ArcMiniBars({ tracks }: { tracks: SequencedTrack[] }) {
  const sample =
    tracks.length <= 26
      ? tracks
      : Array.from({ length: 26 }, (_, index) => tracks[Math.floor((index * tracks.length) / 26)]!);
  return (
    <div className="space-y-3">
      {[
        { label: "Energy", value: (track: SequencedTrack) => track.estimatedEnergy * 10, color: "bg-[#9b3944]" },
        { label: "Rhythm", value: (track: SequencedTrack) => track.rhythmIntensityScore, color: "bg-[#629886]" },
      ].map((metric) => (
        <div key={metric.label}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">{metric.label}</p>
          <div className="flex h-9 items-end gap-[2px]">
            {sample.map((track, index) => (
              <span
                key={`${metric.label}-${track.id}-${index}`}
                className={cn("min-w-0 flex-1 rounded-t-sm opacity-85", metric.color)}
                style={{ height: `${Math.max(7, metric.value(track))}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  stale,
  resolvedTrackCount,
  playlistTypeId,
  selectedFlowKeywordIds,
}: {
  stale: boolean;
  resolvedTrackCount: number;
  playlistTypeId: string | null;
  selectedFlowKeywordIds: string[];
}) {
  const regeneration = canRegenerateFromCurrentState({
    resolvedTrackCount,
    playlistTypeId,
    selectedFlowKeywordIds,
  });
  const target = stale
    ? regeneration.canRegenerate
      ? { href: "/analyze", label: "Generate new sequence" }
      : regeneration.missing[0] === "tracks"
        ? { href: "/import", label: "Start sequencing" }
        : regeneration.missing[0] === "playlistType"
          ? { href: "/playlist-type", label: "Choose playlist type" }
          : { href: "/flow", label: "Choose flow keywords" }
    : { href: "/import", label: "Start sequencing" };

  return (
    <AppFrame contentClassName="max-w-xl">
      <div className="flow-page-in flex flex-1 items-center pb-14">
        <section className="table-panel w-full rounded-xl p-6">
          <h1 className="flow-display text-3xl font-semibold text-[#faf1e2]">
            {stale ? "Your settings changed." : "No sequence generated yet."}
          </h1>
          <p className="mt-2 text-sm text-white/52">
            {stale ? "Generate a fresh result from the current playlist and flow selections." : "Bring in a playlist to deal a new order."}
          </p>
          <Link href={target.href} className={cn(buttonVariants({ size: "lg" }), "mt-5 inline-flex rounded-lg no-underline")}>
            {target.label}
          </Link>
        </section>
      </div>
    </AppFrame>
  );
}

export default function ResultsPage() {
  const { result, resultIsStale, resolvedTracks, playlistTypeId, selectedFlowKeywordIds, reset } = useFlow();
  const [copied, setCopied] = useState(false);

  // Play once when arriving from a fresh generation. The flag is written by analyze/page.tsx
  // immediately before router.replace("/results") and consumed here to avoid replaying on
  // page refresh or direct navigation.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem("flowlist:fresh-result") === "1") {
        window.sessionStorage.removeItem("flowlist:fresh-result");
        playResultReady();
      }
    } catch {}
  }, []);
  const groups = useMemo(() => (result ? buildOrderGroups(result.tracks, result.chapters) : []), [result]);
  const transitionByIndex = useMemo(() => {
    const map = new Map<number, TransitionInsight>();
    result?.transitions.forEach((transition) => map.set(transition.toIndex, transition));
    return map;
  }, [result]);
  const exportText = useMemo(
    () => (result ? buildExportText({ tracks: result.tracks, transitions: result.transitions, snapshot: result.snapshot ?? null }) : ""),
    [result],
  );

  if (!result) {
    return (
      <EmptyState
        stale={resultIsStale}
        resolvedTrackCount={resolvedTracks.length}
        playlistTypeId={playlistTypeId}
        selectedFlowKeywordIds={selectedFlowKeywordIds}
      />
    );
  }

  if (result.tracks.length === 0) {
    return (
      <AppFrame contentClassName="max-w-xl">
        <div className="flow-page-in flex flex-1 items-center pb-14">
          <section className="table-panel w-full rounded-xl p-6">
            <h1 className="flow-display text-2xl font-semibold">No usable tracks to sequence.</h1>
            <Link href="/import" className={cn(buttonVariants(), "mt-5 rounded-lg no-underline")}>Start sequencing</Link>
          </section>
        </div>
      </AppFrame>
    );
  }

  const { tracks, playlistFit, snapshot, skippedUnavailableCount, moodArcSummary, rhythmArcSummary } = result;
  const flowLabels = snapshot?.selectedFlowKeywords.map((keyword) => keyword.label) ?? [];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "flowlist-sequence.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppFrame contentClassName="max-w-6xl">
      <div className="flow-page-in flex flex-1 flex-col gap-5 pb-8">
        <header className="result-header-in">
          <h1 className="flow-display text-3xl font-semibold text-[#faf1e2] sm:text-4xl">Your reordered playlist is ready</h1>
          <p className="mt-1 text-sm text-white/53">
            A prototype listening order based on playlist metadata and estimated mood/rhythm.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              sourceDisplay(snapshot ?? null),
              snapshot?.playlistTypeLabel,
              ...flowLabels,
              "Prototype sequencing",
              "Estimated mood/rhythm",
              "BPM ranges approximate",
              "No audio streamed or downloaded",
            ]
              .filter((label): label is string => Boolean(label))
              .map((label) => (
                <Badge key={label} variant="outline" className="border-white/12 bg-black/18 text-[10px] font-normal text-white/63">
                  {label}
                </Badge>
              ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-lg border-white/14 bg-black/16" onClick={handleCopy}>
              {copied ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy sequence"}
            </Button>
            <Button type="button" variant="outline" className="rounded-lg border-white/14 bg-black/16" onClick={handleDownload}>
              <Download className="size-4" />
              Export as text
            </Button>
          </div>
        </header>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <main className="table-panel result-order-in rounded-xl p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flow-display flex items-center gap-2 text-xl font-semibold text-[#fbf1e1]">
                <ListMusic className="size-4 text-[#cddbd2]" />
                Sequenced order
              </h2>
              <span className="text-xs text-white/40">{tracks.length} tracks</span>
            </div>
            {skippedUnavailableCount != null && skippedUnavailableCount > 0 ? (
              <p className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                Some unavailable YouTube videos were skipped.
              </p>
            ) : null}
            {groups.map((group, groupIndex) => (
              <section
                key={group.id}
                className={cn("result-group-in", groupIndex > 0 ? "mt-5" : "")}
                style={{ animationDelay: `${Math.min(groupIndex, 4) * 38 + 170}ms` }}
              >
                {group.label ? (
                  <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b border-[#7c9c8e]/25 pb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b96c75]">
                      Chapter {groupIndex + 1}
                    </span>
                    <h3 className="text-sm font-medium text-white/76">{group.label}</h3>
                    {group.role ? <span className="text-xs text-white/40">{group.role}</span> : null}
                  </div>
                ) : null}
                {group.tracks.map((track, localIndex) => {
                  const position = group.startIndex + localIndex;
                  return (
                    <TrackRow
                      key={`${track.id}-${position}`}
                      track={track}
                      position={position}
                      transition={transitionByIndex.get(position)}
                    />
                  );
                })}
              </section>
            ))}
          </main>

          <aside className="result-summary-in space-y-3 lg:sticky lg:top-4">
            <section className="table-panel rounded-xl p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/37">Snapshot</p>
              <dl className="space-y-2 text-xs">
                {[
                  ["Tracks", String(snapshot?.trackCount ?? tracks.length)],
                  ["Source", sourceDisplay(snapshot ?? null)],
                  ["Playlist fit", playlistFit?.label ?? "Prototype fit"],
                  ["Flow", flowLabels.join(" / ") || "Selected flow"],
                  ["Generated", formatGeneratedAt(snapshot?.generatedAt)],
                ].map(([term, value]) => (
                  <div key={term} className="border-b border-white/6 pb-2 last:border-0 last:pb-0">
                    <dt className="text-white/36">{term}</dt>
                    <dd className="mt-0.5 leading-snug text-white/72">{value}</dd>
                  </div>
                ))}
              </dl>
              {snapshot?.playlistExternalUrl ? (
                <a
                  href={snapshot.playlistExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[#bdd5ca] hover:underline"
                >
                  Open source
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </section>
            <section className="table-panel rounded-xl p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/37">Energy / Rhythm</p>
              <ArcMiniBars tracks={tracks} />
              <p className="mt-3 text-[10px] leading-relaxed text-white/37">
                BPM ranges approximate. No audio is analyzed.
              </p>
            </section>
            <details className="table-panel rounded-xl p-4 text-xs text-white/52">
              <summary className="cursor-pointer font-medium text-white/68">Method notes</summary>
              <p className="mt-3 flex gap-2">
                <Waves className="mt-0.5 size-3.5 shrink-0 text-[#c5dad1]" />
                {moodArcSummary}
              </p>
              <p className="mt-2 flex gap-2">
                <Activity className="mt-0.5 size-3.5 shrink-0 text-[#72a391]" />
                {rhythmArcSummary}
              </p>
            </details>
          </aside>
        </div>

        <footer className="flex flex-wrap justify-between gap-3 border-t border-white/8 pt-4">
          <Button type="button" variant="ghost" className="text-white/50" onClick={() => reset()}>
            Reset session
          </Button>
          <Link href="/flow" className="inline-flex items-center gap-1 text-sm text-white/52 hover:text-white/78">
            <FileText className="size-3.5" />
            Adjust flow keywords
          </Link>
        </footer>
      </div>
    </AppFrame>
  );
}
