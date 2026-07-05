export interface ExperienceEntry {
  id: string;
  range: string;
  title: string;
  org: string;
  description: string;
  /** Short suffix appended to the date line, e.g. "FINAL YEAR PROJECT" */
  qualifier?: string;
  /** Not yet started — renders a status pill and a hollow spine node */
  incoming?: boolean;
  side: "left" | "right";
}

export const EXPERIENCE: ExperienceEntry[] = [
  {
    id: "beng",
    range: "2022 — 2025",
    title: "BEng Electronic Engineering",
    org: "University of Manchester",
    description: "First Class Honours — analogue circuits to embedded firmware and DSP.",
    side: "left",
  },
  {
    id: "tsa",
    range: "2023 — 2024",
    title: "Secretary",
    org: "Taiwanese Student Association · UoM",
    description: "Comms, events, and community for the Taiwanese student network.",
    side: "right",
  },
  {
    id: "tabletennis",
    range: "2024 — 2025",
    title: "Treasurer",
    org: "Table Tennis Team · UoM",
    description: "Budgets, kit, and match-day logistics for the university club.",
    side: "left",
  },
  {
    id: "fyp",
    range: "2024 — 2025",
    qualifier: "FINAL YEAR PROJECT",
    title: "Smart Environmental Sensing Network",
    org: "University of Manchester",
    description: "ESP32 mesh with on-device AI (Edge Impulse) — environmental monitoring at the edge.",
    side: "right",
  },
  {
    id: "nus",
    range: "2026 —",
    title: "MSc Engineering Design & Innovation",
    org: "NUS College of Design and Engineering",
    description: "Design × engineering at NUS CDE, Singapore.",
    incoming: true,
    side: "left",
  },
];
