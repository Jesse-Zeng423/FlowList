"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { TypeCard } from "@/components/flow-type-cards";
import { FlowStepper } from "@/components/flow-stepper";
import { HelpButton, StepHeader } from "@/components/flow-ui";
import { WorkflowActionBar } from "@/components/workflow-action-bar";
import { useFlow } from "@/components/flow-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { PLAYLIST_TYPES, type PlaylistTypeId } from "@/lib/flow-presets";
import { cn } from "@/lib/utils";

export default function PlaylistTypePage() {
  const router = useRouter();
  const { resolvedTracks, playlistTypeId, setPlaylistTypeId } = useFlow();

  if (resolvedTracks.length === 0) {
    return (
      <AppFrame contentClassName="max-w-3xl">
        <div className="flow-page-in flex flex-1 flex-col gap-5 pb-16">
          <FlowStepper current={1} />
          <div className="table-panel mt-10 rounded-xl p-6 text-sm text-white/65">
            <h1 className="flow-display text-2xl font-semibold text-[#fbf2e2]">Import a playlist first.</h1>
            <p className="mt-2">Flowlist needs tracks before you can choose a musical world.</p>
            <Link
              href="/import"
              className={cn(buttonVariants({ size: "lg" }), "mt-5 inline-flex rounded-lg no-underline")}
            >
              Go to Import
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame contentClassName="max-w-[56rem]">
      <div className="flow-page-in flex flex-1 flex-col gap-4 pb-3">
        <FlowStepper current={1} />
        <StepHeader
          title="What kind of playlist is this?"
          subtitle="Choose the closest musical world."
          help={
            <HelpButton label="Not sure what to pick?" title="Not sure what to pick?">
              Choose <strong>Mixed Mess</strong> if the playlist jumps across genres, artists, or
              moods. It is the best general-purpose option.
            </HelpButton>
          }
        />

        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {PLAYLIST_TYPES.map((type) => {
            const selected = type.id === playlistTypeId;
            return (
              <TypeCard
                key={type.id}
                type={type}
                selected={selected}
                onSelect={() => setPlaylistTypeId(selected ? null : (type.id as PlaylistTypeId))}
              />
            );
          })}
        </section>

        <WorkflowActionBar
          left={
            <Link href="/import" className="text-sm text-white/52 hover:text-white/78">
              Back
            </Link>
          }
          note={!playlistTypeId ? "Choose one type to continue." : null}
          right={
            <Button
              type="button"
              disabled={!playlistTypeId}
              size="lg"
              className="rounded-lg px-5"
              onClick={() => playlistTypeId && router.push("/flow")}
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </AppFrame>
  );
}
