/**
 * Easter eggs — every piece of copy and every tunable lives here.
 *
 * Two hidden features, both invisible to normal visitors:
 *  1. A styled note in the browser DevTools console (production only).
 *  2. The Konami code (or five quick taps on m_7 on touch devices) puts the
 *     hero mascot into his DANCE state (see src/m7/).
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
// The dance itself (clip, loops, crossfade, in-place lock, framing) is one
// of m_7's states — configured in src/m7/config.ts with the others.

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
