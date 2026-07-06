import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/stats?path=/some/path
 * Returns { online, totalViews, currentPageViews } or { error: true }.
 *
 * online is derived purely from live TTL keys: SCAN session:* and count.
 * Traffic on a personal portfolio is low, so scanning is cheap and needs no
 * sorted-set workaround.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") ?? "/";

  try {
    const redis = getRedis();

    // Count non-expired session keys across the full cursor loop.
    let cursor = "0";
    let online = 0;
    do {
      const [next, keys] = await redis.scan(cursor, { match: "session:*", count: 100 });
      cursor = String(next);
      online += keys.length;
    } while (cursor !== "0");

    const [totalViews, currentPageViews] = await Promise.all([
      redis.get<number>("pv:total"),
      redis.get<number>(`pv:page:${encodeURIComponent(path)}`),
    ]);

    return NextResponse.json({
      online,
      totalViews: Number(totalViews ?? 0),
      currentPageViews: Number(currentPageViews ?? 0),
    });
  } catch {
    return NextResponse.json({ error: true });
  }
}
