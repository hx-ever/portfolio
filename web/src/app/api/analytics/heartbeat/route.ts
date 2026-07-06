import { NextResponse } from "next/server";
import { getRedis, SESSION_TTL_SECONDS } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/analytics/heartbeat
 * Body: { sessionId, path }
 *
 * Cheap TTL refresh: re-SET the session key with a fresh 60s expiry. No
 * counters. When heartbeats stop the key simply expires on its own — there is
 * no online set to prune.
 */
export async function POST(request: Request) {
  try {
    const { sessionId, path } = await request.json();
    if (typeof sessionId !== "string") {
      return NextResponse.json({ error: true }, { status: 400 });
    }

    const redis = getRedis();
    const now = Date.now();
    const payload = JSON.stringify({
      firstVisit: now,
      currentPage: typeof path === "string" ? path : "",
      lastSeen: now,
    });

    await redis.set(`session:${sessionId}`, payload, { ex: SESSION_TTL_SECONDS });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: true });
  }
}
