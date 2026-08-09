import "server-only";
import { ApiError, tooMany } from "./api";
import { aiEnabled } from "./env";
import { hit } from "./rate-limit";

/**
 * The two checks every AI route shares.
 *
 * The 503 matters: with no API key the buttons are already hidden, so a request
 * here means a stale tab or a direct call. Saying so plainly beats a 500.
 *
 * The per-user rate limit is a spend guard, not an abuse guard — these routes
 * are authenticated. It exists so a stuck retry loop in one tab cannot quietly
 * run up a bill.
 */

const PER_MINUTE = 10;

export function aiGuard(userId: string, route: string): void {
  if (!aiEnabled()) {
    throw new ApiError(503, "AI features are turned off for this workspace.");
  }

  const result = hit(`ai:${route}:${userId}`, PER_MINUTE, 60_000);
  if (!result.ok) {
    throw tooMany("You're asking Claude a lot — give it a moment.");
  }
}
