"use client";

import * as React from "react";
import { Download, Lock, Paperclip, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Badge, Separator } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { TicketDetail } from "@/lib/ticket-detail";
import { cn, formatBytes } from "@/lib/utils";
import { RelativeTime } from "./relative-time";

/** Threads longer than this get an AI summary panel offered. */
const SUMMARY_THRESHOLD = 10;

export function Thread({
  ticket,
  currentUserId,
  aiEnabled,
  onSummaryChange,
}: {
  ticket: TicketDetail;
  currentUserId: string;
  aiEnabled: boolean;
  onSummaryChange: (summary: string) => void;
}) {
  return (
    <div className="space-y-4 p-4">
      {aiEnabled && ticket.messages.length > SUMMARY_THRESHOLD && (
        <SummaryPanel ticket={ticket} onSummaryChange={onSummaryChange} />
      )}

      {ticket.messages.map((message, index) => {
        // Activity that happened between this message and the previous one.
        const previous = ticket.messages[index - 1];
        const between = ticket.activities.filter(
          (a) =>
            isDisplayableActivity(a.type) &&
            a.createdAt > (previous?.createdAt ?? "") &&
            a.createdAt <= message.createdAt,
        );

        return (
          <React.Fragment key={message.id}>
            {between.map((a) => (
              <ActivityLine key={a.id} activity={a} />
            ))}
            <MessageBubble message={message} currentUserId={currentUserId} />
          </React.Fragment>
        );
      })}

      {/* Anything that happened after the last message. */}
      {ticket.activities
        .filter(
          (a) =>
            isDisplayableActivity(a.type) &&
            a.createdAt > (ticket.messages.at(-1)?.createdAt ?? ""),
        )
        .map((a) => (
          <ActivityLine key={a.id} activity={a} />
        ))}
    </div>
  );
}

function MessageBubble({
  message,
  currentUserId,
}: {
  message: TicketDetail["messages"][number];
  currentUserId: string;
}) {
  const isCustomer = message.authorType === "CUSTOMER";
  const isMine = message.authorId === currentUserId;

  return (
    <article
      className={cn(
        "rounded-lg border p-3",
        message.isInternal
          ? "border-note-border bg-note text-note-foreground"
          : isCustomer
            ? "border-border bg-card"
            : "border-primary/20 bg-primary/5",
      )}
      aria-label={message.isInternal ? "Internal note" : isCustomer ? "Customer message" : "Agent reply"}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <Avatar
          name={message.authorName ?? "Unknown"}
          seed={message.authorId ?? message.authorName ?? "x"}
          size={22}
        />
        <span className="text-sm font-medium">
          {message.authorName ?? "Unknown"}
          {isMine && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
        </span>

        {message.isInternal && (
          <Badge variant="warning" className="gap-1">
            <Lock className="size-3" /> Internal note
          </Badge>
        )}
        {!message.isInternal && !isCustomer && <Badge variant="default">Sent to customer</Badge>}

        <RelativeTime
          value={message.createdAt}
          className="ml-auto text-xs text-muted-foreground"
        />
      </header>

      {message.bodyHtml ? (
        <div
          className="prose-sm max-w-none break-words text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_img]:max-w-full [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2"
          // Sanitised server-side by sanitizeEmailHtml() before it was stored.
          dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
      )}

      {message.attachments.length > 0 && (
        <>
          <Separator className="my-3" />
          <ul className="flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  download={a.filename}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                >
                  <Paperclip className="size-3" />
                  <span className="max-w-40 truncate">{a.filename}</span>
                  <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                  <Download className="size-3 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

const HIDDEN_ACTIVITY = new Set(["REPLIED", "NOTE_ADDED", "CUSTOMER_REPLIED", "TICKET_CREATED"]);

function isDisplayableActivity(type: string): boolean {
  return !HIDDEN_ACTIVITY.has(type);
}

function ActivityLine({ activity }: { activity: TicketDetail["activities"][number] }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-muted-foreground">
      <span className="h-px w-4 bg-border" aria-hidden />
      <span>
        <span className="font-medium">{activity.actorName ?? "System"}</span>{" "}
        {describeActivity(activity)}
      </span>
      <RelativeTime value={activity.createdAt} className="opacity-70" />
    </p>
  );
}

function describeActivity(activity: TicketDetail["activities"][number]): string {
  const p = (activity.payload ?? {}) as Record<string, unknown>;

  switch (activity.type) {
    case "STATUS_CHANGED":
      return `changed status${p.from ? ` from ${String(p.from).toLowerCase()}` : ""} to ${String(
        p.to,
      ).toLowerCase()}`;
    case "PRIORITY_CHANGED":
      return `set priority to ${String(p.to).toLowerCase()}`;
    case "ASSIGNED":
      return p.automatic ? "was auto-assigned this ticket" : "reassigned this ticket";
    case "UNASSIGNED":
      return "unassigned this ticket";
    case "TAGGED":
      return Array.isArray(p.to) ? `set tags to ${(p.to as string[]).join(", ") || "none"}` : "updated tags";
    case "REOPENED":
      return "reopened this ticket (customer replied)";
    case "RULE_APPLIED":
      return `matched rule${Array.isArray(p.rules) && p.rules.length > 1 ? "s" : ""} ${
        Array.isArray(p.rules) ? (p.rules as string[]).join(", ") : ""
      }`;
    case "SLA_WARNING":
      return "was flagged at 75% of its SLA";
    case "SLA_BREACHED":
      return "breached its SLA";
    case "AI_TAGGED":
      return `was categorised by AI as ${String(p.category ?? "")}`;
    default:
      return activity.type.toLowerCase().replace(/_/g, " ");
  }
}

function SummaryPanel({
  ticket,
  onSummaryChange,
}: {
  ticket: TicketDetail;
  onSummaryChange: (summary: string) => void;
}) {
  const [loading, setLoading] = React.useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't summarise this thread.");
      onSummaryChange(data.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't summarise this thread.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-primary/25 bg-primary/5 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-medium">Thread summary</h2>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          loading={loading}
          onClick={() => void generate()}
        >
          {ticket.aiSummary ? "Regenerate" : "Summarise"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {ticket.aiSummary ??
          `This conversation has ${ticket.messages.length} messages. Generate a summary to catch up quickly.`}
      </p>
    </section>
  );
}
