import "server-only";
import { prisma, tenantDb } from "./db";
import { slaView, workspaceClock } from "./sla";
import { portalUrl } from "./tokens";
import type { AuthorType, Channel, Priority, TicketStatus } from "@/generated/prisma/enums";

/**
 * One loader for the ticket detail, shared by the server-rendered page and the
 * REST endpoint, so the two can never drift apart. Everything is returned
 * already JSON-safe (dates as ISO strings) so it can cross the server/client
 * boundary unchanged.
 */

export type TicketDetail = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  channel: Channel;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  firstResponseAt: string | null;
  aiSummary: string | null;
  aiCategory: string | null;
  portalUrl: string;
  customer: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    ticketCount: number;
  };
  assignee: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  team: { id: string; name: string } | null;
  tags: { id: string; name: string; color: string | null }[];
  messages: {
    id: string;
    authorType: AuthorType;
    authorId: string | null;
    authorName: string | null;
    body: string;
    bodyHtml: string | null;
    isInternal: boolean;
    createdAt: string;
    attachments: {
      id: string;
      url: string;
      filename: string;
      mimeType: string;
      size: number;
    }[];
  }[];
  activities: {
    id: string;
    type: string;
    payload: unknown;
    actorName: string | null;
    createdAt: string;
  }[];
  sla: {
    state: string;
    label: string;
    kind: string | null;
    dueAt: string | null;
    progress: number;
    remainingMs: number | null;
  };
  slaPolicy: {
    firstResponseMinutes: number;
    resolutionMinutes: number;
  } | null;
  timezone: string;
};

export async function loadTicketDetail(
  workspaceId: string,
  ticketId: string,
): Promise<TicketDetail | null> {
  const db = tenantDb(workspaceId);

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      customer: true,
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      team: { select: { id: true, name: true } },
      tags: { select: { id: true, name: true, color: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          attachments: {
            select: { id: true, url: true, filename: true, mimeType: true, size: true },
          },
        },
      },
      activities: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) return null;

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { timezone: true, businessHours: true, slaPolicies: true },
  });

  const clock = workspaceClock(workspace);
  const policy = workspace.slaPolicies.find((p) => p.priority === ticket.priority) ?? null;
  const sla = slaView(ticket, policy, clock);

  const customerTicketCount = await db.ticket.count({
    where: { customerId: ticket.customerId },
  });

  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    channel: ticket.channel,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
    aiSummary: ticket.aiSummary,
    aiCategory: ticket.aiCategory,
    portalUrl: portalUrl(ticket.id),
    customer: {
      id: ticket.customer.id,
      email: ticket.customer.email,
      name: ticket.customer.name,
      createdAt: ticket.customer.createdAt.toISOString(),
      ticketCount: customerTicketCount,
    },
    assignee: ticket.assignee,
    team: ticket.team,
    tags: ticket.tags,
    messages: ticket.messages.map((m) => ({
      id: m.id,
      authorType: m.authorType,
      authorId: m.authorId,
      authorName: m.authorName,
      body: m.body,
      bodyHtml: m.bodyHtml,
      isInternal: m.isInternal,
      createdAt: m.createdAt.toISOString(),
      attachments: m.attachments,
    })),
    activities: ticket.activities.map((a) => ({
      id: a.id,
      type: a.type,
      payload: a.payload,
      actorName: a.actorName,
      createdAt: a.createdAt.toISOString(),
    })),
    sla: {
      state: sla.state,
      label: sla.label,
      kind: sla.kind,
      dueAt: sla.dueAt?.toISOString() ?? null,
      progress: sla.progress,
      remainingMs: sla.remainingMs,
    },
    slaPolicy: policy
      ? {
          firstResponseMinutes: policy.firstResponseMinutes,
          resolutionMinutes: policy.resolutionMinutes,
        }
      : null,
    timezone: workspace.timezone,
  };
}
