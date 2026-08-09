import { TZDate } from "@date-fns/tz";

/**
 * Business-hours arithmetic for SLA timers.
 *
 * All instants are UTC `Date`s. The workspace timezone is only used to decide
 * which wall-clock hours count as "open", which is what makes an SLA of
 * "4 working hours" mean the same thing in Asia/Kolkata and America/New_York.
 *
 * This module is deliberately free of server-only imports so it can be unit
 * tested directly and reused on the client for countdown rendering.
 */

export type BusinessHours = {
  /** Weekday index ("0" = Sunday) -> open ranges. An empty list means closed. */
  days: Record<string, { start: string; end: string }[]>;
  /** `YYYY-MM-DD` dates treated as fully closed. */
  holidays: string[];
};

/** Mon–Fri, 09:00–18:00 in the workspace timezone. */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  days: {
    "0": [],
    "1": [{ start: "09:00", end: "18:00" }],
    "2": [{ start: "09:00", end: "18:00" }],
    "3": [{ start: "09:00", end: "18:00" }],
    "4": [{ start: "09:00", end: "18:00" }],
    "5": [{ start: "09:00", end: "18:00" }],
    "6": [],
  },
  holidays: [],
};

export function parseBusinessHours(raw: unknown): BusinessHours {
  if (!raw || typeof raw !== "object") return DEFAULT_BUSINESS_HOURS;

  const candidate = raw as Partial<BusinessHours>;
  if (!candidate.days || typeof candidate.days !== "object") return DEFAULT_BUSINESS_HOURS;

  return {
    days: candidate.days,
    holidays: Array.isArray(candidate.holidays) ? candidate.holidays : [],
  };
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** `YYYY-MM-DD` for the given instant, as seen in `timezone`. */
function dateKey(instant: Date, timezone: string): string {
  const z = new TZDate(instant, timezone);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The instant corresponding to local midnight of the day containing `instant`. */
function startOfLocalDay(instant: Date, timezone: string): Date {
  const z = new TZDate(instant, timezone);
  return new Date(
    new TZDate(z.getFullYear(), z.getMonth(), z.getDate(), 0, 0, 0, 0, timezone).getTime(),
  );
}

function localDayPlus(instant: Date, timezone: string, days: number): Date {
  const z = new TZDate(instant, timezone);
  return new Date(
    new TZDate(
      z.getFullYear(),
      z.getMonth(),
      z.getDate() + days,
      0,
      0,
      0,
      0,
      timezone,
    ).getTime(),
  );
}

/** Instant for a `HH:mm` wall-clock time on the local day containing `instant`. */
function localTimeOn(instant: Date, timezone: string, hhmm: string): Date {
  const z = new TZDate(instant, timezone);
  const mins = minutesOfDay(hhmm);
  return new Date(
    new TZDate(
      z.getFullYear(),
      z.getMonth(),
      z.getDate(),
      Math.floor(mins / 60),
      mins % 60,
      0,
      0,
      timezone,
    ).getTime(),
  );
}

function openRangesFor(
  instant: Date,
  timezone: string,
  hours: BusinessHours,
): { start: Date; end: Date }[] {
  if (hours.holidays?.includes(dateKey(instant, timezone))) return [];

  const weekday = new TZDate(instant, timezone).getDay();
  const ranges = hours.days[String(weekday)] ?? [];

  return ranges
    .filter((r) => minutesOfDay(r.end) > minutesOfDay(r.start))
    .map((r) => ({
      start: localTimeOn(instant, timezone, r.start),
      end: localTimeOn(instant, timezone, r.end),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Whether `instant` falls inside an open range. */
export function isWithinBusinessHours(
  instant: Date,
  timezone: string,
  hours: BusinessHours,
): boolean {
  return openRangesFor(instant, timezone, hours).some(
    (r) => instant >= r.start && instant < r.end,
  );
}

const MAX_DAYS_SCAN = 400;

/**
 * Adds `minutes` of *open* time to `start` and returns the resulting instant.
 *
 * If the workspace has no open hours configured at all, the calculation falls
 * back to plain wall-clock arithmetic rather than looping forever.
 */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  timezone: string,
  hours: BusinessHours,
): Date {
  if (minutes <= 0) return new Date(start.getTime());

  const anyOpen = Object.values(hours.days ?? {}).some((r) => r && r.length > 0);
  if (!anyOpen) return new Date(start.getTime() + minutes * 60_000);

  let remaining = minutes;
  let cursor = new Date(start.getTime());
  let day = startOfLocalDay(cursor, timezone);

  for (let i = 0; i < MAX_DAYS_SCAN; i++) {
    for (const range of openRangesFor(day, timezone, hours)) {
      if (cursor >= range.end) continue;

      const from = cursor < range.start ? range.start : cursor;
      const availableMs = range.end.getTime() - from.getTime();
      const neededMs = remaining * 60_000;

      if (neededMs <= availableMs) {
        return new Date(from.getTime() + neededMs);
      }

      remaining -= availableMs / 60_000;
      cursor = range.end;
    }

    day = localDayPlus(day, timezone, 1);
    if (cursor < day) cursor = day;
  }

  // Pathological config (e.g. every day a holiday) — degrade to wall clock.
  return new Date(start.getTime() + minutes * 60_000);
}

/**
 * Open minutes between two instants. Used to report how much of an SLA has
 * actually elapsed, so a ticket raised on Friday evening is not "80% burnt"
 * by Monday morning.
 */
export function businessMinutesBetween(
  from: Date,
  to: Date,
  timezone: string,
  hours: BusinessHours,
): number {
  if (to <= from) return 0;

  const anyOpen = Object.values(hours.days ?? {}).some((r) => r && r.length > 0);
  if (!anyOpen) return (to.getTime() - from.getTime()) / 60_000;

  let total = 0;
  let day = startOfLocalDay(from, timezone);

  for (let i = 0; i < MAX_DAYS_SCAN && day < to; i++) {
    for (const range of openRangesFor(day, timezone, hours)) {
      const start = range.start < from ? from : range.start;
      const end = range.end > to ? to : range.end;
      if (end > start) total += (end.getTime() - start.getTime()) / 60_000;
    }
    day = localDayPlus(day, timezone, 1);
  }

  return total;
}
