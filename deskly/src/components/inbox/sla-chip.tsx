"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

/**
 * Live SLA countdown. The server sends the deadline; the chip ticks locally so
 * the colour changes green → amber → red without polling the API.
 */
export function SlaChip({
  sla,
  className,
  showLabel = false,
}: {
  sla: {
    state: string;
    label: string;
    dueAt: string | null;
    progress: number;
    remainingMs: number | null;
  };
  className?: string;
  showLabel?: boolean;
}) {
  const [now, setNow] = React.useState(() => Date.now());

  const live = sla.state === "ok" || sla.state === "warning" || sla.state === "breached";

  React.useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [live]);

  if (sla.state === "none") return null;

  if (sla.state === "met") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-success/15 px-1.5 py-0.5 text-xs font-medium text-success",
          className,
        )}
      >
        <CheckCircle2 className="size-3" />
        {showLabel ? "Within SLA" : "On time"}
      </span>
    );
  }

  const remainingMs = sla.dueAt ? new Date(sla.dueAt).getTime() - now : (sla.remainingMs ?? 0);
  const breached = remainingMs <= 0;
  // Amber once 75% of the window is gone (the server computes the ratio using
  // business hours; this only has to agree on the sign near the boundary).
  const warning = !breached && sla.progress >= 0.75;

  const tone = breached
    ? "bg-destructive/15 text-destructive"
    : warning
      ? "bg-warning/20 text-warning"
      : "bg-success/15 text-success";

  const Icon = breached ? AlertTriangle : Clock;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        tone,
        className,
      )}
      title={
        sla.dueAt
          ? `${sla.label}: ${new Date(sla.dueAt).toLocaleString()}`
          : sla.label
      }
    >
      <Icon className="size-3" />
      {breached ? `${formatDuration(remainingMs)} over` : formatDuration(remainingMs)}
      {showLabel && <span className="font-normal opacity-80">· {sla.label}</span>}
    </span>
  );
}
