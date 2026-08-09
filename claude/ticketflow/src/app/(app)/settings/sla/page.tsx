import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { PRIORITIES, DEFAULT_SLA } from "@/lib/constants";
import { SlaSettings } from "@/components/settings/sla-settings";

export const metadata: Metadata = { title: "SLA policies" };

export default async function SlaSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stored = await tenantDb(user.workspaceId).slaPolicy.findMany();

  // Show a row per priority even if a policy was never created.
  const policies = PRIORITIES.map((priority) => {
    const found = stored.find((p) => p.priority === priority);
    return {
      priority,
      firstResponseMinutes:
        found?.firstResponseMinutes ?? DEFAULT_SLA[priority].firstResponseMinutes,
      resolutionMinutes: found?.resolutionMinutes ?? DEFAULT_SLA[priority].resolutionMinutes,
      businessHoursOnly: found?.businessHoursOnly ?? true,
    };
  });

  return <SlaSettings initial={policies} role={user.role} />;
}
