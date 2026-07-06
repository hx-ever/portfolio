"use client";

import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { HERO_ACCENT } from "@/lib/sections";
import { useLiveStats } from "@/lib/useLiveStats";
import styles from "./LiveStatusWidget.module.css";

// Soft, non-bouncy count-up: higher damping so the value settles without
// overshoot, matching a professional tone rather than a game score.
const SPRING = { stiffness: 80, damping: 26, mass: 1 };

function AnimatedNumber({ value }: { value: number | null }) {
  const reduced = useReducedMotion();
  const spring = useSpring(0, SPRING);
  const text = useTransform(spring, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    if (value == null) return;
    if (reduced) spring.jump(value);
    else spring.set(value);
  }, [value, reduced, spring]);

  if (value == null) return <span className={styles.num}>—</span>;
  return <motion.span className={styles.num}>{text}</motion.span>;
}

export default function LiveStatusWidget() {
  const { online, totalViews, currentPageViews, isError } = useLiveStats();

  return (
    <section
      className={styles.section}
      style={{ "--accent": HERO_ACCENT } as React.CSSProperties}
      aria-label="Live site activity"
    >
      <div className={styles.card}>
        {isError ? (
          <p className={styles.unavailable}>Analytics unavailable</p>
        ) : (
          <>
            <div className={styles.online}>
              <span className={styles.dotWrap} aria-hidden="true">
                <span className={styles.halo} />
                <span className={styles.dot} />
              </span>
              <span className={styles.onlineText}>
                <AnimatedNumber value={online} />
                <span className={styles.label}>online now</span>
              </span>
            </div>

            <span className={styles.divider} aria-hidden="true" />

            <div className={styles.stat}>
              <AnimatedNumber value={currentPageViews} />
              <span className={styles.label}>views here</span>
            </div>

            <span className={styles.divider} aria-hidden="true" />

            <div className={styles.stat}>
              <AnimatedNumber value={totalViews} />
              <span className={styles.label}>total views</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
