"use client";

import { useEffect, useRef, useState } from "react";
import { hasHover, prefersReducedMotion } from "@/lib/reducedMotion";
import { EXPERIENCE, type ExperienceEntry } from "@/lib/experience";
import { HERO_ACCENT } from "@/lib/sections";
import { useActiveEntry, useFocusDistance, useSpineFill } from "@/lib/useFocusDistance";
import { useScrollFriction } from "@/lib/useScrollFriction";
import styles from "./Experience.module.css";

export default function Experience() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const { ref: trackRef, fraction } = useSpineFill<HTMLDivElement>();
  const activeIndex = useActiveEntry(sectionRef);
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
  const { ref, t } = useFocusDistance<HTMLDivElement>();
  const focus = 1 - t;

  const [hovered, setHovered] = useState(false);

  // Tilt bypasses React entirely: mousemove writes --rx/--ry straight onto
  // the card, and the rendered transform reads them via var(). A cursor
  // stream never re-renders anything; the card's 220ms spring transition
  // still supplies the eased feel.
  const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!active || !hasHover()) return; // no tilt/clarity path on touch
    if (!hovered) setHovered(true);
    if (prefersReducedMotion()) return; // hover clarity only, no tilt
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--rx", `${(-py * 2 * MAX_TILT).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 2 * MAX_TILT).toFixed(2)}deg`);
  };

  const onMouseLeave = (event: React.MouseEvent<HTMLDivElement>) => {
    setHovered(false);
    event.currentTarget.style.setProperty("--rx", "0deg");
    event.currentTarget.style.setProperty("--ry", "0deg");
  };

  // Everything hover-driven is gated on `active` at render time, so a
  // card that drops out of the plateau mid-hover (scrolling with the
  // cursor parked on it) loses tilt and clarity immediately even though
  // no mouse event fires; mouseleave still resets the stale state.
  const clear = hovered && active; // hover clarity outranks scroll blur

  // The imperative tilt vars must also reset when the card leaves the
  // plateau under a parked cursor (no mouse event fires in that case).
  useEffect(() => {
    if (!active && ref.current) {
      ref.current.style.setProperty("--rx", "0deg");
      ref.current.style.setProperty("--ry", "0deg");
    }
  }, [active, ref]);

  const scale = (1 + Math.pow(focus, 3) * 0.03) * (clear ? HOVER_SCALE : 1);
  // Blur quantized to 0.5px steps: visually identical to the continuous
  // value, but the expensive re-rasterization happens ~14 times per card
  // transit instead of on every scroll frame.
  const blur = Math.round(t * 7 * 2) / 2;

  const cardStyle = {
    gridRow: row,
    filter: clear || blur === 0 ? "none" : `blur(${blur}px)`,
    opacity: clear ? 1 : 0.22 + focus * 0.78,
    transform: `perspective(700px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) scale(${scale.toFixed(3)})`,
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

      {/* Spine-to-card connector: visible only for the active entry, and
          retracts while it is hovered (the card "detaches" to be examined).
          Visibility is a data attribute so CSS can give the draw-out and
          retract transitions different durations and easings. */}
      <div
        className={styles.connector}
        data-side={entry.side}
        data-visible={active && !hovered}
        style={{ gridRow: row }}
        aria-hidden="true"
      />
    </>
  );
}
