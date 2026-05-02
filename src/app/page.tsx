import Link from "next/link";
import { ArrowRight, Sparkles, Waves } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <AppFrame>
      <div className="flex flex-1 flex-col gap-12">
        <section className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-amber-200/90" />
            Mock sequencing · YouTube Music first · manual paste · experimental Spotify fallback
          </p>
          <h1 className="max-w-xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Turn your YouTube Music playlist into a smoother listening journey.
          </h1>
          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Reorder playlists by emotional flow, rhythm continuity, and energy progression — intro,
            build, peak, cooldown, and outro — before you press play. Designed for YouTube Music
            first, with manual paste and experimental Spotify fallback.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/playlist"
              className={cn(
                buttonVariants({ size: "lg" }),
                "inline-flex rounded-full px-6 no-underline",
              )}
            >
              Start a sequence
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Link>
            <Link
              href="/flow"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "rounded-full border-white/15 bg-white/5 px-6 text-foreground no-underline hover:bg-white/10",
              )}
            >
              Browse flow keywords
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Card className="border-white/10 bg-black/30 shadow-lg shadow-black/40 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Waves className="size-4 text-violet-300/90" />
                Emotional continuity
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Darkness, intensity, uplift, and flavor tags inform how each song hands off to the
                next — not just similarity clustering.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-white/10 bg-black/30 shadow-lg shadow-black/40 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-amber-200/90" />
                Rhythmic continuity
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Tempo feel, groove intensity, and energy progression are smoothed so the set moves
                like one composition.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              v0 uses deterministic mock sequencing on imported metadata only — no audio download,
              streaming, or lyrics.
            </CardContent>
          </Card>
        </section>
      </div>
    </AppFrame>
  );
}
