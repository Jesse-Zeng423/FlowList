"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Layers3, Shuffle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Progress } from "@/components/ui/progress";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SequencedPlaylist } from "@/types/flowlist";

const LOADING_COPY = [
  "Reading playlist metadata",
  "Finding transition paths",
  "Balancing energy",
  "Dealing the final order",
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
      try { window.sessionStorage.setItem("flowlist:fresh-result", "1"); } catch {}
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
          <div className="table-panel mt-14 rounded-xl p-6 text-sm leading-relaxed text-rose-50/95">
            <p className="flow-display text-xl font-semibold">{generationError}</p>
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
    <AppFrame contentClassName="max-w-xl">
      <div className="flow-page-in flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-7 pb-14 text-center">
          <div className="relative h-36 w-56">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="absolute left-1/2 top-1/2 h-28 w-[76px] -translate-x-1/2 -translate-y-1/2"
                style={{
                  marginLeft: `${(i - 2) * 14}px`,
                  marginTop: `${Math.abs(i - 2) * 5}px`,
                  zIndex: i,
                }}
              >
                <div
                  data-card-scale="compact"
                  className="music-card flow-card-shuffle flex h-full flex-col justify-between rounded-lg p-2.5"
                  style={{
                    animationDelay: `${i * 120}ms`,
                    ["--flow-spread" as string]: i - 2 || 1,
                    ["--flow-rotate" as string]: `${(i - 2) * 2}deg`,
                  }}
                >
                  <span className="relative z-10 text-[8px] font-bold uppercase tracking-[0.18em] text-[#59554e]">
                    flow
                  </span>
                  {i === 2 ? (
                    <Shuffle className="relative z-10 mx-auto size-6 text-[#242321]" />
                  ) : i % 2 === 0 ? (
                    <Layers3 className="relative z-10 mx-auto size-5 text-[#4f4c47]" />
                  ) : (
                    <Sparkles className="relative z-10 mx-auto size-5 text-[#8f1d2c]" />
                  )}
                  <span className="relative z-10 text-center text-[9px] text-[#5e5952]">FL</span>
                </div>
              </div>
            ))}
          </div>

          <div>
            <h1 className="flow-display text-3xl font-semibold text-[#fbf2e2]">Dealing your sequence...</h1>
          </div>

          <div className="w-full max-w-sm space-y-3">
            <Progress value={progress} className="h-1.5 bg-white/10" />
            <p className="text-xs text-[#d8e3dc]">{LOADING_COPY[copyIndex]}</p>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
