import { z } from "zod";
import { badRequest, forbidden, json, notFound, parseBody, withAuth } from "@/lib/api";
import { assignableRoles } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  role: z.enum(["ADMIN", "AGENT", "VIEWER"]).optional(),
  teamId: z.string().cuid().nullish(),
  isActive: z.boolean().optional(),
});

export const PATCH = withAuth<Ctx>(
  "workspace.members",
  async (req, { user, db }, { params }) => {
    const { id } = await params;
    const input = await parseBody(req, patchSchema);

    const member = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!member) throw notFound("That person isn't in this workspace.");

    // The owner is the root of trust — nobody may demote or disable them.
    if (member.role === "OWNER") {
      throw forbidden("The workspace owner can't be changed here.");
    }
    if (member.id === user.id && input.isActive === false) {
      throw badRequest("You can't deactivate your own account.");
    }
    if (input.role && !assignableRoles(user.role).includes(input.role)) {
      throw forbidden(`You can't grant the ${input.role.toLowerCase()} role.`);
    }

    if (input.teamId) {
      const team = await db.team.findUnique({
        where: { id: input.teamId },
        select: { id: true },
      });
      if (!team) throw badRequest("That team doesn't exist.");
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        team: { select: { id: true, name: true } },
      },
    });

    return json({ member: updated });
  },
);

/**
 * Deactivates rather than deletes: tickets, replies and the activity log all
 * reference the user, and a support desk's history should stay readable.
 */
export const DELETE = withAuth<Ctx>(
  "workspace.members",
  async (_req, { user, db }, { params }) => {
    const { id } = await params;

    const member = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!member) throw notFound("That person isn't in this workspace.");
    if (member.role === "OWNER") throw forbidden("The workspace owner can't be removed.");
    if (member.id === user.id) throw badRequest("You can't remove your own account.");

    await db.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Free up whatever they were holding so it doesn't sit in a dead queue.
    const { count } = await db.ticket.updateMany({
      where: { assigneeId: id, status: { in: ["OPEN", "PENDING", "ON_HOLD"] } },
      data: { assigneeId: null },
    });

    return json({ ok: true, unassignedTickets: count });
  },
);
