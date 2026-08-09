/**
 * Fixed-window rate limiter held in process memory.
 *
 * TicketFlow's default deployment is a single Node process (local macOS app, or one
 * container), where this is exactly right and needs no Redis. If you scale to
 * multiple instances, swap the `hit()` body for a Redis INCR+EXPIRE — the
 * call sites do not change. See DECISIONS.md.
 */

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();
let lastSweep = Date.now();

/** Drop expired windows occasionally so the map cannot grow without bound. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, win] of buckets) {
    if (win.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  const win =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  win.count += 1;
  buckets.set(key, win);

  return {
    ok: win.count <= limit,
    remaining: Math.max(0, limit - win.count),
    resetAt: win.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((win.resetAt - now) / 1000)),
  };
}

/** Best-effort client identity for public endpoints sitting behind a proxy. */
export function clientKey(req: Request, prefix: string): string {
  const h = req.headers;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown";
  return `${prefix}:${ip}`;
}

/** Test hook — resets all windows. */
export function __resetRateLimits() {
  buckets.clear();
}
