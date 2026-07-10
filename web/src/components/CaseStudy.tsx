"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { ShowcaseSection } from "@/lib/sections";
import ctaStyles from "./Showcase.module.css";
import styles from "./CaseStudy.module.css";

const REPO_URL = "https://github.com/hx-ever/AuraEyez";

// Both sides rendered from the real fab Gerbers (pcb-stackup composite of
// copper + mask + silkscreen + drills, clipped by Edge_Cuts). SVG, so the
// zoom stays crisp down to individual traces.
const SIDES = [
  { id: "top", label: "Top", src: "/auraeyez-pcb-top.svg" },
  { id: "bottom", label: "Bottom", src: "/auraeyez-pcb-bottom.svg" },
] as const;
type SideId = (typeof SIDES)[number]["id"];

// What the firmware actually does, in plain English — each with an optional
// 5–8 line peek at the real code (never the full file; the repo link is for
// that). Snippets are verbatim-trimmed from AuraEyez.ino.
const CAPABILITIES = [
  {
    label: "Motion-triggered wake",
    desc: "A PIR sensor keeps the OLED alive; ten seconds without motion and the display sleeps until someone walks by.",
    snippet: `if (digitalRead(PIR_PIN) == HIGH) {
  lastMotionTime = now;
  display.ssd1306_command(SSD1306_DISPLAYON);
}
if (now - lastMotionTime > SCREEN_TIMEOUT) {
  display.ssd1306_command(SSD1306_DISPLAYOFF);
  return; // asleep — skip the rest of the loop
}`,
  },
  {
    label: "Live environmental sensing",
    desc: "An HDC1080 supplies temperature and humidity through a two-phase trigger-then-read poll that never blocks the loop.",
    snippet: `// phase 1: kick off a conversion, note the time
Wire.beginTransmission(HDC1080_ADDR);
Wire.write(REG_TEMP);
Wire.endTransmission();
// phase 2 (next pass, >=15 ms later): read it
uint16_t raw  = (Wire.read() << 8) | Wire.read();
float celsius = (raw / 65536.0f) * 165.0f - 40.0f;`,
  },
  {
    label: "Rotary encoder navigation",
    desc: "Quadrature counts wrap around the three-entry menu; pressing the knob commits the highlighted page.",
    snippet: `long pos = (encoder.read() - menuEncoderBaseline) / 4;
if (pos < 0) pos += menuLength;
pos %= menuLength; // wraps around the menu
if (pos != menuSelectedIndex) {
  menuSelectedIndex = pos;
  drawMenu();
}`,
  },
  {
    label: "Animated idle face",
    desc: "RoboEyes drives the main screen — auto-blinking and wandering gaze make the device read as awake, not idle.",
    snippet: `roboEyes.begin(SCREEN_WIDTH, SCREEN_HEIGHT, 60);
roboEyes.setAutoblinker(ON, 3, 2); // blink ~every 3 s
roboEyes.setIdleMode(ON, 2, 2);    // gaze wanders on its own`,
  },
];

/**
 * The case-study CTA for sections that have an in-site case study: opens a
 * full-screen glass overlay (portal) instead of navigating anywhere. Entrance
 * is the site's overlay language — 200ms fade with a slight scale/rise.
 */
export default function CaseStudyCta({ section }: { section: ShowcaseSection }) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef(0);

  const open = () => {
    window.clearTimeout(closeTimer.current);
    setMounted(true);
    // two frames so the hidden state paints before the transition starts —
    // with a timer fallback, because rAF never fires in a hidden tab and the
    // overlay must not stall half-open (setShown is idempotent)
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    window.setTimeout(() => setShown(true), 80);
  };
  const close = useCallback(() => {
    setShown(false);
    closeTimer.current = window.setTimeout(() => {
      setMounted(false);
      triggerRef.current?.focus();
    }, 220); // matches the CSS fade duration
  }, []);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  return (
    <>
      <button ref={triggerRef} className={ctaStyles.cta} onClick={open}>
        {section.cta} →
      </button>
      {mounted &&
        createPortal(
          <CaseStudyModal section={section} shown={shown} onClose={close} />,
          document.body
        )}
    </>
  );
}

function CaseStudyModal({
  section,
  shown,
  onClose,
}: {
  section: ShowcaseSection;
  shown: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // <html> is the scroll container — lock it while the overlay is up
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      data-shown={shown}
      style={{ "--accent": section.accent } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`${section.name} case study`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.close} onClick={onClose} aria-label="Close case study">
          ✕
        </button>

        <header className={styles.header}>
          <span className={styles.eyebrow}>
            <span style={{ color: section.accent }}>{section.index}</span> · {section.tag}
          </span>
          <h2 className={styles.title}>{section.name}</h2>
          <p className={styles.lede}>
            An ESP32 desk assistant with animated RoboEyes, motion-triggered
            wake, and live temperature &amp; humidity — enclosure, PCB, and
            firmware built as one system.
          </p>
        </header>

        <section className={styles.block} aria-label="PCB viewer">
          <PcbViewer />
        </section>

        <section className={styles.block} aria-label="Firmware architecture">
          <h3 className={styles.blockTitle}>Firmware</h3>
          <p className={styles.blockNote}>
            One loop, five screens: a small state machine moves between them,
            gated by a PIR presence check.
          </p>
          <StateDiagram accent={section.accent} />
          <div className={styles.cards}>
            {CAPABILITIES.map((cap) => (
              <article key={cap.label} className={styles.card}>
                <h4 className={styles.cardLabel}>{cap.label}</h4>
                <p className={styles.cardDesc}>{cap.desc}</p>
                <details className={styles.peek}>
                  <summary>Peek at the code</summary>
                  <pre>
                    <code>{cap.snippet}</code>
                  </pre>
                </details>
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.repoLink}
          >
            Full repository on GitHub →
          </a>
        </footer>
      </div>
    </div>
  );
}

/**
 * Top/bottom board viewer over the Gerber-derived SVGs. Wheel zooms toward
 * the cursor (1–6x), drag pans, double-click resets — all written straight to
 * the transform (no per-frame React work). The wheel listener is attached
 * natively because React's synthetic wheel handlers are passive.
 */
function PcbViewer() {
  const [side, setSide] = useState<SideId>("top");
  const frameRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const drag = useRef({ x: 0, y: 0, active: false });

  const apply = () => {
    const el = innerRef.current;
    const { s, x, y } = view.current;
    if (el) el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  const clampPan = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const v = view.current;
    const maxX = (frame.clientWidth * (v.s - 1)) / 2;
    const maxY = (frame.clientHeight * (v.s - 1)) / 2;
    v.x = Math.max(-maxX, Math.min(maxX, v.x));
    v.y = Math.max(-maxY, Math.min(maxY, v.y));
  };
  const reset = () => {
    view.current = { s: 1, x: 0, y: 0 };
    apply();
  };

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // the board zooms; the modal must not scroll
      const v = view.current;
      const next = Math.min(6, Math.max(1, v.s * Math.exp(-e.deltaY * 0.0016)));
      const rect = frame.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      v.x = cx - ((cx - v.x) * next) / v.s;
      v.y = cy - ((cy - v.y) * next) / v.s;
      v.s = next;
      clampPan();
      apply();
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, active: true };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    view.current.x += e.clientX - drag.current.x;
    view.current.y += e.clientY - drag.current.y;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    clampPan();
    apply();
  };
  const endDrag = () => {
    drag.current.active = false;
  };

  const active = SIDES.find((s) => s.id === side)!;

  return (
    <div>
      <div className={styles.viewerBar}>
        <div className={styles.sideToggle} role="tablist" aria-label="Board side">
          {SIDES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={side === s.id}
              data-active={side === s.id}
              onClick={() => {
                setSide(s.id);
                reset(); // fresh side, fresh framing
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className={styles.viewerHint}>scroll to zoom · drag to pan · double-click to reset</span>
      </div>

      <div
        ref={frameRef}
        className={styles.viewerFrame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={reset}
      >
        <div ref={innerRef} className={styles.viewerInner}>
          <Image
            src={active.src}
            alt={`AuraEyez PCB, ${active.label.toLowerCase()} side — rendered from the fabrication Gerbers`}
            width={740}
            height={740}
            draggable={false}
            priority
          />
        </div>
      </div>

      <p className={styles.viewerCaption}>Custom PCB — 2-layer, KiCad · 74 × 74 mm</p>
    </div>
  );
}

/**
 * The firmware's actual state machine, drawn in the site's diagram language:
 * glass-chip nodes, hairline edges, the accent reserved for the resting
 * state. Transitions mirror AuraEyez.ino — nav button toggles MAIN↔MENU
 * (and recalls the last page), the encoder selects into the three sub-pages
 * and steps back out, and the PIR boundary gates the whole display.
 */
function StateDiagram({ accent }: { accent: string }) {
  const node = (
    x: number,
    y: number,
    label: string,
    accented = false
  ) => (
    <g>
      <rect
        x={x - 62}
        y={y - 21}
        width={124}
        height={42}
        rx={12}
        fill="rgba(255,255,255,0.045)"
        stroke={accented ? accent : "rgba(255,255,255,0.16)"}
        strokeOpacity={accented ? 0.65 : 1}
      />
      <text x={x} y={y + 4} textAnchor="middle" className={styles.diagramLabel}>
        {label}
      </text>
    </g>
  );

  return (
    <svg
      viewBox="0 0 720 330"
      className={styles.diagram}
      role="img"
      aria-label="Firmware state machine: the nav button toggles between the main face and the menu; the rotary encoder selects the temperature, humidity, or about page and steps back to the menu; a PIR motion boundary wakes the display and sleeps it after ten seconds idle."
    >
      <defs>
        <marker id="cs-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0,0.8 L7.2,4 L0,7.2 Z" fill="rgba(255,255,255,0.38)" />
        </marker>
      </defs>

      {/* PIR gate: the whole machine only runs while the display is awake */}
      <rect x={12} y={34} width={696} height={284} rx={20} fill="none" stroke="rgba(255,255,255,0.10)" strokeDasharray="5 7" />
      <text x={30} y={22} className={styles.diagramNote}>
        PIR motion → display on · sleeps after 10 s without motion
      </text>

      {/* MAIN ↔ MENU */}
      <path d="M 168 160 C 210 128, 250 128, 292 160" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow)" />
      <path d="M 292 192 C 250 224, 210 224, 168 192" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow)" />
      <text x={230} y={118} textAnchor="middle" className={styles.diagramNote}>nav button</text>
      <text x={230} y={244} textAnchor="middle" className={styles.diagramNote}>nav button · recalls last page</text>

      {/* MENU -> sub-pages (encoder select), sub-pages -> MENU (encoder press) */}
      <path d="M 420 160 C 470 120, 500 92, 534 78" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow)" />
      <path d="M 422 172 L 532 172" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow)" />
      <path d="M 420 184 C 470 224, 500 252, 534 266" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow)" />
      <path d="M 534 94 C 496 118, 466 140, 424 160" fill="none" stroke="rgba(255,255,255,0.18)" markerEnd="url(#cs-arrow)" />
      <path d="M 532 186 C 500 196, 470 196, 426 186" fill="none" stroke="rgba(255,255,255,0.18)" markerEnd="url(#cs-arrow)" />
      <path d="M 534 250 C 496 226, 466 204, 424 184" fill="none" stroke="rgba(255,255,255,0.18)" markerEnd="url(#cs-arrow)" />
      <text x={472} y={100} textAnchor="middle" className={styles.diagramNote}>encoder select</text>
      <text x={478} y={214} textAnchor="middle" className={styles.diagramNote}>encoder press · back</text>

      {node(106, 176, "MAIN · RoboEyes", true)}
      {node(358, 176, "MENU")}
      {node(596, 78, "TEMPERATURE")}
      {node(596, 172, "HUMIDITY")}
      {node(596, 266, "ABOUT")}
    </svg>
  );
}
