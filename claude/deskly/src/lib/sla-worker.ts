import "server-only";
import { prisma, tenantDb } from "./db";
import { publish } from "./events";
import { sendSlaAlert } from "./email/send";
import { SLA_WARNING_THRESHOLD, workspaceClock } from "./sla";
import { addBusinessMinutes, businessMinutesBetween } from "./business-hours";
import { ACTIVE_STATUSES } from "./constants";

/**
 * SLA sweep.
 *
 * Runs on a short interval and, for every ticket still in the queue, decides
 * whether it has just crossed 75% of its target or breached it. Both states
 * are recorded on the ticket (`*WarnedAt`, `*Breached`) so an alert fires once
 * and only once, no matter how often the sweep runs.
 *
 * A polling sweep rather than per-ticket scheduled jobs: it needs no broker,
 * it is idempotent, and it self-heals after downtime — a ticket that breached
 * while the process was stopped is picked up on the next pass. The acceptance
 * target is "alerts within 1 minute of breach", which a 30s interval meets.
 */

export type SweepResult = {
  scanned: number;
  warned: number;
  breached: number;
  errors: number;
};

export async function runSlaSweep(now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = { scanned: 0, warned: 0, breached: 0, errors: 0 };

  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      name: true,
      timezone: true,
      businessHours: true,
      slaPolicies: true,
    },
  });

  for (const workspace of workspaces) {
    const db = tenantDb(workspace.id);
    const clock = workspaceClock(workspace);

    // Only tickets that are still in the queue and have a deadline can move.
    const tickets = await db.ticket.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        OR: [
          { firstResponseBreached: false, firstResponseAt: null },
          { resolutionBreached: false },
        ],
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    for (const ticket of tickets) {
      result.scanned++;

      const policy =
        workspace.slaPolicies.find((p) => p.priority === ticket.priority) ?? null;
      if (!policy) continue;

      const awaitingFirstResponse = !ticket.firstResponseAt;
      const dueAt = awaitingFirstResponse
        ? ticket.firstResponseDueAt
        : ticket.resolutionDueAt;
      if (!dueAt) continue;

      const alreadyBreached = awaitingFirstResponse
        ? ticket.firstResponseBreached
        : ticket.resolutionBreached;
      const alreadyWarned = awaitingFirstResponse
        ? ticket.firstResponseWarnedAt
        : ticket.resolutionWarnedAt;

      const targetMinutes = awaitingFirstResponse
        ? policy.firstResponseMinutes
        : policy.resolutionMinutes;

      const warnAt = addBusinessMinutes(
        ticket.createdAt,
        targetMinutes * SLA_WARNING_THRESHOLD,
        clock.timezone,
        clock.businessHours,
      );

      const breached = now >= dueAt;
      const warning = !breached && now >= warnAt;

      if (!breached && !warning) continue;
      if (breached && alreadyBreached) continue;
      if (warning && alreadyWarned) continue;

      try {
        const data: Record<string, unknown> = {};

        if (breached) {
          if (awaitingFirstResponse) {
            data.firstResponseBreached = true;
            data.firstResponseWarnedAt = ticket.firstResponseWarnedAt ?? now;
          } else {
            data.resolutionBreached = true;
            data.resolutionWarnedAt = ticket.resolutionWarnedAt ?? now;
          }
        } else {
          if (awaitingFirstResponse) data.firstResponseWarnedAt = now;
          else data.resolutionWarnedAt = now;
        }

        await db.ticket.update({ where: { id: ticket.id }, data });

        await db.activity.create({
          data: {
            workspaceId: workspace.id,
            ticketId: ticket.id,
            type: breached ? "SLA_BREACHED" : "SLA_WARNING",
            actorName: "SLA monitor",
            payload: {
              kind: awaitingFirstResponse ? "first_response" : "resolution",
              dueAt: dueAt.toISOString(),
              elapsedMinutes: Math.round(
                businessMinutesBetween(
                  ticket.createdAt,
                  now,
                  clock.timezone,
                  clock.businessHours,
                ),
              ),
            },
          },
        });

        // In-app + email alert to whoever owns it.
        if (ticket.assignee) {
          await db.notification.create({
            data: {
              workspaceId: workspace.id,
              userId: ticket.assignee.id,
              type: breached ? "SLA_BREACH" : "SLA_WARNING",
              ticketId: ticket.id,
              title: breached
                ? `SLA breached on #${ticket.number}`
                : `#${ticket.number} is at 75% of its SLA`,
              body: ticket.subject,
            },
          });

          publish({
            type: "notification.created",
            workspaceId: workspace.id,
            userId: ticket.assignee.id,
            notificationId: ticket.id,
          });

          await sendSlaAlert({
            to: ticket.assignee.email,
            agentName: ticket.assignee.name,
            workspaceName: workspace.name,
            ticketId: ticket.id,
            ticketNumber: ticket.number,
            subject: ticket.subject,
            breached,
            dueAt,
          }).catch((err) => console.error("[sla] alert email failed", err));
        }

        publish({
          type: "ticket.updated",
          workspaceId: workspace.id,
          ticketId: ticket.id,
        });

        if (breached) result.breached++;
        else result.warned++;
      } catch (err) {
        result.errors++;
        console.error(`[sla] ticket ${ticket.id} failed:`, err);
      }
    }
  }

  return result;
}
