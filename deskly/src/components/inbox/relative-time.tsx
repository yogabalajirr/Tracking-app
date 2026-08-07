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
 * Renders "3h ago" and keeps it fresh.
 *
 * The first client render must match the server's HTML, so the absolute
 * timestamp is rendered until after hydration — otherwise every list row would
 * log a hydration mismatch as the clock moves between render and paint.
 */
export function RelativeTime({
  value,
  className,
}: {
  value: string | Date;
  className?: string;
}) {
  const date = React.useMemo(() => new Date(value), [value]);
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const absolute = date.toLocaleString();

  return (
    <time dateTime={date.toISOString()} title={absolute} className={className}>
      {now === null ? date.toLocaleDateString() : relative(date.getTime(), now)}
    </time>
  );
}
