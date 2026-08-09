import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadTicketDetail } from "@/lib/ticket-detail";
import { loadWorkspaceMeta } from "@/lib/meta";
import { aiEnabled } from "@/lib/env";
import { TicketDetailView } from "@/components/inbox/ticket-detail";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return { title: "Ticket" };

  const { id } = await params;
  const ticket = await loadTicketDetail(user.workspaceId, id);
  return { title: ticket ? `#${ticket.number} ${ticket.subject}` : "Ticket" };
}

export default async function TicketPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const [ticket, meta] = await Promise.all([
    loadTicketDetail(user.workspaceId, id),
    loadWorkspaceMeta(user.workspaceId, user.id),
  ]);

  if (!ticket) notFound();

  return (
    <TicketDetailView
      initialTicket={ticket}
      meta={meta}
      currentUser={{ id: user.id, name: user.name, email: user.email, role: user.role }}
      aiEnabled={aiEnabled()}
    />
  );
}
