"use client";

import { Check, Crown, Flame, Layers3, Moon, Music2, Sparkles, Waves, Zap } from "lucide-react";
import type { PlaylistType, PlaylistTypeId } from "@/lib/flow-presets";
import { cn } from "@/lib/utils";

export const SHORT_TYPE_DESCRIPTIONS: Record<PlaylistTypeId, string> = {
  mixed_mess: "Mixed artists, moods, and energy jumps.",
  hip_hop: "Bars, beats, flex, darkness, and momentum.",
  rnb_soul: "Smooth vocals, intimacy, heartbreak, and warmth.",
  pop_dance: "Hooks, lift, bounce, and bright momentum.",
  rock_alt: "Guitars, tension, release, and anthem moments.",
  electronic_club: "Pulse, drops, loops, and dancefloor energy.",
  classical_score: "Movement, drama, grandeur, and resolution.",
  jazz_blues: "Groove, warmth, smoke, and late-night motion.",
  chill_lofi: "Soft texture, calm pacing, and low-disruption flow.",
};

const TYPE_ICON_BY_ID: Partial<Record<PlaylistTypeId, typeof Layers3>> = {
  mixed_mess: Layers3,
  hip_hop: Flame,
  rnb_soul: Moon,
  pop_dance: Sparkles,
  rock_alt: Zap,
  electronic_club: Waves,
  classical_score: Crown,
  jazz_blues: Music2,
  chill_lofi: Moon,
};

export function TypeCard({
  type,
  selected,
  onSelect,
}: {
  type: PlaylistType;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = TYPE_ICON_BY_ID[type.id] ?? Layers3;
  const recommended = type.id === "mixed_mess";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative min-h-32 overflow-hidden rounded-[1.25rem] border p-3 text-left shadow-xl shadow-black/15 backdrop-blur-xl transition-all duration-300",
        selected
          ? "-translate-y-1 border-violet-200/55 bg-violet-500/15 shadow-[0_0_40px_rgba(139,92,246,0.23)]"
          : "border-white/10 bg-white/[0.045] hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07]",
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(167,139,250,0.18),transparent_48%)] opacity-80" />
      <div className="relative flex h-full flex-col">
        <div className="mb-4 flex items-start justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
            type
          </span>
          <Icon className="size-4 text-violet-100/75" />
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-foreground">{type.label}</h3>
            {recommended ? (
              <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-100">
                Recommended
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {SHORT_TYPE_DESCRIPTIONS[type.id]}
          </p>
        </div>
        <div className="mt-auto pt-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              selected ? "text-violet-100" : "text-muted-foreground",
            )}
          >
            {selected ? <Check className="size-3.5" /> : null}
            {selected ? "Selected deck world" : "Choose this world"}
          </span>
        </div>
      </div>
    </button>
  );
}
