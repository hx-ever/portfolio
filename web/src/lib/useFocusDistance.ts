"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Normalized distance (0 = centered in the viewport, 1 = at or beyond
 * `range` pixels away) of this element from the viewport's vertical
 * center. Powers scroll-driven focus effects like the Experience timeline,
 * where the entry nearest center reads sharp and others blur/fade out.
 */
export function useFocusDistance<T extends HTMLElement>(range = 320) {
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
      setT(Math.min(1, dist / range));
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
  }, [range]);

  return { ref, t };
}

/**
 * Height (in px) of the timeline spine that should be "filled" with the
 * accent color, measured from the top of this element down to wherever
 * the viewport's vertical center currently crosses it.
 */
export function useSpineFill<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [fill, setFill] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const raw = window.innerHeight / 2 - rect.top;
      setFill(Math.min(rect.height, Math.max(0, raw)));
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

  return { ref, fill };
}
