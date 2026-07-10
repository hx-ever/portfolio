"use client";

import { useRef, useState, type ComponentType, type RefObject } from "react";
import Image from "next/image";
import ModelCanvas from "./three/ModelCanvas";
import AuraEyezModel from "./three/AuraEyezModel";
import BuggyModel from "./three/BuggyModel";
import KeycapModel from "./three/KeycapModel";
import PulseModel from "./three/PulseModel";
import EchoModel from "./three/EchoModel";
import { useSectionProgress } from "@/lib/useSectionProgress";
import {
  useSectionPointer,
  type SectionPointer,
} from "@/lib/useSectionPointer";
import type { ShowcaseSection } from "@/lib/sections";
import styles from "./Showcase.module.css";

type ModelProps = { progress: number; pointer?: RefObject<SectionPointer> };

const MODELS: Record<string, ComponentType<ModelProps>> = {
  lumen: AuraEyezModel,
  wayfarer: BuggyModel,
  keycap: KeycapModel,
  pulse: PulseModel,
  echo: EchoModel,
};

export default function Showcase({ section }: { section: ShowcaseSection }) {
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const pointer = useSectionPointer(ref);
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
          {/* the drone (echo) flies in from above: its canvas bleeds upward so
              the entry happens at the section's top edge, never mid-stage —
              EchoModel compensates the composition for the extra headroom */}
          <ModelCanvas
            cameraPosition={[0, 0, 4]}
            fov={34}
            className={section.id === "echo" ? styles.bleedTop : undefined}
          >
            <Model progress={progress} pointer={pointer} />
          </ModelCanvas>
        </div>

        <div
          className={styles.copy}
          style={{
            opacity: reveal,
            // cleared once revealed: a lingering transform would make .copy
            // the containing block for the fixed-position case-study preview
            transform:
              reveal >= 1 ? undefined : `translateY(${(1 - reveal) * 24}px)`,
          }}
        >
          <span className={styles.tag}>
            <span style={{ color: section.accent }}>{section.index}</span> ·{" "}
            {section.tag}
          </span>
          <h2 className={styles.title}>{section.name}</h2>
          <p className={styles.description}>{section.description}</p>
          <CtaLink section={section} revealed={reveal >= 1} />
        </div>
      </div>
    </section>
  );
}

/**
 * The case-study link. Sections that carry a `preview` asset (currently only
 * Hxkeys Air's KiCad PCB export) get a hover/focus glass preview panel in
 * the Contact-dock tooltip language: same frosted material, same 200ms
 * fade-and-6px-slide. The panel is position:fixed and placed from the link's
 * rect on each show — above the link, flipping below when the fixed nav
 * leaves no room, clamped to the viewport on every edge — so the section's
 * overflow:hidden can never clip it. It's a child of the hover wrapper, so
 * moving the cursor from the link onto the panel keeps it open; leaving both
 * fades it out.
 */
function CtaLink({
  section,
  revealed,
}: {
  section: ShowcaseSection;
  revealed: boolean;
}) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, below: false });

  const anchorProps = {
    href: section.href ?? (section.id === "echo" ? "/contact" : "#"),
    className: styles.cta,
    ...(section.href?.startsWith("http")
      ? { target: "_blank", rel: "noopener noreferrer" }
      : {}),
  };
  const preview = section.preview;
  if (!preview) return <a {...anchorProps}>{section.cta} →</a>;

  const show = () => {
    // during the copy's reveal slide the link is at the viewport's bottom
    // edge (and .copy's transform would break fixed positioning) — skip
    if (!revealed) return;
    const wrap = wrapRef.current;
    const panel = panelRef.current;
    if (wrap && panel) {
      const link = wrap.getBoundingClientRect();
      const GAP = 12;
      const MARGIN = 16; // minimum clearance from the viewport edges
      const NAV_CLEAR = 96; // fixed nav bottom + breathing room
      const fitsAbove = link.top - GAP - panel.offsetHeight >= NAV_CLEAR;
      const top = Math.min(
        fitsAbove ? link.top - GAP - panel.offsetHeight : link.bottom + GAP,
        window.innerHeight - panel.offsetHeight - MARGIN
      );
      const left = Math.max(
        MARGIN,
        Math.min(link.left, window.innerWidth - panel.offsetWidth - MARGIN)
      );
      setPos({ top, left, below: !fitsAbove });
    }
    setVisible(true);
  };
  const hide = () => setVisible(false);

  return (
    <span
      ref={wrapRef}
      className={styles.previewWrap}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <a {...anchorProps} onFocus={show} onBlur={hide}>
        {section.cta} →
      </a>
      <div
        ref={panelRef}
        className={styles.previewPanel}
        data-visible={visible}
        data-placement={pos.below ? "below" : "above"}
        style={{ top: pos.top, left: pos.left }}
      >
        <Image
          src={preview.src}
          alt={preview.alt}
          width={preview.width}
          height={preview.height}
          className={styles.previewImage}
        />
        <span className={styles.previewCaption}>{preview.caption}</span>
      </div>
    </span>
  );
}
