"use client";

import { Check, Lock, Shuffle, Waves, Flame, Sparkles, Moon, Zap } from "lucide-react";
import type { FlowKeyword } from "@/lib/flow-presets";
import { cn } from "@/lib/utils";

const FLOW_ICONS = [Waves, Shuffle, Sparkles, Flame, Moon, Zap] as const;

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
  /** Softer pairwise note when ≥1 keyword is already selected */
  tensionHint?: string | null;
  pairsWell?: boolean;
  onSelect: () => void;
}) {
  const Icon = FLOW_ICONS[index % FLOW_ICONS.length] ?? Waves;
  const conflict = Boolean(conflictMessage);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "group relative min-h-36 overflow-hidden rounded-[1.25rem] border p-3 text-left shadow-xl shadow-black/15 backdrop-blur-xl transition-all duration-300",
        selected
          ? "-translate-y-1 rotate-[-1deg] border-violet-200/55 bg-violet-500/15 shadow-[0_0_40px_rgba(139,92,246,0.22)]"
          : conflict
            ? "cursor-not-allowed border-white/5 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(139,92,246,0.05))] opacity-70"
            : disabled
              ? "cursor-not-allowed border-white/5 bg-black/20 opacity-50"
              : "border-white/10 bg-white/[0.045] hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07]",
      )}
    >
      {conflict ? (
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.06)_0px,rgba(255,255,255,0.06)_1px,transparent_1px,transparent_10px)]" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(167,139,250,0.16),transparent_48%)] opacity-80" />
      )}
      <div className="relative flex h-full flex-col">
        <div className="mb-4 flex items-start justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-violet-100/60">
            flow
          </span>
          {conflict ? <Lock className="size-4 text-muted-foreground" /> : <Icon className="size-4 text-violet-100/75" />}
        </div>

        {conflict ? (
          <div className="mt-auto space-y-2">
            <p className="text-sm font-semibold text-foreground/80">Card locked</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {conflictLabel ? `Conflicts with ${conflictLabel}. ${conflictMessage ?? ""}` : conflictMessage}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold tracking-tight text-foreground">{keyword.label}</h3>
              <p className="max-h-10 overflow-hidden text-xs leading-relaxed text-muted-foreground">
                {keyword.description}
              </p>
            </div>
            {!selected && tensionHint ? (
              <p className="mt-2 text-[10px] leading-snug text-amber-100/72">{tensionHint}</p>
            ) : null}
            {!selected && pairsWell ? (
              <p className="mt-1 text-[10px] font-medium leading-snug text-emerald-100/72">Pairs well together.</p>
            ) : null}
            <div className="mt-auto pt-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  selected ? "text-violet-100" : "text-muted-foreground",
                )}
              >
                {selected ? <Check className="size-3.5" /> : null}
                {selected ? "In movement tray" : disabled ? "Max 2 selected" : "Select movement"}
              </span>
            </div>
          </>
        )}
      </div>
    </button>
  );
}
