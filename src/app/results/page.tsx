"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, ListMusic } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { FLOW_KEYWORDS } from "@/lib/flow-options";
import type { SequencedTrack, TrackAnalysis, TransitionInsight } from "@/types/flowlist";
import { cn } from "@/lib/utils";

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
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-muted-foreground/90">Source channel · </span>
        {track.artist}
        <span className="ml-1.5 text-xs text-muted-foreground/75">(upload channel, not verified as artist)</span>
      </p>
    );
  }
  if (conf === "unknown") {
    return (
      <p className="text-sm text-muted-foreground">
        Artist unknown <span className="text-xs text-muted-foreground/75">(metadata did not separate performer)</span>
      </p>
    );
  }
  return <p className="text-sm text-muted-foreground">{track.artist}</p>;
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function buildExportText(
  tracks: SequencedTrack[],
  transitions: TransitionInsight[],
  moodArc: string,
  rhythmArc: string,
  flowLabels: string[],
  source: {
    isDemo: boolean;
    isYoutube: boolean;
    isSpotify: boolean;
    importName?: string;
  },
) {
  const lines: string[] = [];
  lines.push("Flowlist — sequenced order (mock analysis)");
  if (source.isDemo) {
    lines.push("Source: built-in demo playlist (mock data only).");
  }
  if (source.isYoutube && source.importName) {
    lines.push(`Source: YouTube / YouTube Music playlist metadata — ${source.importName}`);
  }
  if (source.isSpotify && source.importName) {
    lines.push(`Source: experimental Spotify playlist metadata — ${source.importName}`);
  }
  lines.push(`Flow: ${flowLabels.join(" · ")}`);
  lines.push("");
  lines.push("Mood arc:", moodArc);
  lines.push("Rhythm arc:", rhythmArc);
  lines.push("");
  tracks.forEach((t, i) => {
    const credit =
      t.artistConfidence === "channel_fallback"
        ? `Source channel: ${t.artist}`
        : t.artistConfidence === "unknown"
          ? "Artist unknown"
          : t.artist;
    lines.push(`${i + 1}. ${t.title} — ${credit}`);
    lines.push(`   Phase: ${t.phase} · Mood: ${t.estimatedMood} · Energy: ${t.estimatedEnergy}/10`);
    lines.push(`   Tempo: ${t.tempoFeel} · Rhythm intensity: ${t.rhythmIntensityScore}/100`);
    lines.push(`   Why here: ${t.positionReason}`);
    const tr = transitions[i - 1];
    if (tr) {
      lines.push(`   Transition in: ${tr.explanation}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

export default function ResultsPage() {
  const router = useRouter();
  const { result, selectedFlowIds, reset, playlistSource, youtubeImport, spotifyImport } = useFlow();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!result || result.tracks.length === 0) {
      router.replace("/playlist");
    }
  }, [result, router]);

  const flowLabels = useMemo(
    () =>
      FLOW_KEYWORDS.filter((k) => selectedFlowIds.includes(k.id)).map((k) => k.label),
    [selectedFlowIds],
  );

  const exportText = useMemo(() => {
    if (!result) return "";
    return buildExportText(result.tracks, result.transitions, result.moodArcSummary, result.rhythmArcSummary, flowLabels, {
      isDemo: playlistSource === "demo",
      isYoutube: playlistSource === "youtube",
      isSpotify: playlistSource === "spotify",
      importName:
        playlistSource === "youtube"
          ? youtubeImport?.name
          : playlistSource === "spotify"
            ? spotifyImport?.name
            : undefined,
    });
  }, [result, flowLabels, playlistSource, youtubeImport, spotifyImport]);

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

  if (!result || result.tracks.length === 0) {
    return (
      <AppFrame>
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </AppFrame>
    );
  }

  const { tracks, transitions, moodArcSummary, rhythmArcSummary, skippedUnavailableCount } = result;

  return (
    <AppFrame>
      <div className="flex flex-1 flex-col gap-8 pb-8">
        {playlistSource === "youtube" && youtubeImport ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-50/95">
            <span className="font-medium text-emerald-100">
              Imported from YouTube Music / YouTube metadata
            </span>{" "}
            — {youtubeImport.name}
            {youtubeImport.channelTitle ? (
              <span className="text-emerald-100/85"> · {youtubeImport.channelTitle}</span>
            ) : null}
            . Order, mood, and rhythm tags use mock sequencing only (no audio analysis).
            <a
              href={youtubeImport.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-200 underline-offset-4 hover:underline"
            >
              Open playlist on YouTube
              <ExternalLink className="size-3" />
            </a>
          </div>
        ) : null}
        {playlistSource === "demo" ? (
          <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm leading-relaxed text-violet-50/95">
            You’re viewing the built-in <span className="font-medium">demo playlist</span> — mock
            data only, loaded explicitly via &quot;Load demo&quot; on the import page.
          </div>
        ) : null}
        {playlistSource === "spotify" && spotifyImport ? (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-50/95">
            <span className="font-medium text-amber-100">Experimental Spotify import</span> —{" "}
            {spotifyImport.name}
            {spotifyImport.ownerDisplayName ? (
              <span className="text-amber-100/85"> by {spotifyImport.ownerDisplayName}</span>
            ) : null}
            . Metadata only; mood/energy are still mock-filled. Prefer YouTube Music for reliable
            imports.
            <a
              href={spotifyImport.playlistExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-200 underline-offset-4 hover:underline"
            >
              Open in Spotify
              <ExternalLink className="size-3" />
            </a>
          </div>
        ) : null}

        {skippedUnavailableCount != null && skippedUnavailableCount > 0 ? (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-50/95">
            Some unavailable YouTube videos were skipped.
          </div>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your sequence</h1>
              <Badge
                variant="outline"
                className="border-violet-400/35 bg-violet-500/15 text-xs font-medium text-violet-100"
              >
                Mock analysis
              </Badge>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Prototype sequencing: phase labels, mood and rhythm tags, and handoff notes — not
              AI or audio analysis yet. Replace the sequencer when you plug in a real model.
              {playlistSource === "manual"
                ? " Only the tracks you pasted are listed below."
                : null}
              {playlistSource === "youtube"
                ? " Thumbnails and titles come from YouTube metadata; sequencing is mock-only."
                : null}
              {playlistSource === "spotify"
                ? " Experimental Spotify row — thumbnails/metadata from Spotify where available; sequencing is mock-only."
                : null}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {flowLabels.map((label) => (
                <Badge
                  key={label}
                  variant="outline"
                  className="border-white/15 bg-white/5 font-normal text-muted-foreground"
                >
                  {label}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="size-4 text-emerald-300" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied" : "Copy / export"}
            </Button>
            <Link
              href="/playlist"
              className={cn(
                buttonVariants({ variant: "secondary", size: "default" }),
                "inline-flex bg-white/10 no-underline",
              )}
            >
              New import
            </Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-white/10 bg-black/35 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-base">Mood arc</CardTitle>
              <CardDescription className="text-muted-foreground">{moodArcSummary}</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-white/10 bg-black/35 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-base">Rhythm arc</CardTitle>
              <CardDescription className="text-muted-foreground">
                {rhythmArcSummary}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <ListMusic className="size-4 text-violet-300/90" />
            Reordered playlist
          </div>
          <ScrollArea className="h-[min(70vh,720px)] rounded-xl border border-white/10 bg-black/25 pr-3">
            <ol className="space-y-0 px-4 py-4">
              {tracks.map((track, index) => {
                const transition = transitions[index - 1];
                return (
                  <li key={`${track.id}-${index}`}>
                    {transition ? (
                      <div className="mb-4 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Transition
                        </p>
                        <p className="text-xs leading-relaxed text-foreground/90">
                          {transition.explanation}
                        </p>
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "rounded-xl border border-white/10 bg-black/40 p-4 shadow-sm shadow-black/20",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 gap-3">
                          {track.importMeta?.thumbnailUrl ? (
                            <Image
                              src={track.importMeta.thumbnailUrl}
                              alt={track.album}
                              width={48}
                              height={48}
                              unoptimized
                              className="size-12 shrink-0 rounded-md object-cover ring-1 ring-white/10"
                            />
                          ) : (
                            <div
                              className="size-12 shrink-0 rounded-md bg-white/5 ring-1 ring-white/10"
                              aria-hidden
                            />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-[11px] font-medium tabular-nums text-muted-foreground">
                              {String(index + 1).padStart(2, "0")}
                            </p>
                            <p className="truncate text-base font-semibold tracking-tight text-foreground">
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
                            <p className="text-xs text-muted-foreground/80">{track.album}</p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("shrink-0 border font-medium", phaseBadgeClass(track.phase))}
                        >
                          {track.phase}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge
                          variant="secondary"
                          className="bg-white/5 text-xs font-normal text-foreground/90"
                        >
                          {track.estimatedMood}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="bg-white/5 text-xs font-normal text-foreground/90"
                        >
                          Energy {track.estimatedEnergy}/10
                        </Badge>
                        {track.importMeta?.durationMs != null && track.importMeta.durationMs > 0 ? (
                          <Badge
                            variant="secondary"
                            className="bg-white/5 text-xs font-normal text-foreground/90"
                          >
                            {formatDuration(track.importMeta.durationMs)}
                          </Badge>
                        ) : null}
                        {track.importMeta?.source ? (
                          <Badge
                            variant="outline"
                            className="border-white/10 text-xs font-normal text-muted-foreground"
                          >
                            {track.importMeta.source === "youtube" ? "YouTube" : "Spotify"}
                          </Badge>
                        ) : null}
                        <Badge
                          variant="secondary"
                          className="bg-white/5 text-xs font-normal text-foreground/90"
                        >
                          Tempo: {track.tempoFeel}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="bg-white/5 text-xs font-normal text-foreground/90"
                        >
                          Rhythm {track.rhythmIntensityScore}/100
                        </Badge>
                        {track.flavorTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="border-white/10 text-xs font-normal text-muted-foreground"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <Separator className="my-3 bg-white/10" />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground/80">Why this spot: </span>
                        {track.positionReason}
                      </p>
                    </div>
                    {index < tracks.length - 1 ? <div className="h-4" /> : null}
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        </div>

        <div className="flex flex-wrap justify-between gap-3 border-t border-white/10 pt-6">
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => reset()}>
            Reset session
          </Button>
          <Link
            href="/flow"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Adjust flow keywords
          </Link>
        </div>
      </div>
    </AppFrame>
  );
}
