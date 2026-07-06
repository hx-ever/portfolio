"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** Distance from viewport center (px) within which an entry is fully sharp. */
export const FOCUS_PLATEAU = 150;

/**
 * Normalized distance (0 = centered in the viewport, 1 = at or beyond
 * `range` pixels away) of this element from the viewport's vertical
 * center. Powers scroll-driven focus effects like the Experience timeline,
 * where the entry nearest center reads sharp and others blur/fade out.
 *
 * Distances within `plateau` px of center report 0, so the entry stays
 * fully sharp across a window around center rather than at a single
 * point; beyond it, t ramps to 1 on a smoothstep (flat near the plateau
 * edge, steeper mid-transition). The plateau is deliberately wider than
 * the scroll-friction hold zone so the held entry reads comfortably for
 * the whole sticky stretch.
 */
export function useFocusDistance<T extends HTMLElement>(range = 320, plateau = FOCUS_PLATEAU) {
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
 * Index of the single "active" entry: the `[data-focal]` element inside
 * the container nearest the viewport center, provided it sits within the
 * clarity plateau; -1 when none qualifies. The one source of truth for
 * everything gated on "the active entry" (hover tilt/clarity/scale and
 * the spine connector), so at most one entry is ever interactive even
 * when two are simultaneously inside their own clarity plateaus.
 */
export function useActiveEntry<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const els = container.querySelectorAll<HTMLElement>("[data-focal]");
      const focal = window.innerHeight / 2;
      let best = -1;
      let min = Infinity;
      els.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const d = Math.abs(rect.top + rect.height / 2 - focal);
        if (d < min) {
          min = d;
          best = i;
        }
      });
      setActiveIndex(min <= FOCUS_PLATEAU ? best : -1);
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
  }, [ref]);

  return activeIndex;
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
