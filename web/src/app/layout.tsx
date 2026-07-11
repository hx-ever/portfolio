import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import Nav from "@/components/Nav";
import ScrollProgress from "@/components/ScrollProgress";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const body = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const SITE_URL = "https://hankhsu.com";
const TITLE = "Hsu Hsin-Wei — Design Portfolio";
const DESCRIPTION =
  "Portfolio of Hsu Hsin-Wei (Hank), Design Engineer — embedded systems, PCBs, and firmware built as one system.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Hsu Hsin-Wei",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Hsu Hsin-Wei — Design Engineer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

// Split out of `metadata` per Next 16: theme-color tints the mobile browser
// chrome to the site's own near-black; the viewport line is the framework
// default, restated so it's explicit.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#060607",
};

// Person schema for richer search results; rendered once in the root layout.
const PERSON_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Hsu Hsin-Wei",
  alternateName: "Hank Hsu",
  jobTitle: "Design Engineer",
  url: SITE_URL,
  sameAs: [
    "https://github.com/hx-ever",
    "https://www.linkedin.com/in/hsinweihsu",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} ${body.variable}`}
    >
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(PERSON_JSONLD) }}
        />
        <ScrollProgress />
        <Nav />
        <AnalyticsTracker />
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
