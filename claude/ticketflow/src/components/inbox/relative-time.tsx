"use client";

import * as React from "react";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "narrow" });

function relative(from: number, to: number): string {
  const diff = from - to;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

/**
 * One clock for the whole page.
 *
 * A busy inbox can render a hundred of these; each running its own interval
 * would mean a hundred timers ticking out of phase. Instead they all subscribe
 * to a single store that ticks once a minute and stops when the last one
 * unmounts.
 */
let clock = 0;
const clockListeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);

  if (timer === null) {
    clock = Date.now();
    timer = setInterval(() => {
      clock = Date.now();
      for (const l of clockListeners) l();
    }, 60_000);
  }

  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function readClock(): number {
  // Cached between calls so repeated reads in one render agree with each other.
  return clock || (clock = Date.now());
}

/** On the server there is no "now" worth committing to — see below. */
const serverClock = () => 0;

/**
 * Renders "3h ago" and keeps it fresh.
 *
 * The first client render must match the server's HTML, so the absolute date is
 * rendered until hydration finishes — otherwise every list row would log a
 * hydration mismatch as the clock moves between render and paint. That is what
 * the `0` server snapshot buys.
 */
export function RelativeTime({
  value,
  className,
}: {
  value: string | Date;
  className?: string;
}) {
  const date = React.useMemo(() => new Date(value), [value]);
  const now = React.useSyncExternalStore(subscribeClock, readClock, serverClock);

  const absolute = date.toLocaleString();

  return (
    <time dateTime={date.toISOString()} title={absolute} className={className}>
      {now === 0 ? date.toLocaleDateString() : relative(date.getTime(), now)}
    </time>
  );
}
