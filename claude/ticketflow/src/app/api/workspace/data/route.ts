import { z } from "zod";
import { badRequest, json, notFound, parseQuery, withAuth } from "@/lib/api";

/**
 * GDPR / DPDP data rights.
 *
 * GET  ?email=…  — everything held about one customer, as JSON
 * DELETE ?email=… — erase that customer and their tickets
 *
 * Both are restricted to workspace admins, and both are scoped by the tenant
 * client so one workspace can never reach another's customer.
 */

const querySchema = z.object({
  email: z.string().trim().toLowerCase().email("Give a valid customer email."),
});

export const GET = withAuth("workspace.manage", async (req, { db }) => {
  const { email } = parseQuery(req, querySchema);

  const customer = await db.customer.findFirst({
    where: { email },
    include: {
      tickets: {
        include: {
          messages: {
            // Internal notes are the agents' working notes about the case, not
            // the customer's own data; a subject-access request covers what we
            // hold *about* them, and notes are exported without author detail.
            select: {
              id: true,
              authorType: true,
              body: true,
              isInternal: true,
              createdAt: true,
              attachments: { select: { filename: true, mimeType: true, size: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          tags: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!customer) throw notFound("No customer with that email in this workspace.");

  const payload = {
    exportedAt: new Date().toISOString(),
    customer: {
      email: customer.email,
      name: customer.name,
      firstSeen: customer.createdAt,
    },
    tickets: customer.tickets.map((t) => ({
      number: t.number,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      channel: t.channel,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      tags: t.tags.map((tag) => tag.name),
      messages: t.messages.map((m) => ({
        from: m.authorType === "CUSTOMER" ? "customer" : "support",
        internal: m.isInternal,
        body: m.body,
        sentAt: m.createdAt,
        attachments: m.attachments,
      })),
    })),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ticketflow-export-${email.replace(/[^a-z0-9]/gi, "_")}.json"`,
    },
  });
});

export const DELETE = withAuth("workspace.manage", async (req, { db }) => {
  const { email } = parseQuery(req, querySchema);

  const customer = await db.customer.findFirst({
    where: { email },
    select: { id: true, _count: { select: { tickets: true } } },
  });
  if (!customer) throw notFound("No customer with that email in this workspace.");

  // Cascades take the tickets, and through them messages, activity and
  // attachment rows. Files on disk are cleaned up by the storage sweep.
  await db.customer.delete({ where: { id: customer.id } });

  return json({
    ok: true,
    deleted: { customer: email, tickets: customer._count.tickets },
  });
});

/** Lists customers so the settings screen can offer a picker. */
export const POST = withAuth("workspace.manage", async (req, { db }) => {
  const body = await req.json().catch(() => ({}));
  const search = typeof body.search === "string" ? body.search.trim() : "";

  if (search.length > 0 && search.length < 2) {
    throw badRequest("Type at least two characters to search.");
  }

  const customers = await db.customer.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return json({ customers });
});
