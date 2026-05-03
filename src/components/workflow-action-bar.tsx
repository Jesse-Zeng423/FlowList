"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkflowActionBar({
  left,
  right,
  note,
  className,
}: {
  left?: ReactNode;
  right: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-3 z-30 mt-auto rounded-2xl border border-white/10 bg-black/70 px-3 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">{left}</div>
        <div className="flex items-center gap-3">
          {note ? <div className="hidden max-w-xs text-right text-xs text-amber-100/85 sm:block">{note}</div> : null}
          {right}
        </div>
      </div>
      {note ? <div className="mt-2 text-xs text-amber-100/85 sm:hidden">{note}</div> : null}
    </div>
  );
}
