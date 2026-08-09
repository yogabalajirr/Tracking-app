import "server-only";
import { prisma, tenantDb } from "./db";
import { ACTIVE_STATUSES } from "./constants";
import type { Channel, Priority, TicketStatus } from "@/generated/prisma/enums";

/**
 * Reporting aggregates.
 *
 * Everything is computed in SQL rather than by loading tickets into memory, so
 * a workspace with 100k tickets reports as fast as one with 100.
 */

export type Range = "7d" | "30d" | "90d";

export const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function rangeStart(range: Range, now = new Date()): Date {
  const start = new Date(now);
  start.setDate(start.getDate() - RANGE_DAYS[range]);
  start.setHours(0, 0, 0, 0);
  return start;
}

export type Overview = {
  range: Range;
  from: string;
  to: string;
  created: number;
  resolved: number;
  /** Still in the queue right now, regardless of range. */
  openNow: number;
  overdueNow: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  slaCompliancePercent: number | null;
  /** Placeholder until the CSAT survey ships — see scope. */
  csatAverage: number | null;
  csatResponses: number;
  /** Same metrics for the preceding window, for trend arrows. */
  previous: {
    created: number;
    resolved: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
  };
};

export async function buildOverview(
  workspaceId: string,
  range: Range,
  now = new Date(),
): Promise<Overview> {
  const from = rangeStart(range, now);
  const previousFrom = new Date(from);
  previousFrom.setDate(previousFrom.getDate() - RANGE_DAYS[range]);

  const db = tenantDb(workspaceId);

  const [
    created,
    resolved,
    openNow,
    overdueNow,
    responseStats,
    slaStats,
    csat,
    previousCreated,
    previousResolved,
    previousResponseStats,
  ] = await Promise.all([
    db.ticket.count({ where: { createdAt: { gte: from } } }),
    db.ticket.count({ where: { resolvedAt: { gte: from } } }),
    db.ticket.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    db.ticket.count({
      where: { status: { in: ACTIVE_STATUSES }, slaDueAt: { lt: now } },
    }),
    averageDurations(workspaceId, from, now),
    slaCompliance(workspaceId, from, now),
    db.ticket.aggregate({
      where: { csatScore: { not: null }, resolvedAt: { gte: from } },
      _avg: { csatScore: true },
      _count: { csatScore: true },
    }),
    db.ticket.count({ where: { createdAt: { gte: previousFrom, lt: from } } }),
    db.ticket.count({ where: { resolvedAt: { gte: previousFrom, lt: from } } }),
    averageDurations(workspaceId, previousFrom, from),
  ]);

  return {
    range,
    from: from.toISOString(),
    to: now.toISOString(),
    created,
    resolved,
    openNow,
    overdueNow,
    avgFirstResponseMinutes: responseStats.firstResponse,
    avgResolutionMinutes: responseStats.resolution,
    slaCompliancePercent: slaStats,
    csatAverage: csat._avg.csatScore,
    csatResponses: csat._count.csatScore,
    previous: {
      created: previousCreated,
      resolved: previousResolved,
      avgFirstResponseMinutes: previousResponseStats.firstResponse,
      avgResolutionMinutes: previousResponseStats.resolution,
    },
  };
}

/** Mean first-response and resolution times, in minutes. */
async function averageDurations(
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<{ firstResponse: number | null; resolution: number | null }> {
  const rows = await prisma.$queryRaw<
    { first_response: number | null; resolution: number | null }[]
  >`
    SELECT
      AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) / 60)
        FILTER (WHERE "firstResponseAt" IS NOT NULL) AS first_response,
      AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 60)
        FILTER (WHERE "resolvedAt" IS NOT NULL) AS resolution
    FROM "Ticket"
    WHERE "workspaceId" = ${workspaceId}
      AND "createdAt" >= ${from}
      AND "createdAt" < ${to}
  `;

  const row = rows[0];
  return {
    firstResponse: row?.first_response !== null ? Number(row?.first_response) : null,
    resolution: row?.resolution !== null ? Number(row?.resolution) : null,
  };
}

/**
 * Percentage of tickets in the window that met both their first-response and
 * resolution targets. Tickets with no policy are excluded rather than counted
 * as passes.
 */
async function slaCompliance(
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ total: bigint; met: bigint }[]>`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (
        WHERE NOT "firstResponseBreached"
          AND NOT "resolutionBreached"
          AND ("resolvedAt" IS NULL OR "resolutionDueAt" IS NULL OR "resolvedAt" <= "resolutionDueAt")
      ) AS met
    FROM "Ticket"
    WHERE "workspaceId" = ${workspaceId}
      AND "createdAt" >= ${from}
      AND "createdAt" < ${to}
      AND "firstResponseDueAt" IS NOT NULL
  `;

  const row = rows[0];
  if (!row || Number(row.total) === 0) return null;
  return (Number(row.met) / Number(row.total)) * 100;
}

export type VolumePoint = {
  date: string;
  created: number;
  resolved: number;
};

/** Daily created/resolved counts, with empty days filled in as zero. */
export async function buildVolume(
  workspaceId: string,
  range: Range,
  now = new Date(),
): Promise<VolumePoint[]> {
  const from = rangeStart(range, now);

  const rows = await prisma.$queryRaw<
    { day: Date; created: bigint; resolved: bigint }[]
  >`
    WITH days AS (
      SELECT generate_series(${from}::date, ${now}::date, '1 day')::date AS day
    )
    SELECT
      days.day,
      COUNT(created.id) AS created,
      COUNT(resolved.id) AS resolved
    FROM days
    LEFT JOIN "Ticket" created
      ON created."workspaceId" = ${workspaceId}
     AND created."createdAt"::date = days.day
    LEFT JOIN "Ticket" resolved
      ON resolved."workspaceId" = ${workspaceId}
     AND resolved."resolvedAt"::date = days.day
    GROUP BY days.day
    ORDER BY days.day
  `;

  return rows.map((r) => ({
    date: r.day.toISOString().slice(0, 10),
    created: Number(r.created),
    resolved: Number(r.resolved),
  }));
}

export type Breakdown = { label: string; value: number }[];

export async function buildBreakdowns(
  workspaceId: string,
  range: Range,
  now = new Date(),
): Promise<{
  byChannel: Breakdown;
  byPriority: Breakdown;
  byStatus: Breakdown;
  byTag: Breakdown;
}> {
  const from = rangeStart(range, now);
  const db = tenantDb(workspaceId);
  const where = { createdAt: { gte: from } };

  const [channels, priorities, statuses, tagRows] = await Promise.all([
    db.ticket.groupBy({ by: ["channel"], where, _count: { _all: true } }),
    db.ticket.groupBy({ by: ["priority"], where, _count: { _all: true } }),
    db.ticket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.$queryRaw<{ name: string; count: bigint }[]>`
      SELECT t."name", COUNT(*) AS count
      FROM "Tag" t
      JOIN "_TagToTicket" tt ON tt."A" = t.id
      JOIN "Ticket" tk ON tk.id = tt."B"
      WHERE t."workspaceId" = ${workspaceId}
        AND tk."createdAt" >= ${from}
      GROUP BY t."name"
      ORDER BY count DESC
      LIMIT 10
    `,
  ]);

  return {
    byChannel: channels.map((c) => ({
      label: c.channel as Channel,
      value: c._count._all,
    })),
    byPriority: priorities.map((p) => ({
      label: p.priority as Priority,
      value: p._count._all,
    })),
    byStatus: statuses.map((s) => ({
      label: s.status as TicketStatus,
      value: s._count._all,
    })),
    byTag: tagRows.map((t) => ({ label: t.name, value: Number(t.count) })),
  };
}

export type AgentRow = {
  id: string;
  name: string;
  avatarUrl: string | null;
  assigned: number;
  resolved: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  openNow: number;
};

/** Agent leaderboard for the window. */
export async function buildAgentStats(
  workspaceId: string,
  range: Range,
  now = new Date(),
): Promise<AgentRow[]> {
  const from = rangeStart(range, now);

  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      avatarUrl: string | null;
      assigned: bigint;
      resolved: bigint;
      open_now: bigint;
      first_response: number | null;
      resolution: number | null;
    }[]
  >`
    SELECT
      u.id,
      u.name,
      u."avatarUrl",
      COUNT(t.id) FILTER (WHERE t."createdAt" >= ${from}) AS assigned,
      COUNT(t.id) FILTER (WHERE t."resolvedAt" >= ${from}) AS resolved,
      COUNT(t.id) FILTER (WHERE t.status IN ('OPEN', 'PENDING', 'ON_HOLD')) AS open_now,
      AVG(EXTRACT(EPOCH FROM (t."firstResponseAt" - t."createdAt")) / 60)
        FILTER (WHERE t."firstResponseAt" IS NOT NULL AND t."createdAt" >= ${from})
        AS first_response,
      AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 60)
        FILTER (WHERE t."resolvedAt" >= ${from}) AS resolution
    FROM "User" u
    LEFT JOIN "Ticket" t ON t."assigneeId" = u.id AND t."workspaceId" = ${workspaceId}
    WHERE u."workspaceId" = ${workspaceId}
      AND u."isActive" = true
    GROUP BY u.id, u.name, u."avatarUrl"
    ORDER BY resolved DESC, assigned DESC, u.name ASC
  `;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatarUrl: r.avatarUrl,
    assigned: Number(r.assigned),
    resolved: Number(r.resolved),
    openNow: Number(r.open_now),
    avgFirstResponseMinutes: r.first_response !== null ? Number(r.first_response) : null,
    avgResolutionMinutes: r.resolution !== null ? Number(r.resolution) : null,
  }));
}
