import { z } from "zod";
import { forbidden, json, notFound, parseBody, withAuth } from "@/lib/api";
import { can } from "@/lib/rbac";
import type { TenantDb } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const putSchema = z.object({
  shortcode: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Letters, numbers and hyphens only."),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10_000),
});

/** You may edit your own macros; shared ones need admin rights. */
async function assertEditable(
  db: TenantDb,
  id: string,
  user: { id: string; role: Parameters<typeof can>[0] },
) {
  const response = await db.cannedResponse.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!response) throw notFound("That canned response no longer exists.");

  if (response.userId !== user.id && !can(user.role, "workspace.manage")) {
    throw forbidden("Only admins can change a workspace-wide canned response.");
  }

  return response;
}

export const PUT = withAuth<Ctx>("tickets.write", async (req, { user, db }, { params }) => {
  const { id } = await params;
  await assertEditable(db, id, user);

  const input = await parseBody(req, putSchema);

  const response = await db.cannedResponse.update({
    where: { id },
    data: input,
  });

  return json({ response });
});

export const DELETE = withAuth<Ctx>("tickets.write", async (_req, { user, db }, { params }) => {
  const { id } = await params;
  await assertEditable(db, id, user);

  await db.cannedResponse.delete({ where: { id } });
  return json({ ok: true });
});
