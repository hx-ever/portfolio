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
      navigating (currently only AuraEyez has one built) */
  caseStudy?: boolean;
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
    caseStudy: true,
    accent: "#F0B24A",
    glow: "240,178,74",
    layout: "model-left",
    gradientFrom: "#060607",
    gradientTo: "#140D07",
    motion: "AuraEyez device rotates with scroll · eyes track cursor · knob hover glow",
  },
  {
    index: "02",
    id: "wayfarer",
    name: "Land Rover",
    tag: "TEAM LEAD — ROBOTICS",
    description:
      "An autonomous line-following buggy I led a five-person team to build — STM32 control, dual-loop PID steering, and a hybrid analogue/digital sensor array, engineered from chassis to firmware.",
    cta: "View case study",
    accent: "#30D158",
    glow: "48,209,88",
    layout: "model-right",
    gradientFrom: "#140D06",
    gradientTo: "#0A1309",
    motion: "buggy drives in from the right and brakes to a stop · one-time per session",
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
    preview: {
      src: "/hxkeysair-pcb.svg",
      alt: "Hxkeys Air PCB schematic preview",
      caption: "Custom PCB, KiCad",
      // exported from hxkeysair.kicad_pcb via kicad-cli (76.3 x 96.4 mm board)
      width: 200,
      height: 253,
    },
    accent: "#5AC8FA",
    glow: "90,200,250",
    layout: "model-center",
    gradientFrom: "#0A1309",
    gradientTo: "#081113",
    motion: "keyboard explodes into keycaps mid-section → reassembles on exit",
  },
  {
    index: "04",
    id: "pulse",
    name: "CoreLink",
    tag: "FINAL YEAR PROJECT — EMBEDDED AI",
    description:
      "A lightweight AI framework for context-aware smart home networks — ESP32 edge devices running on-device sensor fusion and adaptive logic for air quality and lighting control, without a cloud round-trip.",
    cta: "View case study",
    href: "https://github.com/hx-ever/IndividualProject",
    accent: "#2FA093",
    glow: "47,160,147",
    layout: "model-left",
    gradientFrom: "#081113",
    gradientTo: "#0B1312",
    motion: "sensor-scan pulse burst on arrival · slow ambient ring while idle · scroll-scrub rotation",
  },
  {
    index: "05",
    id: "echo",
    name: "Arx",
    tag: "BUILD — FPV DRONE",
    description:
      "A four-propeller ESP32 drone, built from an open community design and adapted with a custom-designed 3D-printed frame — phone-controlled flight, hands-on with FC/ESC wiring and build tuning.",
    cta: "View case study",
    href: "https://github.com/hx-ever/ESP32-Drone",
    accent: "#FF375F",
    glow: "255,55,95",
    layout: "model-right",
    gradientFrom: "#0B1312",
    gradientTo: "#140913",
    motion: "flies in from above and wobble-corrects into a perpetual hover · props never stop",
  },
];
