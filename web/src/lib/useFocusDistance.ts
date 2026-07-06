"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Normalized distance (0 = centered in the viewport, 1 = at or beyond
 * `range` pixels away) of this element from the viewport's vertical
 * center. Powers scroll-driven focus effects like the Experience timeline,
 * where the entry nearest center reads sharp and others blur/fade out.
 *
 * Distances within `plateau` px of center report 0, so the entry stays
 * fully sharp across a window around center rather than at a single
 * point; beyond it, t ramps to 1 on a smoothstep (flat near the plateau
 * edge, steeper mid-transition).
 */
export function useFocusDistance<T extends HTMLElement>(range = 320, plateau = 100) {
  const ref = useRef<T | null>(null);
  const [t, setT] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      const dist = Math.abs(cardCenter - viewportCenter);
      const u = Math.min(1, Math.max(0, (dist - plateau) / (range - plateau)));
      setT(u * u * (3 - 2 * u));
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
  }, [range, plateau]);

  return { ref, t };
}

/**
 * Fraction (0–1) of the timeline spine that should be "filled" with the
 * accent color: how far the viewport's vertical center has traveled down
 * this element. Grows as you scroll down, shrinks back as you scroll up,
 * continuously per animation frame. Recomputes on viewport resize and on
 * any change to the element's own size.
 */
export function useSpineFill<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [fraction, setFraction] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0) return;
      const raw = (window.innerHeight / 2 - rect.top) / rect.height;
      setFraction(Math.min(1, Math.max(0, raw)));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    const observer = new ResizeObserver(onScroll);
    observer.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, fraction };
}
