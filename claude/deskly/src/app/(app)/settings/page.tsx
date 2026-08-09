import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { supportAddress } from "@/lib/env";
import { parseBusinessHours } from "@/lib/business-hours";
import { WorkspaceSettings } from "@/components/settings/workspace-settings";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: user.workspaceId },
    select: {
      name: true,
      subdomain: true,
      brandColor: true,
      logoUrl: true,
      timezone: true,
      businessHours: true,
    },
  });

  return (
    <WorkspaceSettings
      role={user.role}
      workspace={{
        name: workspace.name,
        subdomain: workspace.subdomain,
        brandColor: workspace.brandColor,
        logoUrl: workspace.logoUrl,
        timezone: workspace.timezone,
        businessHours: parseBusinessHours(workspace.businessHours),
        supportEmail: supportAddress(workspace.subdomain),
      }}
    />
  );
}
