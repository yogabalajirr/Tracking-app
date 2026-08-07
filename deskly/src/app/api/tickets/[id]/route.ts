import { z } from "zod";
import { badRequest, forbidden, json, notFound, parseBody, withAuth } from "@/lib/api";
import { loadTicketDetail } from "@/lib/ticket-detail";
import { updateTicket } from "@/lib/tickets";
import { can } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/tickets/:id — full ticket with thread and activity log. */
export const GET = withAuth<Ctx>(
  "tickets.read",
  async (_req, { workspaceId }, { params }) => {
    const { id } = await params;
    const ticket = await loadTicketDetail(workspaceId, id);
    if (!ticket) throw notFound("That ticket doesn't exist.");
    return json({ ticket });
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

    await updateTicket({
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

    // Return the refreshed detail so the client can replace its state wholesale
    // rather than patching it field by field.
    const ticket = await loadTicketDetail(workspaceId, id);
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
