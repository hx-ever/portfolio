"use client";

import { useRef, useState } from "react";
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

const MAX_TILT = 10; // degrees at the card's edges

function Row({ entry, row }: { entry: ExperienceEntry; row: number }) {
  const { ref, t } = useFocusDistance<HTMLDivElement>();
  const focus = 1 - t;
  // Hover only works on the entry the scroll system holds in its clear
  // plateau; everything still blurred must ignore the cursor entirely.
  const active = t === 0;

  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [hovered, setHovered] = useState(false);

  const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!active) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setHovered(true);
    setTilt({ rx: -py * 2 * MAX_TILT, ry: px * 2 * MAX_TILT });
  };

  const onMouseLeave = () => {
    setHovered(false);
    setTilt({ rx: 0, ry: 0 });
  };

  // Everything hover-driven is gated on `active` at render time, so a
  // card that drops out of the plateau mid-hover (scrolling with the
  // cursor parked on it) loses tilt and clarity immediately even though
  // no mouse event fires; mouseleave still resets the stale state.
  const clear = hovered && active; // hover clarity outranks scroll blur
  const rx = active ? tilt.rx : 0;
  const ry = active ? tilt.ry : 0;

  const cardStyle = {
    gridRow: row,
    filter: clear ? "none" : `blur(${(t * 7).toFixed(2)}px)`,
    opacity: clear ? 1 : 0.22 + focus * 0.78,
    transform: `perspective(700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${1 + Math.pow(focus, 3) * 0.03})`,
    "--focus": focus,
  } as React.CSSProperties;

  return (
    <>
      <div
        ref={ref}
        className={styles.card}
        data-side={entry.side}
        data-focal=""
        data-active={active}
        style={cardStyle}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
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
