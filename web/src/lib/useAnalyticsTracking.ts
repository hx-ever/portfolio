"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const STORAGE_KEY = "hx_analytics_session";
const HEARTBEAT_MS = 20_000;

interface StoredSession {
  sessionId: string;
  firstVisit: number;
}

/** Read the session from localStorage, creating one on first ever visit. */
function loadSession(): { session: StoredSession; created: boolean } {
  let parsed: StoredSession | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw) as StoredSession;
  } catch {
    parsed = null;
  }

  if (parsed?.sessionId) return { session: parsed, created: false };

  const session: StoredSession = { sessionId: crypto.randomUUID(), firstVisit: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* private mode / storage disabled — tracking degrades to no-op */
  }
  return { session, created: true };
}

function post(url: string, body: unknown) {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Site-wide visitor tracking. Mount once (near the root layout).
 * - Fires one pageview per pathname, guarded against Strict Mode's double
 *   invoke via a ref scoped to the exact path.
 * - Heartbeats immediately then every 20s, paused while the tab is hidden.
 */
export function useAnalyticsTracking() {
  const pathname = usePathname();
  const firedPath = useRef<string | null>(null);
  const firstPageviewEver = useRef(true);

  // Pageview on route change (Strict-Mode safe: the ref only advances, so the
  // duplicated dev invoke for the same path is skipped).
  useEffect(() => {
    if (firedPath.current === pathname) return;
    firedPath.current = pathname;

    const { session, created } = loadSession();
    const isNewSession = created && firstPageviewEver.current;
    firstPageviewEver.current = false;

    post("/api/analytics/pageview", {
      sessionId: session.sessionId,
      path: pathname,
      isNewSession,
    });
  }, [pathname]);

  // Heartbeat loop, restarted on route change so the payload carries the
  // current path.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const beat = () => {
      const { session } = loadSession();
      post("/api/analytics/heartbeat", { sessionId: session.sessionId, path: pathname });
    };

    const start = () => {
      if (interval) return;
      beat(); // don't wait a full cycle for the first one
      interval = setInterval(beat, HEARTBEAT_MS);
    };

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);
}
