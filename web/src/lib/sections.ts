import { SIGNATURE, SECTION_COLORS } from "./palette";

export type Layout = "model-left" | "model-right" | "model-center";

export interface ShowcaseSection {
  index: string; // "01".."05"
  id: string;
  name: string;
  tag: string;
  /** pain-point pitch — the primary line under the title on the main card,
      the first thing a visitor reads. The technical detail moved to the case
      study (`description`), so this is what sells the project at a glance. */
  pitch: string;
  /** technical description — displayed as the case study's opening lede, no
      longer shown on the main showcase card. */
  description: string;
  cta: string;
  /** case-study link target; an http(s) URL opens in a new tab */
  href?: string;
  /** hover/focus preview panel on the case-study link (glass-pill treatment,
      same interaction language as the Contact dock tooltips). Only sections
      with a real exported asset carry one. */
  preview?: {
    src: string;
    alt: string;
    caption: string;
    /** intrinsic pixel size of the asset (aspect source for layout) */
    width: number;
    height: number;
  };
  /** the case-study link opens the in-site case study overlay instead of
      navigating. AuraEyez, Land Rover, and Hxkeys Air have full studies (PCB
      viewer + firmware); CoreLink and Arx have minimal studies (description +
      repo link only — no PCB/firmware assets exist for them yet). */
  caseStudy?: boolean;
  accent: string;
  glow: string; // rgba glow color used behind the model
  layout: Layout;
  /** background gradient this section fades from -> to, threading into the next section */
  gradientFrom: string;
  gradientTo: string;
  motion: string;
}

// The hero + all shared chrome (Contact dock, Experience timeline, live
// status) ride the site's single signature colour.
export const HERO_ACCENT = SIGNATURE;

export const SHOWCASES: ShowcaseSection[] = [
  {
    index: "01",
    id: "auraeyez",
    name: "AuraEyez",
    tag: "PRODUCT — EMBEDDED SYSTEMS",
    pitch:
      "Solves the problem of not having instant, personalized advice the moment you're about to head outdoors.",
    description:
      "An ESP32-powered smart assistant with animated RoboEyes on an OLED display, motion-triggered wake behavior, and a two-knob control interface — enclosure, PCB, and firmware built as one system.",
    cta: "View case study",
    caseStudy: true,
    accent: SECTION_COLORS.auraeyez.accent,
    glow: SECTION_COLORS.auraeyez.rgb,
    layout: "model-left",
    gradientFrom: "#060607",
    gradientTo: "#140D07",
    motion: "AuraEyez device rotates with scroll · eyes track cursor · knob hover glow",
  },
  {
    index: "02",
    id: "landrover",
    name: "Land Rover",
    tag: "TEAM LEAD — ROBOTICS",
    // PLACEHOLDER pitch — user-drafted, flagged as needing confirmation.
    pitch:
      "Solves the lack of affordable, complete STEM kits for learning real autonomous-vehicle control systems hands-on.",
    description:
      "An autonomous line-following buggy I led a five-person team to build — STM32 control, dual-loop PID steering, and a hybrid analogue/digital sensor array, engineered from chassis to firmware.",
    cta: "View case study",
    // in-site case study (sensor-board PCB viewer + control-loop firmware
    // view); no public repo for this group project
    caseStudy: true,
    accent: SECTION_COLORS.landrover.accent,
    glow: SECTION_COLORS.landrover.rgb,
    layout: "model-right",
    gradientFrom: "#140D06",
    gradientTo: "#0A1309",
    motion: "buggy drives in from the right and brakes to a stop · one-time per session",
  },
  {
    index: "03",
    id: "hxkeysair",
    name: "Hxkeys Air",
    tag: "PRODUCT — INPUT DEVICE",
    pitch:
      "Separates gaming macro input from a traditional keyboard — personalized keys and trigger effects built to improve in-game performance.",
    description:
      "A custom 10-key macropad running KMK firmware on a Seeed Studio XIAO RP2040 — PCB, 3D-printed enclosure, and firmware designed and built as one system.",
    cta: "View case study",
    // in-site case study (PCB viewer + firmware) — the GitHub repo link
    // lives inside it as the secondary footer link
    caseStudy: true,
    accent: SECTION_COLORS.hxkeysair.accent,
    glow: SECTION_COLORS.hxkeysair.rgb,
    layout: "model-center",
    gradientFrom: "#0A1309",
    gradientTo: "#0C0E15",
    motion: "keyboard explodes into keycaps mid-section → reassembles on exit",
  },
  {
    index: "04",
    id: "corelink",
    name: "CoreLink",
    tag: "FINAL YEAR PROJECT — EMBEDDED AI",
    pitch:
      "Solves smart home Wi-Fi dependency with a peer-to-peer, low-latency ESP32 protocol.",
    description:
      "A lightweight AI framework for context-aware smart home networks — ESP32 edge devices running on-device sensor fusion and adaptive logic for air quality and lighting control, without a cloud round-trip.",
    cta: "View case study",
    // minimal in-site case study (description + repo link); the repo lives in
    // the study's footer rather than as a direct external card link
    caseStudy: true,
    accent: SECTION_COLORS.corelink.accent,
    glow: SECTION_COLORS.corelink.rgb,
    layout: "model-left",
    gradientFrom: "#0C0E15",
    gradientTo: "#100C16",
    motion: "hub boots, then link pulses connect each submodule in turn · slow ambient ring while idle · scroll-scrub rotation",
  },
  {
    index: "05",
    id: "arx",
    name: "Arx",
    tag: "BUILD — FPV DRONE",
    // PLACEHOLDER pitch — user-drafted, flagged as needing confirmation.
    pitch:
      "Solves the gap between expensive ready-made drones and inaccessible full-scratch builds — a frame anyone can build on and customize.",
    description:
      "A four-propeller ESP32 drone, built from an open community design and adapted with a custom-designed 3D-printed frame — phone-controlled flight, hands-on with FC/ESC wiring and build tuning.",
    cta: "View case study",
    // minimal in-site case study (description + repo link)
    caseStudy: true,
    accent: SECTION_COLORS.arx.accent,
    glow: SECTION_COLORS.arx.rgb,
    layout: "model-right",
    gradientFrom: "#100C16",
    gradientTo: "#140913",
    motion: "flies in from above and wobble-corrects into a perpetual hover · props never stop",
  },
];
