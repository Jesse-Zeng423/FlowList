"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useSound } from "@/hooks/use-sound";
import { cn } from "@/lib/utils";

export function SoundToggle() {
  const { enabled, toggle } = useSound();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? "Turn sound off" : "Turn sound on"}
      aria-pressed={enabled}
      title={enabled ? "Sound on" : "Sound off"}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
        enabled
          ? "border-white/18 bg-white/8 text-white/78 hover:bg-white/12 hover:text-white/92"
          : "border-white/10 bg-transparent text-white/44 hover:border-white/16 hover:text-white/62",
      )}
    >
      {enabled ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
      Sound
    </button>
  );
}
