import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy. Everything the browser loads is same-origin:
// next/font self-hosts the fonts at build time, images/GLBs live in /public,
// and Vercel Analytics + Speed Insights are proxied under /_vercel (same
// origin) in production. So 'self' covers scripts, styles, fonts, and
// beacons. 'unsafe-inline' stays because the App Router injects inline
// bootstrap scripts and inline styles without a nonce; 'unsafe-eval' and the
// HMR websocket are dev-only (Turbopack needs them) and never ship to prod.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self'`,
  // blob: + data: are required here, not just in img-src: three.js decodes
  // GLB-embedded textures through ImageBitmapLoader, which fetch()es the
  // blob: URL — and fetch() is governed by connect-src, not img-src.
  `connect-src 'self' blob: data:${isDev ? " ws:" : ""}`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Force HTTPS for two years, including subdomains, and allow preloading.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Deny powerful features the site never uses.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework.
  poweredByHeader: false,

  async headers() {
    return [
      // Security headers on every route.
      { source: "/:path*", headers: securityHeaders },
      // The 3D models are content-addressed by filename and only change when
      // re-exported under a new name, so cache them hard at the edge.
      {
        source: "/:file*.glb",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
