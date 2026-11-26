"use client";

import { useState, type CSSProperties } from "react";
import { EXPERIENCE } from "@/lib/experience";
import styles from "./Experience.module.css";

const FIRST_YEAR = Math.min(...EXPERIENCE.map((entry) => entry.startYear));
const LAST_YEAR = Math.max(...EXPERIENCE.map((entry) => entry.endYear ?? entry.startYear));
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, index) => FIRST_YEAR + index);

export default function Experience() {
  const [year, setYear] = useState(2025);
  const entries = EXPERIENCE.filter(
    ({ startYear, endYear }) => year >= startYear && (endYear === undefined || year <= endYear),
  );
  const progress = YEARS.length > 1 ? (100 * (year - FIRST_YEAR)) / (LAST_YEAR - FIRST_YEAR) : 100;

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
        <input
          type="range"
          id="experience-year"
          className={styles.range}
          min={FIRST_YEAR}
          max={LAST_YEAR}
          step={1}
          value={year}
          style={{ "--year-progress": `${progress}%` } as CSSProperties}
          onChange={(event) => setYear(event.currentTarget.valueAsNumber)}
        />
        <div className={styles.ticks} role="group" aria-label="Jump to a year">
          {YEARS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === year}
              onClick={() => setYear(value)}
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
        {entries.map((entry) => (
          <article key={entry.id} className={styles.entry}>
            <p className={styles.dates}>
              {entry.startYear} — {entry.endYear}
              {entry.qualifier && ` · ${entry.qualifier}`}
            </p>
            <h2>{entry.title}</h2>
            <p className={styles.org}>{entry.org}</p>
            <p className={styles.description}>{entry.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
