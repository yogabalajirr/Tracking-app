import { z } from "zod";
import { forbidden, json, parseBody, withAuth } from "@/lib/api";
import { can } from "@/lib/rbac";

export const GET = withAuth("tickets.read", async (_req, { user, db }) => {
  const views = await db.savedView.findMany({
    where: { OR: [{ userId: null }, { userId: user.id }] },
    orderBy: { createdAt: "asc" },
  });
  return json({ views });
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Name this view.").max(60),
  filters: z.record(z.string(), z.string()),
  /** Shared views are visible to the whole workspace. */
  shared: z.boolean().default(false),
});

export const POST = withAuth("tickets.read", async (req, { user, db, workspaceId }) => {
  const input = await parseBody(req, createSchema);

  if (input.shared && !can(user.role, "workspace.manage")) {
    throw forbidden("Only admins can share a view with the whole workspace.");
  }

  const view = await db.savedView.create({
    data: {
      workspaceId,
      name: input.name,
      filters: input.filters,
      userId: input.shared ? null : user.id,
    },
  });

  return json({ view }, { status: 201 });
});
