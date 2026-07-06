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
 * second). Re-subscribes when the path changes so currentPageViews tracks the
 * page in view. Any failure or an { error: true } payload surfaces as isError.
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
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const res = await fetch(
          `/api/analytics/stats?path=${encodeURIComponent(pathname)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;
        if (data?.error) {
          setStats((s) => ({ ...s, isError: true }));
          return;
        }
        setStats({
          online: data.online,
          totalViews: data.totalViews,
          currentPageViews: data.currentPageViews,
          isError: false,
        });
      } catch {
        if (!cancelled) setStats((s) => ({ ...s, isError: true }));
      }
    };

    fetchStats();
    const id = setInterval(fetchStats, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pathname]);

  return stats;
}
