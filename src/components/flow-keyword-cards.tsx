"use client";

import { useEffect, useRef } from "react";
import { Check, Flame, Lock, Moon, Shuffle, Sparkles, Waves, Zap } from "lucide-react";
import type { FlowKeyword } from "@/lib/flow-presets";
import { playCardDeal, playCardFlip, playCardTap } from "@/lib/sound-effects";
import { cn } from "@/lib/utils";

const FLOW_ICONS = [Waves, Shuffle, Sparkles, Flame, Moon, Zap] as const;

const MIXED_MESS_SHORT_COPY: Record<string, string> = {
  "mixed_mess.chaos_to_coherence": "Turn rough jumps into a path.",
  "mixed_mess.surprise_but_smooth": "Keep contrast without whiplash.",
  "mixed_mess.mood_chapters": "Break into emotional sections.",
  "mixed_mess.soft_landing": "Let the ending settle.",
  "mixed_mess.energy_wave": "Move through rises and releases.",
  "mixed_mess.genre_bridge": "Connect different musical worlds.",
};

function shortDescription(keyword: FlowKeyword) {
  return MIXED_MESS_SHORT_COPY[keyword.id] ?? keyword.description;
}

function flowSuit(keyword: FlowKeyword) {
  if (/(landing|closure|romantic|intimacy|heartbreak|warm|serenity|gentle|emotional)/i.test(keyword.label)) return "♥";
  if (/(energy|peak|rise|banger|drop|anthem|victory|finale|release)/i.test(keyword.label)) return "♦";
  if (/(bridge|smooth|continuity|groove|flow|drift|loop)/i.test(keyword.label)) return "♣";
  return "♠";
}

export function FlowCard({
  keyword,
  index,
  selected,
  disabled,
  conflictLabel,
  conflictMessage,
  tensionHint,
  pairsWell,
  onSelect,
}: {
  keyword: FlowKeyword;
  index: number;
  selected: boolean;
  disabled: boolean;
  conflictLabel: string | null;
  conflictMessage: string | null;
  tensionHint?: string | null;
  pairsWell?: boolean;
  onSelect: () => void;
}) {
  const Icon = FLOW_ICONS[index % FLOW_ICONS.length] ?? Waves;
  const conflict = Boolean(conflictMessage);
  const descriptionId = `flow-keyword-${keyword.id}-description`;

  // Play flip sound when this card newly becomes locked (null → non-null transition only).
  const wasLockedRef = useRef(conflict);
  useEffect(() => {
    if (conflict && !wasLockedRef.current) playCardFlip();
    wasLockedRef.current = conflict;
  }, [conflict]);
  const compatibility = pairsWell ? " Pairs well with selected movement." : tensionHint ? " Tension with selected movement." : "";
  const accessibleLabel = conflict
    ? `${keyword.label}. Locked. Conflicts with ${conflictLabel ?? "a selected flow keyword"}.`
    : selected
      ? `Remove ${keyword.label} from selected movement.`
      : disabled
        ? `Select flow keyword: ${keyword.label}. Maximum of 2 flow keywords already selected.`
        : `Select flow keyword: ${keyword.label}.${compatibility}`;
  const visibleDescription = shortDescription(keyword);
  const suit = flowSuit(keyword);
  const redSuit = suit === "♥" || suit === "♦";

  return (
    <button
      type="button"
      onClick={() => {
        if (selected) { playCardTap(); onSelect(); }
        else if (!disabled) { playCardDeal(); onSelect(); }
      }}
      aria-disabled={disabled}
      aria-pressed={selected}
      aria-label={accessibleLabel}
      aria-describedby={descriptionId}
      className={cn(
        "music-card-shell group relative h-[128px] w-full text-left",
        disabled && !conflict && "cursor-not-allowed opacity-55",
        conflict && "cursor-not-allowed",
      )}
    >
      <span id={descriptionId} className="sr-only">
        {conflict
          ? `Locked. Conflicts with ${conflictLabel ?? "selected movement"}.`
          : visibleDescription}
      </span>
      <span className="music-card-inner block rounded-xl" data-locked={conflict}>
        <span
          aria-hidden={conflict}
          data-suit={suit}
          data-suit-tone={redSuit ? "red" : "black"}
          data-card-scale="compact"
          className={cn(
            "music-card-face music-card-front flex flex-col p-3",
            selected &&
              "!border-[#356b55] !bg-[linear-gradient(145deg,#faf5ec,#f3eee4)] shadow-[0_13px_29px_rgba(0,10,7,0.34),0_0_0_1px_#356b55]",
          )}
        >
          <span className="relative z-10 flex items-start justify-between gap-2">
            <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em]", redSuit ? "text-[#8f1d2c]" : "text-[#54514b]")}>{suit} Flow</span>
            {pairsWell && !selected ? (
              <span className="rounded border border-[#a8c0d3] bg-[#e8f0f7] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[#305272]">
                Pairs well
              </span>
            ) : tensionHint && !selected ? (
              <span
                title={tensionHint}
                className="rounded border border-[#d6b0b4] bg-[#f4e7e7] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[#7c2632]"
              >
                Tension
              </span>
            ) : selected ? (
              <span className="rounded border border-[#a3c4ac] bg-[#e5f0e8] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[#356048]">
                Selected
              </span>
            ) : (
              <Icon className={cn("size-3.5", redSuit ? "text-[#8f1d2c]" : "text-[#343332]")} />
            )}
          </span>
          <span className="relative z-10 mt-3">
            <span className="flow-display block text-[15px] font-semibold leading-tight text-[#171717]">
              {keyword.label}
            </span>
            <span className="mt-1 block line-clamp-2 text-[11px] leading-snug text-[#625e57]">
              {visibleDescription}
            </span>
          </span>
          <span className={cn("relative z-10 mt-auto inline-flex items-center gap-1 text-[10px]", selected ? "text-[#245a46]" : "text-[#655f57]")}>
            {selected ? <Check className="size-3" /> : null}
            {selected ? "In movement tray" : disabled ? "Max 2 selected" : "Choose"}
          </span>
        </span>
        <span
          aria-hidden={!conflict}
          className="music-card-face music-card-back flex flex-col items-center justify-center gap-1.5 p-3 text-center"
        >
          <Lock className="relative z-10 size-4 text-[#ece7da]" />
          <span className="relative z-10 text-[9px] font-bold uppercase tracking-[0.18em] text-[#c1cabf]">
            Flow · Locked
          </span>
          <span className="flow-display relative z-10 text-sm font-semibold text-[#f4efe6]">{keyword.label}</span>
          <span className="relative z-10 text-xs font-medium text-[#d9ddd3]">
            Conflicts with {conflictLabel ?? "selected movement"}
          </span>
        </span>
      </span>
    </button>
  );
}
