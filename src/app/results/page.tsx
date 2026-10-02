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
  ArrowDown,
  ArrowUp,
  Lock,
  Unlock,
  Waves,
} from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { canRegenerateFromCurrentState } from "@/lib/result-freshness";
import { buildOrderExport } from "@/lib/build-order-export";
import { makeYouTubeExportDraft, YOUTUBE_EXPORT_KEY } from "@/lib/youtube-export-draft";
import { makeAppleExportDraft, APPLE_EXPORT_KEY } from "@/lib/apple-export-draft";
import { featureTrust, moveOccurrence, orderedOccurrences } from "@/lib/result-editor";
import { buildTransitions } from "@/lib/transitions";
import { combineResolvedFlowSemantics } from "@/lib/flow-semantics";
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
  if (snapshot.source === "apple") return "Apple Music library";
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
  manuallyEdited,
}: {
  tracks: SequencedTrack[];
  transitions: TransitionInsight[];
  snapshot: SequencedPlaylistSnapshot | null;
  manuallyEdited: boolean;
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
    lines.push(`   Why here: ${manuallyEdited ? "Placed here manually; original position note no longer applies." : track.positionReason}`);
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
  originalPosition,
  manualOrder,
  canMoveUp,
  canMoveDown,
  onMove,
  rating,
  onRate,
}: {
  track: SequencedTrack;
  position: number;
  transition?: TransitionInsight;
  originalPosition: number;
  manualOrder: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  rating?: "smooth" | "jarring" | "unsure";
  onRate: (rating: "smooth" | "jarring" | "unsure") => void;
}) {
  const bpm = bpmDisplay(track.audioFeatures);
  const trust = featureTrust(track);
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
          <p className="mt-1 text-[11px] text-white/48" title={trust.detail}>
            Features: {trust.label}{originalPosition !== position ? ` · was #${originalPosition + 1}` : ""}
          </p>
        </div>
        <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-auto sm:justify-end">
          {!manualOrder ? <Badge variant="outline" className="border-white/12 bg-white/[0.04] text-[10px] font-normal text-white/60">
            {track.phase}
          </Badge> : null}
          {!manualOrder && track.semanticPhaseRibbon ? (
            <Badge variant="outline" className="border-[#779e8e]/28 bg-[#245343]/20 text-[10px] font-normal text-[#d5e2da]">
              {track.semanticPhaseRibbon}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="ml-11 mt-1.5 flex flex-wrap items-center gap-1 text-xs">
        <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label={`Move ${track.title} up`} className="rounded border border-white/12 px-2 py-1 text-white/65 disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
        <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label={`Move ${track.title} down`} className="rounded border border-white/12 px-2 py-1 text-white/65 disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
        {transition ? <span className="ml-2 text-white/38">Transition:</span> : null}
        {transition ? (["smooth", "jarring", "unsure"] as const).map(value => (
          <button key={value} type="button" onClick={() => onRate(value)} aria-pressed={rating === value} className={cn("rounded border px-2 py-1 capitalize", rating === value ? "border-[#96b9a7] bg-[#245343]/40 text-white" : "border-white/10 text-white/45")}>{value}</button>
        )) : null}
      </div>
      <details className="group ml-11 mt-1.5 text-xs text-white/48">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-white/42 hover:text-white/68">
          <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
          Why here{transition ? " / Transition" : ""}
        </summary>
        <div className="mt-2 space-y-1.5 rounded-lg bg-black/18 px-3 py-2 leading-relaxed">
          <p><span className="font-medium text-white/66">Why here: </span>{manualOrder ? "Placed here manually. The transition below reflects the edited order." : track.positionReason}</p>
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
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [editor, setEditor] = useState<{ key: string; order: number[] } | null>(null);
  const [lockFirst, setLockFirst] = useState(false);
  const [lockLast, setLockLast] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackState, setFeedbackState] = useState<{ key: string; ratings: Record<string, "smooth" | "jarring" | "unsure"> }>(() => {
    const key = `flowlist:feedback:v1:${result?.snapshot?.inputFingerprint ?? "none"}`;
    if (typeof window === "undefined") return { key, ratings: {} };
    try { return { key, ratings: JSON.parse(window.localStorage.getItem(key) || "{}") }; }
    catch { return { key, ratings: {} }; }
  });
  const resultKey = result?.snapshot?.generatedAt ?? "";
  const indices = useMemo(() => result?.tracks.map((_, i) => i) ?? [], [result]);
  const order = editor?.key === resultKey && editor.order.length === indices.length ? editor.order : indices;
  const manuallyEdited = order.some((index, position) => index !== position);
  const tracks = useMemo(() => result ? orderedOccurrences(result.tracks, order) : [], [result, order]);
  const transitions = useMemo(() => {
    if (!result) return [];
    if (!manuallyEdited) return result.transitions;
    return buildTransitions(tracks, result.playlistTypeId ?? null, result.flowKeywordIds ?? [], combineResolvedFlowSemantics(result.flowKeywordIds ?? []));
  }, [result, tracks, manuallyEdited]);
  const feedbackKey = `flowlist:feedback:v1:${result?.snapshot?.inputFingerprint ?? "none"}`;
  const feedback = feedbackState.key === feedbackKey ? feedbackState.ratings : {};

  const rateTransition = (position: number, value: "smooth" | "jarring" | "unsure") => {
    const from = tracks[position - 1];
    const to = tracks[position];
    if (!from || !to) return;
    const key = `${position}:${from.id}:${to.id}`;
    const evaluationStorageKey = `${feedbackKey}:id:${key}`;
    let evaluationId: string;
    try {
      evaluationId = window.localStorage.getItem(evaluationStorageKey) || crypto.randomUUID();
      window.localStorage.setItem(evaluationStorageKey, evaluationId);
    } catch { evaluationId = crypto.randomUUID(); }
    setFeedbackState(previous => {
      const next = { ...(previous.key === feedbackKey ? previous.ratings : {}), [key]: value };
      try { window.localStorage.setItem(feedbackKey, JSON.stringify(next)); } catch {}
      return { key: feedbackKey, ratings: next };
    });
    setFeedbackStatus("Rating saved in this browser. Sending anonymous transition metrics…");
    void fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      evaluationId, rating: value, playlistTypeId: result?.playlistTypeId ?? "unknown", flowKeywordIds: result?.flowKeywordIds ?? [],
      source: result?.snapshot?.source ?? "manual", fromEnergy: from.estimatedEnergy * 10, toEnergy: to.estimatedEnergy * 10,
      fromRhythm: from.rhythmIntensityScore, toRhythm: to.rhythmIntensityScore,
      fromConfidence: from.audioFeatures.confidence, toConfidence: to.audioFeatures.confidence,
    }) }).then(response => setFeedbackStatus(response.ok ? "Anonymous transition rating submitted." : "Rating saved in this browser; feedback collection is not configured or unavailable."))
      .catch(() => setFeedbackStatus("Rating saved in this browser; feedback collection is unavailable."));
  };

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
  const groups = useMemo(() => (result ? buildOrderGroups(tracks, manuallyEdited ? undefined : result.chapters) : []), [result, tracks, manuallyEdited]);
  const transitionByIndex = useMemo(() => {
    const map = new Map<number, TransitionInsight>();
    transitions.forEach((transition) => map.set(transition.toIndex, transition));
    return map;
  }, [transitions]);
  const exportText = useMemo(
    () => (result ? buildExportText({ tracks, transitions, snapshot: result.snapshot ?? null, manuallyEdited }) : ""),
    [result, tracks, transitions, manuallyEdited],
  );
  const orderText = useMemo(() => buildOrderExport(tracks), [tracks]);

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

  const { playlistFit, snapshot, skippedUnavailableCount, moodArcSummary, rhythmArcSummary } = result;
  const flowLabels = snapshot?.selectedFlowKeywords.map((keyword) => keyword.label) ?? [];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(orderText);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2500);
    } catch {
      setCopyStatus("error");
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

  const handleYouTubeExport = () => {
    const draft = makeYouTubeExportDraft(tracks, snapshot?.playlistName);
    if (!draft) return;
    window.sessionStorage.setItem(YOUTUBE_EXPORT_KEY, JSON.stringify(draft));
    window.location.assign("/export/youtube");
  };

  const handleAppleExport = () => {
    const draft = makeAppleExportDraft(tracks, snapshot?.playlistName);
    if (!draft) return;
    window.sessionStorage.setItem(APPLE_EXPORT_KEY, JSON.stringify(draft));
    window.location.assign("/export/apple");
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
            <Button type="button" className="rounded-lg bg-[#f3ece0] text-[#12231d] hover:bg-[#faf6ee]" onClick={handleCopy}>
              {copyStatus === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copyStatus === "copied" ? "Order copied" : "Copy track order"}
            </Button>
            <Button type="button" variant="outline" className="rounded-lg border-white/14 bg-black/16" onClick={handleDownload}>
              <Download className="size-4" />
              Export as text
            </Button>
            {snapshot?.source === "youtube" && makeYouTubeExportDraft(tracks, snapshot.playlistName) ? <Button type="button" variant="outline" onClick={handleYouTubeExport}>Save to YouTube</Button> : null}
            {snapshot?.source === "apple" && makeAppleExportDraft(tracks, snapshot.playlistName) ? <Button type="button" variant="outline" onClick={handleAppleExport}>Save to Apple Music</Button> : null}
          </div>
          <p className="mt-2 text-xs text-white/48" role="status">
            {copyStatus === "error"
              ? "Could not access clipboard. Use Export as text instead."
              : snapshot?.source === "youtube"
                ? "Copies the ordered tracks with direct YouTube video links."
                : "Copies a clean, numbered list of the ordered tracks."}
          </p>
          <p className="mt-1 text-xs text-white/43" role="status">After listening, rate each transition below. {feedbackStatus}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <Button type="button" variant="outline" aria-pressed={lockFirst} onClick={() => setLockFirst(v => !v)}>{lockFirst ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />} {lockFirst ? "First locked" : "Lock first"}</Button>
            <Button type="button" variant="outline" aria-pressed={lockLast} onClick={() => setLockLast(v => !v)}>{lockLast ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />} {lockLast ? "Last locked" : "Lock last"}</Button>
            <Button type="button" variant="ghost" onClick={() => { setEditor(null); setLockFirst(false); setLockLast(false); }}>Restore algorithm order</Button>
            <Button type="button" variant="ghost" aria-expanded={showComparison} onClick={() => setShowComparison(v => !v)}>{showComparison ? "Hide comparison" : "Compare original order"}</Button>
          </div>
        </header>

        {showComparison ? <section className="table-panel rounded-xl p-4 text-xs text-white/65">
          <h2 className="flow-display mb-2 text-lg text-white">Original → current</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ol className="space-y-1"><li className="font-semibold text-white/80">Original import</li>{resolvedTracks.map((track, index) => <li key={`original-${index}`}>{index + 1}. {track.title} — {track.artist}</li>)}</ol>
            <ol className="space-y-1"><li className="font-semibold text-white/80">Current sequence</li>{tracks.map((track, index) => <li key={`current-${index}`}>{index + 1}. {track.title} — {track.artist}</li>)}</ol>
          </div>
        </section> : null}

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
                      originalPosition={order[position] ?? position}
                      manualOrder={manuallyEdited}
                      canMoveUp={position > 0 && !(lockFirst && position <= 1) && !(lockLast && position === tracks.length - 1)}
                      canMoveDown={position < tracks.length - 1 && !(lockLast && position >= tracks.length - 2) && !(lockFirst && position === 0)}
                      onMove={direction => setEditor({ key: resultKey, order: moveOccurrence(order, position, direction, { first: lockFirst, last: lockLast }) })}
                      rating={feedback[`${position}:${tracks[position - 1]?.id}:${track.id}`]}
                      onRate={value => rateTransition(position, value)}
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
