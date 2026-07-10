/**
 * One-shot prefers-reduced-motion check for imperative animation code (the
 * CSS side is handled globally in globals.css). Safe to call during render
 * of client components — SSR returns false and the client re-checks.
 */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
