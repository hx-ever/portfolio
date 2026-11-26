/**
 * Settings for m_7's animation states and boredom/welcome-back reactions.
 */
import { DURATION_S } from "@/lib/motion";

export const MASCOT_NAME = "hxever";

export type M7State = "ENTRANCE" | "IDLE" | "BORED" | "GREETING" | "DANCE";

/** Clip names in m_7.glb (all share one rig). The pack's celebration clip
 *  is called "Win" — that is the "Victory" greeting. */
export const CLIPS: Record<M7State, string> = {
  ENTRANCE: "Walk",
  IDLE: "Idle",
  BORED: "Sad",
  GREETING: "Win",
  DANCE: "Dance",
};

/** Higher wins. ENTRANCE is never interrupted; requests made during it are
 *  queued until m_7 reaches IDLE. */
export const PRIORITY: Record<M7State, number> = {
  ENTRANCE: 5,
  DANCE: 4,
  GREETING: 3,
  BORED: 2,
  IDLE: 1,
};

/** One crossfade for every state transition (the 340ms motion token). */
export const CROSSFADE_S = DURATION_S.slow;

/** Loops played by the one-shot states before returning to IDLE. */
export const LOOPS = {
  GREETING: 1,
  DANCE: 1, // the Dance clip is 5.25s — one loop is the ~5–6s target
  DANCE_REDUCED_MOTION: 1,
} as const;

/** A request queued while m_7 wasn't idle (walk-in, model load, arriving
 *  from another page) starts this long after he reaches IDLE. */
export const QUEUED_START_DELAY_MS = 600;

// ------------------------------------------------------------ in place
/** Translation tracks on these nodes are stripped from every clip. */
export const LOCKED_ROOT_BONES = ["root"];
/** The hips: pinned horizontally to their Idle position while any
 *  non-idle clip plays, since Sad / Win / Dance all shift them. */
export const ANCHOR_BONE = "DEF-spine";

/**
 * Per-state framing scale, pivoting at the feet. Dance raises both hands
 * high above the head; at full size they reached the nav's bottom edge.
 * (Disclosed with the Dance easter egg; GREETING/BORED stay at full size.)
 */
export const FRAMING_SCALE: Record<M7State, number> = {
  ENTRANCE: 1,
  IDLE: 1,
  BORED: 1,
  GREETING: 1,
  DANCE: 0.9,
};

/** Weight of HeroCharacter's relaxed-arm override per state — only the
 *  Idle clip holds its arms raised; the others own their arm motion. */
export const ARM_RELAX_WEIGHT: Record<M7State, number> = {
  ENTRANCE: 1, // not applied during the walk itself, only the settle turn
  IDLE: 1,
  BORED: 0,
  GREETING: 0,
  DANCE: 0,
};

// ------------------------------------------------------------ boredom
/** No activity for this long (m_7 on screen, IDLE) → BORED. Also the
 *  cooldown after a greeting, and the "away" threshold for hidden tabs. */
export const BORED_AFTER_MS = 20_000;
/** Mouse moves smaller than this (px) are jitter, not activity. */
export const ACTIVITY_MOVE_PX = 4;
/** Fraction of m_7's canvas that must be on screen for the timer to run. */
export const VISIBLE_THRESHOLD = 0.35;

// ------------------------------------------------------------ safe bounds
/**
 * Vertical extents of m_7 across ALL states, in his root group's local
 * units (before the per-layout presentation scale). Measured from the
 * skinned mesh: Idle peaks at 1.059, Dance (with its 0.9 framing) at 1.028,
 * Sad at 1.06 — and Win's raised arm + jump at 1.185, the highest point he
 * ever reaches. The feet bottom out at -1.095 (Win's landing).
 */
export const SAFE_BOUNDS = {
  peakLocal: 1.185,
  feetLocal: -1.095,
  /** Clearance kept between his highest point and the nav's bottom edge. */
  navMarginPx: 24,
  /** Clearance kept between his feet and the bottom of his canvas. */
  bottomMarginPx: 8,
} as const;
