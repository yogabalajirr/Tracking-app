import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full min-h-0">
      <SettingsNav role={user.role} />
      <div className="min-h-0 flex-1 overflow-y-auto scroll-slim">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
