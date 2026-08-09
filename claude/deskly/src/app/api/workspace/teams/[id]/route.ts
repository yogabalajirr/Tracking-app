import { z } from "zod";
import { json, notFound, parseBody, withAuth } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1, "Give the team a name.").max(60),
});

export const PATCH = withAuth<Ctx>("workspace.manage", async (req, { db }, { params }) => {
  const { id } = await params;
  const input = await parseBody(req, patchSchema);

  const team = await db.team.update({
    where: { id },
    data: { name: input.name },
    select: { id: true, name: true },
  });

  return json({ team });
});

export const DELETE = withAuth<Ctx>("workspace.manage", async (_req, { db }, { params }) => {
  const { id } = await params;

  const team = await db.team.findUnique({ where: { id }, select: { id: true } });
  if (!team) throw notFound("That team no longer exists.");

  // Members and tickets keep existing; the schema's SetNull just detaches them.
  await db.team.delete({ where: { id } });

  return json({ ok: true });
});
