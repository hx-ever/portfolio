import type { Metadata } from "next";
import Contact from "@/components/Contact";
import LiveStatusWidget from "@/components/LiveStatusWidget";
import WorldMap from "@/components/WorldMap";

const TITLE = "Contact — Hsu Hsin-Wei";
const DESCRIPTION =
  "Get in touch with Hsu Hsin-Wei — open to design engineering roles in Singapore, Taiwan, and Shanghai.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/contact",
    siteName: "Hsu Hsin-Wei",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Hsu Hsin-Wei — Design Engineer" }],
  },
};

export default function ContactPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <Contact />
      <LiveStatusWidget />
      <WorldMap />
    </main>
  );
}
