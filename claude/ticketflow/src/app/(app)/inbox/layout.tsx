import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadWorkspaceMeta } from "@/lib/meta";
import { InboxShell } from "@/components/inbox/inbox-shell";

/**
 * The ticket list lives in the layout rather than the page so that navigating
 * between tickets keeps its scroll position, selection and in-flight filters —
 * the three-pane behaviour agents expect.
 */
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const meta = await loadWorkspaceMeta(user.workspaceId, user.id);

  return (
    <InboxShell meta={meta} currentUserId={user.id} role={user.role}>
      {children}
    </InboxShell>
  );
}
