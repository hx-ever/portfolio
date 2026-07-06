import { NextResponse } from "next/server";
import { getRedis, SESSION_TTL_SECONDS } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/analytics/pageview
 * Body: { sessionId, path, isNewSession }
 *
 * One call = one page load, so pv:total is incremented every time. isNewSession
 * is informational only (the client uses it to decide firstVisit); we don't do
 * server-side dedup — the client's per-path ref guard is the primary defense
 * against React Strict Mode double-firing.
 */
export async function POST(request: Request) {
  try {
    const { sessionId, path } = await request.json();
    if (typeof sessionId !== "string" || typeof path !== "string") {
      return NextResponse.json({ error: true }, { status: 400 });
    }

    const redis = getRedis();
    const now = Date.now();
    // firstVisit is set to now here; nothing reads it back (stats only counts
    // keys + reads counters) and the key lives at most 60s, so an approximate
    // value is fine rather than paying a read-before-write round trip.
    const payload = JSON.stringify({ firstVisit: now, currentPage: path, lastSeen: now });

    await Promise.all([
      redis.incr("pv:total"),
      redis.incr(`pv:page:${encodeURIComponent(path)}`),
      redis.set(`session:${sessionId}`, payload, { ex: SESSION_TTL_SECONDS }),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    // Never surface a stack trace — the widget renders its own fallback.
    return NextResponse.json({ error: true });
  }
}
