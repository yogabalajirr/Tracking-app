/**
 * Demo seed — makes a fresh install look alive on first login.
 *
 * Creates one workspace with three agents, two teams, five customers and
 * twenty tickets spread across every status, priority and channel, with
 * realistic conversation threads and a few deliberately breached SLAs so the
 * red/amber/green states are all visible.
 *
 *   npm run seed
 *
 * Safe to re-run: it removes the previous demo workspace first, and touches
 * nothing else in the database.
 */
import "dotenv/config";
import { prisma, tenantDb } from "../src/lib/db";
import { provisionWorkspace } from "../src/lib/workspace";
import { hashPassword } from "../src/lib/auth";
import { addMessage, createTicket } from "../src/lib/tickets";
import { DEFAULT_BUSINESS_HOURS } from "../src/lib/business-hours";
import type { Priority, TicketStatus } from "../src/generated/prisma/enums";

const SUBDOMAIN = "acme";
const PASSWORD = "deskly123";

const AGENTS = [
  { name: "Priya Sharma", email: "priya@acme.test", role: "OWNER" as const, team: "Tech support" },
  { name: "Arjun Mehta", email: "arjun@acme.test", role: "ADMIN" as const, team: "Billing" },
  { name: "Sara Iyer", email: "sara@acme.test", role: "AGENT" as const, team: "Tech support" },
];

const CUSTOMERS = [
  { name: "Rahul Verma", email: "rahul@northwind.test" },
  { name: "Lena Fischer", email: "lena@globex.test" },
  { name: "Tomás Oliveira", email: "tomas@initech.test" },
  { name: "Aisha Khan", email: "aisha@umbrella.test" },
  { name: "Daniel Cho", email: "daniel@hooli.test" },
];

type Spec = {
  subject: string;
  body: string;
  customer: number;
  channel: "EMAIL" | "FORM" | "MANUAL" | "PORTAL";
  priority: Priority;
  status: TicketStatus;
  /** Hours before "now" that the ticket was raised. */
  ageHours: number;
  tags: string[];
  assignee?: number;
  /** Agent replies, oldest first. */
  replies?: { agent: number; body: string; internal?: boolean }[];
  customerReply?: string;
};

const TICKETS: Spec[] = [
  {
    subject: "Invoice #4417 charged twice",
    body: "Hi — we were billed twice for the March invoice (#4417). Card ending 4242. Could you refund the duplicate?",
    customer: 0,
    channel: "EMAIL",
    priority: "URGENT",
    status: "OPEN",
    ageHours: 30,
    tags: ["billing"],
    assignee: 1,
  },
  {
    subject: "SSO login loops back to the sign-in page",
    body: "Since this morning, signing in with Okta bounces us straight back to the login screen. Roughly 40 people affected.",
    customer: 1,
    channel: "EMAIL",
    priority: "URGENT",
    status: "OPEN",
    ageHours: 5,
    tags: ["bug"],
    assignee: 0,
    replies: [
      { agent: 0, body: "Thanks Lena — I can reproduce this. Escalating to engineering now, I'll update you within the hour." },
      { agent: 2, body: "Okta metadata expired at 02:00 UTC. Rotating the certificate.", internal: true },
    ],
  },
  {
    subject: "How do I export my data as CSV?",
    body: "I need last quarter's report as a spreadsheet. Is there an export button somewhere?",
    customer: 2,
    channel: "FORM",
    priority: "LOW",
    status: "PENDING",
    ageHours: 20,
    tags: ["how-to"],
    assignee: 2,
    replies: [
      { agent: 2, body: "Hi Tomás — yes! Reports → top right → Export CSV. Let me know if the file looks off." },
    ],
  },
  {
    subject: "Request: dark mode for the dashboard",
    body: "Our team works late and the white dashboard is rough on the eyes. Any plans for a dark theme?",
    customer: 3,
    channel: "PORTAL",
    priority: "LOW",
    status: "OPEN",
    ageHours: 60,
    tags: ["feature-request"],
  },
  {
    subject: "API returning 429 on the reports endpoint",
    body: "We're hitting rate limits on /v1/reports even at 5 requests/minute. Has the limit changed?",
    customer: 4,
    channel: "EMAIL",
    priority: "HIGH",
    status: "OPEN",
    ageHours: 9,
    tags: ["bug"],
    assignee: 0,
  },
  {
    subject: "Can we add three more seats?",
    body: "We've hired three people. What's the process for adding seats mid-cycle?",
    customer: 0,
    channel: "EMAIL",
    priority: "NORMAL",
    status: "RESOLVED",
    ageHours: 96,
    tags: ["billing"],
    assignee: 1,
    replies: [
      { agent: 1, body: "Hi Rahul — added the three seats, prorated to your renewal date. Invoice is in your billing portal." },
    ],
  },
  {
    subject: "Webhook deliveries stopped overnight",
    body: "Our endpoint hasn't received anything since 23:00. No config changes on our side.",
    customer: 1,
    channel: "EMAIL",
    priority: "HIGH",
    status: "PENDING",
    ageHours: 14,
    tags: ["bug"],
    assignee: 2,
    replies: [
      { agent: 2, body: "We saw a spike in timeouts from your endpoint and auto-paused deliveries. Could you confirm your server is reachable on 443?" },
    ],
  },
  {
    subject: "Password reset email never arrives",
    body: "I've tried the reset link four times. Nothing in spam either.",
    customer: 2,
    channel: "FORM",
    priority: "NORMAL",
    status: "RESOLVED",
    ageHours: 120,
    tags: [],
    assignee: 0,
    replies: [{ agent: 0, body: "Your address was on a bounce list from an old typo — cleared it. Try again now." }],
  },
  {
    subject: "Onboarding call for the new team",
    body: "Could we book 30 minutes to walk our new hires through the product?",
    customer: 3,
    channel: "MANUAL",
    priority: "NORMAL",
    status: "CLOSED",
    ageHours: 200,
    tags: ["how-to"],
    assignee: 1,
    replies: [{ agent: 1, body: "Booked for Thursday 15:00 IST — calendar invite sent." }],
  },
  {
    subject: "Billing address on invoices is out of date",
    body: "We moved offices last month. Can you update the address on future invoices?",
    customer: 4,
    channel: "EMAIL",
    priority: "LOW",
    status: "RESOLVED",
    ageHours: 150,
    tags: ["billing"],
    assignee: 1,
    replies: [{ agent: 1, body: "Updated — the next invoice will show the new address." }],
  },
  {
    subject: "Two-factor codes rejected on Android",
    body: "Authenticator codes work on iOS but are rejected on Android. Clock is synced.",
    customer: 0,
    channel: "EMAIL",
    priority: "HIGH",
    status: "ON_HOLD",
    ageHours: 45,
    tags: ["bug"],
    assignee: 2,
    replies: [
      { agent: 2, body: "Reproduced on Android 14. Waiting on the vendor SDK fix — tracking as VEN-221.", internal: true },
    ],
  },
  {
    subject: "Bulk import failing with 'invalid column'",
    body: "Our CSV has the same columns as last month but the importer rejects it.",
    customer: 1,
    channel: "PORTAL",
    priority: "NORMAL",
    status: "OPEN",
    ageHours: 26,
    tags: ["bug"],
  },
  {
    subject: "Do you support SAML as well as Okta?",
    body: "Our security team asked whether generic SAML 2.0 is supported.",
    customer: 2,
    channel: "FORM",
    priority: "LOW",
    status: "CLOSED",
    ageHours: 300,
    tags: ["how-to"],
    assignee: 0,
    replies: [{ agent: 0, body: "Yes — generic SAML 2.0 is supported. Docs are in Settings → Authentication." }],
  },
  {
    subject: "Refund for unused seats in February",
    body: "We downgraded on the 3rd but were charged for the full month.",
    customer: 3,
    channel: "EMAIL",
    priority: "HIGH",
    status: "OPEN",
    ageHours: 52,
    tags: ["billing"],
    assignee: 1,
  },
  {
    subject: "Reports show yesterday's numbers",
    body: "The dashboard hasn't refreshed since 18:00 yesterday.",
    customer: 4,
    channel: "EMAIL",
    priority: "URGENT",
    status: "PENDING",
    ageHours: 3,
    tags: ["bug"],
    assignee: 0,
    replies: [{ agent: 0, body: "The aggregation job was stuck; I've restarted it. Numbers should catch up in ~15 minutes." }],
  },
  {
    subject: "Change primary account owner",
    body: "Our previous admin has left. How do we transfer ownership?",
    customer: 0,
    channel: "PORTAL",
    priority: "NORMAL",
    status: "PENDING",
    ageHours: 40,
    tags: ["how-to"],
    assignee: 2,
    replies: [{ agent: 2, body: "I can transfer it — could you confirm the new owner's email in writing?" }],
  },
  {
    subject: "Mobile app crashes on launch",
    body: "Latest TestFlight build crashes immediately on iPhone 15.",
    customer: 1,
    channel: "EMAIL",
    priority: "URGENT",
    status: "OPEN",
    ageHours: 2,
    tags: ["bug"],
  },
  {
    subject: "Annual plan quote for 50 seats",
    body: "Could you send a formal quote for 50 seats on the annual plan?",
    customer: 2,
    channel: "MANUAL",
    priority: "NORMAL",
    status: "OPEN",
    ageHours: 7,
    tags: ["billing"],
    assignee: 1,
  },
  {
    subject: "Delete our data under DPDP",
    body: "We're closing our account and need confirmation that our data will be deleted.",
    customer: 3,
    channel: "EMAIL",
    priority: "HIGH",
    status: "RESOLVED",
    ageHours: 170,
    tags: [],
    assignee: 0,
    replies: [{ agent: 0, body: "Confirmed — your workspace data has been exported to you and scheduled for deletion within 30 days." }],
  },
  {
    subject: "Slow search on large workspaces",
    body: "Search takes 8-10 seconds once we pass ~50k records.",
    customer: 4,
    channel: "FORM",
    priority: "NORMAL",
    status: "ON_HOLD",
    ageHours: 80,
    tags: ["bug", "feature-request"],
    assignee: 2,
    customerReply: "Any update on this? It's getting worse as we grow.",
  },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

async function main() {
  console.log("Seeding demo workspace…\n");

  // Start clean so the script is idempotent.
  const existing = await prisma.workspace.findUnique({ where: { subdomain: SUBDOMAIN } });
  if (existing) {
    await prisma.workspace.delete({ where: { id: existing.id } });
    console.log("  removed the previous demo workspace");
  }

  const { workspace, owner } = await provisionWorkspace({
    workspaceName: "Acme Support",
    subdomain: SUBDOMAIN,
    timezone: "Asia/Kolkata",
    ownerName: AGENTS[0].name,
    ownerEmail: AGENTS[0].email,
    ownerPassword: PASSWORD,
  });

  const db = tenantDb(workspace.id);

  // Business hours: Mon–Sat so the demo has open hours most days.
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      businessHours: {
        ...DEFAULT_BUSINESS_HOURS,
        days: {
          ...DEFAULT_BUSINESS_HOURS.days,
          "6": [{ start: "10:00", end: "14:00" }],
        },
      } as object,
    },
  });

  const teams = await Promise.all(
    ["Tech support", "Billing"].map((name) =>
      db.team.create({ data: { workspaceId: workspace.id, name } }),
    ),
  );
  const teamByName = new Map(teams.map((t) => [t.name, t]));

  // Owner already exists; create the other two and attach everyone to a team.
  const passwordHash = await hashPassword(PASSWORD);
  const agents = [owner];

  await prisma.user.update({
    where: { id: owner.id },
    data: { teamId: teamByName.get(AGENTS[0].team)!.id },
  });

  for (const spec of AGENTS.slice(1)) {
    const user = await db.user.create({
      data: {
        workspaceId: workspace.id,
        name: spec.name,
        email: spec.email,
        passwordHash,
        role: spec.role,
        teamId: teamByName.get(spec.team)!.id,
      },
    });
    agents.push(user);
  }
  console.log(`  ${agents.length} agents, ${teams.length} teams`);

  // A routing rule the demo can show off.
  await db.assignmentRule.create({
    data: {
      workspaceId: workspace.id,
      name: "Billing questions → Billing team",
      conditions: [{ field: "subject", op: "contains", value: "invoice" }],
      actions: [
        { action: "assign_team", value: teamByName.get("Billing")!.id },
        { action: "add_tag", value: "billing" },
      ],
      priority: 0,
      isActive: true,
    },
  });

  await db.savedView.create({
    data: {
      workspaceId: workspace.id,
      userId: null,
      name: "Urgent this week",
      filters: { preset: "all_open", priority: "URGENT", sort: "sla" },
    },
  });

  let created = 0;
  for (const spec of TICKETS) {
    const customer = CUSTOMERS[spec.customer];
    const createdAt = hoursAgo(spec.ageHours);

    const ticket = await createTicket({
      workspaceId: workspace.id,
      subject: spec.subject,
      body: spec.body,
      channel: spec.channel,
      customer,
      priority: spec.priority,
      assigneeId: spec.assignee !== undefined ? agents[spec.assignee].id : null,
      tagNames: spec.tags,
      // Deterministic data beats rule side effects in a demo fixture.
      skipRules: true,
    });

    // Backdate so the queue shows a realistic spread of ages and SLA states.
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { createdAt },
    });
    await prisma.message.updateMany({
      where: { ticketId: ticket.id },
      data: { createdAt },
    });

    for (const [i, reply] of (spec.replies ?? []).entries()) {
      const agent = agents[reply.agent];
      const { message } = await addMessage({
        workspaceId: workspace.id,
        ticketId: ticket.id,
        authorType: "AGENT",
        actor: { id: agent.id, name: agent.name, role: agent.role },
        body: reply.body,
        isInternal: reply.internal ?? false,
      });
      await prisma.message.update({
        where: { id: message.id },
        data: { createdAt: hoursAgo(Math.max(0.5, spec.ageHours - (i + 1) * 1.5)) },
      });
    }

    if (spec.customerReply) {
      await addMessage({
        workspaceId: workspace.id,
        ticketId: ticket.id,
        authorType: "CUSTOMER",
        authorName: customer.name,
        body: spec.customerReply,
      });
    }

    // Land on the intended final status.
    const now = new Date();
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: spec.status,
        resolvedAt:
          spec.status === "RESOLVED" || spec.status === "CLOSED"
            ? hoursAgo(Math.max(0.5, spec.ageHours - 6))
            : null,
        closedAt: spec.status === "CLOSED" ? hoursAgo(Math.max(0.25, spec.ageHours - 4)) : null,
        slaDueAt: spec.status === "RESOLVED" || spec.status === "CLOSED" ? null : undefined,
        csatScore:
          spec.status === "CLOSED" || spec.status === "RESOLVED"
            ? [4, 5, 5, 3, 5][created % 5]
            : null,
        updatedAt: now,
      },
    });

    created++;
  }

  // Recompute SLA deadlines against the backdated creation times so the
  // overdue/at-risk chips reflect the demo data rather than seed-run time.
  await recomputeSlaForWorkspace(workspace.id);

  const counts = await db.ticket.groupBy({ by: ["status"], _count: { _all: true } });

  console.log(`  ${created} tickets, ${CUSTOMERS.length} customers`);
  console.log(
    `  ${counts.map((c) => `${c.status}=${c._count._all}`).join("  ")}\n`,
  );
  console.log("Sign in at http://localhost:3000/login");
  for (const a of AGENTS) {
    console.log(`  ${a.email.padEnd(20)} ${PASSWORD}   (${a.role})`);
  }
  console.log("");
}

/** Re-price every ticket's SLA using its (backdated) creation time. */
async function recomputeSlaForWorkspace(workspaceId: string) {
  const { computeSlaDates, workspaceClock } = await import("../src/lib/sla");

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { timezone: true, businessHours: true, slaPolicies: true },
  });
  const clock = workspaceClock(workspace);

  const tickets = await prisma.ticket.findMany({ where: { workspaceId } });

  for (const ticket of tickets) {
    const policy = workspace.slaPolicies.find((p) => p.priority === ticket.priority) ?? null;
    const sla = computeSlaDates({
      createdAt: ticket.createdAt,
      firstResponseAt: ticket.firstResponseAt,
      status: ticket.status,
      policy,
      clock,
    });

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        firstResponseDueAt: sla.firstResponseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
        slaDueAt: sla.slaDueAt,
        firstResponseBreached: Boolean(
          sla.firstResponseDueAt &&
            !ticket.firstResponseAt &&
            sla.firstResponseDueAt < new Date(),
        ),
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
