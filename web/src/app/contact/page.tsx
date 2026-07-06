import type { Metadata } from "next";
import Contact from "@/components/Contact";
import LiveStatusWidget from "@/components/LiveStatusWidget";
import WorldMap from "@/components/WorldMap";

export const metadata: Metadata = {
  title: "Contact — Hsu Hsin-Wei",
  description:
    "Get in touch with Hsu Hsin-Wei — open to design engineering roles in Singapore, Taiwan, and Shanghai.",
};

export default function ContactPage() {
  return (
    <main>
      <Contact />
      <LiveStatusWidget />
      <WorldMap />
    </main>
  );
}
