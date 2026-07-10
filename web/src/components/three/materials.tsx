"use client";

/** Shared "matte toylike" look for all product/character models. */
export const matte = {
  color: "#eee9df",
  roughness: 0.82,
  metalness: 0.06,
} as const;

export const matteDark = {
  color: "#242226",
  roughness: 0.75,
  metalness: 0.1,
} as const;

export const ink = {
  color: "#1c1c1e",
  roughness: 0.5,
  metalness: 0,
} as const;

/**
 * Dyson-inspired engineered base shared by all five showcase models: dark
 * graphite/iron, matte with a whisper of brushed metal — machined, not
 * molded. Accents live only at each model's interaction points.
 */
export const GRAPHITE = "#434347";
export const GRAPHITE_DEEP = "#3A3A3D";
export const graphite = {
  color: GRAPHITE,
  roughness: 0.72,
  metalness: 0.15,
} as const;
