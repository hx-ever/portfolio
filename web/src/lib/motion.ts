/**
 * Motion duration tokens for imperative (JS / three.js) animation code.
 * Mirrors the duration scale documented with the easing tokens in
 * globals.css (~170 / 220 / 340 / 500ms) — keep the two in sync, the same
 * way palette.ts mirrors the colour tokens.
 */
export const DURATION_MS = {
  quick: 170,
  base: 220,
  slow: 340,
  slower: 500,
} as const;

export const DURATION_S = {
  quick: DURATION_MS.quick / 1000,
  base: DURATION_MS.base / 1000,
  slow: DURATION_MS.slow / 1000,
  slower: DURATION_MS.slower / 1000,
} as const;
