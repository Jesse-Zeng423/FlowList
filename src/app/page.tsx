import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DECK_CARDS = [
  { label: "Mixed Mood",    suit: "♣", red: false, mx: "-22px", my: "12px",  mr: "-11deg", da: "-1.0s" },
  { label: "Energy Jump",   suit: "♦", red: true,  mx: "-10px", my: "-9px",  mr: "8deg",   da: "-0.8s" },
  { label: "Genre Shift",   suit: "♠", red: false, mx: "4px",   my: "16px",  mr: "-5deg",  da: "-0.6s" },
  { label: "Warm Opening",  suit: "♥", red: true,  mx: "10px",  my: "-13px", mr: "13deg",  da: "-0.4s" },
  { label: "Rising Motion", suit: "♦", red: true,  mx: "14px",  my: "8px",   mr: "-7deg",  da: "-0.2s" },
  { label: "Soft Landing",  suit: "♥", red: true,  mx: "22px",  my: "-11px", mr: "5deg",   da: "0s"    },
] as const;

type DeckCard = (typeof DECK_CARDS)[number];

function DeckPreviewCard({ label, suit, red, mx, my, mr, da }: DeckCard) {
  return (
    <div
      data-suit={suit}
      data-suit-tone={red ? "red" : "black"}
      data-card-scale="compact"
      className="deck-settle-card music-card relative flex w-[78px] shrink-0 flex-col rounded-xl p-2.5"
      style={
        {
          height: "102px",
          animationDelay: da,
          "--mx": mx,
          "--my": my,
          "--mr": mr,
        } as CSSProperties
      }
    >
      <span
        className={cn(
          "relative z-10 text-[8px] font-bold uppercase tracking-[0.16em]",
          red ? "text-[#8f1d2c]" : "text-[#514c44]",
        )}
      >
        {suit} Flow
      </span>
      <p className="flow-display relative z-10 mt-auto text-[10px] font-semibold leading-tight text-[#171717]">
        {label}
      </p>
    </div>
  );
}

export default function HomePage() {
  return (
    <AppFrame>
      <main className="flow-page-in relative flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center pb-4 text-center">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b7636d]">
            Every playlist is a deck
          </p>
          <h1 className="flow-display text-4xl font-semibold leading-[1.05] text-[#fcf3e5] sm:text-5xl">
            Deal a smoother playlist.
          </h1>
          <p className="mt-3 max-w-[21rem] text-base leading-snug text-white/58">
            Import a playlist. Choose a flow. Let Flowlist reorder the journey.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/import"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 rounded-lg bg-[#f3ece0] px-6 text-[#12231d] no-underline shadow-[0_9px_25px_rgba(0,10,7,0.32)] hover:bg-[#faf6ee]",
              )}
            >
              Start sequencing
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/import?demo=1"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 rounded-lg border-white/16 bg-black/20 px-5 text-white/70 no-underline hover:bg-white/8",
              )}
            >
              Try demo
            </Link>
          </div>
          <p className="mt-3 text-xs text-white/35">
            Best for messy playlists and mood jumps.
          </p>
        </div>

        {/* Decorative: scattered cards settle into order, then loop. Non-interactive. */}
        <div
          className="pointer-events-none relative h-44 w-full shrink-0 overflow-hidden"
          aria-hidden="true"
        >
          <div className="hero-landing-glow" />
          <div className="hero-landing-arc" />
          <div className="absolute inset-x-0 bottom-5 flex items-end justify-center gap-2.5 px-4">
            {DECK_CARDS.map((card) => (
              <DeckPreviewCard key={card.label} {...card} />
            ))}
          </div>
        </div>
      </main>
    </AppFrame>
  );
}
