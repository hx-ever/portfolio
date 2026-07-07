export type Layout = "model-left" | "model-right" | "model-center";

export interface ShowcaseSection {
  index: string; // "01".."05"
  id: string;
  name: string;
  tag: string;
  description: string;
  cta: string;
  /** case-study link target; an http(s) URL opens in a new tab */
  href?: string;
  accent: string;
  glow: string; // rgba glow color used behind the model
  layout: Layout;
  /** background gradient this section fades from -> to, threading into the next section */
  gradientFrom: string;
  gradientTo: string;
  motion: string;
}

export const HERO_ACCENT = "#2997FF";

export const SHOWCASES: ShowcaseSection[] = [
  {
    index: "01",
    id: "lumen",
    name: "AuraEyez",
    tag: "PRODUCT — EMBEDDED SYSTEMS",
    description:
      "An ESP32-powered smart assistant with animated RoboEyes on an OLED display, motion-triggered wake behavior, and a two-knob control interface — enclosure, PCB, and firmware built as one system.",
    cta: "View case study",
    accent: "#FF9F0A",
    glow: "255,159,10",
    layout: "model-left",
    gradientFrom: "#060607",
    gradientTo: "#140D07",
    motion: "lamp rotates −30°→+18°Y with scroll · light blooms at 55%",
  },
  {
    index: "02",
    id: "wayfarer",
    name: "Land Rover",
    tag: "TEAM LEAD — ROBOTICS",
    description:
      "An autonomous line-following buggy I led a five-person team to build — STM32 control, dual-loop PID steering, and a hybrid analogue/digital sensor array, engineered from chassis to firmware.",
    cta: "View case study",
    accent: "#5AC8FA",
    glow: "90,200,250",
    layout: "model-right",
    gradientFrom: "#140D06",
    gradientTo: "#081113",
    motion: "glasses unfold as section enters · lens HUD fades in, scrubbed by scroll",
  },
  {
    index: "03",
    id: "keycap",
    name: "Hxkeys Air",
    tag: "PRODUCT — INPUT DEVICE",
    description:
      "A custom 10-key macropad running KMK firmware on a Seeed Studio XIAO RP2040 — PCB, 3D-printed enclosure, and firmware designed and built as one system.",
    cta: "View case study",
    href: "https://github.com/hx-ever/KMK-macropad",
    accent: "#30D158",
    glow: "48,209,88",
    layout: "model-center",
    gradientFrom: "#081113",
    gradientTo: "#0A1309",
    motion: "keyboard explodes into keycaps mid-section → reassembles on exit",
  },
  {
    index: "04",
    id: "pulse",
    name: "Pulse",
    tag: "PRODUCT — WEARABLE HEALTH",
    description:
      "A smart ring for recovery tracking — sensor hardware, a readiness algorithm, and the dashboard that explains it plainly.",
    cta: "View case study",
    accent: "#0A84FF",
    glow: "10,132,255",
    layout: "model-left",
    gradientFrom: "#0A1309",
    gradientTo: "#090D15",
    motion: "ring orbits camera 360° · stat cards orbit in behind it",
  },
  {
    index: "05",
    id: "echo",
    name: "Echo",
    tag: "PRODUCT — AUDIO",
    description:
      "Spatial audio headphones tuned by ear shape — a fitting app, adaptive DSP, and the sound design behind the presets.",
    cta: "Get in touch",
    accent: "#FF375F",
    glow: "255,55,95",
    layout: "model-right",
    gradientFrom: "#090D15",
    gradientTo: "#140913",
    motion: "headphones tilt toward viewer · waveform ripple · closes with contact CTA",
  },
];
