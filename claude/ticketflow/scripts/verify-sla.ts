/**
 * SLA worker proof (acceptance criterion #4).
 *
 * Builds tickets sitting either side of the 75% and 100% marks, runs one
 * sweep, and asserts that exactly the right ones warned or breached — and that
 * a second sweep is a no-op, so an agent is never alerted twice.
 *
 *   npm run verify:sla
 */
import "dotenv/config";
import { prisma, tenantDb } from "../src/lib/db";
import { runSlaSweep } from "../src/lib/sla-worker";
import { provisionWorkspace } from "../src/lib/workspace";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const minutesAhead = (m: number) => new Date(Date.now() + m * 60_000);

async function main() {
  const stamp = Date.now();

  const { workspace, owner } = await provisionWorkspace({
    workspaceName: "SLA Check",
    subdomain: `sla-check-${stamp}`,
    timezone: "UTC",
    ownerName: "SLA Owner",
    ownerEmail: `sla-owner-${stamp}@example.test`,
    ownerPassword: "verify-sla-password",
  });

  const db = tenantDb(workspace.id);

  // 24/7 hours so the arithmetic in this test is plain wall-clock.
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      businessHours: {
        days: {
          "0": [{ start: "00:00", end: "23:59" }],
          "1": [{ start: "00:00", end: "23:59" }],
          "2": [{ start: "00:00", end: "23:59" }],
          "3": [{ start: "00:00", end: "23:59" }],
          "4": [{ start: "00:00", end: "23:59" }],
          "5": [{ start: "00:00", end: "23:59" }],
          "6": [{ start: "00:00", end: "23:59" }],
        },
        holidays: [],
      } as object,
    },
  });

  // URGENT: first response in 60 minutes → warn at 45.
  await prisma.slaPolicy.updateMany({
    where: { workspaceId: workspace.id, priority: "URGENT" },
    data: { firstResponseMinutes: 60, resolutionMinutes: 240, businessHoursOnly: true },
  });

  const customer = await db.customer.create({
    data: { workspaceId: workspace.id, email: "sla-customer@example.test", name: "Cust" },
  });

  async function makeTicket(label: string, ageMinutes: number, dueInMinutes: number) {
    return prisma.ticket.create({
      data: {
        workspaceId: workspace.id,
        customerId: customer.id,
        assigneeId: owner.id,
        number: Math.floor(Math.random() * 1_000_000),
        subject: label,
        channel: "MANUAL",
        priority: "URGENT",
        status: "OPEN",
        createdAt: minutesAgo(ageMinutes),
        firstResponseDueAt:
          dueInMinutes >= 0 ? minutesAhead(dueInMinutes) : minutesAgo(-dueInMinutes),
        resolutionDueAt: minutesAhead(240),
        slaDueAt: dueInMinutes >= 0 ? minutesAhead(dueInMinutes) : minutesAgo(-dueInMinutes),
      },
    });
  }

  // 10 min old, 50 min left → well inside target.
  const healthy = await makeTicket("healthy", 10, 50);
  // 50 min old (>45 = 75% of 60), 10 min left → warning.
  const warning = await makeTicket("warning", 50, 10);
  // 90 min old, due 30 min ago → breached.
  const breached = await makeTicket("breached", 90, -30);

  // A resolved ticket must never alert, however overdue it looks.
  const resolved = await makeTicket("resolved", 200, -140);
  await prisma.ticket.update({
    where: { id: resolved.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  console.log("\nFirst sweep");
  // The sweep covers every workspace in the database, so its totals include
  // whatever else is seeded here. Assertions below are scoped to this
  // workspace's own tickets and activity.
  const first = await runSlaSweep();
  check("sweep completed without errors", first.errors === 0, `errors=${first.errors}`);
  check(
    "sweep reached this workspace's tickets",
    first.warned >= 1 && first.breached >= 1,
    `warned=${first.warned} breached=${first.breached}`,
  );

  const after = await prisma.ticket.findMany({
    where: { id: { in: [healthy.id, warning.id, breached.id, resolved.id] } },
  });
  const byId = new Map(after.map((t) => [t.id, t]));

  check(
    "healthy ticket untouched",
    !byId.get(healthy.id)?.firstResponseWarnedAt && !byId.get(healthy.id)?.firstResponseBreached,
  );
  check(
    "warning ticket marked warned, not breached",
    Boolean(byId.get(warning.id)?.firstResponseWarnedAt) &&
      !byId.get(warning.id)?.firstResponseBreached,
  );
  check("breached ticket marked breached", byId.get(breached.id)?.firstResponseBreached === true);
  check(
    "resolved ticket untouched",
    !byId.get(resolved.id)?.firstResponseWarnedAt &&
      !byId.get(resolved.id)?.firstResponseBreached,
  );

  console.log("\nActivity log");
  const activities = await prisma.activity.findMany({
    where: { workspaceId: workspace.id, type: { in: ["SLA_WARNING", "SLA_BREACHED"] } },
  });
  check(
    "one SLA_WARNING activity",
    activities.filter((a) => a.type === "SLA_WARNING").length === 1,
  );
  check(
    "one SLA_BREACHED activity",
    activities.filter((a) => a.type === "SLA_BREACHED").length === 1,
  );

  console.log("\nAssignee alerted");
  const notifications = await prisma.notification.findMany({
    where: { workspaceId: workspace.id, userId: owner.id },
  });
  check(
    "assignee got a warning notification",
    notifications.some((n) => n.type === "SLA_WARNING"),
  );
  check(
    "assignee got a breach notification",
    notifications.some((n) => n.type === "SLA_BREACH"),
  );

  console.log("\nSecond sweep is a no-op (no duplicate alerts)");
  await runSlaSweep();

  const activitiesAfter = await prisma.activity.count({
    where: { workspaceId: workspace.id, type: { in: ["SLA_WARNING", "SLA_BREACHED"] } },
  });
  check(
    "no extra SLA activity in this workspace",
    activitiesAfter === activities.length,
    `${activities.length} → ${activitiesAfter}`,
  );

  const notificationsAfter = await prisma.notification.count({
    where: { workspaceId: workspace.id, userId: owner.id },
  });
  check(
    "notification count unchanged",
    notificationsAfter === notifications.length,
    `${notifications.length} → ${notificationsAfter}`,
  );

  console.log("\nWarning ticket escalates to breach once its deadline passes");
  await prisma.ticket.update({
    where: { id: warning.id },
    data: { firstResponseDueAt: minutesAgo(1), slaDueAt: minutesAgo(1) },
  });
  await runSlaSweep();
  const escalated = await prisma.ticket.findUniqueOrThrow({ where: { id: warning.id } });
  check("previously warned ticket now breaches", escalated.firstResponseBreached === true);

  await prisma.workspace.delete({ where: { id: workspace.id } });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
