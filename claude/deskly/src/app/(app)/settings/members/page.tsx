import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { MembersSettings } from "@/components/settings/members-settings";

export const metadata: Metadata = { title: "Members & teams" };

export default async function MembersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = tenantDb(user.workspaceId);

  const [members, invites, teams] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    db.invite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.team.findMany({
      select: { id: true, name: true, _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <MembersSettings
      currentUser={{ id: user.id, role: user.role }}
      initialMembers={members}
      initialInvites={invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
      initialTeams={teams}
    />
  );
}
