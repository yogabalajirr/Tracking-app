"use client";

import * as React from "react";
import { Bookmark, BookmarkPlus, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/primitives";
import {
  CHANNELS,
  CHANNEL_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_STATUSES,
} from "@/lib/constants";
import type { Filters } from "@/lib/filters";
import type { WorkspaceMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";

/** Multi-select filter chips plus saved views. */
export function FilterPanel({
  meta,
  currentUserId,
  searchParams,
  onChange,
}: {
  meta: WorkspaceMeta;
  currentUserId: string;
  searchParams: URLSearchParams;
  onChange: (next: Partial<Filters>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [savingView, setSavingView] = React.useState(false);
  const [viewName, setViewName] = React.useState("");
  const [views, setViews] = React.useState(meta.savedViews);

  const csv = (key: string) => (searchParams.get(key) ?? "").split(",").filter(Boolean);

  const status = csv("status");
  const priority = csv("priority");
  const channel = csv("channel");
  const tag = csv("tag");
  const assignee = searchParams.get("assignee") ?? "";
  const teamId = searchParams.get("teamId") ?? "";
  const createdFrom = searchParams.get("createdFrom") ?? "";
  const createdTo = searchParams.get("createdTo") ?? "";
  const sort = searchParams.get("sort") ?? "newest";

  const activeCount =
    status.length +
    priority.length +
    channel.length +
    tag.length +
    (assignee ? 1 : 0) +
    (teamId ? 1 : 0) +
    (createdFrom || createdTo ? 1 : 0);

  function toggleIn(key: keyof Filters, values: string[], value: string) {
    const next = values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
    onChange({ [key]: next.length ? next : undefined } as Partial<Filters>);
  }

  function clearAll() {
    onChange({
      status: undefined,
      priority: undefined,
      channel: undefined,
      tag: undefined,
      assignee: undefined,
      teamId: undefined,
      createdFrom: undefined,
      createdTo: undefined,
    });
  }

  async function saveView() {
    if (!viewName.trim()) return;

    const filters = Object.fromEntries(searchParams.entries());
    const res = await fetch("/api/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: viewName.trim(), filters, shared: false }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error ?? "Couldn't save that view.");
      return;
    }

    setViews((prev) => [...prev, data.view]);
    setViewName("");
    setSavingView(false);
    toast.success(`Saved "${data.view.name}".`);
  }

  async function deleteView(id: string) {
    setViews((prev) => prev.filter((v) => v.id !== id));
    await fetch(`/api/saved-views/${id}`, { method: "DELETE" }).catch(() => undefined);
  }

  return (
    <div className="border-t border-border">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5">
        <Button
          variant={open ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <SlidersHorizontal />
          Filters
          {activeCount > 0 && <Badge variant="default">{activeCount}</Badge>}
        </Button>

        {views.map((view) => (
          <span key={view.id} className="group relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const params = new URLSearchParams(
                  view.filters as Record<string, string>,
                );
                onChange(Object.fromEntries(params.entries()) as Partial<Filters>);
              }}
              title={view.userId ? "Your saved view" : "Shared with the workspace"}
            >
              <Bookmark className={cn(view.userId ? "" : "text-primary")} />
              {view.name}
            </Button>
            {view.userId === currentUserId && (
              <button
                type="button"
                onClick={() => void deleteView(view.id)}
                aria-label={`Delete view ${view.name}`}
                className="absolute -right-1 -top-1 hidden rounded-full bg-muted p-0.5 group-hover:block"
              >
                <X className="size-2.5" />
              </button>
            )}
          </span>
        ))}

        {activeCount > 0 && !savingView && (
          <Button variant="ghost" size="sm" onClick={() => setSavingView(true)}>
            <BookmarkPlus /> Save view
          </Button>
        )}

        {savingView && (
          <span className="flex items-center gap-1">
            <Input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveView();
                if (e.key === "Escape") setSavingView(false);
              }}
              placeholder="View name"
              aria-label="Name for this saved view"
              className="h-7 w-36 text-xs"
              autoFocus
            />
            <Button size="sm" onClick={() => void saveView()}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSavingView(false)}>
              Cancel
            </Button>
          </span>
        )}

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="ml-auto">
            <X /> Clear
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <Group label="Status">
            {TICKET_STATUSES.map((s) => (
              <Chip
                key={s}
                active={status.includes(s)}
                onClick={() => toggleIn("status", status, s)}
              >
                {STATUS_LABELS[s]}
              </Chip>
            ))}
          </Group>

          <Group label="Priority">
            {PRIORITIES.map((p) => (
              <Chip
                key={p}
                active={priority.includes(p)}
                onClick={() => toggleIn("priority", priority, p)}
              >
                {PRIORITY_LABELS[p]}
              </Chip>
            ))}
          </Group>

          <Group label="Channel">
            {CHANNELS.map((c) => (
              <Chip
                key={c}
                active={channel.includes(c)}
                onClick={() => toggleIn("channel", channel, c)}
              >
                {CHANNEL_LABELS[c]}
              </Chip>
            ))}
          </Group>

          {meta.tags.length > 0 && (
            <Group label="Tags">
              {meta.tags.map((t) => (
                <Chip
                  key={t.id}
                  active={tag.includes(t.name)}
                  onClick={() => toggleIn("tag", tag, t.name)}
                >
                  {t.name}
                </Chip>
              ))}
            </Group>
          )}

          <Group label="Assignee">
            <Chip
              active={assignee === "unassigned"}
              onClick={() =>
                onChange({ assignee: assignee === "unassigned" ? undefined : "unassigned" })
              }
            >
              Unassigned
            </Chip>
            <Chip
              active={assignee === "me"}
              onClick={() => onChange({ assignee: assignee === "me" ? undefined : "me" })}
            >
              Me
            </Chip>
            {meta.agents
              .filter((a) => a.id !== currentUserId)
              .map((a) => (
                <Chip
                  key={a.id}
                  active={assignee === a.id}
                  onClick={() => onChange({ assignee: assignee === a.id ? undefined : a.id })}
                >
                  {a.name}
                </Chip>
              ))}
          </Group>

          {meta.teams.length > 0 && (
            <Group label="Team">
              {meta.teams.map((t) => (
                <Chip
                  key={t.id}
                  active={teamId === t.id}
                  onClick={() => onChange({ teamId: teamId === t.id ? undefined : t.id })}
                >
                  {t.name}
                </Chip>
              ))}
            </Group>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Created from</span>
              <Input
                type="date"
                value={createdFrom}
                onChange={(e) => onChange({ createdFrom: e.target.value || undefined })}
                className="h-8 w-36 text-xs"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">to</span>
              <Input
                type="date"
                value={createdTo}
                onChange={(e) => onChange({ createdTo: e.target.value || undefined })}
                className="h-8 w-36 text-xs"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Sort by</span>
              <select
                value={sort}
                onChange={(e) => onChange({ sort: e.target.value as Filters["sort"] })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="priority">Priority</option>
                <option value="sla">SLA deadline</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2 py-0.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
