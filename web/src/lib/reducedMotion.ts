/**
 * One-shot prefers-reduced-motion check for imperative animation code (the
 * CSS side is handled globally in globals.css). Safe to call during render
 * of client components — SSR returns false and the client re-checks.
 */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * True when the primary input can actually hover (mouse/trackpad). Hover-
 * driven JS effects (dock magnification, card tilt, nav pill) are skipped on
 * touch devices, where synthetic mouse events would otherwise leave stuck
 * hover states that need a second tap to clear.
 */
export const hasHover = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
