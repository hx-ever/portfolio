"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const FOCUS_RANGE = 150;

const atPageEnd = () =>
  window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;

/** The timeline entry nearest the viewport center, within the highlight range. */
export function useActiveEntry<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const els = container.querySelectorAll<HTMLElement>("[data-focal]");
      if (atPageEnd()) {
        setActiveIndex(els.length - 1);
        return;
      }
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
      setActiveIndex(min <= FOCUS_RANGE ? best : -1);
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
      setFraction(atPageEnd() ? 1 : Math.min(1, Math.max(0, raw)));
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
