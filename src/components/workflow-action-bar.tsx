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
        "table-panel sticky bottom-3 z-30 mt-auto rounded-xl px-3 py-2.5",
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
