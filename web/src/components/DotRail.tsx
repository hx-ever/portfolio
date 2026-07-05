"use client";

import { SHOWCASES } from "@/lib/sections";
import { useActiveSection } from "@/lib/useActiveSection";
import styles from "./DotRail.module.css";

const IDS = SHOWCASES.map((s) => s.id);

export default function DotRail() {
  const active = useActiveSection(IDS);
  const activeIndex = IDS.indexOf(active);
  const visible = activeIndex !== -1;

  return (
    <div className={styles.rail} data-visible={visible}>
      {SHOWCASES.map((section, i) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          aria-label={`Jump to ${section.name}`}
          className={styles.dot}
          data-active={i === activeIndex}
          style={
            i === activeIndex
              ? ({ "--dot-color": section.accent } as React.CSSProperties)
              : undefined
          }
        />
      ))}
    </div>
  );
}
