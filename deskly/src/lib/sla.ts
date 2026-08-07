import {
  addBusinessMinutes,
  businessMinutesBetween,
  parseBusinessHours,
  type BusinessHours,
} from "./business-hours";
import type { Priority, TicketStatus } from "@/generated/prisma/enums";

/** Fraction of the target elapsed before we warn the assignee. */
export const SLA_WARNING_THRESHOLD = 0.75;

export type SlaPolicyLike = {
  priority: Priority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly: boolean;
};

export type WorkspaceClock = {
  timezone: string;
  businessHours: BusinessHours;
};

export function workspaceClock(workspace: {
  timezone: string;
  businessHours: unknown;
}): WorkspaceClock {
  return {
    timezone: workspace.timezone,
    businessHours: parseBusinessHours(workspace.businessHours),
  };
}

function addMinutes(
  from: Date,
  minutes: number,
  clock: WorkspaceClock,
  businessHoursOnly: boolean,
): Date {
  return businessHoursOnly
    ? addBusinessMinutes(from, minutes, clock.timezone, clock.businessHours)
    : new Date(from.getTime() + minutes * 60_000);
}

function minutesBetween(
  from: Date,
  to: Date,
  clock: WorkspaceClock,
  businessHoursOnly: boolean,
): number {
  return businessHoursOnly
    ? businessMinutesBetween(from, to, clock.timezone, clock.businessHours)
    : Math.max(0, (to.getTime() - from.getTime()) / 60_000);
}

/**
 * Deadlines for a ticket. `slaDueAt` is the one deadline that currently
 * matters — first response until the agent has replied, then resolution — so
 * the inbox's Overdue filter and the SLA worker can both use a single
 * indexed column.
 */
export function computeSlaDates(input: {
  createdAt: Date;
  firstResponseAt: Date | null;
  status: TicketStatus;
  policy: SlaPolicyLike | null;
  clock: WorkspaceClock;
  /** Baseline for the resolution clock; defaults to `createdAt`. */
  resolutionAnchor?: Date;
}): {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  slaDueAt: Date | null;
} {
  const { policy, clock, createdAt, firstResponseAt, status } = input;

  if (!policy) {
    return { firstResponseDueAt: null, resolutionDueAt: null, slaDueAt: null };
  }

  const bh = policy.businessHoursOnly;
  const firstResponseDueAt = addBusinessOrClock(
    createdAt,
    policy.firstResponseMinutes,
    clock,
    bh,
  );
  const resolutionDueAt = addBusinessOrClock(
    input.resolutionAnchor ?? createdAt,
    policy.resolutionMinutes,
    clock,
    bh,
  );

  // A finished ticket has no live countdown.
  const settled = status === "RESOLVED" || status === "CLOSED";
  const slaDueAt = settled ? null : firstResponseAt ? resolutionDueAt : firstResponseDueAt;

  return { firstResponseDueAt, resolutionDueAt, slaDueAt };
}

function addBusinessOrClock(
  from: Date,
  minutes: number,
  clock: WorkspaceClock,
  businessHoursOnly: boolean,
): Date {
  return addMinutes(from, minutes, clock, businessHoursOnly);
}

export type SlaState = "none" | "ok" | "warning" | "breached" | "met";

export type SlaView = {
  state: SlaState;
  /** Which clock is running. */
  kind: "first_response" | "resolution" | null;
  dueAt: Date | null;
  /** 0–1, clamped. */
  progress: number;
  /** Positive = time left, negative = overdue. Wall-clock ms, for display. */
  remainingMs: number | null;
  label: string;
};

/**
 * Derives the SLA chip shown on a ticket: green → amber at 75% → red on breach.
 */
export function slaView(
  ticket: {
    createdAt: Date;
    status: TicketStatus;
    firstResponseAt: Date | null;
    firstResponseDueAt: Date | null;
    resolutionDueAt: Date | null;
    resolvedAt: Date | null;
  },
  policy: SlaPolicyLike | null,
  clock: WorkspaceClock,
  now: Date = new Date(),
): SlaView {
  const settled = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  if (settled) {
    const met =
      !ticket.resolutionDueAt ||
      !ticket.resolvedAt ||
      ticket.resolvedAt <= ticket.resolutionDueAt;
    return {
      state: met ? "met" : "breached",
      kind: null,
      dueAt: ticket.resolutionDueAt,
      progress: 1,
      remainingMs: null,
      label: met ? "Within SLA" : "SLA missed",
    };
  }

  const awaitingFirstResponse = !ticket.firstResponseAt;
  const dueAt = awaitingFirstResponse ? ticket.firstResponseDueAt : ticket.resolutionDueAt;
  const kind = awaitingFirstResponse ? "first_response" : "resolution";

  if (!dueAt || !policy) {
    return {
      state: "none",
      kind: null,
      dueAt: null,
      progress: 0,
      remainingMs: null,
      label: "No SLA",
    };
  }

  const totalMinutes = awaitingFirstResponse
    ? policy.firstResponseMinutes
    : policy.resolutionMinutes;

  const elapsed = minutesBetween(ticket.createdAt, now, clock, policy.businessHoursOnly);
  const progress = totalMinutes > 0 ? Math.min(1, Math.max(0, elapsed / totalMinutes)) : 0;
  const remainingMs = dueAt.getTime() - now.getTime();

  const state: SlaState =
    remainingMs <= 0 ? "breached" : progress >= SLA_WARNING_THRESHOLD ? "warning" : "ok";

  const label =
    state === "breached"
      ? awaitingFirstResponse
        ? "First response overdue"
        : "Resolution overdue"
      : awaitingFirstResponse
        ? "First response due"
        : "Resolution due";

  return { state, kind, dueAt, progress, remainingMs, label };
}

/** The instant at which we should warn the assignee (75% of the target). */
export function warningInstant(
  createdAt: Date,
  minutes: number,
  clock: WorkspaceClock,
  businessHoursOnly: boolean,
): Date {
  return addMinutes(createdAt, minutes * SLA_WARNING_THRESHOLD, clock, businessHoursOnly);
}
