import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function AppFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-h-full flex-1 overflow-hidden bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(139,92,246,0.18),transparent_55%),radial-gradient(900px_circle_at_100%_0%,rgba(251,191,36,0.08),transparent_50%),linear-gradient(180deg,oklch(0.14_0.02_280),oklch(0.1_0.02_280_/_1))]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_35%)]" />
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link href="/" className="group inline-flex items-baseline gap-2">
            <span className="font-semibold tracking-tight text-foreground">Flowlist</span>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              prototype
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link
              href="/playlist"
              className="rounded-md px-2 py-1 transition-colors hover:bg-white/5 hover:text-foreground"
            >
              Import
            </Link>
            <span className="text-white/10">/</span>
            <Link
              href="/flow"
              className="rounded-md px-2 py-1 transition-colors hover:bg-white/5 hover:text-foreground"
            >
              Flow
            </Link>
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
