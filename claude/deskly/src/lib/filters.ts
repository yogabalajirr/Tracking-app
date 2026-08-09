import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVE_STATUSES } from "./constants";

/**
 * Inbox filter state. The same shape is used in three places, which is why it
 * lives here: URL search params, the `/api/tickets` query, and the `filters`
 * JSON persisted on a SavedView.
 */

export const PRESETS = {
  my_open: "My open tickets",
  unassigned: "Unassigned",
  overdue: "Overdue",
  all_open: "All open",
  closed: "Closed",
} as const;

export type Preset = keyof typeof PRESETS;

const csv = (v: unknown) =>
  typeof v === "string" && v.length > 0 ? v.split(",").filter(Boolean) : undefined;

export const filterSchema = z.object({
  preset: z.enum(["my_open", "unassigned", "overdue", "all_open", "closed"]).optional(),
  status: z.preprocess(csv, z.array(z.enum(["OPEN", "PENDING", "ON_HOLD", "RESOLVED", "CLOSED"])).optional()),
  priority: z.preprocess(csv, z.array(z.enum(["LOW", "NORMAL", "HIGH", "URGENT"])).optional()),
  channel: z.preprocess(csv, z.array(z.enum(["EMAIL", "FORM", "MANUAL", "PORTAL"])).optional()),
  /** A user id, or the literals "me" / "unassigned". */
  assignee: z.string().optional(),
  tag: z.preprocess(csv, z.array(z.string()).optional()),
  teamId: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  sort: z.enum(["newest", "oldest", "priority", "sla"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export type Filters = z.infer<typeof filterSchema>;

/** Serialise back to a query string, omitting defaults so URLs stay short. */
export function toSearchParams(filters: Partial<Filters>): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
      return;
    }
    params.set(key, String(value));
  };

  put("preset", filters.preset);
  put("status", filters.status);
  put("priority", filters.priority);
  put("channel", filters.channel);
  put("assignee", filters.assignee);
  put("tag", filters.tag);
  put("teamId", filters.teamId);
  put("q", filters.q);
  put("createdFrom", filters.createdFrom);
  put("createdTo", filters.createdTo);
  if (filters.sort && filters.sort !== "newest") put("sort", filters.sort);
  if (filters.page && filters.page > 1) put("page", filters.page);

  return params;
}

/**
 * Translates filter state into a Prisma `where`.
 *
 * Note there is deliberately no `workspaceId` here — that is injected by the
 * scoped client in db.ts, so it cannot be forgotten at a call site.
 */
export function buildWhere(
  filters: Filters,
  currentUserId: string,
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};
  const and: Prisma.TicketWhereInput[] = [];

  // Presets set a baseline that explicit filters can still narrow.
  switch (filters.preset) {
    case "my_open":
      where.assigneeId = currentUserId;
      where.status = { in: ACTIVE_STATUSES };
      break;
    case "unassigned":
      where.assigneeId = null;
      where.status = { in: ACTIVE_STATUSES };
      break;
    case "overdue":
      where.status = { in: ACTIVE_STATUSES };
      where.slaDueAt = { lt: new Date() };
      break;
    case "all_open":
      where.status = { in: ACTIVE_STATUSES };
      break;
    case "closed":
      where.status = { in: ["RESOLVED", "CLOSED"] };
      break;
  }

  if (filters.status?.length) where.status = { in: filters.status };
  if (filters.priority?.length) where.priority = { in: filters.priority };
  if (filters.channel?.length) where.channel = { in: filters.channel };
  if (filters.teamId) where.teamId = filters.teamId;

  if (filters.assignee === "unassigned") where.assigneeId = null;
  else if (filters.assignee === "me") where.assigneeId = currentUserId;
  else if (filters.assignee) where.assigneeId = filters.assignee;

  if (filters.tag?.length) {
    // Every named tag must be present, so stacking tags narrows the result.
    for (const name of filters.tag) {
      and.push({ tags: { some: { name } } });
    }
  }

  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {
      ...(filters.createdFrom ? { gte: new Date(filters.createdFrom) } : {}),
      ...(filters.createdTo ? { lte: endOfDay(filters.createdTo) } : {}),
    };
  }

  if (filters.q) {
    const q = filters.q;
    and.push({
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
        ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
      ],
    });
  }

  if (and.length) where.AND = and;
  return where;
}

export function buildOrderBy(sort: Filters["sort"]): Prisma.TicketOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }];
    case "priority":
      // Enum order in the schema is LOW→URGENT, so descending puts URGENT first.
      return [{ priority: "desc" }, { createdAt: "desc" }];
    case "sla":
      return [{ slaDueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

function endOfDay(value: string): Date {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** True when the user has narrowed beyond a bare preset. */
export function hasActiveFilters(f: Partial<Filters>): boolean {
  return Boolean(
    f.status?.length ||
      f.priority?.length ||
      f.channel?.length ||
      f.tag?.length ||
      f.assignee ||
      f.teamId ||
      f.q ||
      f.createdFrom ||
      f.createdTo,
  );
}
