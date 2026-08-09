import "server-only";
import { tenantDb } from "./db";
import { aiEnabled } from "./env";
import { classifyTicket, shouldEscalate, type Classification } from "./ai";
import { ensureTags } from "./tickets";
import { publish } from "./events";

/**
 * Auto-triage: ask the model for a category and a priority, then record them.
 *
 * Two deliberate limits on what this is allowed to change:
 *
 * 1. It only *raises* priority, and only when a human hasn't already set one.
 *    A model that can quietly downgrade an URGENT ticket is a liability.
 * 2. It writes the category to `aiCategory` and adds one tag, so its opinion is
 *    always visibly attributable rather than blended into human-set fields.
 *
 * Every write is logged as an `AI_TAGGED` activity, so the audit trail shows
 * exactly what the model did and when.
 */

export type TriageResult = {
  applied: boolean;
  classification: Classification | null;
  priorityChanged: boolean;
};

export async function triageTicket(
  workspaceId: string,
  ticketId: string,
  opts: { allowPriorityChange?: boolean } = {},
): Promise<TriageResult> {
  if (!aiEnabled()) return { applied: false, classification: null, priorityChanged: false };

  const db = tenantDb(workspaceId);
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subject: true,
      priority: true,
      channel: true,
      aiCategory: true,
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { body: true },
      },
    },
  });
  if (!ticket) return { applied: false, classification: null, priorityChanged: false };

  const classification = await classifyTicket({
    subject: ticket.subject,
    body: ticket.messages[0]?.body ?? "",
    channel: ticket.channel,
  });
  if (!classification) return { applied: false, classification: null, priorityChanged: false };

  // Only ever escalate, never downgrade — see the note at the top of the file.
  const shouldRaise =
    opts.allowPriorityChange !== false &&
    shouldEscalate(ticket.priority, classification.priority);

  const tagIds = await ensureTags(db, workspaceId, [classification.category]);

  await db.ticket.update({
    where: { id: ticketId },
    data: {
      aiCategory: classification.category,
      ...(shouldRaise ? { priority: classification.priority } : {}),
      tags: { connect: tagIds.map((id) => ({ id })) },
    },
  });

  await db.activity.create({
    data: {
      workspaceId,
      ticketId,
      type: "AI_TAGGED",
      actorId: null,
      actorName: "Claude",
      payload: {
        category: classification.category,
        suggestedPriority: classification.priority,
        priorityApplied: shouldRaise,
        reason: classification.reason,
      },
    },
  });

  publish({ type: "ticket.updated", workspaceId, ticketId });

  return { applied: true, classification, priorityChanged: shouldRaise };
}

/**
 * Fire-and-forget wrapper for the ticket-creation path.
 *
 * Triage is a nicety; ticket creation is not. A slow or failing model call must
 * never surface to whoever submitted the form, so this never rejects and never
 * blocks the response.
 */
export function triageInBackground(workspaceId: string, ticketId: string): void {
  if (!aiEnabled()) return;

  void triageTicket(workspaceId, ticketId).catch((err) => {
    console.error("[ai] triage failed for ticket", ticketId, err);
  });
}
