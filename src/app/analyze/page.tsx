"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/spinner";

export default function AnalyzePage() {
  const router = useRouter();
  const { resolvedTracks, selectedFlowIds, runSequence } = useFlow();
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    if (resolvedTracks.length === 0 || selectedFlowIds.length === 0) {
      router.replace("/playlist");
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((p) => Math.min(94, p + 6 + Math.random() * 10));
    }, 220);

    const done = window.setTimeout(() => {
      runSequence();
      router.replace("/results");
    }, 2000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(done);
    };
  }, [resolvedTracks.length, selectedFlowIds.length, router, runSequence]);

  return (
    <AppFrame>
      <div className="flex flex-1 flex-col items-center justify-center gap-10 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="size-12 text-violet-300/90" />
          <h1 className="text-2xl font-semibold tracking-tight">Sequencing your set</h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Mock pass: harmonizing emotional direction, tempo feel, and energy arc. In production,
            this step calls your ranking model — the UI state machine stays the same.
          </p>
        </div>
        <div className="w-full max-w-sm space-y-2">
          <Progress value={progress} className="h-1.5 bg-white/10" />
          <p className="text-xs text-muted-foreground">Analyzing continuity…</p>
        </div>
      </div>
    </AppFrame>
  );
}
