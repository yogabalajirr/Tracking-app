"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, PanelRightClose, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useShortcut } from "@/components/shortcuts";
import { useAppEvents } from "@/components/use-app-events";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/constants";
import type { TicketDetail } from "@/lib/ticket-detail";
import type { WorkspaceMeta } from "@/lib/meta";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { SlaChip } from "./sla-chip";
import { Thread } from "./thread";
import { Composer } from "./composer";
import { DetailsPane } from "./details-pane";

export type CurrentUser = { id: string; name: string; email: string; role: Role };

export function TicketDetailView({
  initialTicket,
  meta,
  currentUser,
  aiEnabled,
}: {
  initialTicket: TicketDetail;
  meta: WorkspaceMeta;
  currentUser: CurrentUser;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [ticket, setTicket] = React.useState(initialTicket);
  const [detailsOpen, setDetailsOpen] = React.useState(true);
  const [composerMode, setComposerMode] = React.useState<"reply" | "note">("reply");

  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const threadEndRef = React.useRef<HTMLDivElement>(null);

  // Replace state when the route changes to a different ticket. Done during
  // render so the previous ticket never flashes in the new route.
  const [loadedTicket, setLoadedTicket] = React.useState(initialTicket);
  if (loadedTicket !== initialTicket) {
    setLoadedTicket(initialTicket);
    setTicket(initialTicket);
  }

  const writable = can(currentUser.role, "tickets.write");

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${initialTicket.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setTicket(data.ticket);
    } catch {
      // Transient — the next event or action will retry.
    }
  }, [initialTicket.id]);

  // Live updates: another agent replying, or a customer's email arriving.
  const onEvent = React.useCallback(
    (payload: unknown) => {
      const evt = payload as { ticketId?: string };
      if (evt?.ticketId === initialTicket.id) void refresh();
    },
    [initialTicket.id, refresh],
  );
  useAppEvents("message.created", onEvent);
  useAppEvents("ticket.updated", onEvent);

  async function patch(body: Record<string, unknown>) {
    // Optimistic: apply locally, roll back if the server disagrees.
    const previous = ticket;
    setTicket((t) => ({ ...t, ...(body as Partial<TicketDetail>) }));

    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      setTicket(previous);
      toast.error(data.error ?? "That change didn't stick.");
      return;
    }

    setTicket(data.ticket);
    router.refresh();
  }

  const resolved = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  useShortcut("r", () => {
    setComposerMode("reply");
    composerRef.current?.focus();
  });
  useShortcut("n", () => {
    setComposerMode("note");
    composerRef.current?.focus();
  });
  useShortcut("e", () => {
    if (writable && !resolved) void patch({ status: "RESOLVED" });
  });

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-start gap-3">
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Back to queue"
            >
              <Link href="/inbox">
                <ArrowLeft />
              </Link>
            </Button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-base font-semibold">{ticket.subject}</h1>
                <span className="font-mono text-xs text-muted-foreground">#{ticket.number}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge className={STATUS_STYLES[ticket.status]}>
                  {STATUS_LABELS[ticket.status]}
                </Badge>
                <SlaChip sla={ticket.sla} showLabel />
                <span className="text-xs text-muted-foreground">
                  {ticket.customer.name ?? ticket.customer.email}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {writable && !resolved && (
                <Button size="sm" onClick={() => void patch({ status: "RESOLVED" })}>
                  <CheckCircle2 /> Resolve
                </Button>
              )}
              {writable && resolved && (
                <Button size="sm" variant="outline" onClick={() => void patch({ status: "OPEN" })}>
                  Reopen
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDetailsOpen((v) => !v)}
                aria-label={detailsOpen ? "Hide details" : "Show details"}
                title={detailsOpen ? "Hide details" : "Show details"}
                className="hidden lg:inline-flex"
              >
                {detailsOpen ? <PanelRightClose /> : <PanelRightOpen />}
              </Button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-slim">
          <Thread
            ticket={ticket}
            currentUserId={currentUser.id}
            aiEnabled={aiEnabled}
            onSummaryChange={(summary) => setTicket((t) => ({ ...t, aiSummary: summary }))}
          />
          <div ref={threadEndRef} />
        </div>

        {writable ? (
          <Composer
            ref={composerRef}
            ticket={ticket}
            meta={meta}
            currentUser={currentUser}
            mode={composerMode}
            onModeChange={setComposerMode}
            aiEnabled={aiEnabled}
            onSent={async () => {
              await refresh();
              threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        ) : (
          <p className="shrink-0 border-t border-border px-4 py-3 text-sm text-muted-foreground">
            You have read-only access to this workspace.
          </p>
        )}
      </div>

      <aside
        aria-label="Ticket details"
        className={cn(
          "min-h-0 w-72 shrink-0 overflow-y-auto border-l border-border scroll-slim xl:w-80",
          detailsOpen ? "hidden lg:block" : "hidden",
        )}
      >
        <DetailsPane
          ticket={ticket}
          meta={meta}
          currentUser={currentUser}
          onPatch={patch}
          readOnly={!writable}
          aiEnabled={aiEnabled}
          onRefresh={refresh}
        />
      </aside>
    </div>
  );
}
