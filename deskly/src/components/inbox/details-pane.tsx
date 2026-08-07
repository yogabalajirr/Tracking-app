"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Mail, Plus, Tag as TagIcon, X } from "lucide-react";
import { Avatar, Badge, Separator } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShortcut } from "@/components/shortcuts";
import {
  CHANNEL_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  TICKET_STATUSES,
} from "@/lib/constants";
import type { TicketDetail } from "@/lib/ticket-detail";
import type { WorkspaceMeta } from "@/lib/meta";
import { formatDuration } from "@/lib/utils";
import type { CurrentUser } from "./ticket-detail";
import { RelativeTime } from "./relative-time";

export function DetailsPane({
  ticket,
  meta,
  currentUser,
  onPatch,
  readOnly,
}: {
  ticket: TicketDetail;
  meta: WorkspaceMeta;
  currentUser: CurrentUser;
  onPatch: (body: Record<string, unknown>) => void | Promise<void>;
  readOnly: boolean;
}) {
  const [tagging, setTagging] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const assigneeRef = React.useRef<HTMLSelectElement>(null);
  const tagButtonRef = React.useRef<HTMLButtonElement>(null);

  useShortcut("a", () => assigneeRef.current?.focus(), { enabled: !readOnly });
  useShortcut("shift+#", () => setTagging(true), { enabled: !readOnly });
  useShortcut("#", () => setTagging(true), { enabled: !readOnly });

  function addTag(name: string) {
    const clean = name.trim().toLowerCase();
    if (!clean || ticket.tags.some((t) => t.name === clean)) {
      setTagDraft("");
      setTagging(false);
      return;
    }
    void onPatch({ tags: [...ticket.tags.map((t) => t.name), clean] });
    setTagDraft("");
    setTagging(false);
  }

  function removeTag(name: string) {
    void onPatch({ tags: ticket.tags.filter((t) => t.name !== name).map((t) => t.name) });
  }

  async function copyPortalLink() {
    await navigator.clipboard.writeText(ticket.portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5 p-4">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Customer
        </h2>
        <div className="flex items-center gap-2">
          <Avatar
            name={ticket.customer.name ?? ticket.customer.email}
            seed={ticket.customer.id}
            size={32}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {ticket.customer.name ?? ticket.customer.email}
            </p>
            <a
              href={`mailto:${ticket.customer.email}`}
              className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
            >
              <Mail className="size-3 shrink-0" />
              {ticket.customer.email}
            </a>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {ticket.customer.ticketCount} ticket{ticket.customer.ticketCount === 1 ? "" : "s"} ·
          first seen <RelativeTime value={ticket.customer.createdAt} />
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Properties
        </h2>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">Status</span>
          <select
            value={ticket.status}
            disabled={readOnly}
            onChange={(e) => void onPatch({ status: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {STATUS_HINTS[ticket.status]}
          </span>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">Priority</span>
          <select
            value={ticket.priority}
            disabled={readOnly}
            onChange={(e) => void onPatch({ priority: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">
            Assignee <kbd className="ml-1 font-mono opacity-60">A</kbd>
          </span>
          <select
            ref={assigneeRef}
            value={ticket.assignee?.id ?? ""}
            disabled={readOnly}
            onChange={(e) => void onPatch({ assigneeId: e.target.value || null })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
          >
            <option value="">Unassigned</option>
            {meta.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.id === currentUser.id ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>

        {!readOnly && ticket.assignee?.id !== currentUser.id && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void onPatch({ assigneeId: currentUser.id })}
          >
            Assign to me
          </Button>
        )}

        {meta.teams.length > 0 && (
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Team</span>
            <select
              value={ticket.team?.id ?? ""}
              disabled={readOnly}
              onChange={(e) => void onPatch({ teamId: e.target.value || null })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
            >
              <option value="">None</option>
              {meta.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <Separator />

      <section>
        <h2 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TagIcon className="size-3" /> Tags
          <kbd className="ml-auto font-mono normal-case opacity-60">#</kbd>
        </h2>

        <div className="flex flex-wrap gap-1">
          {ticket.tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
            >
              {tag.name}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeTag(tag.name)}
                  aria-label={`Remove tag ${tag.name}`}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}

          {ticket.tags.length === 0 && !tagging && (
            <span className="text-xs text-muted-foreground">No tags yet.</span>
          )}
        </div>

        {!readOnly &&
          (tagging ? (
            <div className="mt-2 flex gap-1">
              <Input
                list="detail-tag-options"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTag(tagDraft);
                  if (e.key === "Escape") {
                    setTagging(false);
                    setTagDraft("");
                  }
                }}
                onBlur={() => setTagging(false)}
                placeholder="Tag name"
                aria-label="New tag"
                className="h-7 text-xs"
                autoFocus
              />
              <datalist id="detail-tag-options">
                {meta.tags.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            </div>
          ) : (
            <Button
              ref={tagButtonRef}
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => setTagging(true)}
            >
              <Plus /> Add tag
            </Button>
          ))}
      </section>

      <Separator />

      <section className="space-y-1.5 text-xs">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          SLA
        </h2>
        <Row label="Target">{ticket.sla.label}</Row>
        <Row label="Due">
          {ticket.sla.dueAt ? (
            <span title={new Date(ticket.sla.dueAt).toLocaleString()}>
              {new Date(ticket.sla.dueAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : (
            "—"
          )}
        </Row>
        {ticket.slaPolicy && (
          <>
            <Row label="First response">{formatDuration(ticket.slaPolicy.firstResponseMinutes * 60_000)}</Row>
            <Row label="Resolution">{formatDuration(ticket.slaPolicy.resolutionMinutes * 60_000)}</Row>
          </>
        )}
        <Row label="First replied">
          {ticket.firstResponseAt ? <RelativeTime value={ticket.firstResponseAt} /> : "Not yet"}
        </Row>
      </section>

      <Separator />

      <section className="space-y-1.5 text-xs">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ticket
        </h2>
        <Row label="Number">#{ticket.number}</Row>
        <Row label="Channel">{CHANNEL_LABELS[ticket.channel]}</Row>
        <Row label="Created">
          <RelativeTime value={ticket.createdAt} />
        </Row>
        {ticket.resolvedAt && (
          <Row label="Resolved">
            <RelativeTime value={ticket.resolvedAt} />
          </Row>
        )}
        {ticket.aiCategory && <Row label="AI category">{ticket.aiCategory}</Row>}
      </section>

      <Separator />

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Customer portal
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          A signed link the customer can open without an account.
        </p>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={copyPortalLink}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button asChild variant="ghost" size="icon-sm" aria-label="Open portal view">
            <a href={ticket.portalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
