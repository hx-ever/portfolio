"use client";

import { useAnalyticsTracking } from "@/lib/useAnalyticsTracking";

/** Mounts the site-wide tracking hook. Renders nothing. */
export default function AnalyticsTracker() {
  useAnalyticsTracking();
  return null;
}
