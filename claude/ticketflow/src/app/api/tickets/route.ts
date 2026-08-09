import { z } from "zod";
import { badRequest, forbidden, json, parseBody, parseQuery, withAuth } from "@/lib/api";
import { prisma, type TenantDb } from "@/lib/db";
import { buildOrderBy, buildWhere, filterSchema } from "@/lib/filters";
import { serializeTicket, TICKET_LIST_INCLUDE } from "@/lib/serialize";
import { workspaceClock } from "@/lib/sla";
import { createTicket } from "@/lib/tickets";
import { can } from "@/lib/rbac";
import { emailSchema } from "@/lib/validation";

/** GET /api/tickets — paginated, filtered inbox list. */
export const GET = withAuth("tickets.read", async (req, { user, db, workspaceId }) => {
  const filters = parseQuery(req, filterSchema);
  const where = buildWhere(filters, user.id);

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { timezone: true, businessHours: true, slaPolicies: true },
  });

  const [total, rows] = await Promise.all([
    db.ticket.count({ where }),
    db.ticket.findMany({
      where,
      include: TICKET_LIST_INCLUDE,
      orderBy: buildOrderBy(filters.sort),
      skip: (filters.page - 1) * filters.perPage,
      take: filters.perPage,
    }),
  ]);

  const clock = workspaceClock(workspace);
  const now = new Date();

  return json({
    tickets: rows.map((t) => serializeTicket(t, workspace.slaPolicies, clock, now)),
    page: filters.page,
    perPage: filters.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.perPage)),
  });
});

const createSchema = z.object({
  subject: z.string().trim().min(1, "Give the ticket a subject.").max(500),
  body: z.string().trim().min(1, "Describe the issue."),
  customerEmail: emailSchema,
  customerName: z.string().trim().max(120).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  assigneeId: z.string().cuid().nullish(),
  teamId: z.string().cuid().nullish(),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
});

/** POST /api/tickets — an agent raising a ticket on a customer's behalf. */
export const POST = withAuth("tickets.write", async (req, { user, db, workspaceId }) => {
  const input = await parseBody(req, createSchema);

  if (input.assigneeId) {
    const assignee = await db.user.findUnique({
      where: { id: input.assigneeId },
      select: { id: true },
    });
    if (!assignee) throw badRequest("That assignee is not a member of this workspace.");
  }

  if (input.teamId) {
    const team = await db.team.findUnique({
      where: { id: input.teamId },
      select: { id: true },
    });
    if (!team) throw badRequest("That team does not exist in this workspace.");
  }

  const ticket = await createTicket({
    workspaceId,
    subject: input.subject,
    body: input.body,
    channel: "MANUAL",
    customer: { email: input.customerEmail, name: input.customerName },
    priority: input.priority,
    assigneeId: input.assigneeId ?? null,
    teamId: input.teamId ?? null,
    tagNames: input.tags,
    actor: { id: user.id, name: user.name, role: user.role },
  });

  return json({ ticket: { id: ticket.id, number: ticket.number } }, { status: 201 });
});

const bulkSchema = z.object({
  ticketIds: z.array(z.string().cuid()).min(1).max(200),
  action: z.enum(["assign", "status", "tag", "delete", "priority"]),
  value: z.string().nullish(),
});

/** PATCH /api/tickets — bulk actions from the inbox. */
export const PATCH = withAuth("tickets.write", async (req, { user, db, workspaceId }) => {
  const input = await parseBody(req, bulkSchema);

  // The scoped client guarantees these ids all belong to the caller's workspace.
  const owned = await db.ticket.findMany({
    where: { id: { in: input.ticketIds } },
    select: { id: true },
  });
  const ids = owned.map((t) => t.id);
  if (ids.length === 0) return json({ updated: 0 });

  switch (input.action) {
    case "delete": {
      if (!can(user.role, "tickets.delete")) {
        throw forbidden("Only owners and admins can delete tickets.");
      }
      const { count } = await db.ticket.deleteMany({ where: { id: { in: ids } } });
      return json({ updated: count });
    }

    case "assign": {
      const assigneeId = input.value || null;
      if (assigneeId) {
        const member = await db.user.findUnique({
          where: { id: assigneeId },
          select: { id: true },
        });
        if (!member) throw badRequest("That agent is not a member of this workspace.");
      }
      const { count } = await db.ticket.updateMany({
        where: { id: { in: ids } },
        data: { assigneeId },
      });
      await recordBulkActivity(db, workspaceId, ids, "ASSIGNED", { assigneeId, bulk: true }, user);
      return json({ updated: count });
    }

    case "status": {
      const status = z
        .enum(["OPEN", "PENDING", "ON_HOLD", "RESOLVED", "CLOSED"])
        .parse(input.value);
      const now = new Date();
      const { count } = await db.ticket.updateMany({
        where: { id: { in: ids } },
        data: {
          status,
          resolvedAt: status === "RESOLVED" || status === "CLOSED" ? now : null,
          closedAt: status === "CLOSED" ? now : null,
          slaDueAt: status === "RESOLVED" || status === "CLOSED" ? null : undefined,
        },
      });
      await recordBulkActivity(db, workspaceId, ids, "STATUS_CHANGED", { to: status, bulk: true }, user);
      return json({ updated: count });
    }

    case "priority": {
      const priority = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).parse(input.value);
      const { count } = await db.ticket.updateMany({
        where: { id: { in: ids } },
        data: { priority },
      });
      await recordBulkActivity(db, workspaceId, ids, "PRIORITY_CHANGED", { to: priority, bulk: true }, user);
      return json({ updated: count });
    }

    case "tag": {
      const name = z.string().trim().min(1).parse(input.value).toLowerCase();
      const tag = await db.tag.upsert({
        where: { workspaceId_name: { workspaceId, name } },
        create: { workspaceId, name },
        update: {},
        select: { id: true },
      });
      // `connect` on a many-to-many needs one statement per row.
      for (const id of ids) {
        await db.ticket.update({
          where: { id },
          data: { tags: { connect: { id: tag.id } } },
        });
      }
      await recordBulkActivity(db, workspaceId, ids, "TAGGED", { added: name, bulk: true }, user);
      return json({ updated: ids.length });
    }
  }
});

async function recordBulkActivity(
  db: TenantDb,
  workspaceId: string,
  ticketIds: string[],
  type: string,
  payload: Record<string, unknown>,
  user: { id: string; name: string },
) {
  await db.activity.createMany({
    data: ticketIds.map((ticketId) => ({
      workspaceId,
      ticketId,
      type,
      payload: payload as object,
      actorId: user.id,
      actorName: user.name,
    })),
  });
}
