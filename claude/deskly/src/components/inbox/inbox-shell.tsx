"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { WorkspaceMeta } from "@/lib/meta";
import type { Role } from "@/generated/prisma/enums";
import { TicketList } from "./ticket-list";

/**
 * Two-column container: the queue on the left, the selected ticket on the
 * right. On narrow screens only one is visible at a time — the list until a
 * ticket is opened, then the ticket.
 */
export function InboxShell({
  meta,
  currentUserId,
  role,
  children,
}: {
  meta: WorkspaceMeta;
  currentUserId: string;
  role: Role;
  children: React.ReactNode;
}) {
  const params = useParams<{ id?: string }>();
  const selectedId = params?.id;

  return (
    <div className="flex h-full min-h-0">
      <aside
        aria-label="Ticket queue"
        className={cn(
          "flex min-h-0 w-full shrink-0 flex-col border-r border-border md:w-[380px] lg:w-[420px]",
          selectedId && "hidden md:flex",
        )}
      >
        <TicketList meta={meta} currentUserId={currentUserId} role={role} selectedId={selectedId} />
      </aside>

      <section
        className={cn("min-h-0 min-w-0 flex-1", !selectedId && "hidden md:block")}
        aria-label="Ticket"
      >
        {children}
      </section>
    </div>
  );
}
