"use client";

import { useRef, useState, type RefObject } from "react";
import Image from "next/image";
import CaseStudyCta from "./CaseStudy";
import ModelCanvas, { type ModelLoader } from "./three/ModelCanvas";
import { useSectionProgress } from "@/lib/useSectionProgress";
import {
  useSectionPointer,
  type SectionPointer,
} from "@/lib/useSectionPointer";
import type { ShowcaseSection } from "@/lib/sections";
import styles from "./Showcase.module.css";

type ModelProps = { progress: number; pointer?: RefObject<SectionPointer> };

const MODELS: Record<string, ModelLoader<ModelProps>> = {
  auraeyez: () => import("./three/AuraEyezModel"),
  landrover: () => import("./three/BuggyModel"),
  hxkeysair: () => import("./three/KeycapModel"),
  corelink: () => import("./three/PulseModel"),
  arx: () => import("./three/EchoModel"),
};

export default function Showcase({ section }: { section: ShowcaseSection }) {
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const pointer = useSectionPointer(ref, section.id === "auraeyez");

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
          {/* the drone (arx) flies in from above: its canvas bleeds upward so
              the entry happens at the section's top edge, never mid-stage —
              EchoModel compensates the composition for the extra headroom */}
          <ModelCanvas
            loadModel={MODELS[section.id]}
            modelProps={{ progress, pointer }}
            cameraPosition={[0, 0, 4]}
            fov={34}
            className={section.id === "arx" ? styles.bleedTop : undefined}
          />
        </div>

        <div className={styles.copy}>
          <span className={styles.tag}>
            <span style={{ color: section.accent }}>{section.index}</span> ·{" "}
            {section.tag}
          </span>
          <h2 className={styles.title}>{section.name}</h2>
          {/* pain-point pitch — the technical description moved to the case
              study; same styling, content swap only */}
          <p className={styles.description}>{section.pitch}</p>
          {section.caseStudy ? (
            <CaseStudyCta section={section} />
          ) : (
            <CtaLink section={section} />
          )}
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
function CtaLink({ section }: { section: ShowcaseSection }) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, below: false });

  const anchorProps = {
    href: section.href ?? (section.id === "arx" ? "/contact" : "#"),
    className: styles.cta,
    ...(section.href?.startsWith("http")
      ? { target: "_blank", rel: "noopener noreferrer" }
      : {}),
  };
  const preview = section.preview;
  if (!preview) return <a {...anchorProps}>{section.cta} →</a>;

  const show = () => {
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
