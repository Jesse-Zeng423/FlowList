import Link from "next/link";
import { ArrowRight, ArrowRightIcon, Layers3, Shuffle, Sparkles, Waves } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const phases = ["Intro", "Build", "Peak", "Cooldown", "Outro"];
  const messy = ["Mood jump", "Genre shift", "Energy spike", "Odd bridge"];

  return (
    <AppFrame contentClassName="max-w-6xl">
      <div className="flow-page-in flex flex-1 flex-col gap-8">
        <section className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground shadow-lg shadow-black/20 backdrop-blur">
              <Sparkles className="size-3.5 text-amber-200/90" />
              Prototype sequencing · YouTube Music first · mock analysis labels preserved
            </p>
            <div className="space-y-4">
              <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Turn messy playlists into smooth listening journeys.
              </h1>
              <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Flowlist reorganizes your playlist by mood, rhythm, energy, and flow — so random
                songs start to feel like a curated set.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/import"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "inline-flex rounded-full px-6 shadow-[0_0_32px_rgba(139,92,246,0.25)] no-underline",
                )}
              >
                Start sequencing
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Link>
              <Link
                href="/import?demo=1"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "rounded-full border-white/15 bg-white/5 px-6 text-foreground no-underline hover:bg-white/10",
                )}
              >
                Try demo
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              The messier the playlist, the more Flowlist has to work with.
            </p>
          </div>

          <div className="relative rounded-[2rem] border border-white/10 bg-black/25 p-5 shadow-2xl shadow-black/35 backdrop-blur-xl">
            <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.25),transparent_45%)]" />
            <div className="relative h-full">
              <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Layers3 className="size-4 text-violet-200" />
                  Deck transformation
                </span>
                <span className="uppercase tracking-[0.22em]">prototype</span>
              </div>

              <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1.25fr]">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                      Mixed playlist
                    </p>
                    <Shuffle className="size-4 text-white/45" />
                  </div>
                  <div className="space-y-2">
                    {messy.map((item, index) => (
                      <div
                        key={item}
                        className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/30 px-3 py-2 text-xs"
                      >
                        <span className="text-foreground/85">{item}</span>
                        <span className="text-muted-foreground">{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="hidden rounded-full border border-violet-200/20 bg-violet-500/10 p-2 text-violet-100 sm:block">
                  <ArrowRightIcon className="size-4" />
                </div>
                <div className="rounded-3xl border border-violet-300/20 bg-violet-500/10 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-violet-100">
                    <Sparkles className="size-4" />
                    Flowlist sequence
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {phases.slice(0, 4).map((phase, index) => (
                      <div
                        key={phase}
                        className="rounded-2xl border border-white/10 bg-black/35 p-2 text-center shadow-lg shadow-black/25"
                      >
                        <div className="mx-auto mb-2 h-9 rounded-xl bg-gradient-to-b from-violet-300/25 to-amber-200/10" />
                        <p className="text-[10px] font-medium text-foreground/90">
                          {phase === "Cooldown" ? "Landing" : phase}
                        </p>
                        <p className="text-[9px] text-muted-foreground">{index + 1}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/25 p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight">
              <Waves className="size-4 text-violet-200" />
              How it works
            </h2>
            <ol className="space-y-3 text-sm text-muted-foreground">
              {["Import a playlist", "Choose the kind of mess", "Shape the journey"].map(
                (item, index) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs text-foreground">
                      {index + 1}
                    </span>
                    {item}
                  </li>
                ),
              )}
            </ol>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/25 p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight">
              <Sparkles className="size-4 text-amber-200" />
              Best for
            </h2>
            <div className="flex flex-wrap gap-2">
              {["Mixed artists", "Big mood swings", "Weird transitions", "Long saved playlists"].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground"
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>
      </div>
    </AppFrame>
  );
}
