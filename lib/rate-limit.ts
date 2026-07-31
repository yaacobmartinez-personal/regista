import { headers } from "next/headers";

/**
 * Fixed-window rate limiter held in process memory.
 *
 * Deliberately dependency-free: it protects the public write endpoints without
 * adding infrastructure. The trade-off is that counters reset on restart and are
 * per-instance, so a multi-instance deployment should swap this for a shared
 * store (Redis/Upstash) behind the same `rateLimit()` signature.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Opportunistic sweep so the map cannot grow without bound.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the window resets (only meaningful when `ok` is false). */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Client IP for bucketing, read with the number of proxies actually in front of
 * the app.
 *
 * `X-Forwarded-For` is client-writable: the leftmost entry is whatever the
 * caller put there, so trusting it lets anyone mint a fresh bucket per request
 * and bypass every limit here. Each trusted proxy appends the address it saw,
 * so the trustworthy entry is the Nth from the right, where N is the number of
 * proxies we actually run behind.
 *
 * Set TRUSTED_PROXY_COUNT to that number (0 when the app is directly exposed,
 * which is the safe default — the header is then ignored entirely).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const trustedProxies = Number(process.env.TRUSTED_PROXY_COUNT ?? "0");

  if (Number.isInteger(trustedProxies) && trustedProxies > 0) {
    const chain = (h.get("x-forwarded-for") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const candidate = chain[chain.length - trustedProxies];
    if (candidate) return candidate;

    // Header missing or shorter than expected: fail closed to one shared bucket
    // rather than handing out an unlimited number of them.
    return "untrusted-chain";
  }

  return h.get("x-real-ip") ?? "direct";
}
