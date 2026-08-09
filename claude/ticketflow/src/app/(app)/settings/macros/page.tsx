import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { MacroSettings } from "@/components/settings/macro-settings";

export const metadata: Metadata = { title: "Canned responses" };

export default async function MacrosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const responses = await tenantDb(user.workspaceId).cannedResponse.findMany({
    where: { OR: [{ userId: null }, { userId: user.id }] },
    orderBy: [{ userId: "asc" }, { shortcode: "asc" }],
  });

  return (
    <MacroSettings
      role={user.role}
      currentUserId={user.id}
      initial={responses.map((r) => ({
        id: r.id,
        shortcode: r.shortcode,
        title: r.title,
        body: r.body,
        userId: r.userId,
      }))}
    />
  );
}
