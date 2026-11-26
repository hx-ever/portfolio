"use client";

import { useEffect, useRef, useState } from "react";
import { hasHover, prefersReducedMotion } from "@/lib/reducedMotion";
import { EXPERIENCE, type ExperienceEntry } from "@/lib/experience";
import { HERO_ACCENT } from "@/lib/sections";
import { useActiveEntry, useSpineFill } from "@/lib/useFocusDistance";
import styles from "./Experience.module.css";

export default function Experience() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const { ref: trackRef, fraction } = useSpineFill<HTMLDivElement>();
  const activeIndex = useActiveEntry(sectionRef);

  return (
    <section
      id="experience"
      ref={sectionRef}
      className={styles.section}
      style={{ "--accent": HERO_ACCENT } as React.CSSProperties}
    >
      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.header}>
        <span className={styles.eyebrow}>EXPERIENCE — 2022 → 2026</span>
        <h1 className={styles.title}>
          Where I&rsquo;ve been<span className={styles.dot}>.</span>
        </h1>
      </div>

      <div className={styles.timeline}>
        {/* grid-row 1/-1 can't span implicit rows, so span the entry count */}
        <div
          ref={trackRef}
          className={styles.spineTrack}
          style={{ gridRow: `1 / ${EXPERIENCE.length + 1}` }}
          aria-hidden="true"
        >
          <div className={styles.spineFill} style={{ transform: `scaleY(${fraction})` }} />
        </div>

        {EXPERIENCE.map((entry, i) => (
          <Row key={entry.id} entry={entry} row={i + 1} active={i === activeIndex} />
        ))}
      </div>
    </section>
  );
}

const MAX_TILT = 10; // degrees at the card's edges
const HOVER_SCALE = 1.06;

function Row({
  entry,
  row,
  active, // the single scroll-focused entry — the only one hover affects
}: {
  entry: ExperienceEntry;
  row: number;
  active: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  const [hovered, setHovered] = useState(false);

  // Tilt bypasses React entirely: mousemove writes --rx/--ry straight onto
  // the card, and the rendered transform reads them via var(). A cursor
  // stream never re-renders anything; the card's 220ms spring transition
  // still supplies the eased feel.
  const onMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    if (!active || !hasHover() || prefersReducedMotion()) return;
    if (!hovered) setHovered(true);
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--rx", `${(-py * 2 * MAX_TILT).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 2 * MAX_TILT).toFixed(2)}deg`);
  };

  const onMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
    setHovered(false);
    event.currentTarget.style.setProperty("--rx", "0deg");
    event.currentTarget.style.setProperty("--ry", "0deg");
  };

  // Everything hover-driven is gated on `active` at render time, so a
  // card that drops out of the plateau mid-hover (scrolling with the
  // cursor parked on it) loses tilt immediately even though
  // no mouse event fires; mouseleave still resets the stale state.
  const tilted = hovered && active;

  // The imperative tilt vars must also reset when the card leaves the
  // plateau under a parked cursor (no mouse event fires in that case).
  useEffect(() => {
    if (!active && ref.current) {
      ref.current.style.setProperty("--rx", "0deg");
      ref.current.style.setProperty("--ry", "0deg");
    }
  }, [active, ref]);

  return (
    <>
      <article
        ref={ref}
        className={styles.card}
        data-side={entry.side}
        data-focal=""
        data-active={active}
        style={{ gridRow: row, "--hover-scale": tilted ? HOVER_SCALE : 1 } as React.CSSProperties}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <span className={styles.range}>
          {entry.range}
          {entry.qualifier ? ` · ${entry.qualifier}` : ""}
        </span>
        {entry.incoming && <span className={styles.badge}>INCOMING · AUG 2026</span>}
        <h2 className={styles.entryTitle}>{entry.title}</h2>
        <span className={styles.org}>{entry.org}</span>
        <p className={styles.description}>{entry.description}</p>
      </article>

      <div
        className={styles.node}
        data-incoming={entry.incoming ?? false}
        style={{ gridRow: row, "--focus": active ? 1 : 0 } as React.CSSProperties}
        aria-hidden="true"
      />

      {/* Spine-to-card connector: visible only for the active entry, and
          retracts while it is hovered (the card "detaches" to be examined).
          Visibility is a data attribute so CSS can give the draw-out and
          retract transitions different durations and easings. */}
      <div
        className={styles.connector}
        data-side={entry.side}
        data-visible={active && !tilted}
        style={{ gridRow: row }}
        aria-hidden="true"
      />
    </>
  );
}
