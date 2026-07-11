"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks a section's transit progress through the viewport: 0 when its
 * top edge enters at the bottom of the screen, 1 when its bottom edge
 * exits at the top. Since each section is exactly one viewport tall,
 * this lands at ~0.5 while the section fully fills the screen — used to
 * scroll-scrub each showcase's 3D model in place of scroll-jacking.
 */
export function useSectionProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // a zero denominator (collapsed rect before first layout) yields 0/0
      const raw = (vh - rect.top) / (vh + rect.height);
      setProgress(Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, progress };
}
