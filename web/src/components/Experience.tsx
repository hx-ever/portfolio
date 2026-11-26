"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EXPERIENCE } from "@/lib/experience";
import styles from "./Experience.module.css";

const FIRST_YEAR = Math.min(...EXPERIENCE.map((entry) => entry.startYear));
const LAST_YEAR = Math.max(...EXPERIENCE.map((entry) => entry.endYear ?? entry.startYear));
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, index) => FIRST_YEAR + index);

function magneticPosition(value: number) {
  const stop = Math.floor(value);
  const fraction = value - stop;
  const eased = fraction * fraction * (3 - 2 * fraction);
  // Ease at both ends of each interval while keeping the full range movable.
  return stop + 0.25 * fraction + 0.75 * eased;
}

export default function Experience() {
  const [position, setPosition] = useState(2025);
  const [dragging, setDragging] = useState(false);
  const [thumbHovered, setThumbHovered] = useState(false);
  const activePointer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const year = Math.round(position);
  const entries = EXPERIENCE.filter(
    ({ startYear, endYear }) => year >= startYear && (endYear === undefined || year <= endYear),
  );
  const visualPosition = dragging && !reducedMotion ? magneticPosition(position) : position;
  const progress = YEARS.length > 1 ? (100 * (visualPosition - FIRST_YEAR)) / (LAST_YEAR - FIRST_YEAR) : 100;

  function movePointer(event: PointerEvent<HTMLInputElement>) {
    if (event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const track = event.currentTarget.nextElementSibling?.getBoundingClientRect();
    const thumbX = track ? track.left + track.width * progress / 100 : rect.left;
    setThumbHovered(Math.abs(event.clientX - thumbX) <= 16);
  }

  function settle(event: PointerEvent<HTMLInputElement>) {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    setDragging(false);
    setPosition((current) => Math.round(current));
  }

  function changeYearWithKey(event: KeyboardEvent<HTMLInputElement>) {
    const stops: Record<string, number> = {
      ArrowLeft: year - 1,
      ArrowDown: year - 1,
      PageDown: year - 1,
      ArrowRight: year + 1,
      ArrowUp: year + 1,
      PageUp: year + 1,
      Home: FIRST_YEAR,
      End: LAST_YEAR,
    };
    const next = stops[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setPosition(Math.max(FIRST_YEAR, Math.min(LAST_YEAR, next)));
  }

  return (
    <section id="experience" className={styles.section}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Experience · {FIRST_YEAR} — {LAST_YEAR}</p>
        <h1>Where I&rsquo;ve been<span>.</span></h1>
      </header>

      <div className={styles.scrubber}>
        <div className={styles.scrubberHeader}>
          <label htmlFor="experience-year">Year</label>
          <span className={styles.readout} aria-hidden="true">{year}</span>
        </div>
        <div
          className={styles.slider}
          data-dragging={dragging}
          data-thumb-hovered={thumbHovered}
          style={{ "--year-progress": `${progress}%` } as CSSProperties}
        >
          <input
            type="range"
            id="experience-year"
            className={styles.range}
            min={FIRST_YEAR}
            max={LAST_YEAR}
            step={0.001}
            value={position}
            aria-valuetext={String(year)}
            onPointerDown={(event) => {
              if (event.button !== 0 || activePointer.current !== null) return;
              activePointer.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
            }}
            onPointerMove={movePointer}
            onPointerLeave={() => setThumbHovered(false)}
            onPointerUp={settle}
            onPointerCancel={settle}
            onLostPointerCapture={settle}
            onKeyDown={changeYearWithKey}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (activePointer.current !== null) {
                setPosition(next);
              } else {
                // Assistive technologies can adjust the native range directly.
                const stop = Math.round(next);
                const target = stop === year ? year + Math.sign(next - position) : stop;
                setPosition(Math.max(FIRST_YEAR, Math.min(LAST_YEAR, target)));
              }
            }}
          />
          <span className={styles.visualTrack} aria-hidden="true">
            <span className={styles.fill} />
            {YEARS.map((value, index) => (
              <span key={value} className={styles.notch} style={{ left: `${(100 * index) / Math.max(1, YEARS.length - 1)}%` }} />
            ))}
            <span className={styles.thumbAnchor}><span className={styles.thumb} /></span>
          </span>
        </div>
        <div className={styles.ticks} role="group" aria-label="Jump to a year">
          {YEARS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === year}
              onClick={() => setPosition(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.result} role="status">
        {entries.length} {entries.length === 1 ? "entry" : "entries"} in {year}
      </p>
      <div className={styles.entries}>
        <AnimatePresence initial={false} mode="popLayout">
          {entries.map((entry) => (
            <motion.article
              key={entry.id}
              className={styles.entry}
              layout={reducedMotion ? false : "position"}
              layoutDependency={year}
              initial={reducedMotion ? false : { opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -5 }}
              transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className={styles.dates}>
                {entry.startYear} — {entry.endYear}
                {entry.qualifier && ` · ${entry.qualifier}`}
              </p>
              <h2>{entry.title}</h2>
              <p className={styles.org}>{entry.org}</p>
              <p className={styles.description}>{entry.description}</p>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
