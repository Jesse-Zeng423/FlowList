import type {
  SequencedChapter,
  SequencedTrack,
  SoftLandingSummaryMeta,
  TransitionInsight,
} from "@/types/flowlist";
import {
  getFlowKeyword,
  getPlaylistType,
  type PlaylistType,
} from "@/lib/flow-presets";
import {
  resolveStrategyFromKeywordIds,
  type FlowCurveType,
  type FlowExplanationTone,
  type FlowStrategy,
} from "@/lib/flow-strategies";
import { transitionCostWithStrategy } from "@/lib/transition-cost";

/**
 * Per-transition explanations using `transitionCostWithStrategy`.
 *
 * Each row is built from the actual reason fragments — never generic copy. We
 * also append a short flow tag at the end so the user can see which strategy
 * shaped the cut.
 */
export function buildTransitions(
  tracks: SequencedTrack[],
  playlistTypeId: string | null,
  flowKeywordIds: string[],
): TransitionInsight[] {
  const labels = flowKeywordIds
    .map((id) => getFlowKeyword(id)?.label)
    .filter((s): s is string => Boolean(s));
  const flowTag = labels[0] ? `Tuned for "${labels[0]}".` : null;

  const { combined: strategy } = resolveStrategyFromKeywordIds(flowKeywordIds);
  void playlistTypeId;

  const out: TransitionInsight[] = [];
  const n = tracks.length;
  for (let i = 1; i < n; i++) {
    const a = tracks[i - 1]!;
    const b = tracks[i]!;
    const position = n > 1 ? i / (n - 1) : 0.5;
    const { reasons } = transitionCostWithStrategy(a, b, strategy, { position });

    const chosen = reasons.slice(0, 2);

    const sharedTags = a.flavorTags.filter((tag) => b.flavorTags.includes(tag));
    if (sharedTags.length && chosen.length < 3) {
      chosen.push(`Shared ${sharedTags.slice(0, 2).join(" / ")} flavor keeps tonal continuity.`);
    }

    if (flowTag && chosen.length < 3) chosen.push(flowTag);

    out.push({
      fromIndex: i - 1,
      toIndex: i,
      explanation: chosen.length
        ? chosen.join(" ")
        : `Energy ${a.estimatedEnergy} → ${b.estimatedEnergy}, rhythm ${a.audioFeatures.rhythmIntensity} → ${b.audioFeatures.rhythmIntensity}.`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mood / rhythm summaries — strategy-driven
// ---------------------------------------------------------------------------

function moodSummaryByCurve(strategy: FlowStrategy, trackCount: number): string {
  const c = strategy.curveType;
  switch (c) {
    case "linear-rise":
      return `The arc lifts in measured steps from a steadier opening toward a brighter, higher-energy back third — across ${trackCount} tracks.`;
    case "linear-fall":
      return `Energy and intensity peak earlier and ease across ${trackCount} tracks toward a calmer landing.`;
    case "wave":
      return `The order alternates rises and releases so the playlist breathes in waves instead of one flat slope.`;
    case "chaptered":
      return `The playlist is organised into chapters, each with its own internal rhythm and emotional colour.`;
    case "peak-centered":
      return `The contour builds toward a focal high section and resolves around it — a peak-centred arc.`;
    case "landing-focused":
      return `The closing stretch is weighted toward lower intensity, softer rhythm, and more resolved tracks.`;
    case "contrast-to-resolution":
      return `The sequence starts with sharper contrast and gradually settles into resolution and emotional warmth.`;
    case "stability-focused":
      return `Adjacent tracks stay in the same energy and tempo neighbourhood — minimal disruption rather than dramatic motion.`;
    case "cluster-run":
      return `The strongest peak tracks are clustered into a focused central run rather than spread across the playlist.`;
    case "loop":
      return `The order is shaped to feel circular — the closing track sits comfortably next to the opener.`;
  }
}

function rhythmSummaryByCurve(
  strategy: FlowStrategy,
  first: SequencedTrack,
  last: SequencedTrack,
): string {
  const span = `Groove intensity runs about ${first.audioFeatures.rhythmIntensity} → ${last.audioFeatures.rhythmIntensity} with ${first.audioFeatures.tempoFeel} → ${last.audioFeatures.tempoFeel} endcaps.`;
  const c = strategy.curveType;
  switch (c) {
    case "linear-rise":
      return `${span} Perceived rhythm intensity generally strengthens toward the back half.`;
    case "linear-fall":
      return `${span} Rhythmic drive is weighted earlier; later tracks ease toward sparser or steadier motion.`;
    case "wave":
      return `${span} Rhythm rises and releases in waves — short climbs followed by softer landings.`;
    case "chaptered":
      return `${span} Bigger rhythm shifts happen between chapters, not inside them.`;
    case "peak-centered":
      return `${span} Rhythmic staging follows a story shape: establish, rise, focal band, then release.`;
    case "landing-focused":
      return `${span} Later segments favour gentler motion and less aggressive groove.`;
    case "contrast-to-resolution":
      return `${span} Front-loaded contrast resolves into smoother groove by the end.`;
    case "stability-focused":
      return `${span} Adjacent tempo and groove changes are minimised so the listener can stay inside the playlist.`;
    case "cluster-run":
      return `${span} Rhythm stays tight inside the cluster run; the rest of the playlist acts as warm-up and cooldown.`;
    case "loop":
      return `${span} The closing rhythm is chosen to re-enter the opener with little disruption.`;
  }
}

/** Tone the summary with playlist-type framing so different genres read differently. */
function applyPlaylistTypeTone(
  base: string,
  type: PlaylistType | null,
  curve: FlowCurveType,
): string {
  if (!type) return base;
  switch (type.id) {
    case "mixed_mess":
      if (curve === "stability-focused" || curve === "contrast-to-resolution") {
        return `${base} The order organises the messiest jumps into smoother chapters so the playlist starts to feel intentional rather than random.`;
      }
      return `${base} The mix's variety is preserved while harsh whiplash is reduced.`;
    case "classical_score":
      return `${base} The framing emphasises movement, contrast, and resolution — not motivational hype.`;
    case "chill_lofi":
      return `${base} Continuity and low-disruption motion take priority over dramatic peaks.`;
    case "rnb_soul":
      return `${base} Vocal warmth and emotional softness shape the handoffs.`;
    case "hip_hop":
      return `${base} Energy density and lyrical weight colour the focal sections.`;
    case "rock_alt":
      return `${base} Tension, release, and anthem moments shape the contour.`;
    case "electronic_club":
      return `${base} Pulse, build-ups, and release placement shape the contour.`;
    case "pop_dance":
      return `${base} Hooks and bright lift influence where the peak sits.`;
    case "jazz_blues":
      return `${base} Groove, swing, and atmosphere drive the smaller transitions.`;
    default:
      return base;
  }
}

/** Strategy-flag overlays. */
function applyFlagOverlays(strategy: FlowStrategy, mood: string, rhythm: string): {
  mood: string;
  rhythm: string;
} {
  let m = mood;
  let r = rhythm;
  if (strategy.flags.grandFinale) {
    m += " The arc is reserved for an expansive closing section rather than fading away.";
  }
  if (strategy.flags.clusterRun && strategy.curveType !== "cluster-run") {
    m += " The strongest peak tracks are pulled into a focused run rather than spread thinly.";
  }
  if (strategy.flags.loop) {
    m += " The shape is designed to feel circular — easy to keep playing.";
  }
  if (strategy.flags.bridgeMode) {
    r += " Bridge tracks sit between the most contrasting neighbours rather than being adjacent without a buffer.";
  }
  if (strategy.flags.surpriseAllowed) {
    r += " Some surprise is preserved, but at least one of tempo, warmth, or rhythm carries continuity through each cut.";
  }
  if (strategy.flags.momentumRequired) {
    r += " Long stalls are avoided so forward momentum holds across the playlist.";
  }
  return { mood: m, rhythm: r };
}

/** Tone tail. */
function toneTail(tone: FlowExplanationTone): string {
  switch (tone) {
    case "cinematic":
      return " The phrasing leans cinematic — movement, scale, and resolution.";
    case "dramatic":
      return " The phrasing leans dramatic — tension, contrast, and release.";
    case "intimate":
      return " The phrasing leans intimate — close, warm, low-key.";
    case "club":
      return " The phrasing leans club — pulse, rhythm, and hook placement.";
    case "focused":
      return " The phrasing leans focused — steadiness over drama.";
    case "playful":
      return " The phrasing leans playful — bright colour and movement.";
    case "journey":
    default:
      return "";
  }
}

export function buildArcSummaries(
  tracks: SequencedTrack[],
  playlistTypeId: string | null,
  flowKeywordIds: string[],
  meta?: {
    softLandingMeta?: SoftLandingSummaryMeta | null;
    chapters?: SequencedChapter[] | null;
  },
): { moodArcSummary: string; rhythmArcSummary: string } {
  if (tracks.length === 0) {
    return { moodArcSummary: "", rhythmArcSummary: "" };
  }
  const { combined: strategy } = resolveStrategyFromKeywordIds(flowKeywordIds);
  const type = getPlaylistType(playlistTypeId);
  const first = tracks[0]!;
  const last = tracks[tracks.length - 1]!;

  let mood = moodSummaryByCurve(strategy, tracks.length);
  let rhythm = rhythmSummaryByCurve(strategy, first, last);

  ({ mood, rhythm } = applyFlagOverlays(strategy, mood, rhythm));

  const hasMoodChapters = meta?.chapters?.some((c) => c.journeyRole != null);

  // Soft landing — explicit wording in both mood + rhythm arcs.
  if (strategy.flags.landingFocused && meta?.softLandingMeta) {
    const m = meta.softLandingMeta;

    mood += hasMoodChapters
      ? " The resolving chapter pulls toward softer motion: slower—or steady—tempo, lower rhythmic drive, warmer or more emotionally resolved cues at the playlist end"
      : " The closing arc pulls toward softer motion — slower—or steady—tempo, lower rhythmic drive, and warmer or more resolved emotional cues toward the playlist end";

    if (m.endingGentlerRhythm && m.endingGentlerEnergy) {
      rhythm +=
        " Compared with the opener, rhythm intensity and headline energy taper for the softer landing.";
    } else if (m.endingGentlerRhythm || m.endingGentlerEnergy) {
      rhythm +=
        " Rhythm or energy eases modestly toward the end, though it is not perfectly even track-to-track.";
    } else {
      rhythm +=
        " Groove and energy stay similar to earlier sections — softer ordering had limited slack because most tracks skew one way.";
    }
    rhythm += " Soft Landing is biased as strongly as sequencing allows given this playlist.";
    if (m.limitedByHomogeneity) {
      mood += ", as much as this playlist allows";
      rhythm +=
        " If the catalogue is homogeneous, softness is capped — this is tightened as far as estimates allow.";
    }
    mood += ".";
  }

  // Chapter overview.
  if (meta?.chapters && meta.chapters.length > 0) {
    const labels = meta.chapters.map((c) => c.label).join(", ");
    mood += ` Chapters: ${labels}.`;
  }

  mood = applyPlaylistTypeTone(mood, type, strategy.curveType);
  mood += toneTail(strategy.explanationTone);

  if (type) {
    const typePrefix = `Playlist type: ${type.label}.`;
    mood = `${typePrefix} ${mood}`;
  }

  return { moodArcSummary: mood, rhythmArcSummary: rhythm };
}
