"use client";

import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";

// The five showcase GLBs in page order. Kept in sync with the MODEL
// constants in the showcase model components — the prefetcher is the only
// other place that names these files.
const MODELS = [
  "/auraeyez.glb",
  "/buggy.glb",
  "/hxkeysair.glb",
  "/corelink.glb",
  "/airmodule.glb", // CoreLink's companion submodules load with their section
  "/lightmodule.glb",
  "/arx.glb",
];

/**
 * Staggered idle-time warm-up of the showcase models. The GLBs used to be
 * preloaded at module scope — six parallel multi-MB fetches+parses competing
 * with the initial paint. Instead: wait for the hero to settle, then preload
 * one model at a time in page order during idle callbacks. A visitor who
 * scrolls immediately still gets each model via the canvas' own 500px
 * early-mount (Suspense covers the gap); everyone else finds every model
 * already cached by the time they reach it.
 */
export default function ModelPrefetcher() {
  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const idle = (cb: () => void) =>
      "requestIdleCallback" in window
        ? requestIdleCallback(cb, { timeout: 2500 })
        : setTimeout(cb, 400);
    const next = () => {
      if (cancelled || i >= MODELS.length) return;
      useGLTF.preload(MODELS[i++]);
      idle(next);
    };
    const t = setTimeout(() => idle(next), 800); // let first paint settle
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);
  return null;
}
