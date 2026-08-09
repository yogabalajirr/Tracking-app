import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { describeRule } from "@/lib/rules";
import { RulesSettings } from "@/components/settings/rules-settings";

export const metadata: Metadata = { title: "Routing rules" };

export default async function RulesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = tenantDb(user.workspaceId);

  const [rules, agents, teams, tags] = await Promise.all([
    db.assignmentRule.findMany({ orderBy: { priority: "asc" } }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <RulesSettings
      role={user.role}
      initialRules={rules.map((r) => ({
        id: r.id,
        name: r.name,
        conditions: r.conditions as never,
        actions: r.actions as never,
        priority: r.priority,
        isActive: r.isActive,
        summary: describeRule(r.conditions, r.actions),
      }))}
      agents={agents}
      teams={teams}
      tags={tags.map((t) => t.name)}
    />
  );
}
