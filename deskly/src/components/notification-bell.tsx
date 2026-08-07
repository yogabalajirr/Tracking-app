"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { useAppEvents } from "@/components/use-app-events";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ticketId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
    } catch {
      // Offline or navigating away — the next event or open will retry.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Live-refresh when the server pushes a notification for this user.
  useAppEvents("notification.created", load);

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.readAt).length;

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications", { method: "POST" }).catch(() => undefined);
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-medium">Notifications</p>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                <Check /> Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto scroll-slim">
            {loading ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="You're all caught up"
                description="Mentions and SLA alerts will show up here."
                className="py-8"
              />
            ) : (
              <ul>
                {items.map((n) => {
                  const content = (
                    <>
                      <div className="flex items-start gap-2">
                        {!n.readAt && (
                          <span
                            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                            aria-label="Unread"
                          />
                        )}
                        <div className={cn("min-w-0", n.readAt && "pl-3.5")}>
                          <p className="truncate text-sm font-medium">{n.title}</p>
                          {n.body && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                          )}
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {new Date(n.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </>
                  );

                  return (
                    <li key={n.id} className="border-b border-border last:border-0">
                      {n.ticketId ? (
                        <Link
                          href={`/inbox/${n.ticketId}`}
                          onClick={() => setOpen(false)}
                          className="block px-3 py-2.5 hover:bg-accent/60"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className="px-3 py-2.5">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
