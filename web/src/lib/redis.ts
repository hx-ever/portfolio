import { Redis } from "@upstash/redis";

/**
 * Server-only Redis client. The credentials are read from
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (never NEXT_PUBLIC_),
 * so this module must only ever be imported from Route Handlers.
 *
 * Redis.fromEnv() throws if either variable is missing — callers wrap this in
 * try/catch and return an { error: true } shape so the client can fall back
 * gracefully when analytics isn't configured.
 */
let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) client = Redis.fromEnv();
  return client;
}

export const SESSION_TTL_SECONDS = 60;
