"use client";

import { useEffect, type RefObject } from "react";

const ZONE = 90; // px around the viewport center where friction applies
const DAMPING = 0.35; // effective scroll = delta * DAMPING inside the zone
const INTENT = 120; // wheel deltas this large pass through undamped

/**
 * Magnetic scroll resistance around focal points. While any `[data-focal]`
 * element inside the container sits near the viewport center, wheel deltas
 * are damped so the entry lingers in focus; a forceful scroll (large delta)
 * breaks through undamped. Touch scrolling stays native — the entries'
 * CSS scroll-snap-align covers that path with proximity snapping.
 */
export function useScrollFriction<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let centers: number[] = [];

    const measure = () => {
      centers = Array.from(
        container.querySelectorAll<HTMLElement>("[data-focal]")
      ).map((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top + window.scrollY + rect.height / 2;
      });
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // pinch-zoom gesture
      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= window.innerHeight;
      if (Math.abs(delta) >= INTENT) return;

      const focal = window.scrollY + window.innerHeight / 2;
      const near = centers.some((c) => Math.abs(c - focal) < ZONE);
      if (!near) return;

      event.preventDefault();
      window.scrollBy({ top: delta * DAMPING, behavior: "instant" });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("wheel", onWheel);
    };
  }, [ref]);
}
