import type { Metadata } from "next";
import Experience from "@/components/Experience";

const TITLE = "Experience — Hsu Hsin-Wei";
const DESCRIPTION =
  "Where Hsu Hsin-Wei has been — education, roles, and projects, 2022 → 2026.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/experience" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/experience",
    siteName: "Hsu Hsin-Wei",
    type: "profile",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Hsu Hsin-Wei — Design Engineer" }],
  },
};

export default function ExperiencePage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <Experience />
    </main>
  );
}
