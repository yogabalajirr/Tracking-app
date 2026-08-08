/**
 * Background worker: SLA timers and housekeeping.
 *
 *   npm run worker
 *
 * Run it alongside the web process. In the macOS app the Electron main process
 * starts it automatically; on a server, run it as a second process (or a
 * sidecar container).
 *
 * The sweep is idempotent, so running two workers is harmless — it just does
 * the work twice.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { runSlaSweep } from "../src/lib/sla-worker";

const SLA_INTERVAL_MS = Number(process.env.SLA_SWEEP_INTERVAL_MS ?? 30_000);
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let running = false;
let stopping = false;

async function sweep() {
  // Never let two sweeps overlap; a slow pass would otherwise pile up.
  if (running || stopping) return;
  running = true;

  try {
    const result = await runSlaSweep();
    if (result.warned || result.breached || result.errors) {
      console.log(
        `[sla] scanned ${result.scanned} · warned ${result.warned} · ` +
          `breached ${result.breached} · errors ${result.errors}`,
      );
    }
  } catch (err) {
    console.error("[sla] sweep failed:", err);
  } finally {
    running = false;
  }
}

async function cleanup() {
  try {
    const { count } = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) console.log(`[cleanup] removed ${count} expired sessions`);

    const invites = await prisma.invite.deleteMany({
      where: { acceptedAt: null, expiresAt: { lt: new Date() } },
    });
    if (invites.count > 0) console.log(`[cleanup] removed ${invites.count} expired invites`);
  } catch (err) {
    console.error("[cleanup] failed:", err);
  }
}

async function main() {
  console.log(`Deskly worker started — SLA sweep every ${SLA_INTERVAL_MS / 1000}s`);

  await sweep();
  await cleanup();

  const slaTimer = setInterval(() => void sweep(), SLA_INTERVAL_MS);
  const cleanupTimer = setInterval(() => void cleanup(), CLEANUP_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} — shutting down…`);
    stopping = true;
    clearInterval(slaTimer);
    clearInterval(cleanupTimer);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
