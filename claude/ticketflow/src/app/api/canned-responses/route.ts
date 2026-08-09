import { z } from "zod";
import { conflict, forbidden, json, parseBody, withAuth } from "@/lib/api";
import { can } from "@/lib/rbac";

export const GET = withAuth("tickets.read", async (_req, { user, db }) => {
  const responses = await db.cannedResponse.findMany({
    where: { OR: [{ userId: null }, { userId: user.id }] },
    orderBy: [{ userId: "asc" }, { shortcode: "asc" }],
  });

  return json({ responses });
});

const createSchema = z.object({
  shortcode: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Use at least 2 characters.")
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Letters, numbers and hyphens only — it's typed after a slash."),
  title: z.string().trim().min(1, "Give it a title.").max(120),
  body: z.string().trim().min(1, "Write the response text.").max(10_000),
  /** Workspace-wide macros are available to everyone. */
  shared: z.boolean().default(false),
});

export const POST = withAuth("tickets.write", async (req, { user, db, workspaceId }) => {
  const input = await parseBody(req, createSchema);

  if (input.shared && !can(user.role, "workspace.manage")) {
    throw forbidden("Only admins can create workspace-wide canned responses.");
  }

  const ownerId = input.shared ? null : user.id;

  const existing = await db.cannedResponse.findFirst({
    where: { shortcode: input.shortcode, userId: ownerId },
    select: { id: true },
  });
  if (existing) {
    throw conflict(`You already have a canned response with the shortcode /${input.shortcode}.`);
  }

  const response = await db.cannedResponse.create({
    data: {
      workspaceId,
      userId: ownerId,
      shortcode: input.shortcode,
      title: input.title,
      body: input.body,
    },
  });

  return json({ response }, { status: 201 });
});
