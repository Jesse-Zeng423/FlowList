"use client";

import { Check, Crown, Flame, Layers3, Moon, Music2, Sparkles, Waves, Zap } from "lucide-react";
import type { PlaylistType, PlaylistTypeId } from "@/lib/flow-presets";
import { playCardDeal, playCardTap } from "@/lib/sound-effects";
import { cn } from "@/lib/utils";

export const SHORT_TYPE_DESCRIPTIONS: Record<PlaylistTypeId, string> = {
  mixed_mess: "Mixed artists, moods, energy jumps.",
  hip_hop: "Bars, beats, darkness, momentum.",
  rnb_soul: "Smooth vocals, intimacy, warmth.",
  pop_dance: "Hooks, lift, bounce, brightness.",
  rock_alt: "Guitars, tension, release, anthems.",
  electronic_club: "Pulse, drops, loops, movement.",
  classical_score: "Drama, grandeur, tension, resolution.",
  jazz_blues: "Groove, warmth, smoke, night.",
  chill_lofi: "Soft texture and low-disruption flow.",
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

const TYPE_SUIT_BY_ID: Record<PlaylistTypeId, string> = {
  mixed_mess: "♠",
  hip_hop: "♦",
  rnb_soul: "♥",
  pop_dance: "♦",
  rock_alt: "♠",
  electronic_club: "♦",
  classical_score: "♠",
  jazz_blues: "♣",
  chill_lofi: "♥",
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
  const suit = TYPE_SUIT_BY_ID[type.id];
  const redSuit = suit === "♥" || suit === "♦";
  const descriptionId = `playlist-type-${type.id}-description`;
  const action = selected ? "Deselect" : "Select";

  return (
    <button
      type="button"
      onClick={() => { if (selected) { playCardTap(); } else { playCardDeal(); } onSelect(); }}
      aria-pressed={selected}
      aria-label={`${action} playlist type: ${type.label}${recommended ? ". Recommended option." : ""}`}
      aria-describedby={descriptionId}
      data-suit={suit}
      data-suit-tone={redSuit ? "red" : "black"}
      data-card-scale="compact"
      className={cn(
        "music-card music-card-choice group relative flex h-[116px] flex-col overflow-hidden rounded-xl p-3 text-left",
        selected
          ? "music-card-selected"
          : "",
      )}
    >
      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em]", redSuit ? "text-[#8f1d2c]" : "text-[#54514b]")}>
            {suit} type
          </span>
          {recommended ? (
            <span className="rounded border border-[#a3c4ac] bg-[#e5f0e8] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-[#356048]">
              Recommended
            </span>
          ) : (
            <Icon className={cn("size-3.5", redSuit ? "text-[#8f1d2c]" : "text-[#343332]")} />
          )}
        </div>
        <div>
          <h3 className="flow-display text-[15px] font-semibold leading-tight text-[#171717]">{type.label}</h3>
          <p id={descriptionId} className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#625e57]">
            {SHORT_TYPE_DESCRIPTIONS[type.id]}
          </p>
        </div>
        <div className="mt-auto">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium",
              selected ? "text-[#245a46]" : "text-[#655f57]",
            )}
          >
            {selected ? <Check className="size-3" /> : <Icon className="size-3" />}
            {selected ? "Selected" : "Choose"}
          </span>
        </div>
      </div>
    </button>
  );
}
