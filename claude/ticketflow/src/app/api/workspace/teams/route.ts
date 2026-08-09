import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";

export const GET = withAuth("workspace.read", async (_req, { db }) => {
  const teams = await db.team.findMany({
    select: {
      id: true,
      name: true,
      members: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { tickets: true } },
    },
    orderBy: { name: "asc" },
  });

  return json({ teams });
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the team a name.").max(60),
});

export const POST = withAuth("workspace.manage", async (req, { db, workspaceId }) => {
  const input = await parseBody(req, createSchema);

  const team = await db.team.create({
    data: { workspaceId, name: input.name },
    select: { id: true, name: true },
  });

  return json({ team }, { status: 201 });
});
