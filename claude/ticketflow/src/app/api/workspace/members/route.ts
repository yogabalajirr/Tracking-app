import { badRequest, conflict, forbidden, json, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashToken, randomToken } from "@/lib/tokens";
import { sendInviteEmail } from "@/lib/email/send";
import { assignableRoles } from "@/lib/rbac";
import { inviteSchema } from "@/lib/validation";
import { env } from "@/lib/env";

const INVITE_TTL_DAYS = 7;

export const GET = withAuth("workspace.read", async (_req, { db }) => {
  const [members, invites, teams] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.invite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.team.findMany({
      select: { id: true, name: true, _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return json({ members, invites, teams });
});

/** POST /api/workspace/members — invite someone by email. */
export const POST = withAuth("workspace.members", async (req, { user, db, workspaceId }) => {
  const input = await parseBody(req, inviteSchema);

  if (!assignableRoles(user.role).includes(input.role)) {
    throw forbidden(`You can't hand out the ${input.role.toLowerCase()} role.`);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, workspaceId: true },
  });
  if (existingUser) {
    throw conflict(
      existingUser.workspaceId === workspaceId
        ? "That person is already in this workspace."
        : "That email is already registered to another workspace.",
    );
  }

  if (input.teamId) {
    const team = await db.team.findUnique({
      where: { id: input.teamId },
      select: { id: true },
    });
    if (!team) throw badRequest("That team doesn't exist.");
  }

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Re-inviting replaces the previous link rather than erroring.
  const invite = await db.invite.upsert({
    where: { workspaceId_email: { workspaceId, email: input.email } },
    create: {
      workspaceId,
      email: input.email,
      role: input.role,
      teamId: input.teamId ?? null,
      tokenHash: hashToken(token),
      invitedById: user.id,
      expiresAt,
    },
    update: {
      role: input.role,
      teamId: input.teamId ?? null,
      tokenHash: hashToken(token),
      invitedById: user.id,
      expiresAt,
      acceptedAt: null,
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  });

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { name: true },
  });

  let emailed = true;
  try {
    await sendInviteEmail({
      to: input.email,
      workspaceName: workspace.name,
      inviterName: user.name,
      token,
      role: input.role,
    });
  } catch (err) {
    // The invite is valid regardless; surface the link so the admin can share
    // it another way rather than leaving them stuck.
    emailed = false;
    console.error("[invite] email failed", err);
  }

  return json(
    {
      invite,
      emailed,
      // Shown in the UI so an admin can copy it — useful on a local install
      // where outbound email isn't configured.
      inviteUrl: `${env().APP_URL}/invite/${token}`,
    },
    { status: 201 },
  );
});
