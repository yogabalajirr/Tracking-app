import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DataSettings } from "@/components/settings/data-settings";

export const metadata: Metadata = { title: "Customer data" };

export default async function DataPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "workspace.manage")) redirect("/settings");

  return <DataSettings />;
}
