import { z } from "zod";
import { parseQuery, withAuth } from "@/lib/api";
import { buildAgentStats, rangeStart } from "@/lib/reports";
import { buildOrderBy, buildWhere, filterSchema } from "@/lib/filters";
import { TICKET_LIST_INCLUDE } from "@/lib/serialize";

/**
 * CSV export.
 *
 * `?dataset=tickets` respects the same filters as the inbox, so "export what
 * I'm looking at" works without a second query language. `?dataset=agents`
 * exports the leaderboard.
 */

const querySchema = z.object({
  dataset: z.enum(["tickets", "agents"]).default("tickets"),
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});

/** RFC 4180: quote if the value contains a comma, quote or newline. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  // BOM so Excel opens UTF-8 correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

function round(value: number | null): string {
  return value === null ? "" : String(Math.round(value));
}

export const GET = withAuth("reports.read", async (req, { user, db, workspaceId }) => {
  const { dataset, range } = parseQuery(req, querySchema);
  const stamp = new Date().toISOString().slice(0, 10);

  if (dataset === "agents") {
    const agents = await buildAgentStats(workspaceId, range);

    const csv = toCsv(
      [
        "Agent",
        "Assigned",
        "Resolved",
        "Open now",
        "Avg first response (min)",
        "Avg resolution (min)",
      ],
      agents.map((a) => [
        a.name,
        a.assigned,
        a.resolved,
        a.openNow,
        round(a.avgFirstResponseMinutes),
        round(a.avgResolutionMinutes),
      ]),
    );

    return csvResponse(csv, `deskly-agents-${range}-${stamp}.csv`);
  }

  // Tickets: reuse the inbox filters so the export matches the current view.
  const filters = filterSchema.parse({
    ...Object.fromEntries(new URL(req.url).searchParams.entries()),
    // Paging doesn't apply to an export.
    page: 1,
    perPage: 100,
  });

  const where = buildWhere(filters, user.id);

  // Default to the range window when the caller gave no explicit date filter.
  if (!filters.createdFrom && !filters.createdTo && !filters.preset) {
    where.createdAt = { gte: rangeStart(range) };
  }

  const tickets = await db.ticket.findMany({
    where,
    include: TICKET_LIST_INCLUDE,
    orderBy: buildOrderBy(filters.sort),
    take: 10_000,
  });

  const csv = toCsv(
    [
      "Number",
      "Subject",
      "Status",
      "Priority",
      "Channel",
      "Customer name",
      "Customer email",
      "Assignee",
      "Tags",
      "Created at",
      "First response at",
      "Resolved at",
      "SLA due at",
      "Messages",
    ],
    tickets.map((t) => [
      t.number,
      t.subject,
      t.status,
      t.priority,
      t.channel,
      t.customer.name ?? "",
      t.customer.email,
      t.assignee?.name ?? "",
      t.tags.map((tag) => tag.name).join(" "),
      t.createdAt,
      t.firstResponseAt,
      t.resolvedAt,
      t.slaDueAt,
      t._count.messages,
    ]),
  );

  return csvResponse(csv, `deskly-tickets-${stamp}.csv`);
});

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
