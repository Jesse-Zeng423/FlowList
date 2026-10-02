import type { SequencedTrack } from "@/types/flowlist";

/** Indices identify occurrences, so duplicate video IDs remain distinct rows. */
export function moveOccurrence(
  order: readonly number[],
  from: number,
  direction: -1 | 1,
  locks: { first: boolean; last: boolean },
): number[] {
  const to = from + direction;
  if (from < 0 || to < 0 || from >= order.length || to >= order.length) return [...order];
  if (locks.first && (from === 0 || to === 0)) return [...order];
  if (locks.last && (from === order.length - 1 || to === order.length - 1)) return [...order];
  const next = [...order];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function orderedOccurrences<T>(items: readonly T[], order: readonly number[]): T[] {
  if (order.length !== items.length || new Set(order).size !== items.length) return [...items];
  return order.map(index => items[index]!);
}

export function featureTrust(track: SequencedTrack): { label: string; detail: string } {
  const { source, confidence } = track.audioFeatures;
  if (source === "prototype") {
    return { label: "Low confidence", detail: "Metadata-based estimate; audio was not analyzed." };
  }
  if (source === "unavailable") {
    return { label: "Unavailable", detail: "No trustworthy audio features are available." };
  }
  if (source === "third_party" && confidence >= 0.8) {
    return { label: "Higher confidence", detail: "External audio feature match; verify the song version." };
  }
  return { label: "Estimated", detail: "Feature match needs listening confirmation." };
}
