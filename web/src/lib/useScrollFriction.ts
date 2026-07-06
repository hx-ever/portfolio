"use client";

import { useEffect, type RefObject } from "react";

const ZONE = 130; // resistance is felt within this distance of an entry's center
const CORE = 40; // near-lock radius right at the center
const MIN_MULT = 0.1; // 90% damping inside the core
const MAX_MULT = 0.85; // mild damping at the zone edge
const RELEASE_AFTER = 480; // sustained same-direction input (raw px) that breaks the hold
const ACC_DECAY_MS = 260; // accumulated intent decays on this timescale when input pauses

/**
 * Magnetic scroll resistance around focal points. While any `[data-focal]`
 * element inside the container sits near the viewport center, scroll input
 * (wheel — which covers trackpads — and touch drags) is damped: hardest at
 * the entry's center, easing toward the zone edge. Gentle input feels close
 * to a soft lock; sustained deliberate scrolling accumulates intent and
 * releases the hold until the entry's zone is exited. Skipped entirely
 * under prefers-reduced-motion.
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

    const nearest = () => {
      const focal = window.scrollY + window.innerHeight / 2;
      let min = Infinity;
      let index = -1;
      centers.forEach((c, i) => {
        const d = Math.abs(c - focal);
        if (d < min) {
          min = d;
          index = i;
        }
      });
      return { distance: min, index };
    };

    // Damping multiplier by distance: near-lock at the core, easing outward.
    const multiplierAt = (distance: number) => {
      if (distance <= CORE) return MIN_MULT;
      const u = (distance - CORE) / (ZONE - CORE);
      return MIN_MULT + (MAX_MULT - MIN_MULT) * Math.pow(u, 1.5);
    };

    // Sustained-intent accumulator shared by wheel and touch.
    let accumulated = 0;
    let lastInputAt = 0;
    let releasedIndex = -1; // entry whose hold has been broken through

    /** Returns the damped delta to apply manually, or null to leave native scrolling alone. */
    const process = (delta: number): number | null => {
      const now = performance.now();
      accumulated *= Math.exp(-(now - lastInputAt) / ACC_DECAY_MS);
      lastInputAt = now;
      if (Math.sign(delta) !== Math.sign(accumulated)) {
        accumulated = 0;
        releasedIndex = -1; // reversing direction re-engages the hold
      }
      accumulated += delta;

      const { distance, index } = nearest();
      if (index !== releasedIndex) releasedIndex = -1; // new entry re-arms
      if (distance >= ZONE) return null;
      if (index === releasedIndex) return null;
      if (Math.abs(accumulated) >= RELEASE_AFTER) {
        releasedIndex = index; // deliberate sustained scroll breaks the hold
        return null;
      }
      return delta * multiplierAt(distance);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // pinch-zoom gesture
      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= window.innerHeight;
      if (delta === 0) return;

      const damped = process(delta);
      if (damped === null) return;
      event.preventDefault();
      window.scrollBy({ top: damped, behavior: "instant" });
    };

    // Touch: once we take a gesture over, keep it manual until the finger
    // lifts — handing back and forth to native scrolling mid-gesture judders.
    let touchY = 0;
    let manualGesture = false;

    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0].clientY;
      manualGesture = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0].clientY;
      const delta = touchY - y;
      touchY = y;
      if (delta === 0) return;

      const damped = process(delta);
      if (damped === null && !manualGesture) return;
      manualGesture = true;
      event.preventDefault();
      window.scrollBy({ top: damped ?? delta, behavior: "instant" });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [ref]);
}
