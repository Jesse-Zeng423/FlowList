"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { useFlow } from "@/components/flow-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SPOTIFY_IMPORT_DISABLED_MESSAGE } from "@/lib/parse-input";
import { cn } from "@/lib/utils";

export default function PlaylistPage() {
  const router = useRouter();
  const {
    playlistRaw,
    setPlaylistRaw,
    loadDemoPlaylist,
    playlistInputKind,
    playlistSource,
    resolvedTracks,
  } = useFlow();

  const isSpotifyUrl = playlistInputKind === "spotify_url";
  const canContinue = resolvedTracks.length > 0 && !isSpotifyUrl;

  return (
    <AppFrame>
      <div className="flex flex-1 flex-col gap-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Playlist input</h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Paste one track per line. Supported shapes include{" "}
            <span className="font-mono text-foreground/80">Artist - Song</span>,{" "}
            <span className="font-mono text-foreground/80">Song - Artist</span>, and{" "}
            <span className="font-mono text-foreground/80">Artist, Song</span>. Spotify playlist
            links are detected but cannot be imported in this prototype yet.
          </p>
        </div>

        {isSpotifyUrl ? (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-50/95">
            {SPOTIFY_IMPORT_DISABLED_MESSAGE}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Label htmlFor="playlist" className="text-foreground">
              Tracks
            </Label>
            <div className="flex flex-col items-end gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto border-white/15 bg-white/5 py-2"
                onClick={loadDemoPlaylist}
              >
                <span className="text-xs font-medium">Try demo playlist</span>
              </Button>
              <span className="max-w-[220px] text-right text-[10px] leading-snug text-muted-foreground">
                Loads a fixed, labeled list for testing mock sequencing only — not your Spotify
                library.
              </span>
            </div>
          </div>
          <Textarea
            id="playlist"
            value={playlistRaw}
            onChange={(e) => setPlaylistRaw(e.target.value)}
            placeholder={`The Less I Know The Better - Tame Impala\nRadiohead, Daydreaming`}
            className={cn(
              "min-h-[220px] resize-y border-white/10 bg-black/40 font-mono text-sm text-foreground",
              "placeholder:text-muted-foreground/60",
            )}
          />
          <p className="text-xs text-muted-foreground">
            {playlistInputKind === "empty"
              ? "No tracks detected yet."
              : isSpotifyUrl
                ? "Paste track lines manually to continue, or use the demo playlist button above."
                : `${resolvedTracks.length} track${resolvedTracks.length === 1 ? "" : "s"} from your input · mock analysis only`}
            {playlistSource === "demo" && !isSpotifyUrl ? " · Demo playlist (not from Spotify)." : null}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-8">
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back
          </Link>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5"
              disabled={!canContinue}
              onClick={() => canContinue && router.push("/flow")}
            >
              Continue to flow
            </Button>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
