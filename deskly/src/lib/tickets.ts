import "server-only";
import { prisma, tenantDb, type TenantDb } from "./db";
import { publish } from "./events";
import { evaluateRules, type RuleContext } from "./rules";
import { computeSlaDates, workspaceClock, type SlaPolicyLike } from "./sla";
import { htmlToText, sanitizeEmailHtml, textToHtml } from "./sanitize";
import { ACTIVE_STATUSES } from "./constants";
import type {
  AuthorType,
  Channel,
  NotificationType,
  Priority,
  TicketStatus,
} from "@/generated/prisma/enums";

export type Actor = { id: string; name: string; role: string } | null;

/** Full workspace context needed to price SLAs and run rules. */
async function loadWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      timezone: true,
      businessHours: true,
      slaPolicies: true,
    },
  });
  return workspace;
}

function policyFor(
  policies: SlaPolicyLike[],
  priority: Priority,
): SlaPolicyLike | null {
  return policies.find((p) => p.priority === priority) ?? null;
}

// --- Activity -------------------------------------------------------------

type ActivityType =
  | "TICKET_CREATED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "ASSIGNED"
  | "UNASSIGNED"
  | "TEAM_CHANGED"
  | "TAGGED"
  | "UNTAGGED"
  | "REPLIED"
  | "NOTE_ADDED"
  | "CUSTOMER_REPLIED"
  | "REOPENED"
  | "SLA_WARNING"
  | "SLA_BREACHED"
  | "RULE_APPLIED"
  | "AI_TAGGED";

async function logActivity(
  db: TenantDb,
  input: {
    workspaceId: string;
    ticketId: string;
    type: ActivityType;
    payload: Record<string, unknown>;
    actor: Actor;
  },
) {
  await db.activity.create({
    data: {
      workspaceId: input.workspaceId,
      ticketId: input.ticketId,
      type: input.type,
      payload: input.payload as object,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? "System",
    },
  });
}

// --- Notifications --------------------------------------------------------

async function notify(
  db: TenantDb,
  input: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    ticketId?: string;
    workspaceId: string;
  },
) {
  const notification = await db.notification.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      ticketId: input.ticketId ?? null,
    },
  });

  publish({
    type: "notification.created",
    workspaceId: input.workspaceId,
    userId: input.userId,
    notificationId: notification.id,
  });

  return notification;
}

/** `@someone@example.com` tokens, resolved against workspace members. */
const MENTION_RE = /@([\w.+-]+@[\w-]+\.[\w.-]+)/g;

export function extractMentions(body: string): string[] {
  const emails = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    emails.add(match[1].toLowerCase());
  }
  return [...emails];
}

// --- Round robin ----------------------------------------------------------

/**
 * Picks the next agent in a team, load-balanced.
 *
 * "Load" is the count of tickets still in the queue, so a returning agent with
 * a clear plate gets work before someone already holding ten tickets. The
 * team's `rrCursor` breaks ties, which keeps allocation fair when everyone is
 * equally loaded.
 */
export async function pickRoundRobinAssignee(
  db: TenantDb,
  teamId: string,
): Promise<string | null> {
  const members = await db.user.findMany({
    where: { teamId, isActive: true, role: { in: ["OWNER", "ADMIN", "AGENT"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (members.length === 0) return null;

  const loads = await db.ticket.groupBy({
    by: ["assigneeId"],
    where: {
      assigneeId: { in: members.map((m) => m.id) },
      status: { in: ACTIVE_STATUSES },
    },
    _count: { _all: true },
  });

  const loadByUser = new Map(loads.map((l) => [l.assigneeId as string, l._count._all]));

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { rrCursor: true },
  });
  const cursor = team?.rrCursor ?? 0;

  // Rotate the member list so ties are handed out in turn, not always to the
  // same person at the head of the list.
  const rotated = members.map(
    (_, i) => members[(cursor + i) % members.length],
  );

  let best = rotated[0];
  let bestLoad = loadByUser.get(best.id) ?? 0;
  for (const member of rotated.slice(1)) {
    const load = loadByUser.get(member.id) ?? 0;
    if (load < bestLoad) {
      best = member;
      bestLoad = load;
    }
  }

  await db.team.update({
    where: { id: teamId },
    data: { rrCursor: (cursor + 1) % members.length },
  });

  return best.id;
}

// --- Ticket creation ------------------------------------------------------

export type CreateTicketInput = {
  workspaceId: string;
  subject: string;
  body: string;
  bodyHtml?: string | null;
  channel: Channel;
  customer: { email: string; name?: string | null };
  priority?: Priority;
  assigneeId?: string | null;
  teamId?: string | null;
  tagNames?: string[];
  emailMessageId?: string | null;
  emailInReplyTo?: string | null;
  emailReferences?: string | null;
  attachments?: {
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  }[];
  actor?: Actor;
  /** Skip routing rules (used by the seed script for deterministic data). */
  skipRules?: boolean;
};

export async function createTicket(input: CreateTicketInput) {
  const workspace = await loadWorkspace(input.workspaceId);
  const db = tenantDb(input.workspaceId);
  const clock = workspaceClock(workspace);

  const customer = await db.customer.upsert({
    where: {
      workspaceId_email: {
        workspaceId: input.workspaceId,
        email: input.customer.email.toLowerCase(),
      },
    },
    create: {
      workspaceId: input.workspaceId,
      email: input.customer.email.toLowerCase(),
      name: input.customer.name ?? null,
    },
    update: input.customer.name ? { name: input.customer.name } : {},
  });

  // --- routing ---
  let priority: Priority = input.priority ?? "NORMAL";
  let assigneeId = input.assigneeId ?? null;
  let teamId = input.teamId ?? null;
  let status: TicketStatus = "OPEN";
  const tagNames = [...(input.tagNames ?? [])];
  let matchedRules: string[] = [];

  if (!input.skipRules) {
    const rules = await db.assignmentRule.findMany({
      where: { isActive: true },
      orderBy: { priority: "asc" },
    });

    const ctx: RuleContext = {
      senderEmail: customer.email,
      subject: input.subject,
      body: input.body,
      channel: input.channel,
      priority,
    };

    const outcome = evaluateRules(rules, ctx);
    matchedRules = outcome.matchedRules;

    if (outcome.priority) priority = outcome.priority as Priority;
    if (outcome.status) status = outcome.status as TicketStatus;
    if (outcome.assigneeId) assigneeId = outcome.assigneeId;
    if (outcome.teamId) teamId = outcome.teamId;
    for (const tag of outcome.tags) {
      if (!tagNames.includes(tag)) tagNames.push(tag);
    }
  }

  // A team without a named agent means "round-robin within this team".
  if (teamId && !assigneeId) {
    assigneeId = await pickRoundRobinAssignee(db, teamId);
  }

  // Guard against a rule naming an agent from another workspace or a stale id.
  if (assigneeId) {
    const exists = await db.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, teamId: true },
    });
    if (!exists) assigneeId = null;
    else if (!teamId) teamId = exists.teamId;
  }

  const createdAt = new Date();
  const policy = policyFor(workspace.slaPolicies, priority);
  const sla = computeSlaDates({
    createdAt,
    firstResponseAt: null,
    status,
    policy,
    clock,
  });

  const tagIds = await ensureTags(db, input.workspaceId, tagNames);

  const ticket = await prisma.$transaction(async (tx) => {
    const { ticketCounter } = await tx.workspace.update({
      where: { id: input.workspaceId },
      data: { ticketCounter: { increment: 1 } },
      select: { ticketCounter: true },
    });

    return tx.ticket.create({
      data: {
        workspaceId: input.workspaceId,
        number: ticketCounter,
        subject: input.subject.slice(0, 500) || "(no subject)",
        status,
        priority,
        channel: input.channel,
        customerId: customer.id,
        assigneeId,
        teamId,
        createdAt,
        firstResponseDueAt: sla.firstResponseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
        slaDueAt: sla.slaDueAt,
        tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
        messages: {
          create: {
            workspaceId: input.workspaceId,
            authorType: "CUSTOMER" satisfies AuthorType,
            authorName: customer.name ?? customer.email,
            body: input.body,
            bodyHtml: input.bodyHtml ? sanitizeEmailHtml(input.bodyHtml) : null,
            isInternal: false,
            emailMessageId: input.emailMessageId ?? null,
            emailInReplyTo: input.emailInReplyTo ?? null,
            emailReferences: input.emailReferences ?? null,
            createdAt,
            attachments: input.attachments?.length
              ? {
                  create: input.attachments.map((a) => ({
                    workspaceId: input.workspaceId,
                    url: a.url,
                    filename: a.filename,
                    mimeType: a.mimeType,
                    size: a.size,
                  })),
                }
              : undefined,
          },
        },
      },
      include: { customer: true, assignee: true, tags: true },
    });
  });

  await logActivity(db, {
    workspaceId: input.workspaceId,
    ticketId: ticket.id,
    type: "TICKET_CREATED",
    payload: { channel: input.channel, subject: ticket.subject },
    actor: input.actor ?? null,
  });

  if (matchedRules.length) {
    await logActivity(db, {
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      type: "RULE_APPLIED",
      payload: { rules: matchedRules, assigneeId, teamId, priority },
      actor: null,
    });
  }

  if (assigneeId) {
    await logActivity(db, {
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      type: "ASSIGNED",
      payload: { assigneeId, automatic: true },
      actor: null,
    });
    await notify(db, {
      workspaceId: input.workspaceId,
      userId: assigneeId,
      type: "ASSIGNED",
      title: `Assigned to you: #${ticket.number}`,
      body: ticket.subject,
      ticketId: ticket.id,
    });
  }

  publish({
    type: "ticket.created",
    workspaceId: input.workspaceId,
    ticketId: ticket.id,
    number: ticket.number,
  });

  return ticket;
}

/**
 * Finds or creates tags by name, returning their ids.
 *
 * The compound unique key needs the real workspaceId, so it is passed in
 * explicitly rather than relying on the scoped client to inject it — the
 * injection happens at the top level of `where`, not inside a compound
 * selector.
 */
export async function ensureTags(
  db: TenantDb,
  workspaceId: string,
  names: string[],
): Promise<string[]> {
  const unique = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return [];

  const ids: string[] = [];
  for (const name of unique) {
    const tag = await db.tag.upsert({
      where: { workspaceId_name: { workspaceId, name } },
      create: { workspaceId, name },
      update: {},
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
}

// --- Messages -------------------------------------------------------------

export type AddMessageInput = {
  workspaceId: string;
  ticketId: string;
  authorType: AuthorType;
  actor?: Actor;
  authorName?: string;
  body: string;
  bodyHtml?: string | null;
  isInternal?: boolean;
  emailMessageId?: string | null;
  emailInReplyTo?: string | null;
  emailReferences?: string | null;
  attachments?: {
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  }[];
};

/**
 * Appends a message and applies every side effect that follows from it:
 * first-response stamping, reopen-on-customer-reply, @mention notifications,
 * SLA recalculation and the activity log.
 */
export async function addMessage(input: AddMessageInput) {
  const db = tenantDb(input.workspaceId);
  const workspace = await loadWorkspace(input.workspaceId);
  const clock = workspaceClock(workspace);

  const ticket = await db.ticket.findUniqueOrThrow({
    where: { id: input.ticketId },
    include: { customer: true },
  });

  const isInternal = input.isInternal ?? false;
  const isAgentReply = input.authorType === "AGENT" && !isInternal;
  const isCustomerReply = input.authorType === "CUSTOMER";

  const message = await db.message.create({
    data: {
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      authorType: input.authorType,
      authorId: input.actor?.id ?? null,
      authorName: input.authorName ?? input.actor?.name ?? ticket.customer.email,
      body: input.body,
      bodyHtml: input.bodyHtml
        ? sanitizeEmailHtml(input.bodyHtml)
        : input.authorType === "AGENT"
          ? textToHtml(input.body)
          : null,
      isInternal,
      emailMessageId: input.emailMessageId ?? null,
      emailInReplyTo: input.emailInReplyTo ?? null,
      emailReferences: input.emailReferences ?? null,
      attachments: input.attachments?.length
        ? {
            create: input.attachments.map((a) => ({
              workspaceId: input.workspaceId,
              url: a.url,
              filename: a.filename,
              mimeType: a.mimeType,
              size: a.size,
            })),
          }
        : undefined,
    },
    include: { attachments: true },
  });

  const patch: Record<string, unknown> = {};
  const now = new Date();

  // First agent reply stops the first-response clock and starts resolution.
  const firstResponseAt =
    isAgentReply && !ticket.firstResponseAt ? now : ticket.firstResponseAt;

  if (isAgentReply && !ticket.firstResponseAt) {
    patch.firstResponseAt = now;
  }

  let status = ticket.status;
  let reopened = false;

  if (isCustomerReply) {
    // A customer replying to a finished ticket brings it back to the queue.
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      status = "OPEN";
      reopened = true;
      patch.resolvedAt = null;
      patch.closedAt = null;
    } else if (ticket.status === "PENDING") {
      status = "OPEN";
    }
  } else if (isAgentReply && ticket.status === "OPEN") {
    // Answering a customer moves the ball to their court.
    status = "PENDING";
  }

  if (status !== ticket.status) patch.status = status;

  const policy = policyFor(workspace.slaPolicies, ticket.priority);
  const sla = computeSlaDates({
    createdAt: ticket.createdAt,
    firstResponseAt,
    status,
    policy,
    clock,
    // A reopened ticket gets a fresh resolution window from the reply.
    resolutionAnchor: reopened ? now : ticket.createdAt,
  });

  patch.firstResponseDueAt = sla.firstResponseDueAt;
  patch.resolutionDueAt = sla.resolutionDueAt;
  patch.slaDueAt = sla.slaDueAt;

  if (reopened) {
    patch.resolutionWarnedAt = null;
    patch.resolutionBreached = false;
  }

  await db.ticket.update({ where: { id: ticket.id }, data: patch });

  // --- activity + notifications ---
  await logActivity(db, {
    workspaceId: input.workspaceId,
    ticketId: ticket.id,
    type: isInternal ? "NOTE_ADDED" : isCustomerReply ? "CUSTOMER_REPLIED" : "REPLIED",
    payload: { messageId: message.id },
    actor: input.actor ?? null,
  });

  if (reopened) {
    await logActivity(db, {
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      type: "REOPENED",
      payload: { reason: "customer_reply" },
      actor: null,
    });
  }

  if (isInternal) {
    await notifyMentions(db, {
      workspaceId: input.workspaceId,
      body: input.body,
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      actorId: input.actor?.id,
      actorName: input.actor?.name ?? "Someone",
    });
  }

  if (isCustomerReply && ticket.assigneeId) {
    await notify(db, {
      workspaceId: input.workspaceId,
      userId: ticket.assigneeId,
      type: "CUSTOMER_REPLY",
      title: `${ticket.customer.name ?? ticket.customer.email} replied on #${ticket.number}`,
      body: htmlToText(input.body).slice(0, 160),
      ticketId: ticket.id,
    });
  }

  publish({
    type: "message.created",
    workspaceId: input.workspaceId,
    ticketId: ticket.id,
    messageId: message.id,
  });
  publish({ type: "ticket.updated", workspaceId: input.workspaceId, ticketId: ticket.id });

  return { message, ticket: { ...ticket, ...patch, status } };
}

async function notifyMentions(
  db: TenantDb,
  input: {
    workspaceId: string;
    body: string;
    ticketId: string;
    ticketNumber: number;
    actorId?: string;
    actorName: string;
  },
) {
  const emails = extractMentions(input.body);
  if (emails.length === 0) return;

  const mentioned = await db.user.findMany({
    where: { email: { in: emails }, isActive: true },
    select: { id: true, email: true },
  });

  for (const user of mentioned) {
    if (user.id === input.actorId) continue; // don't ping yourself
    await notify(db, {
      workspaceId: input.workspaceId,
      userId: user.id,
      type: "MENTION",
      title: `${input.actorName} mentioned you on #${input.ticketNumber}`,
      body: htmlToText(input.body).slice(0, 160),
      ticketId: input.ticketId,
    });
  }
}

// --- Updates --------------------------------------------------------------

export type UpdateTicketPatch = {
  status?: TicketStatus;
  priority?: Priority;
  assigneeId?: string | null;
  teamId?: string | null;
  tagNames?: string[];
};

export async function updateTicket(input: {
  workspaceId: string;
  ticketId: string;
  patch: UpdateTicketPatch;
  actor: Actor;
}) {
  const db = tenantDb(input.workspaceId);
  const workspace = await loadWorkspace(input.workspaceId);
  const clock = workspaceClock(workspace);

  const before = await db.ticket.findUniqueOrThrow({
    where: { id: input.ticketId },
    include: { tags: true },
  });

  const data: Record<string, unknown> = {};
  const now = new Date();

  if (input.patch.priority && input.patch.priority !== before.priority) {
    data.priority = input.patch.priority;
  }

  if (input.patch.status && input.patch.status !== before.status) {
    data.status = input.patch.status;
    if (input.patch.status === "RESOLVED") {
      data.resolvedAt = now;
      data.closedAt = null;
    } else if (input.patch.status === "CLOSED") {
      data.closedAt = now;
      data.resolvedAt = before.resolvedAt ?? now;
    } else {
      data.resolvedAt = null;
      data.closedAt = null;
    }
  }

  if (input.patch.assigneeId !== undefined) {
    data.assigneeId = input.patch.assigneeId;
  }
  if (input.patch.teamId !== undefined) {
    data.teamId = input.patch.teamId;
  }

  // Recompute deadlines whenever priority or status changed.
  const nextPriority = (data.priority as Priority) ?? before.priority;
  const nextStatus = (data.status as TicketStatus) ?? before.status;

  if (data.priority || data.status) {
    const sla = computeSlaDates({
      createdAt: before.createdAt,
      firstResponseAt: before.firstResponseAt,
      status: nextStatus,
      policy: policyFor(workspace.slaPolicies, nextPriority),
      clock,
    });
    data.firstResponseDueAt = sla.firstResponseDueAt;
    data.resolutionDueAt = sla.resolutionDueAt;
    data.slaDueAt = sla.slaDueAt;
  }

  if (input.patch.tagNames) {
    const ids = await ensureTags(db, input.workspaceId, input.patch.tagNames);
    data.tags = { set: ids.map((id) => ({ id })) };
  }

  const ticket = await db.ticket.update({
    where: { id: input.ticketId },
    data,
    include: { customer: true, assignee: true, tags: true },
  });

  // --- activity ---
  if (data.status) {
    await logActivity(db, {
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      type: "STATUS_CHANGED",
      payload: { from: before.status, to: data.status },
      actor: input.actor,
    });
  }
  if (data.priority) {
    await logActivity(db, {
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      type: "PRIORITY_CHANGED",
      payload: { from: before.priority, to: data.priority },
      actor: input.actor,
    });
  }
  if (input.patch.assigneeId !== undefined && input.patch.assigneeId !== before.assigneeId) {
    await logActivity(db, {
      workspaceId: input.workspaceId,
      ticketId: ticket.id,
      type: input.patch.assigneeId ? "ASSIGNED" : "UNASSIGNED",
      payload: { from: before.assigneeId, to: input.patch.assigneeId },
      actor: input.actor,
    });

    if (input.patch.assigneeId && input.patch.assigneeId !== input.actor?.id) {
      await notify(db, {
        workspaceId: input.workspaceId,
        userId: input.patch.assigneeId,
        type: "ASSIGNED",
        title: `${input.actor?.name ?? "Someone"} assigned you #${ticket.number}`,
        body: ticket.subject,
        ticketId: ticket.id,
      });
    }
  }
  if (input.patch.tagNames) {
    const beforeNames = before.tags.map((t) => t.name).sort();
    const afterNames = ticket.tags.map((t) => t.name).sort();
    if (beforeNames.join() !== afterNames.join()) {
      await logActivity(db, {
        workspaceId: input.workspaceId,
        ticketId: ticket.id,
        type: "TAGGED",
        payload: { from: beforeNames, to: afterNames },
        actor: input.actor,
      });
    }
  }

  publish({ type: "ticket.updated", workspaceId: input.workspaceId, ticketId: ticket.id });
  return ticket;
}
