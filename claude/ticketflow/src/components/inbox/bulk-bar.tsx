"use client";

import * as React from "react";
import { Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRIORITIES, PRIORITY_LABELS, STATUS_LABELS, TICKET_STATUSES } from "@/lib/constants";
import type { WorkspaceMeta } from "@/lib/meta";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/rbac";

/** Actions that apply to every checked ticket in the queue. */
export function BulkBar({
  count,
  meta,
  role,
  onClear,
  onAction,
}: {
  count: number;
  meta: WorkspaceMeta;
  role: Role;
  onClear: () => void;
  onAction: (action: string, value?: string | null) => void | Promise<void>;
}) {
  const [tagging, setTagging] = React.useState(false);
  const [tagValue, setTagValue] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent/50 px-3 py-2">
      <span className="text-xs font-medium">
        {count} selected
      </span>

      <select
        aria-label="Assign selected tickets"
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          void onAction("assign", e.target.value === "__none" ? null : e.target.value);
          e.target.value = "";
        }}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="" disabled>
          Assign to…
        </option>
        <option value="__none">Unassigned</option>
        {meta.agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Set status of selected tickets"
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          void onAction("status", e.target.value);
          e.target.value = "";
        }}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="" disabled>
          Status…
        </option>
        {TICKET_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <select
        aria-label="Set priority of selected tickets"
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          void onAction("priority", e.target.value);
          e.target.value = "";
        }}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="" disabled>
          Priority…
        </option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </select>

      {tagging ? (
        <span className="flex items-center gap-1">
          <Input
            list="bulk-tag-options"
            value={tagValue}
            onChange={(e) => setTagValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tagValue.trim()) {
                void onAction("tag", tagValue.trim());
                setTagValue("");
                setTagging(false);
              }
              if (e.key === "Escape") setTagging(false);
            }}
            placeholder="Tag name"
            aria-label="Tag to add"
            className="h-7 w-32 text-xs"
            autoFocus
          />
          <datalist id="bulk-tag-options">
            {meta.tags.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
          <Button
            size="sm"
            onClick={() => {
              if (!tagValue.trim()) return;
              void onAction("tag", tagValue.trim());
              setTagValue("");
              setTagging(false);
            }}
          >
            Add
          </Button>
        </span>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setTagging(true)}>
          <Tag /> Tag
        </Button>
      )}

      {can(role, "tickets.delete") &&
        (confirmDelete ? (
          <span className="flex items-center gap-1">
            <span className="text-xs text-destructive">Delete {count}?</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                void onAction("delete");
                setConfirmDelete(false);
              }}
            >
              Yes, delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </Button>
        ))}

      <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection" className="ml-auto">
        <X />
      </Button>
    </div>
  );
}
