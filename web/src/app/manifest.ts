import type { MetadataRoute } from "next";

// Web app manifest — names the site for "Add to Home Screen", supplies the
// icons, and sets the chrome colours to the site's own dark + accent so the
// install/splash surfaces stay on-brand.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hsu Hsin-Wei — Design Portfolio",
    short_name: "Hsu Hsin-Wei",
    description:
      "Portfolio of Hsu Hsin-Wei (Hank), Design Engineer — embedded systems, PCBs, and firmware built as one system.",
    start_url: "/",
    display: "standalone",
    background_color: "#060607",
    theme_color: "#060607",
    // Reference the stable public asset — app/icon.svg is served at a hashed
    // URL that would break here. Next still auto-injects the apple-touch-icon
    // from app/apple-icon.png for iOS, independent of this manifest.
    icons: [
      { src: "/hankhsu_logo_icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
    ],
  };
}
