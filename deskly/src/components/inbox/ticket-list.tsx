"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Inbox as InboxIcon,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { useShortcut } from "@/components/shortcuts";
import { useAppEvents } from "@/components/use-app-events";
import { PRESETS, toSearchParams, type Filters, type Preset } from "@/lib/filters";
import type { TicketListItem } from "@/lib/serialize";
import type { WorkspaceMeta } from "@/lib/meta";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { FilterPanel } from "./filter-panel";
import { BulkBar } from "./bulk-bar";
import { TicketRow } from "./ticket-row";
import { NewTicketDialog } from "./new-ticket-dialog";

const PRESET_ORDER: Preset[] = ["my_open", "unassigned", "overdue", "all_open", "closed"];

export function TicketList({
  meta,
  currentUserId,
  role,
  selectedId,
}: {
  meta: WorkspaceMeta;
  currentUserId: string;
  role: Role;
  selectedId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tickets, setTickets] = React.useState<TicketListItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = React.useState(false);

  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Filters come from the URL, so a view is shareable and survives reload.
  const query = searchParams.toString();
  const preset = (searchParams.get("preset") as Preset | null) ?? "all_open";
  const page = Number(searchParams.get("page") ?? "1");
  const [searchDraft, setSearchDraft] = React.useState(searchParams.get("q") ?? "");

  React.useEffect(() => {
    setSearchDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  const load = React.useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      if (opts.quiet) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams(query);
      if (!params.has("preset")) params.set("preset", "all_open");

      try {
        const res = await fetch(`/api/tickets?${params.toString()}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't load tickets.");

        setTickets(data.tickets);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load tickets.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  // Keep the queue live as tickets arrive and change.
  const quietReload = React.useCallback(() => void load({ quiet: true }), [load]);
  useAppEvents("ticket.created", quietReload);
  useAppEvents("ticket.updated", quietReload);
  useAppEvents("message.created", quietReload);

  function updateParams(next: Partial<Filters>, opts: { resetPage?: boolean } = {}) {
    const current = Object.fromEntries(searchParams.entries()) as Partial<Filters>;
    const merged = { ...current, ...next } as Partial<Filters>;
    if (opts.resetPage !== false) merged.page = 1;

    const params = toSearchParams(merged);
    router.push(`/inbox${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }

  // --- keyboard navigation ---
  const selectedIndex = tickets.findIndex((t) => t.id === selectedId);

  const move = React.useCallback(
    (delta: number) => {
      if (tickets.length === 0) return;
      const next = selectedIndex < 0 ? 0 : Math.min(tickets.length - 1, Math.max(0, selectedIndex + delta));
      const ticket = tickets[next];
      if (!ticket) return;
      router.push(`/inbox/${ticket.id}${query ? `?${query}` : ""}`);
      listRef.current
        ?.querySelector(`[data-ticket-id="${ticket.id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    },
    [tickets, selectedIndex, router, query],
  );

  useShortcut("j", () => move(1));
  useShortcut("k", () => move(-1));
  useShortcut("/", () => searchRef.current?.focus());

  // --- selection ---
  function toggle(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelection((prev) =>
      prev.size === tickets.length ? new Set() : new Set(tickets.map((t) => t.id)),
    );
  }

  async function runBulk(action: string, value?: string | null) {
    const ids = [...selection];
    const res = await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketIds: ids, action, value }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error ?? "That bulk action failed.");
      return;
    }

    toast.success(
      `${data.updated} ticket${data.updated === 1 ? "" : "s"} ${
        action === "delete" ? "deleted" : "updated"
      }.`,
    );
    setSelection(new Set());
    void load({ quiet: true });
  }

  return (
    <>
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") updateParams({ q: searchDraft || undefined });
                if (e.key === "Escape") {
                  setSearchDraft("");
                  updateParams({ q: undefined });
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search tickets…  (press /)"
              aria-label="Search tickets"
              className="pl-8 pr-8"
            />
            {searchDraft && (
              <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  updateParams({ q: undefined });
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {can(role, "tickets.write") && (
            <Button size="icon-sm" onClick={() => setNewOpen(true)} aria-label="New ticket" title="New ticket">
              <Plus />
            </Button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Ticket views"
          className="flex gap-1 overflow-x-auto px-3 pb-2 scroll-slim"
        >
          {PRESET_ORDER.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={preset === key}
              onClick={() => updateParams({ preset: key })}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                preset === key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {PRESETS[key]}
            </button>
          ))}
        </div>

        <FilterPanel
          meta={meta}
          currentUserId={currentUserId}
          searchParams={searchParams}
          onChange={updateParams}
        />

        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={tickets.length > 0 && selection.size === tickets.length}
              onChange={toggleAll}
              aria-label="Select all tickets on this page"
              className="size-3.5 rounded border-border"
            />
            {loading ? "Loading…" : `${total} ticket${total === 1 ? "" : "s"}`}
          </label>

          <button
            type="button"
            onClick={() => void load({ quiet: true })}
            className="flex items-center gap-1 hover:text-foreground"
            aria-label="Refresh list"
          >
            <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {selection.size > 0 && (
        <BulkBar
          count={selection.size}
          meta={meta}
          role={role}
          onClear={() => setSelection(new Set())}
          onAction={runBulk}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto scroll-slim">
        {loading ? (
          <ul className="divide-y divide-border" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="space-y-2 p-3">
                <div className="flex justify-between gap-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3.5 w-10" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </li>
            ))}
          </ul>
        ) : error ? (
          <EmptyState
            icon={X}
            title="Couldn't load the queue"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title={preset === "closed" ? "Nothing closed yet" : "This queue is empty"}
            description={
              preset === "my_open"
                ? "Nothing is assigned to you right now. Check Unassigned to pick something up."
                : "New tickets from email, your web form and the portal land here."
            }
            action={
              can(role, "tickets.write") ? (
                <Button size="sm" onClick={() => setNewOpen(true)}>
                  <Plus /> New ticket
                </Button>
              ) : null
            }
          />
        ) : (
          <ul ref={listRef} className="divide-y divide-border">
            {tickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                href={`/inbox/${ticket.id}${query ? `?${query}` : ""}`}
                selected={ticket.id === selectedId}
                checked={selection.has(ticket.id)}
                onCheck={() => toggle(ticket.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex shrink-0 items-center justify-between border-t border-border px-3 py-2 text-xs"
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams({ page: page - 1 }, { resetPage: false })}
          >
            <ChevronLeft /> Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: page + 1 }, { resetPage: false })}
          >
            Next <ChevronRight />
          </Button>
        </nav>
      )}

      <NewTicketDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        meta={meta}
        onCreated={(id) => {
          setNewOpen(false);
          void load({ quiet: true });
          router.push(`/inbox/${id}`);
        }}
      />
    </>
  );
}
