"use client";

import { useEffect, useRef } from "react";
import styles from "./ScrollProgress.module.css";

/**
 * Hairline scroll-progress indicator along the very top edge of the
 * viewport: a 2px accent gradient that scales with overall page progress.
 * Written straight to the element's transform inside rAF-gated scroll
 * handling — no React state, no per-scroll re-renders.
 */
export default function ScrollProgress() {
  const bar = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = bar.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `scaleX(${p.toFixed(4)})`;
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

  return <div ref={bar} className={styles.bar} aria-hidden="true" />;
}
