/**
 * Easter eggs — every piece of copy and every tunable lives here.
 *
 * Two hidden features, both invisible to normal visitors:
 *  1. A styled note in the browser DevTools console (production only).
 *  2. The Konami code (or five quick taps on m_7 on touch devices) makes
 *     the hero mascot crossfade into his embedded "Dance" clip.
 */

// ---------------------------------------------------------------- console
export const CONSOLE = {
  /** Print only in production builds; flip to true to preview in `next dev`. */
  printInDevelopment: false,
  heading: "Hey, you opened DevTools.",
  intro:
    "That probably means you build things too. I'm Hank — a design engineer working across embedded systems, PCBs, firmware and product design.",
  craft:
    "This site was hand-built: Three.js models converted from my own CAD files, physics-based animations, and no templates.",
  contactLead: "Let's talk: ",
  contactLinks: "intern@hankhsu.com · github.com/hx-ever",
  hint: "P.S. m_7 has a secret move. Some codes never get old. ↑ ↑ ↓ ↓ ← → ← → B A",
} as const;

// ---------------------------------------------------------------- konami
/** Compared against `event.key` (letters lower-cased). */
export const KONAMI_SEQUENCE = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
] as const;

/** Progress resets if the gap between two key presses exceeds this. */
export const KEY_GAP_RESET_MS = 2000;

// ---------------------------------------------------------------- touch
/** Taps on m_7 needed within TAP_WINDOW_MS to trigger the dance. */
export const TAP_COUNT = 5;
export const TAP_WINDOW_MS = 2000;
/** A touch counts as a tap (not a scroll) only if it stays this still / short. */
export const TAP_MAX_MOVE_PX = 10;
export const TAP_MAX_DURATION_MS = 350;

// ---------------------------------------------------------------- dance
export const DANCE = {
  clipName: "Dance",
  /** Seconds for the Idle → Dance and Dance → Idle crossfades. */
  crossfade: 0.35,
  /**
   * The embedded clip is 5.25s, so a single loop already lands in the
   * ~5–6s target. Reduced motion keeps it to one loop as well.
   */
  loops: 1,
  loopsReducedMotion: 1,
  /** Pause after m_7 reaches Idle before a queued dance (e.g. arriving
   *  from another page) starts, so it reads as a reaction, not a glitch. */
  queuedStartDelayMs: 600,
  /** Bones whose translation tracks are stripped so he dances in place. */
  lockedRootBones: ["root"],
  /**
   * The clip also shifts his hips sideways relative to Idle; this bone is
   * pinned (horizontally) to where it sat in Idle for the whole dance, so
   * he never drifts toward the headline or out of ModelStage's safe area.
   */
  anchorBone: "DEF-spine",
  /**
   * The dance raises his hands well above his head. At full idle size they
   * would reach the nav's bottom edge, so he eases to this scale (pivoting
   * at his feet, blended with the crossfades) for the length of the dance.
   */
  scale: 0.9,
} as const;

// ---------------------------------------------------------------- toast
export const TOAST = {
  homeMessage: "Achievement unlocked: you found m_7's secret move.",
  awayMessage: "m_7 is dancing on the homepage.",
  awayLinkLabel: "Go say hi →",
  /** How long the toast stays up before it fades + slides out. */
  visibleMs: 3000,
  /** Matches the dock tooltip's 200ms fade-and-slide (Contact.module.css). */
  transitionMs: 200,
} as const;
