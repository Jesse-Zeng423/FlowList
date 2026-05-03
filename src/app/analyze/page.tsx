"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers3, Shuffle, Sparkles } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { FlowStepper } from "@/components/flow-stepper";
import { useFlow } from "@/components/flow-provider";
import { Progress } from "@/components/ui/progress";

const LOADING_COPY = [
  "Reading playlist metadata...",
  "Cleaning track titles...",
  "Estimating mood and rhythm...",
  "Testing transitions...",
  "Dealing the journey...",
] as const;

export default function AnalyzePage() {
  const router = useRouter();
  const { isReadyToSequence, runSequence } = useFlow();
  const [progress, setProgress] = useState(12);
  const [copyIndex, setCopyIndex] = useState(0);

  useEffect(() => {
    if (!isReadyToSequence) {
      router.replace("/flow");
      return;
    }

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

    const done = window.setTimeout(() => {
      const next = runSequence();
      router.replace(next ? "/results" : "/flow");
    }, 1850);

    return () => {
      window.clearInterval(interval);
      window.clearInterval(copyInterval);
      window.clearTimeout(finalMoment);
      window.clearTimeout(done);
    };
  }, [isReadyToSequence, router, runSequence]);

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
              Flowlist is dealing a new order from imported metadata, mock mood analysis, and
              prototype rhythm estimates.
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
