"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { ShowcaseSection } from "@/lib/sections";
import ctaStyles from "./Showcase.module.css";
import styles from "./CaseStudy.module.css";

// ---------------------------------------------------------------------------
// Case-study registry. A section opts in with `caseStudy: true` in
// sections.ts and gets its content from this table, keyed by section id.
// Every study shares the same shell: header, PCB viewer (top/bottom layout
// renders exported from the real KiCad board via kicad-cli), a firmware
// diagram in the site's visual language, capability cards with 5–8 line
// code peeks (never the full file), and a secondary repo link.
// ---------------------------------------------------------------------------

interface Capability {
  label: string;
  desc: string;
  /** short verbatim code peek — omitted when the project has no public source */
  snippet?: string;
}

interface CaseStudyConfig {
  /** secondary footer link — omitted when there's no public repository */
  repo?: { url: string; label: string };
  lede: string;
  pcb: {
    sides: { id: string; label: string; src: string }[];
    caption: string;
    /** intrinsic pixel size matching the export's aspect */
    width: number;
    height: number;
  };
  firmwareNote: string;
  Diagram: ComponentType<{ accent: string }>;
  capabilities: Capability[];
}

// ---- AuraEyez (lumen) ------------------------------------------------------

// Snippets are verbatim-trimmed from AuraEyez.ino.
const AURA_CAPABILITIES: Capability[] = [
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
 * AuraEyez's actual firmware state machine — glass-chip nodes, hairline
 * edges, the accent reserved for the resting state. Transitions mirror
 * AuraEyes.ino: nav button toggles MAIN↔MENU (and recalls the last page),
 * the encoder selects into the three sub-pages and steps back out, and the
 * PIR boundary gates the whole display.
 */
function AuraDiagram({ accent }: { accent: string }) {
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

      <DiagramNode x={106} y={176} label="MAIN · RoboEyes" accent={accent} />
      <DiagramNode x={358} y={176} label="MENU" />
      <DiagramNode x={596} y={78} label="TEMPERATURE" />
      <DiagramNode x={596} y={172} label="HUMIDITY" />
      <DiagramNode x={596} y={266} label="ABOUT" />
    </svg>
  );
}

// ---- Hxkeys Air (keycap) ---------------------------------------------------

// Snippets are verbatim-trimmed from Firmware/code.py in the KMK repo.
const KEYS_CAPABILITIES: Capability[] = [
  {
    label: "Snap-tap strafe keys",
    desc: "The WASD keys are macros: releasing one instantly taps the opposite direction, so counter-strafes land without the finger dance.",
    snippet: `Astop = KC.MACRO(
    on_press=(Tap(KC.A),),
    on_hold=(Press(KC.A),),
    # releasing A fires a tap of D — the counter-strafe
    on_release=(Release(KC.A), Tap(KC.D)),
)`,
  },
  {
    label: "Two layers, one toggle",
    desc: "KC.TG(1) flips the whole board between a gaming pad and a launcher pad — the same ten keys, two personalities.",
    snippet: `keyboard.keymap = [
    # layer 0 — snap-tap WASD, shift, backspace
    [KC.TG(1), Wstop, KC.E,  KC.R,
     Astop,    Sstop, Dstop, KC.F, ...],
    # layer 1 — app launchers and typing macros
    [KC.TG(1), KC.NO, Email, KC.NO, Arc, ...],
]`,
  },
  {
    label: "Per-layer rotary encoder",
    desc: "The knob is volume and mute on the base layer; on the macro layer the same detents ride the RGB hue instead.",
    snippet: `encoder_handler.map = [
    # layer 0 — volume control
    ((KC.VOLU, KC.VOLD, KC.MUTE),),
    # layer 1 — RGB control
    ((KC.RGB_HUI, KC.RGB_HUD, KC.RGB_TOG),),
]`,
  },
  {
    label: "App-launch & typing macros",
    desc: "One key Spotlight-launches Arc; another types a full address, waiting out the input-method switch between keystrokes.",
    snippet: `Arc = KC.MACRO(
    Press(KC.LGUI), Tap(KC.SPACE),  # Spotlight
    Release(KC.LGUI),
    Tap(KC.A), Tap(KC.R), Tap(KC.C),
    Delay(1000),                    # let results load
    Tap(KC.ENTER),
)`,
  },
];

/**
 * The macropad's firmware topology, in the same diagram language: the 4×3
 * diode matrix and the encoder feed KMK's scan loop, one toggle key flips
 * between the two layers (the board's "states"), and everything leaves as
 * USB HID reports. Layer 0 carries the accent as the resting state.
 */
function KeysDiagram({ accent }: { accent: string }) {
  return (
    <svg
      viewBox="0 0 720 330"
      className={styles.diagram}
      role="img"
      aria-label="Firmware topology: a four-by-three diode matrix and a rotary encoder feed KMK's scan loop; a toggle key switches between layer zero (snap-tap WASD with volume on the encoder) and layer one (launcher macros with RGB hue on the encoder); both layers emit USB HID reports."
    >
      <defs>
        <marker id="cs-arrow2" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0,0.8 L7.2,4 L0,7.2 Z" fill="rgba(255,255,255,0.38)" />
        </marker>
      </defs>

      {/* the whole loop lives on the module */}
      <rect x={12} y={34} width={696} height={284} rx={20} fill="none" stroke="rgba(255,255,255,0.10)" strokeDasharray="5 7" />
      <text x={30} y={22} className={styles.diagramNote}>
        Seeed XIAO RP2040 · KMK on CircuitPython
      </text>

      {/* inputs -> layers */}
      <path d="M 172 108 C 220 108, 240 112, 288 118" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow2)" />
      <text x={228} y={96} textAnchor="middle" className={styles.diagramNote}>COL2ROW scan</text>
      <path d="M 172 244 C 216 238, 236 190, 286 142" fill="none" stroke="rgba(255,255,255,0.18)" markerEnd="url(#cs-arrow2)" />
      <path d="M 172 258 L 286 258" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow2)" />
      <text x={228} y={186} textAnchor="middle" className={styles.diagramNote}>volume · mute</text>
      <text x={228} y={276} textAnchor="middle" className={styles.diagramNote}>hue · rgb toggle</text>

      {/* layer toggle */}
      <path d="M 344 152 C 336 186, 336 202, 344 236" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow2)" />
      <path d="M 376 236 C 384 202, 384 186, 376 152" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow2)" />
      <text x={360} y={200} textAnchor="middle" className={styles.diagramNote}>TG(1)</text>

      {/* layers -> HID */}
      <path d="M 424 122 C 480 122, 510 148, 546 166" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow2)" />
      <path d="M 424 260 C 480 260, 510 216, 546 190" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow2)" />
      <text x={492} y={112} textAnchor="middle" className={styles.diagramNote}>keys · media</text>
      <text x={492} y={248} textAnchor="middle" className={styles.diagramNote}>macros · rgb</text>

      <DiagramNode x={110} y={108} label="4×3 MATRIX" />
      <DiagramNode x={110} y={252} label="ENCODER" />
      <DiagramNode x={360} y={130} label="LAYER 0 · WASD" accent={accent} />
      <DiagramNode x={360} y={258} label="LAYER 1 · MACROS" />
      <DiagramNode x={610} y={178} label="USB HID" />
    </svg>
  );
}

// ---- Land Rover (wayfarer) -------------------------------------------------

// No public repository for this one (university group project), so the cards
// carry no code peeks — every claim below is from the team's final report.
const BUGGY_CAPABILITIES: Capability[] = [
  {
    label: "Hybrid sensor array",
    desc: "Two centre analogue TCRT5000s resolve the line continuously to ±17 mm; four digital flanks with trimmer-set thresholds flag hard escapes at ±27 and ±52 mm.",
  },
  {
    label: "Dual-loop control",
    desc: "An outer position PID turns displacement into left/right speed demands; an inner PI loop per wheel holds that speed against disturbances using encoder feedback.",
  },
  {
    label: "Noise-hardened line sensing",
    desc: "Dynamic averaging steadies the displacement signal, and infrared sensors tucked behind the front wheel shrug off ambient light — the buggy runs even in the dark.",
  },
  {
    label: "Bluetooth tuning & race control",
    desc: "An HM10 link streams live variables and retunes PID gains on the fly; the race-day 180° turnaround is triggered over the same link.",
  },
];

/**
 * The buggy's nested control loops, in the same diagram language: the sensor
 * board feeds an outer position PID (the accent — the steering brain), whose
 * differential speed demands are held by per-wheel PI loops closed on the
 * encoders; the buggy's own motion closes the outermost loop by shifting the
 * line under the array.
 */
function BuggyDiagram({ accent }: { accent: string }) {
  return (
    <svg
      viewBox="0 0 720 330"
      className={styles.diagram}
      role="img"
      aria-label="Control topology: the hybrid sensor array measures line displacement, an outer position PID converts it into differential wheel-speed demands, two inner PI loops hold each wheel to its demand using encoder feedback, and the buggy's motion shifts the line under the array, closing the outer loop."
    >
      <defs>
        <marker id="cs-arrow3" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0,0.8 L7.2,4 L0,7.2 Z" fill="rgba(255,255,255,0.38)" />
        </marker>
      </defs>

      <rect x={12} y={34} width={696} height={284} rx={20} fill="none" stroke="rgba(255,255,255,0.10)" strokeDasharray="5 7" />
      <text x={30} y={22} className={styles.diagramNote}>
        Nucleo STM32F401RE · Mbed C++
      </text>

      {/* forward path: sensors -> position PID -> wheel PIs -> motors */}
      <path d="M 157 130 L 221 130" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow3)" />
      <text x={189} y={116} textAnchor="middle" className={styles.diagramNote}>±17 mm</text>
      <path d="M 347 130 L 411 130" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow3)" />
      <text x={379} y={116} textAnchor="middle" className={styles.diagramNote}>speed demands</text>
      <path d="M 537 130 L 576 130" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow3)" />
      <text x={557} y={116} textAnchor="middle" className={styles.diagramNote}>PWM</text>

      {/* inner loop: motors -> encoders -> wheel PIs */}
      <path d="M 630 152 C 620 200, 580 240, 539 252" fill="none" stroke="rgba(255,255,255,0.18)" markerEnd="url(#cs-arrow3)" />
      <path d="M 413 250 C 450 236, 462 200, 470 154" fill="none" stroke="rgba(255,255,255,0.28)" markerEnd="url(#cs-arrow3)" />
      <text x={432} y={210} textAnchor="middle" className={styles.diagramNote}>measured speed</text>

      {/* outer loop: the buggy moves, the line shifts under the array */}
      <path d="M 640 156 C 640 300, 130 300, 96 156" fill="none" stroke="rgba(255,255,255,0.14)" strokeDasharray="4 6" markerEnd="url(#cs-arrow3)" />
      <text x={368} y={310} textAnchor="middle" className={styles.diagramNote}>the buggy moves · the line shifts under the array</text>

      <DiagramNode x={95} y={130} label="SENSOR ARRAY" />
      <DiagramNode x={285} y={130} label="POSITION PID" accent={accent} />
      <DiagramNode x={475} y={130} label="WHEEL PI ×2" />
      <DiagramNode x={640} y={130} label="MOTORS" />
      <DiagramNode x={475} y={258} label="ENCODERS" />
    </svg>
  );
}

// ---- shared diagram node ---------------------------------------------------

function DiagramNode({
  x,
  y,
  label,
  accent,
}: {
  x: number;
  y: number;
  label: string;
  accent?: string;
}) {
  return (
    <g>
      <rect
        x={x - 62}
        y={y - 21}
        width={124}
        height={42}
        rx={12}
        fill="rgba(255,255,255,0.045)"
        stroke={accent ?? "rgba(255,255,255,0.16)"}
        strokeOpacity={accent ? 0.65 : 1}
      />
      <text x={x} y={y + 4} textAnchor="middle" className={styles.diagramLabel}>
        {label}
      </text>
    </g>
  );
}

// ---- the registry ----------------------------------------------------------

const CASE_STUDIES: Record<string, CaseStudyConfig> = {
  lumen: {
    repo: {
      url: "https://github.com/hx-ever/AuraEyez",
      label: "Full repository on GitHub →",
    },
    lede: "An ESP32 desk assistant with animated RoboEyes, motion-triggered wake, and live temperature & humidity — enclosure, PCB, and firmware built as one system.",
    pcb: {
      sides: [
        { id: "top", label: "Top", src: "/auraeyez-pcb-top.svg" },
        { id: "bottom", label: "Bottom", src: "/auraeyez-pcb-bottom.svg" },
      ],
      caption: "Custom PCB — 2-layer, KiCad · 74 × 74 mm",
      width: 740,
      height: 855,
    },
    firmwareNote:
      "One loop, five screens: a small state machine moves between them, gated by a PIR presence check.",
    Diagram: AuraDiagram,
    capabilities: AURA_CAPABILITIES,
  },
  wayfarer: {
    // university group project — no public repository, so no footer link
    // and no code peeks on the cards
    lede: "An autonomous line-following buggy built by a five-person team I led — Nucleo STM32 control in Mbed C++, dual-loop PID steering, and a custom hybrid analogue/digital sensor board, engineered from chassis to firmware.",
    pcb: {
      sides: [
        { id: "top", label: "Top", src: "/buggy-pcb-top.svg" },
        { id: "bottom", label: "Bottom", src: "/buggy-pcb-bottom.svg" },
      ],
      caption: "Sensor board — 2-layer, Altium Designer · 125 × 75 mm",
      width: 740,
      height: 443,
    },
    firmwareNote:
      "Two nested loops in Mbed C++ on a Nucleo STM32F401RE: an outer position PID reads the line, and two inner PI loops hold each wheel to the speed it demands.",
    Diagram: BuggyDiagram,
    capabilities: BUGGY_CAPABILITIES,
  },
  keycap: {
    repo: {
      url: "https://github.com/hx-ever/KMK-macropad",
      label: "Full repository on GitHub →",
    },
    lede: "A 10-key macropad with a rotary encoder, running KMK on a Seeed XIAO RP2040 — snap-tap gaming macros, a second launcher layer, and per-layer encoder control.",
    pcb: {
      sides: [
        { id: "top", label: "Top", src: "/hxkeysair-pcb-top.svg" },
        { id: "bottom", label: "Bottom", src: "/hxkeysair-pcb-bottom.svg" },
      ],
      caption: "Custom PCB — 2-layer, KiCad · 76 × 94 mm",
      width: 740,
      height: 935,
    },
    firmwareNote:
      "One keymap, two personalities: a 4×3 diode matrix feeds KMK's scan loop, and a single toggle key flips every binding.",
    Diagram: KeysDiagram,
    capabilities: KEYS_CAPABILITIES,
  },
};

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

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

  const study = CASE_STUDIES[section.id];

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

  if (!study) return null; // a caseStudy section must have a registry entry

  return (
    <>
      <button ref={triggerRef} className={ctaStyles.cta} onClick={open}>
        {section.cta} →
      </button>
      {mounted &&
        createPortal(
          <CaseStudyModal section={section} study={study} shown={shown} onClose={close} />,
          document.body
        )}
    </>
  );
}

function CaseStudyModal({
  section,
  study,
  shown,
  onClose,
}: {
  section: ShowcaseSection;
  study: CaseStudyConfig;
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
          <p className={styles.lede}>{study.lede}</p>
        </header>

        <section className={styles.block} aria-label="PCB viewer">
          <PcbViewer name={section.name} pcb={study.pcb} />
        </section>

        <section className={styles.block} aria-label="Firmware architecture">
          <h3 className={styles.blockTitle}>Firmware</h3>
          <p className={styles.blockNote}>{study.firmwareNote}</p>
          <study.Diagram accent={section.accent} />
          <div className={styles.cards}>
            {study.capabilities.map((cap) => (
              <article key={cap.label} className={styles.card}>
                <h4 className={styles.cardLabel}>{cap.label}</h4>
                <p className={styles.cardDesc}>{cap.desc}</p>
                {cap.snippet && (
                  <details className={styles.peek}>
                    <summary>Peek at the code</summary>
                    <pre>
                      <code>{cap.snippet}</code>
                    </pre>
                  </details>
                )}
              </article>
            ))}
          </div>
        </section>

        {study.repo && (
          <footer className={styles.footer}>
            <a
              href={study.repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.repoLink}
            >
              {study.repo.label}
            </a>
          </footer>
        )}
      </div>
    </div>
  );
}

/**
 * Top/bottom board viewer over the KiCad layout exports (kicad-cli, editor
 * theme — red front copper, blue back copper; the bottom side is mirrored as
 * if the board were flipped over). Wheel zooms toward the cursor (1–6x),
 * drag pans, double-click resets — all written straight to the transform (no
 * per-frame React work). The wheel listener is attached natively because
 * React's synthetic wheel handlers are passive.
 */
function PcbViewer({
  name,
  pcb,
}: {
  name: string;
  pcb: CaseStudyConfig["pcb"];
}) {
  const [side, setSide] = useState(pcb.sides[0].id);
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

  const active = pcb.sides.find((s) => s.id === side)!;

  return (
    <div>
      <div className={styles.viewerBar}>
        <div className={styles.sideToggle} role="tablist" aria-label="Board side">
          {pcb.sides.map((s) => (
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
            alt={`${name} PCB layout, ${active.label.toLowerCase()} side — routing view exported from the KiCad board`}
            width={pcb.width}
            height={pcb.height}
            draggable={false}
            priority
            // inline so next/image's own sizing styles can't override the
            // letterboxed fill of the square frame
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
      </div>

      <p className={styles.viewerCaption}>{pcb.caption}</p>
    </div>
  );
}
