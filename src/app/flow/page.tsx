"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FLOW_KEYWORDS } from "@/lib/flow-options";
import { cn } from "@/lib/utils";

export default function FlowPage() {
  const router = useRouter();
  const {
    selectedFlowIds,
    toggleFlow,
    resolvedTracks,
    playlistSource,
    youtubeImport,
    spotifyImport,
  } = useFlow();

  const canAnalyze = resolvedTracks.length > 0 && selectedFlowIds.length > 0;

  return (
    <AppFrame>
      <div className="flex flex-1 flex-col gap-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Target flow</h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Choose one or more journey keywords. They combine into a single progression bias for
            the mock sequencer — later, this feeds your model as structured intent.
          </p>
        </div>

        {resolvedTracks.length === 0 ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            No tracks loaded.{" "}
            <Link href="/playlist" className="font-medium underline underline-offset-2">
              Add a YouTube playlist, manual lines, or the demo on the import page
            </Link>
            .
          </p>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-muted-foreground">
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

        <div className="grid gap-3 sm:grid-cols-2">
          {FLOW_KEYWORDS.map((kw) => {
            const checked = selectedFlowIds.includes(kw.id);
            const inputId = `flow-${kw.id}`;
            return (
              <label
                key={kw.id}
                htmlFor={inputId}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-4 text-left transition-colors",
                  checked
                    ? "border-violet-400/40 bg-violet-500/10 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]"
                    : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-black/35",
                )}
              >
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={() => toggleFlow(kw.id)}
                  className="mt-0.5 border-white/20 data-checked:border-violet-400 data-checked:bg-violet-500"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-foreground">{kw.label}</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    {kw.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-8">
          <Link
            href="/playlist"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Edit import
          </Link>
          <Button
            type="button"
            disabled={!canAnalyze}
            size="lg"
            className="rounded-full px-6"
            onClick={() => canAnalyze && router.push("/analyze")}
          >
            Analyze sequence
          </Button>
        </div>
      </div>
    </AppFrame>
  );
}
