"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ListMusic } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { FLOW_KEYWORDS } from "@/lib/flow-options";
import type { SequencedTrack, TransitionInsight } from "@/types/flowlist";
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

function buildExportText(
  tracks: SequencedTrack[],
  transitions: TransitionInsight[],
  moodArc: string,
  rhythmArc: string,
  flowLabels: string[],
  isDemoPlaylist: boolean,
) {
  const lines: string[] = [];
  lines.push("Flowlist — sequenced order (mock analysis)");
  if (isDemoPlaylist) {
    lines.push("Source: built-in demo playlist (not from Spotify or your library).");
  }
  lines.push(`Flow: ${flowLabels.join(" · ")}`);
  lines.push("");
  lines.push("Mood arc:", moodArc);
  lines.push("Rhythm arc:", rhythmArc);
  lines.push("");
  tracks.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.title} — ${t.artist}`);
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
  const { result, selectedFlowIds, reset, playlistSource } = useFlow();
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
    return buildExportText(
      result.tracks,
      result.transitions,
      result.moodArcSummary,
      result.rhythmArcSummary,
      flowLabels,
      playlistSource === "demo",
    );
  }, [result, flowLabels, playlistSource]);

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

  const { tracks, transitions, moodArcSummary, rhythmArcSummary } = result;

  return (
    <AppFrame>
      <div className="flex flex-1 flex-col gap-8 pb-8">
        {playlistSource === "demo" ? (
          <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm leading-relaxed text-violet-50/95">
            You’re viewing the built-in <span className="font-medium">demo playlist</span> with
            mock analysis only. These tracks were loaded via &quot;Try demo playlist,&quot; not
            from Spotify or your library.
          </div>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your sequence</h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Mock ordering with phase labels, mood and rhythm tags, and handoff notes between
              songs. Replace the sequencer to plug in real analysis.
              {playlistSource === "user"
                ? " Only the tracks you pasted are listed below — nothing is pulled from Spotify."
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
                        <div className="min-w-0 space-y-1">
                          <p className="text-[11px] font-medium tabular-nums text-muted-foreground">
                            {String(index + 1).padStart(2, "0")}
                          </p>
                          <p className="truncate text-base font-semibold tracking-tight text-foreground">
                            {track.title}
                          </p>
                          <p className="text-sm text-muted-foreground">{track.artist}</p>
                          <p className="text-xs text-muted-foreground/80">{track.album}</p>
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
