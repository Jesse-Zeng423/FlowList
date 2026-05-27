"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ArrowRight, X } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { FlowCard } from "@/components/flow-keyword-cards";
import { FlowStepper } from "@/components/flow-stepper";
import { HelpButton, StepHeader } from "@/components/flow-ui";
import { WorkflowActionBar } from "@/components/workflow-action-bar";
import { useFlow } from "@/components/flow-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_FLOW_KEYWORDS } from "@/lib/flow-presets";
import {
  isRecommendedPairing,
  resolveHardConflict,
  softTensionAgainstSelected,
} from "@/lib/flow-compatibility";
import { playCardTap, playShuffle } from "@/lib/sound-effects";
import { cn } from "@/lib/utils";

export default function FlowPage() {
  const router = useRouter();
  const {
    selectedFlowKeywordIds,
    toggleFlowKeyword,
    playlistTypeId,
    availableFlowKeywords,
    isReadyToSequence,
    sequenceBlocker,
    resolvedTracks,
  } = useFlow();

  const selectedKeywords = useMemo(
    () => selectedFlowKeywordIds.map((id) => availableFlowKeywords.find((keyword) => keyword.id === id)).filter(Boolean),
    [selectedFlowKeywordIds, availableFlowKeywords],
  );

  if (resolvedTracks.length === 0 || !playlistTypeId) {
    const needsImport = resolvedTracks.length === 0;
    return (
      <AppFrame contentClassName="max-w-3xl">
        <div className="flow-page-in flex flex-1 flex-col gap-5 pb-16">
          <FlowStepper current={2} />
          <div className="table-panel mt-10 rounded-xl p-6 text-sm text-white/65">
            <h1 className="flow-display text-2xl font-semibold text-[#fbf2e2]">
              {needsImport ? "Import a playlist first." : "Choose a playlist type first."}
            </h1>
            <p className="mt-2">
              {needsImport
                ? "Add tracks before choosing a listening journey."
                : "Flow cards are selected for the musical world you choose."}
            </p>
            <Link
              href={needsImport ? "/import" : "/playlist-type"}
              className={cn(buttonVariants({ size: "lg" }), "mt-5 inline-flex rounded-lg no-underline")}
            >
              {needsImport ? "Go to Import" : "Choose playlist type"}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame contentClassName="max-w-[56rem]">
      <div className="flow-page-in flex flex-1 flex-col gap-3.5 pb-3">
        <FlowStepper current={2} />
        <StepHeader
          title="How should it flow?"
          subtitle={`Choose up to ${MAX_FLOW_KEYWORDS} directions for the listening journey.`}
          help={
            <HelpButton label="What do flow cards do?" title="What do flow cards do?">
              Flow cards guide the sequencing logic. One card may shape the overall structure,
              while another shapes transitions or the ending.
            </HelpButton>
          }
        />

        <section className="table-panel flex min-h-14 flex-wrap items-center gap-2 rounded-xl px-3 py-2">
          <p className="mr-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/36">
            Selected movement
          </p>
          {selectedKeywords.length === 0 ? (
            <p className="text-xs text-white/40">Choose up to 2 flow cards.</p>
          ) : (
            selectedKeywords.map((keyword) =>
              keyword ? (
                <button
                  key={keyword.id}
                  type="button"
                  onClick={() => { playCardTap(); toggleFlowKeyword(keyword.id); }}
                  aria-label={`Remove ${keyword.label} from selected movement`}
                  className="music-card music-card-choice music-card-no-suit relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#20201e]"
                >
                  <span className="relative z-10">{keyword.label}</span>
                  <X className="relative z-10 size-3 text-[#68635b]" />
                </button>
              ) : null,
            )
          )}
          <span className="ml-auto text-xs text-white/37">
            {selectedFlowKeywordIds.length}/{MAX_FLOW_KEYWORDS}
          </span>
        </section>

        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {availableFlowKeywords.map((keyword, index) => {
            const selected = selectedFlowKeywordIds.includes(keyword.id);
            const hard = selected ? null : resolveHardConflict(keyword.id, selectedFlowKeywordIds);
            const conflictLabel = hard
              ? availableFlowKeywords.find((candidate) => candidate.id === hard.labelId)?.label ?? null
              : null;
            const hasFirstSelection = selectedFlowKeywordIds.length >= 1;
            const tensionHint =
              hasFirstSelection && !selected && !hard
                ? softTensionAgainstSelected(keyword.id, selectedFlowKeywordIds)
                : null;
            const pairsWell =
              hasFirstSelection && !selected && !hard
                ? isRecommendedPairing(keyword.id, selectedFlowKeywordIds)
                : false;
            const disabled =
              !selected && (selectedFlowKeywordIds.length >= MAX_FLOW_KEYWORDS || Boolean(hard));
            return (
              <FlowCard
                key={keyword.id}
                keyword={keyword}
                index={index}
                selected={selected}
                disabled={disabled}
                conflictLabel={conflictLabel}
                conflictMessage={hard?.message ?? null}
                tensionHint={tensionHint}
                pairsWell={pairsWell}
                onSelect={() => {
                  if (!disabled || selected) toggleFlowKeyword(keyword.id);
                }}
              />
            );
          })}
        </section>

        <WorkflowActionBar
          left={
            <Link href="/playlist-type" className="text-sm text-white/52 hover:text-white/78">
              Back
            </Link>
          }
          note={sequenceBlocker}
          right={
            <Button
              type="button"
              disabled={!isReadyToSequence}
              size="lg"
              className="rounded-lg px-5"
              onClick={() => { if (isReadyToSequence) { playShuffle(); router.push("/analyze"); } }}
            >
              Deal the sequence
              <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </AppFrame>
  );
}
