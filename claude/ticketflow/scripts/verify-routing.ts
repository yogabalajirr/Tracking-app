/**
 * Routing proof: rule evaluation + load-balanced round-robin.
 *
 *   npm run verify:routing
 */
import "dotenv/config";
import { prisma, tenantDb } from "../src/lib/db";
import { provisionWorkspace } from "../src/lib/workspace";
import { createTicket, pickRoundRobinAssignee } from "../src/lib/tickets";
import { hashPassword } from "../src/lib/auth";

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

async function main() {
  const stamp = Date.now();

  const { workspace } = await provisionWorkspace({
    workspaceName: "Routing Check",
    subdomain: `routing-${stamp}`,
    timezone: "UTC",
    ownerName: "Owner",
    ownerEmail: `routing-owner-${stamp}@example.test`,
    ownerPassword: "verify-routing-password",
  });

  const db = tenantDb(workspace.id);
  const passwordHash = await hashPassword("verify-routing-password");

  const team = await db.team.create({
    data: { workspaceId: workspace.id, name: "Frontline" },
  });

  const agents = [];
  for (const name of ["Agent A", "Agent B", "Agent C"]) {
    agents.push(
      await db.user.create({
        data: {
          workspaceId: workspace.id,
          name,
          email: `${name.replace(/\s+/g, "-").toLowerCase()}-${stamp}@example.test`,
          passwordHash,
          role: "AGENT",
          teamId: team.id,
        },
      }),
    );
  }

  // --- round robin from an even start ---
  console.log("\nRound-robin from an even start (all agents at zero load)");
  const picks: string[] = [];
  for (let i = 0; i < 6; i++) {
    const id = await pickRoundRobinAssignee(db, team.id);
    picks.push(id!);
    // Give the pick a live ticket so the next call sees the extra load.
    await prisma.ticket.create({
      data: {
        workspaceId: workspace.id,
        customerId: (
          await db.customer.upsert({
            where: { workspaceId_email: { workspaceId: workspace.id, email: "rr@example.test" } },
            create: { workspaceId: workspace.id, email: "rr@example.test" },
            update: {},
          })
        ).id,
        number: 10_000 + i,
        subject: `rr-${i}`,
        channel: "MANUAL",
        assigneeId: id,
        status: "OPEN",
      },
    });
  }

  const counts = new Map<string, number>();
  for (const id of picks) counts.set(id, (counts.get(id) ?? 0) + 1);

  check(
    "six tickets split evenly across three agents",
    [...counts.values()].every((n) => n === 2) && counts.size === 3,
    `got ${[...counts.values()].join("/")} across ${counts.size} agents`,
  );

  // --- round robin corrects an uneven start ---
  console.log("\nRound-robin corrects an uneven start");
  const heavy = agents[0];
  for (let i = 0; i < 5; i++) {
    await prisma.ticket.create({
      data: {
        workspaceId: workspace.id,
        customerId: (
          await db.customer.findFirstOrThrow({ where: { email: "rr@example.test" } })
        ).id,
        number: 20_000 + i,
        subject: `heavy-${i}`,
        channel: "MANUAL",
        assigneeId: heavy.id,
        status: "OPEN",
      },
    });
  }

  const nextPick = await pickRoundRobinAssignee(db, team.id);
  check(
    "the overloaded agent is skipped",
    nextPick !== heavy.id,
    `picked the agent already holding the most work`,
  );

  // --- resolved tickets don't count as load ---
  console.log("\nResolved work stops counting as load");
  await prisma.ticket.updateMany({
    where: { workspaceId: workspace.id, assigneeId: heavy.id },
    data: { status: "CLOSED" },
  });

  const afterClearing = await pickRoundRobinAssignee(db, team.id);
  check(
    "an agent with a cleared queue becomes eligible again",
    afterClearing === heavy.id,
    `picked ${afterClearing}`,
  );

  // --- rules ---
  console.log("\nRule evaluation on ticket creation");
  await db.assignmentRule.create({
    data: {
      workspaceId: workspace.id,
      name: "VIP domain",
      conditions: [{ field: "sender_domain", op: "equals", value: "vip.test" }],
      actions: [
        { action: "set_priority", value: "URGENT" },
        { action: "add_tag", value: "vip" },
      ],
      priority: 0,
      isActive: true,
    },
  });

  await db.assignmentRule.create({
    data: {
      workspaceId: workspace.id,
      name: "Refunds to the team",
      conditions: [{ field: "subject", op: "contains", value: "refund" }],
      actions: [{ action: "assign_team", value: team.id }],
      priority: 1,
      isActive: true,
    },
  });

  await db.assignmentRule.create({
    data: {
      workspaceId: workspace.id,
      name: "Paused rule that must not fire",
      conditions: [{ field: "subject", op: "contains", value: "refund" }],
      actions: [{ action: "add_tag", value: "should-not-appear" }],
      priority: 2,
      isActive: false,
    },
  });

  const vipTicket = await createTicket({
    workspaceId: workspace.id,
    subject: "Please process my refund",
    body: "I would like a refund.",
    channel: "EMAIL",
    customer: { email: "boss@vip.test", name: "Boss" },
  });

  const loaded = await db.ticket.findUniqueOrThrow({
    where: { id: vipTicket.id },
    include: { tags: true },
  });

  check("matching rule raised priority", loaded.priority === "URGENT", loaded.priority);
  check(
    "matching rule added its tag",
    loaded.tags.some((t) => t.name === "vip"),
    loaded.tags.map((t) => t.name).join(","),
  );
  check("a second matching rule also applied", loaded.teamId === team.id);
  check(
    "round-robin filled in the assignee for the team",
    loaded.assigneeId !== null,
  );
  check(
    "inactive rule did not fire",
    !loaded.tags.some((t) => t.name === "should-not-appear"),
  );

  const nonMatch = await createTicket({
    workspaceId: workspace.id,
    subject: "General question",
    body: "Just wondering.",
    channel: "EMAIL",
    customer: { email: "someone@other.test" },
  });
  const nonMatchLoaded = await db.ticket.findUniqueOrThrow({
    where: { id: nonMatch.id },
    include: { tags: true },
  });

  check("non-matching ticket keeps default priority", nonMatchLoaded.priority === "NORMAL");
  check("non-matching ticket gets no rule tags", nonMatchLoaded.tags.length === 0);
  check("non-matching ticket is left unassigned", nonMatchLoaded.assigneeId === null);

  const activity = await db.activity.findMany({
    where: { ticketId: vipTicket.id, type: "RULE_APPLIED" },
  });
  check("rule application is recorded in the activity log", activity.length === 1);

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
