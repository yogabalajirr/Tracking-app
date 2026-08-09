"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/constants";
import type { WorkspaceMeta } from "@/lib/meta";
import { Dialog } from "@/components/ui/dialog";

/** Agent-raised ticket, on behalf of a customer. */
export function NewTicketDialog({
  open,
  onClose,
  meta,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  meta: WorkspaceMeta;
  onCreated: (ticketId: string) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const form = new FormData(e.currentTarget);
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.get("subject"),
          body: form.get("body"),
          customerEmail: form.get("customerEmail"),
          customerName: form.get("customerName") || undefined,
          priority: form.get("priority"),
          assigneeId: form.get("assigneeId") || null,
          teamId: form.get("teamId") || null,
          tags,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (Array.isArray(data.details)) {
          const errs: Record<string, string> = {};
          for (const d of data.details) errs[d.field] = d.message;
          setFieldErrors(errs);
        }
        setFormError(data.error ?? "Couldn't create that ticket.");
        return;
      }

      toast.success(`Ticket #${data.ticket.number} created.`);
      onCreated(data.ticket.id);
    } catch {
      setFormError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New ticket" description="Raise a ticket on a customer's behalf.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer email" htmlFor="customerEmail" required error={fieldErrors.customerEmail}>
            <Input name="customerEmail" type="email" required placeholder="customer@example.com" />
          </Field>
          <Field label="Customer name" htmlFor="customerName" error={fieldErrors.customerName}>
            <Input name="customerName" placeholder="Optional" />
          </Field>
        </div>

        <Field label="Subject" htmlFor="subject" required error={fieldErrors.subject}>
          <Input name="subject" required placeholder="Short summary of the issue" />
        </Field>

        <Field label="Description" htmlFor="body" required error={fieldErrors.body}>
          <Textarea name="body" required rows={5} placeholder="What does the customer need?" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Priority" htmlFor="priority">
            <select
              name="priority"
              defaultValue="NORMAL"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assignee" htmlFor="assigneeId">
            <select
              name="assigneeId"
              defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Unassigned</option>
              {meta.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Team" htmlFor="teamId">
            <select
              name="teamId"
              defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">None</option>
              {meta.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tags" htmlFor="tags" hint="Comma-separated.">
          <Input name="tags" placeholder="billing, urgent" />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Create ticket
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
