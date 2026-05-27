"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound-effects";

// In-process subscriber set — notified whenever sound preference changes.
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useSound() {
  // useSyncExternalStore: server snapshot = false (Off by default, avoids hydration mismatch)
  const enabled = useSyncExternalStore(subscribe, isSoundEnabled, () => false);

  const toggle = useCallback(() => {
    setSoundEnabled(!isSoundEnabled());
    for (const cb of listeners) cb();
  }, []);

  return { enabled, toggle };
}
