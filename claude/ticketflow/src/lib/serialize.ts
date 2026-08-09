import type { Priority, TicketStatus, Channel } from "@/generated/prisma/enums";
import { slaView, type SlaPolicyLike, type WorkspaceClock } from "./sla";

/**
 * Wire shapes shared by the API routes and the client components that consume
 * them. Keeping them in one place is what stops the inbox and the ticket page
 * from drifting apart.
 */

export type TicketListItem = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  channel: Channel;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; email: string; name: string | null };
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  tags: { id: string; name: string; color: string | null }[];
  preview: string;
  messageCount: number;
  sla: {
    state: string;
    label: string;
    dueAt: string | null;
    progress: number;
    remainingMs: number | null;
  };
};

type TicketRow = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  channel: Channel;
  createdAt: Date;
  updatedAt: Date;
  firstResponseAt: Date | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
  customer: { id: string; email: string; name: string | null };
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  tags: { id: string; name: string; color: string | null }[];
  messages?: { body: string }[];
  _count?: { messages: number };
};

export function serializeTicket(
  ticket: TicketRow,
  policies: SlaPolicyLike[],
  clock: WorkspaceClock,
  now = new Date(),
): TicketListItem {
  const policy = policies.find((p) => p.priority === ticket.priority) ?? null;
  const sla = slaView(ticket, policy, clock, now);

  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    channel: ticket.channel,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    customer: ticket.customer,
    assignee: ticket.assignee,
    tags: ticket.tags,
    preview: (ticket.messages?.[0]?.body ?? "").replace(/\s+/g, " ").slice(0, 160),
    messageCount: ticket._count?.messages ?? 0,
    sla: {
      state: sla.state,
      label: sla.label,
      dueAt: sla.dueAt?.toISOString() ?? null,
      progress: sla.progress,
      remainingMs: sla.remainingMs,
    },
  };
}

/** Prisma `include` that satisfies `serializeTicket`. */
export const TICKET_LIST_INCLUDE = {
  customer: { select: { id: true, email: true, name: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  tags: { select: { id: true, name: true, color: true } },
  messages: {
    where: { isInternal: false },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { body: true },
  },
  _count: { select: { messages: true } },
} as const;
