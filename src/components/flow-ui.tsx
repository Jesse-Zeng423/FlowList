"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, CircleHelp, X, type LucideIcon } from "lucide-react";
import { playCardTap } from "@/lib/sound-effects";
import { cn } from "@/lib/utils";

export function HelpButton({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-xs text-white/54 transition-colors hover:border-white/20 hover:text-white/78"
      >
        <CircleHelp className="size-3.5" />
        {label}
      </button>
      {open ? (
        <div
          role="presentation"
          className="help-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/68 p-4 backdrop-blur-sm"
          onMouseDown={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="music-card music-card-no-suit help-modal-surface relative w-full max-w-md rounded-xl p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="relative z-10 flex items-start justify-between gap-4">
              <h2 id={titleId} className="flow-display text-xl font-semibold text-[#21170f]">
                {title}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-[#776854] transition-colors hover:bg-black/5 hover:text-[#21170f]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="relative z-10 mt-3 text-sm leading-relaxed text-[#574838]">{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function StepHeader({
  title,
  subtitle,
  help,
}: {
  title: string;
  subtitle: string;
  help?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flow-display text-3xl font-semibold text-[#faf1df] sm:text-[2.1rem]">{title}</h1>
        <p className="mt-1 text-sm text-white/52">{subtitle}</p>
      </div>
      {help}
    </div>
  );
}

export function SourceChoiceCard({
  label,
  icon: Icon,
  selected,
  onSelect,
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
}) {
  const suit = label === "Manual Paste" ? "♣" : label === "Demo" ? "♥" : "♠";
  const redSuit = suit === "♥";

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => { playCardTap(); onSelect(); }}
      data-suit={suit}
      data-suit-tone={redSuit ? "red" : "black"}
      data-card-scale="compact"
      className={cn(
        "music-card music-card-choice group relative flex min-h-[82px] flex-col justify-between rounded-xl p-3 text-left",
        selected && "music-card-selected",
      )}
    >
      <span className={cn("relative z-10 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em]", redSuit ? "text-[#8f1d2c]" : "text-[#5d5951]")}>
        {suit} Source
      </span>
      <span className="relative z-10 mt-3 flex items-center justify-between gap-2">
        <span className="flow-display text-sm font-semibold">{label}</span>
        {selected ? <Check className="size-4 text-[#245a46]" /> : <Icon className="size-4 text-[#45423d]" />}
      </span>
    </button>
  );
}
