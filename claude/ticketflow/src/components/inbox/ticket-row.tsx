"use client";

import Link from "next/link";
import { Mail, MessageSquare, Monitor, PenLine, UserCircle2 } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/primitives";
import { CHANNEL_LABELS, PRIORITY_STYLES, STATUS_LABELS, STATUS_STYLES } from "@/lib/constants";
import type { TicketListItem } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { SlaChip } from "./sla-chip";
import { RelativeTime } from "./relative-time";

const CHANNEL_ICONS = {
  EMAIL: Mail,
  FORM: Monitor,
  MANUAL: PenLine,
  PORTAL: UserCircle2,
} as const;

export function TicketRow({
  ticket,
  href,
  selected,
  checked,
  onCheck,
}: {
  ticket: TicketListItem;
  href: string;
  selected: boolean;
  checked: boolean;
  onCheck: () => void;
}) {
  const ChannelIcon = CHANNEL_ICONS[ticket.channel];

  return (
    <li data-ticket-id={ticket.id} className={cn(selected && "bg-accent/60")}>
      <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-accent/40">
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ticket ${ticket.number}`}
          className="mt-1 size-3.5 shrink-0 rounded border-border"
        />

        <Link
          href={href}
          className="min-w-0 flex-1 space-y-1"
          aria-current={selected ? "true" : undefined}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium leading-tight">{ticket.subject}</p>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              #{ticket.number}
            </span>
          </div>

          <p className="truncate text-xs text-muted-foreground">
            {ticket.customer.name ?? ticket.customer.email}
            {ticket.preview && <span className="opacity-70"> — {ticket.preview}</span>}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Badge className={STATUS_STYLES[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>

            {ticket.priority !== "NORMAL" && (
              <Badge className={PRIORITY_STYLES[ticket.priority]}>
                {ticket.priority === "URGENT" ? "Urgent" : ticket.priority === "HIGH" ? "High" : "Low"}
              </Badge>
            )}

            <SlaChip sla={ticket.sla} />

            {ticket.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
              >
                {tag.name}
              </Badge>
            ))}
            {ticket.tags.length > 2 && (
              <Badge variant="muted">+{ticket.tags.length - 2}</Badge>
            )}

            <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              {ticket.messageCount > 1 && (
                <span className="flex items-center gap-0.5" title={`${ticket.messageCount} messages`}>
                  <MessageSquare className="size-3" />
                  {ticket.messageCount}
                </span>
              )}
              <ChannelIcon className="size-3" aria-label={CHANNEL_LABELS[ticket.channel]} />
              <RelativeTime value={ticket.createdAt} />
              {ticket.assignee ? (
                <Avatar
                  name={ticket.assignee.name}
                  src={ticket.assignee.avatarUrl}
                  seed={ticket.assignee.id}
                  size={18}
                />
              ) : (
                <span className="rounded bg-muted px-1 py-0.5 text-[10px]">Unassigned</span>
              )}
            </span>
          </div>
        </Link>
      </div>
    </li>
  );
}
