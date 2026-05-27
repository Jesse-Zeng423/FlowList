"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Import", href: "/import" },
  { label: "Type", href: "/playlist-type" },
  { label: "Flow", href: "/flow" },
] as const;

export function FlowStepper({
  current,
  className,
}: {
  current: 0 | 1 | 2;
  className?: string;
}) {
  return (
    <nav aria-label="Flowlist sequencing steps" className={cn("flex justify-center", className)}>
      <ol className="table-panel flex items-center rounded-full px-3 py-2">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step.label} className="flex items-center">
              <Link
                href={step.href}
                aria-current={active ? "step" : undefined}
                className="flex items-center gap-1.5 text-[11px] font-medium"
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                    active
                      ? "border-[#d7ddd0]/35 bg-white/[0.05] text-[#f3ece0]"
                      : done
                        ? "border-[#4e8170] bg-[#254e40]/45 text-[#c4d8ce]"
                        : "border-white/12 bg-white/[0.03] text-white/35",
                  )}
                >
                  {done ? <Check className="size-3" /> : index + 1}
                </span>
                <span className={active ? "text-[#f3ece0]" : done ? "text-white/62" : "text-white/38"}>
                  {step.label}
                </span>
              </Link>
              {index < STEPS.length - 1 ? (
                <span className="mx-3 h-px w-7 bg-white/12 sm:w-10" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
