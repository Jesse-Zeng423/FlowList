"use client";

import Link from "next/link";
import { Check, Circle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Import", href: "/playlist" },
  { label: "Type", href: "/flow#type" },
  { label: "Flow", href: "/flow#keywords" },
  { label: "Shuffle", href: "/analyze" },
] as const;

export function FlowStepper({
  current,
  className,
}: {
  current: 0 | 1 | 2 | 3;
  className?: string;
}) {
  return (
    <nav
      aria-label="Flowlist sequencing steps"
      className={cn(
        "rounded-2xl border border-white/10 bg-black/25 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl",
        className,
      )}
    >
      <ol className="grid grid-cols-4 gap-1">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step.label}>
              <Link
                href={step.href}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex min-h-14 flex-col justify-between rounded-xl border px-2.5 py-2 text-left transition-all duration-300",
                  active
                    ? "border-violet-300/45 bg-violet-500/15 shadow-[0_0_24px_rgba(139,92,246,0.18)]"
                    : done
                      ? "border-emerald-300/20 bg-emerald-500/10 hover:bg-emerald-500/15"
                      : "border-white/5 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.05]",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {done ? (
                    <Check className="size-3 text-emerald-200" />
                  ) : active ? (
                    <Sparkles className="size-3 text-violet-200" />
                  ) : (
                    <Circle className="size-3 text-white/25" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    active ? "text-violet-50" : done ? "text-emerald-50/90" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
