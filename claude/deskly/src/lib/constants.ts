import type { Channel, Priority, TicketStatus } from "@/generated/prisma/enums";

export const TICKET_STATUSES: TicketStatus[] = [
  "OPEN",
  "PENDING",
  "ON_HOLD",
  "RESOLVED",
  "CLOSED",
];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  PENDING: "Pending",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const STATUS_HINTS: Record<TicketStatus, string> = {
  OPEN: "Needs an agent's attention.",
  PENDING: "Waiting on the customer to reply.",
  ON_HOLD: "Parked — blocked on something internal.",
  RESOLVED: "Answered. Reopens automatically if the customer replies.",
  CLOSED: "Finished and archived.",
};

/** Statuses that still count as "in the queue" for SLA and inbox defaults. */
export const ACTIVE_STATUSES: TicketStatus[] = ["OPEN", "PENDING", "ON_HOLD"];

export const PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_RANK: Record<Priority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export const CHANNELS: Channel[] = ["EMAIL", "FORM", "MANUAL", "PORTAL"];

export const CHANNEL_LABELS: Record<Channel, string> = {
  EMAIL: "Email",
  FORM: "Web form",
  MANUAL: "Created by agent",
  PORTAL: "Customer portal",
};

/** Tailwind classes per status — kept here so the inbox and detail agree. */
export const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: "bg-primary/10 text-primary border-transparent",
  PENDING: "bg-warning/20 text-warning border-transparent",
  ON_HOLD: "bg-muted text-muted-foreground border-transparent",
  RESOLVED: "bg-success/15 text-success border-transparent",
  CLOSED: "bg-muted text-muted-foreground border-transparent",
};

export const PRIORITY_STYLES: Record<Priority, string> = {
  LOW: "bg-muted text-muted-foreground border-transparent",
  NORMAL: "bg-secondary text-secondary-foreground border-transparent",
  HIGH: "bg-warning/20 text-warning border-transparent",
  URGENT: "bg-destructive/15 text-destructive border-transparent",
};

/** Default SLA targets seeded for a new workspace, in minutes. */
export const DEFAULT_SLA: Record<Priority, { firstResponseMinutes: number; resolutionMinutes: number }> =
  {
    URGENT: { firstResponseMinutes: 60, resolutionMinutes: 4 * 60 },
    HIGH: { firstResponseMinutes: 4 * 60, resolutionMinutes: 12 * 60 },
    NORMAL: { firstResponseMinutes: 8 * 60, resolutionMinutes: 24 * 60 },
    LOW: { firstResponseMinutes: 24 * 60, resolutionMinutes: 72 * 60 },
  };

export const MAX_ACTIVE_RULES = 20;

/** Mime types accepted for attachments (allowlist, per the security constraints). */
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];
