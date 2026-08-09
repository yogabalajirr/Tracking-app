import { forbidden, json, notFound, withAuth } from "@/lib/api";
import { can } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth<Ctx>(
  "tickets.read",
  async (_req, { user, db }, { params }) => {
    const { id } = await params;

    const view = await db.savedView.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!view) throw notFound("That view no longer exists.");

    // Your own views are yours; shared ones need admin rights.
    const isOwn = view.userId === user.id;
    if (!isOwn && !can(user.role, "workspace.manage")) {
      throw forbidden("Only admins can delete a shared view.");
    }

    await db.savedView.delete({ where: { id } });
    return json({ ok: true });
  },
);
