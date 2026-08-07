import { z } from "zod";
import { badRequest, forbidden, json, notFound, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { workspaceClock, slaView } from "@/lib/sla";
import { updateTicket } from "@/lib/tickets";
import { portalUrl } from "@/lib/tokens";
import { can } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/tickets/:id — full ticket with thread and activity log. */
export const GET = withAuth<Ctx>(
  "tickets.read",
  async (_req, { db, workspaceId }, { params }) => {
    const { id } = await params;

    const ticket = await db.ticket.findUnique({
      where: { id },
      include: {
        customer: true,
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        team: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true, color: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { attachments: true },
        },
        activities: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!ticket) throw notFound("That ticket doesn't exist.");

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { timezone: true, businessHours: true, slaPolicies: true },
    });

    const clock = workspaceClock(workspace);
    const policy =
      workspace.slaPolicies.find((p) => p.priority === ticket.priority) ?? null;
    const sla = slaView(ticket, policy, clock);

    // How many other tickets this customer has raised — useful context in the
    // right-hand pane.
    const customerTicketCount = await db.ticket.count({
      where: { customerId: ticket.customerId },
    });

    return json({
      ticket: {
        ...ticket,
        sla: {
          state: sla.state,
          label: sla.label,
          kind: sla.kind,
          dueAt: sla.dueAt,
          progress: sla.progress,
          remainingMs: sla.remainingMs,
        },
        portalUrl: portalUrl(ticket.id),
        customerTicketCount,
      },
      slaPolicy: policy,
      timezone: workspace.timezone,
    });
  },
);

const patchSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "ON_HOLD", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().cuid().nullish(),
  teamId: z.string().cuid().nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

/** PATCH /api/tickets/:id — status, priority, assignee, team, tags. */
export const PATCH = withAuth<Ctx>(
  "tickets.write",
  async (req, { user, db, workspaceId }, { params }) => {
    const { id } = await params;
    const input = await parseBody(req, patchSchema);

    const exists = await db.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound("That ticket doesn't exist.");

    if (input.assigneeId) {
      const member = await db.user.findUnique({
        where: { id: input.assigneeId },
        select: { id: true },
      });
      if (!member) throw badRequest("That agent is not a member of this workspace.");
    }

    if (input.teamId) {
      const team = await db.team.findUnique({
        where: { id: input.teamId },
        select: { id: true },
      });
      if (!team) throw badRequest("That team does not exist in this workspace.");
    }

    const ticket = await updateTicket({
      workspaceId,
      ticketId: id,
      patch: {
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        teamId: input.teamId,
        tagNames: input.tags,
      },
      actor: { id: user.id, name: user.name, role: user.role },
    });

    return json({ ticket });
  },
);

/** DELETE /api/tickets/:id */
export const DELETE = withAuth<Ctx>(
  "tickets.delete",
  async (_req, { user, db }, { params }) => {
    if (!can(user.role, "tickets.delete")) {
      throw forbidden("Only owners and admins can delete tickets.");
    }
    const { id } = await params;
    await db.ticket.delete({ where: { id } });
    return json({ ok: true });
  },
);
