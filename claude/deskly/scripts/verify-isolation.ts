/**
 * Multi-tenant isolation proof (acceptance criterion #9).
 *
 * Creates two workspaces with identical-looking data, then attempts every
 * cross-tenant access path through a scoped client and asserts each one fails.
 *
 *   npm run verify:isolation
 */
import "dotenv/config";
import { prisma, tenantDb } from "../src/lib/db";

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

async function expectThrows(name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    check(name, false, `expected a throw, got ${JSON.stringify(result)?.slice(0, 80)}`);
  } catch {
    check(name, true);
  }
}

async function main() {
  const stamp = Date.now();
  const mk = async (slug: string) => {
    const ws = await prisma.workspace.create({
      data: { name: slug, subdomain: `${slug}-${stamp}` },
    });
    const customer = await prisma.customer.create({
      data: { workspaceId: ws.id, email: `person@${slug}.test`, name: "Person" },
    });
    const ticket = await prisma.ticket.create({
      data: {
        workspaceId: ws.id,
        customerId: customer.id,
        number: 1,
        subject: `${slug} secret subject`,
        channel: "MANUAL",
      },
    });
    return { ws, customer, ticket };
  };

  const alpha = await mk("alpha");
  const beta = await mk("beta");

  const dbAlpha = tenantDb(alpha.ws.id);

  console.log("\nCross-tenant reads");
  const list = await dbAlpha.ticket.findMany();
  check(
    "findMany returns only own tickets",
    list.length === 1 && list[0].id === alpha.ticket.id,
    `got ${list.length} rows`,
  );

  const foreignUnique = await dbAlpha.ticket.findUnique({ where: { id: beta.ticket.id } });
  check("findUnique on foreign id returns null", foreignUnique === null);

  const foreignFirst = await dbAlpha.ticket.findFirst({ where: { id: beta.ticket.id } });
  check("findFirst on foreign id returns null", foreignFirst === null);

  const count = await dbAlpha.ticket.count();
  check("count excludes foreign rows", count === 1, `got ${count}`);

  const grouped = await dbAlpha.ticket.groupBy({ by: ["status"], _count: true });
  const total = grouped.reduce((n, g) => n + (g._count as number), 0);
  check("groupBy excludes foreign rows", total === 1, `got ${total}`);

  const customers = await dbAlpha.customer.findMany();
  check("customer findMany is scoped", customers.length === 1, `got ${customers.length}`);

  console.log("\nCross-tenant writes");
  await expectThrows("update on foreign id throws", () =>
    dbAlpha.ticket.update({
      where: { id: beta.ticket.id },
      data: { subject: "HIJACKED" },
    }),
  );

  await expectThrows("delete on foreign id throws", () =>
    dbAlpha.ticket.delete({ where: { id: beta.ticket.id } }),
  );

  const bulk = await dbAlpha.ticket.updateMany({ data: { priority: "URGENT" } });
  check("updateMany touches only own rows", bulk.count === 1, `updated ${bulk.count}`);

  console.log("\nForeign row survived intact");
  const betaAfter = await prisma.ticket.findUnique({ where: { id: beta.ticket.id } });
  check("foreign ticket still exists", betaAfter !== null);
  check(
    "foreign subject unchanged",
    betaAfter?.subject === "beta secret subject",
    `got ${betaAfter?.subject}`,
  );
  check("foreign priority unchanged", betaAfter?.priority === "NORMAL", `got ${betaAfter?.priority}`);

  console.log("\nCreates are auto-scoped");
  const created = await dbAlpha.tag.create({ data: { name: `t-${stamp}` } as never });
  check("create injects caller's workspaceId", created.workspaceId === alpha.ws.id);

  // Even an explicit attempt to write into another tenant is overridden.
  const smuggled = await dbAlpha.tag.create({
    data: { name: `smuggle-${stamp}`, workspaceId: beta.ws.id } as never,
  });
  check(
    "create cannot be redirected to another workspace",
    smuggled.workspaceId === alpha.ws.id,
    `landed in ${smuggled.workspaceId}`,
  );

  // Cleanup
  await prisma.workspace.deleteMany({
    where: { id: { in: [alpha.ws.id, beta.ws.id] } },
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
