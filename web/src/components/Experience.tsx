"use client";

import { useRef } from "react";
import { EXPERIENCE, type ExperienceEntry } from "@/lib/experience";
import { HERO_ACCENT } from "@/lib/sections";
import { useFocusDistance, useSpineFill } from "@/lib/useFocusDistance";
import { useScrollFriction } from "@/lib/useScrollFriction";
import styles from "./Experience.module.css";

export default function Experience() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const { ref: trackRef, fraction } = useSpineFill<HTMLDivElement>();
  useScrollFriction(sectionRef);

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
        <h2 className={styles.title}>
          Where I&rsquo;ve been<span className={styles.dot}>.</span>
        </h2>
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
          <Row key={entry.id} entry={entry} row={i + 1} />
        ))}
      </div>
    </section>
  );
}

function Row({ entry, row }: { entry: ExperienceEntry; row: number }) {
  const { ref, t } = useFocusDistance<HTMLDivElement>();
  const focus = 1 - t;

  const cardStyle = {
    gridRow: row,
    filter: `blur(${(t * 7).toFixed(2)}px)`,
    opacity: 0.22 + focus * 0.78,
    transform: `scale(${1 + Math.pow(focus, 3) * 0.03})`,
    "--focus": focus,
  } as React.CSSProperties;

  return (
    <>
      <div
        ref={ref}
        className={styles.card}
        data-side={entry.side}
        data-focal=""
        style={cardStyle}
      >
        <span className={styles.range} style={{ color: `color-mix(in oklab, var(--accent) ${focus * 100}%, var(--dim))` }}>
          {entry.range}
          {entry.qualifier ? ` · ${entry.qualifier}` : ""}
        </span>
        {entry.incoming && <span className={styles.badge}>INCOMING · AUG 2026</span>}
        <span className={styles.entryTitle}>{entry.title}</span>
        <span className={styles.org}>{entry.org}</span>
        <p className={styles.description}>{entry.description}</p>
      </div>

      <div
        className={styles.node}
        data-incoming={entry.incoming ?? false}
        style={{ gridRow: row, "--focus": focus } as React.CSSProperties}
      />
    </>
  );
}
