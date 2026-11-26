export interface ExperienceEntry {
  id: string;
  startYear: number;
  endYear?: number;
  title: string;
  org: string;
  description: string;
  /** Short suffix appended to the date line, e.g. "FINAL YEAR PROJECT" */
  qualifier?: string;
}

export const EXPERIENCE: ExperienceEntry[] = [
  {
    id: "beng",
    startYear: 2022,
    endYear: 2025,
    title: "BEng Electronic Engineering",
    org: "University of Manchester",
    description: "First Class Honours — analogue circuits to embedded firmware and DSP.",
  },
  {
    id: "tsa",
    startYear: 2023,
    endYear: 2024,
    title: "Secretary",
    org: "Taiwanese Student Association · UoM",
    description: "Comms, events, and community for the Taiwanese student network.",
  },
  {
    id: "tabletennis",
    startYear: 2024,
    endYear: 2025,
    title: "Treasurer",
    org: "Table Tennis Team · UoM",
    description: "Budgets, kit, and match-day logistics for the university club.",
  },
  {
    id: "fyp",
    startYear: 2024,
    endYear: 2025,
    qualifier: "FINAL YEAR PROJECT",
    title: "Smart Environmental Sensing Network",
    org: "University of Manchester",
    description: "ESP32 mesh with on-device AI (Edge Impulse) — environmental monitoring at the edge.",
  },
  {
    id: "nus",
    startYear: 2026,
    title: "MSc Engineering Design & Innovation",
    org: "NUS College of Design and Engineering",
    description: "Design × engineering at NUS CDE, Singapore.",
  },
];
