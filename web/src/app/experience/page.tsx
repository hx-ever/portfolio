import type { Metadata } from "next";
import Experience from "@/components/Experience";

export const metadata: Metadata = {
  title: "Experience — hxstudio",
  description:
    "Where Hsu Hsin-Wei has been — education, roles, and projects, 2022 → 2026.",
};

export default function ExperiencePage() {
  return (
    <main>
      <Experience />
    </main>
  );
}
