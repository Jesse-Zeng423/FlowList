import type { ReactNode } from "react";
import Link from "next/link";
import { SoundToggle } from "@/components/sound-toggle";
import { cn } from "@/lib/utils";

export function AppFrame({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div
      className={cn(
        "wood-table relative min-h-svh flex-1 overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "relative z-10 mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 pb-6 pt-4 sm:px-7 sm:pt-5",
          contentClassName,
        )}
      >
        <header className="mb-4 flex items-center justify-between gap-4 border-b border-white/6 pb-3">
          <Link href="/" className="group inline-flex items-baseline gap-2">
            <span className="flow-display text-xl font-semibold text-[#f3ece0]">Flowlist</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/32">
              prototype
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-1 text-xs text-white/48">
            <nav className="flex flex-wrap items-center gap-1">
              <Link
                href="/import"
                className="rounded-md px-2 py-1 transition-colors hover:bg-white/7 hover:text-foreground"
              >
                Import
              </Link>
              <span className="text-white/15">/</span>
              <Link
                href="/playlist-type"
                className="rounded-md px-2 py-1 transition-colors hover:bg-white/7 hover:text-foreground"
              >
                Type
              </Link>
              <span className="text-white/15">/</span>
              <Link
                href="/flow"
                className="rounded-md px-2 py-1 transition-colors hover:bg-white/7 hover:text-foreground"
              >
                Flow
              </Link>
            </nav>
            <span className="text-white/15">·</span>
            <SoundToggle />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
