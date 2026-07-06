"use client";

import type { ComponentType } from "react";
import ModelCanvas from "./three/ModelCanvas";
import LumenModel from "./three/LumenModel";
import WayfarerModel from "./three/WayfarerModel";
import KeycapModel from "./three/KeycapModel";
import PulseModel from "./three/PulseModel";
import EchoModel from "./three/EchoModel";
import { useSectionProgress } from "@/lib/useSectionProgress";
import type { ShowcaseSection } from "@/lib/sections";
import styles from "./Showcase.module.css";

const MODELS: Record<string, ComponentType<{ progress: number }>> = {
  lumen: LumenModel,
  wayfarer: WayfarerModel,
  keycap: KeycapModel,
  pulse: PulseModel,
  echo: EchoModel,
};

export default function Showcase({ section }: { section: ShowcaseSection }) {
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const Model = MODELS[section.id];
  const reveal = Math.min(1, progress / 0.2);

  return (
    <section
      id={section.id}
      ref={ref}
      className={styles.section}
      data-layout={section.layout}
      style={
        {
          background: `linear-gradient(180deg, ${section.gradientFrom} 0%, ${section.gradientTo} 100%)`,
          "--accent": section.accent,
          "--glow-rgb": section.glow,
        } as React.CSSProperties
      }
    >
      <div className={styles.glow} aria-hidden="true" />
      <span className={styles.ghostNumeral} aria-hidden="true">
        {section.index}
      </span>

      <div className={styles.layout}>
        <div className={styles.stage}>
          <ModelCanvas cameraPosition={[0, 0, 4]} fov={34}>
            <Model progress={progress} />
          </ModelCanvas>
        </div>

        <div
          className={styles.copy}
          style={{
            opacity: reveal,
            transform: `translateY(${(1 - reveal) * 24}px)`,
          }}
        >
          <span className={styles.tag}>
            <span style={{ color: section.accent }}>{section.index}</span> · {section.tag}
          </span>
          <h2 className={styles.title}>{section.name}</h2>
          <p className={styles.description}>{section.description}</p>
          <a href={section.id === "echo" ? "/contact" : "#"} className={styles.cta}>
            {section.cta} →
          </a>
        </div>
      </div>
    </section>
  );
}
