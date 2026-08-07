import type { Metadata } from "next";
import { MousePointerClick } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { WelcomeBanner } from "@/components/inbox/welcome-banner";
import { getCurrentUser } from "@/lib/auth";
import { supportAddress } from "@/lib/env";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const user = await getCurrentUser();

  if (welcome && user) {
    return (
      <div className="h-full overflow-y-auto p-6 scroll-slim">
        <WelcomeBanner
          workspaceName={user.workspace.name}
          supportEmail={supportAddress(user.workspace.subdomain)}
        />
      </div>
    );
  }

  return (
    <div className="grid h-full place-items-center">
      <EmptyState
        icon={MousePointerClick}
        title="Pick a ticket"
        description="Choose a ticket from the queue, or press J to jump to the first one."
      />
    </div>
  );
}
