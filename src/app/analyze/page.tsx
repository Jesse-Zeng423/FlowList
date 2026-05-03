"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Layers3, Shuffle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { FlowStepper } from "@/components/flow-stepper";
import { useFlow } from "@/components/flow-provider";
import { Progress } from "@/components/ui/progress";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SequencedPlaylist } from "@/types/flowlist";

const LOADING_COPY = [
  "Reading playlist metadata...",
  "Cleaning track titles...",
  "Estimating mood and rhythm...",
  "Testing transitions...",
  "Dealing the journey...",
] as const;

/** Match prior UX (~1.85s) while allowing generation to flush to context first. */
const MIN_SEQUENCE_UI_MS = 1850;

export default function AnalyzePage() {
  const router = useRouter();
  const { isReadyToSequence, runSequence, resolvedTracks, playlistTypeId } = useFlow();
  const [progress, setProgress] = useState(12);
  const [copyIndex, setCopyIndex] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const flowRef = useRef({
    isReadyToSequence,
    runSequence,
    playlistTypeId,
    resolvedTracksLength: resolvedTracks.length,
  });

  useLayoutEffect(() => {
    flowRef.current = {
      isReadyToSequence,
      runSequence,
      playlistTypeId,
      resolvedTracksLength: resolvedTracks.length,
    };
  });

  /** Monotonic counter so strict-mode double mounts / overlapping async work cannot navigate stale runs. */
  const genRunRef = useRef(0);

  useEffect(() => {
    const gate = flowRef.current;
    if (gate.resolvedTracksLength === 0) {
      router.replace("/import");
      return undefined;
    }
    if (!gate.playlistTypeId) {
      router.replace("/playlist-type");
      return undefined;
    }
    if (!gate.isReadyToSequence) {
      router.replace("/flow");
      return undefined;
    }

    const runId = ++genRunRef.current;
    let cancelled = false;
    setGenerationError(null);

    const interval = window.setInterval(() => {
      setProgress((p) => Math.min(94, p + 6 + Math.random() * 10));
    }, 220);
    const copyInterval = window.setInterval(() => {
      setCopyIndex((i) => Math.min(LOADING_COPY.length - 1, i + 1));
    }, 360);

    const finalMoment = window.setTimeout(() => {
      setCopyIndex(LOADING_COPY.length - 1);
      setProgress(98);
    }, 1500);

    const stopLoadingUi = (): void => {
      window.clearInterval(interval);
      window.clearInterval(copyInterval);
      window.clearTimeout(finalMoment);
    };

    void (async () => {
      const minUiDelay = new Promise<void>((resolve) => {
        window.setTimeout(resolve, MIN_SEQUENCE_UI_MS);
      });

      const next = await new Promise<SequencedPlaylist | null>((resolve) => {
        queueMicrotask(() => {
          if (cancelled) {
            resolve(null);
            return;
          }
          let produced: SequencedPlaylist | null = null;
          try {
            flushSync(() => {
              produced = flowRef.current.runSequence();
            });
          } catch {
            produced = null;
          }
          resolve(produced);
        });
      });

      await minUiDelay;

      if (cancelled || runId !== genRunRef.current) {
        return;
      }

      const g = flowRef.current;
      if (g.resolvedTracksLength === 0) {
        stopLoadingUi();
        router.replace("/import");
        return;
      }
      if (!g.playlistTypeId) {
        stopLoadingUi();
        router.replace("/playlist-type");
        return;
      }
      if (!g.isReadyToSequence) {
        stopLoadingUi();
        router.replace("/flow");
        return;
      }

      if (!next) {
        stopLoadingUi();
        setGenerationError("Sequence generation did not finish. Please try again.");
        return;
      }

      stopLoadingUi();
      router.replace("/results");
    })();

    return () => {
      cancelled = true;
      stopLoadingUi();
    };
    // Exclude runSequence from deps — refreshed via flowRef each render so timers are not wiped by identity churn.
  }, [
    router,
    resolvedTracks.length,
    playlistTypeId,
    isReadyToSequence,
    retryNonce,
  ]);

  if (generationError) {
    return (
      <AppFrame contentClassName="max-w-xl">
        <div className="flow-page-in flex flex-1 flex-col gap-6 pb-24">
          <FlowStepper current={3} />
          <div className="rounded-[1.75rem] border border-rose-500/35 bg-rose-500/10 p-6 text-sm leading-relaxed text-rose-50/95">
            <p className="text-lg font-semibold tracking-tight">{generationError}</p>
            <p className="mt-2 text-rose-100/85">
              Check your playlist and flow selections, then run the sequence again.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                className="rounded-full"
                onClick={() => {
                  setGenerationError(null);
                  setRetryNonce((n) => n + 1);
                  setProgress(12);
                  setCopyIndex(0);
                }}
              >
                Try again
              </Button>
              <Link
                href="/flow"
                className={cn(buttonVariants({ variant: "outline" }), "rounded-full bg-white/10 no-underline")}
              >
                Back to Flow
              </Link>
            </div>
          </div>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame contentClassName="max-w-5xl">
      <div className="flow-page-in flex flex-1 flex-col gap-10">
        <FlowStepper current={3} />

        <div className="flex flex-1 flex-col items-center justify-center gap-10 py-12 text-center">
          <div className="relative h-52 w-full max-w-md">
            <div className="absolute inset-0 rounded-[2rem] border border-violet-300/15 bg-violet-500/10 blur-3xl" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="absolute left-1/2 top-1/2 h-36 w-24 -translate-x-1/2 -translate-y-1/2"
                style={{
                  marginLeft: `${(i - 2) * 18}px`,
                  marginTop: `${Math.abs(i - 2) * 8}px`,
                  zIndex: i,
                }}
              >
                <div
                  className="flow-card-shuffle flex h-full flex-col justify-between rounded-2xl border border-white/12 bg-black/45 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl"
                  style={{
                    animationDelay: `${i * 120}ms`,
                    ["--flow-spread" as string]: i - 2 || 1,
                    ["--flow-rotate" as string]: `${(i - 2) * 2}deg`,
                  }}
                >
                  <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-violet-100/55">
                    flow
                  </span>
                  {i === 2 ? (
                    <Shuffle className="mx-auto size-7 text-violet-100" />
                  ) : i % 2 === 0 ? (
                    <Layers3 className="mx-auto size-6 text-white/45" />
                  ) : (
                    <Sparkles className="mx-auto size-6 text-amber-100/60" />
                  )}
                  <span className="text-center text-[10px] text-muted-foreground">mock</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-violet-200" />
              Prototype sequencing · estimated audio features
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Shuffling your journey</h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Flowlist is dealing a new order from imported metadata, mock mood analysis, and prototype rhythm estimates.
            </p>
          </div>

          <div className="w-full max-w-sm space-y-3">
            <Progress value={progress} className="h-1.5 bg-white/10" />
            <p className="text-xs text-violet-100/90">{LOADING_COPY[copyIndex]}</p>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
