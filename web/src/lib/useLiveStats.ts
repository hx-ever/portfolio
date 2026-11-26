"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const POLL_MS = 18_000;

export interface LiveStats {
  online: number | null;
  totalViews: number | null;
  currentPageViews: number | null;
  isError: boolean;
}

/**
 * Polls /api/analytics/stats on mount and every 18s (deliberately not per
 * second), while the tab is visible. Refreshes when the visitor returns.
 */
export function useLiveStats(): LiveStats {
  const pathname = usePathname();
  const [stats, setStats] = useState<LiveStats>({
    online: null,
    totalViews: null,
    currentPageViews: null,
    isError: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;

    const fetchStats = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(
          `/api/analytics/stats?path=${encodeURIComponent(pathname)}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!res.ok) throw new Error("Stats request failed");
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (data?.error) throw new Error("Stats unavailable");
        setStats({
          online: data.online,
          totalViews: data.totalViews,
          currentPageViews: data.currentPageViews,
          isError: false,
        });
      } catch {
        if (!controller.signal.aborted) setStats((s) => ({ ...s, isError: true }));
      } finally {
        inFlight = false;
      }
    };

    fetchStats();
    const id = setInterval(fetchStats, POLL_MS);
    document.addEventListener("visibilitychange", fetchStats);
    return () => {
      controller.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", fetchStats);
    };
  }, [pathname]);

  return stats;
}
