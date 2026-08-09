"use client";

import * as React from "react";
import { CheckCircle2, Headset, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Avatar, Badge } from "@/components/ui/primitives";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import type { AuthorType, TicketStatus } from "@/generated/prisma/enums";

type PortalMessage = {
  id: string;
  authorType: AuthorType;
  authorName: string | null;
  body: string;
  bodyHtml: string | null;
  createdAt: string;
  attachments: { id: string; url: string; filename: string; mimeType: string; size: number }[];
};

export function PortalTicket({
  workspace,
  ticket,
  token,
}: {
  workspace: { name: string; brandColor: string | null; logoUrl: string | null };
  ticket: {
    id: string;
    number: number;
    subject: string;
    status: TicketStatus;
    createdAt: string;
    customerName: string | null;
    messages: PortalMessage[];
  };
  token: string;
}) {
  const [messages, setMessages] = React.useState(ticket.messages);
  const [status, setStatus] = React.useState(ticket.status);
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal/ticket/${ticket.id}/reply?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim() }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "We couldn't send that. Please try again.");
        return;
      }

      setMessages((prev) => [...prev, data.message]);
      setStatus(data.status);
      setBody("");
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch {
      setError("Network problem — please try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  const accent = workspace.brandColor ?? "#1e1e1e";

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <span
            className="grid size-8 place-items-center rounded-md text-white"
            style={{ backgroundColor: accent }}
          >
            <Headset className="size-4" />
          </span>
          <span className="font-semibold">{workspace.name}</span>
          <span className="ml-auto text-sm text-muted-foreground">Support</span>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{ticket.subject}</h1>
            <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Ticket #{ticket.number} · opened{" "}
            {new Date(ticket.createdAt).toLocaleDateString(undefined, {
              dateStyle: "long",
            })}
          </p>
        </div>

        <ol className="space-y-3">
          {messages.map((message) => {
            const fromUs = message.authorType !== "CUSTOMER";
            return (
              <li
                key={message.id}
                className={
                  fromUs
                    ? "rounded-lg border border-border bg-card p-4"
                    : "rounded-lg border border-border bg-muted/40 p-4"
                }
              >
                <div className="mb-2 flex items-center gap-2">
                  <Avatar
                    name={message.authorName ?? (fromUs ? workspace.name : "You")}
                    seed={message.authorName ?? "x"}
                    size={22}
                  />
                  <span className="text-sm font-medium">
                    {fromUs ? (message.authorName ?? workspace.name) : "You"}
                  </span>
                  <time
                    dateTime={message.createdAt}
                    className="ml-auto text-xs text-muted-foreground"
                  >
                    {new Date(message.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </div>

                {message.bodyHtml ? (
                  <div
                    className="text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_p]:my-2"
                    // Sanitised on the server before storage.
                    dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                )}

                {message.attachments.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {message.attachments.map((a) => (
                      <li key={a.id}>
                        <a
                          href={`${a.url}?ticket=${ticket.id}&token=${encodeURIComponent(token)}`}
                          download={a.filename}
                          className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                        >
                          <Paperclip className="size-3" />
                          {a.filename}
                          <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>

        <form onSubmit={submit} className="space-y-2 rounded-lg border border-border p-4">
          <label htmlFor="portal-reply" className="block text-sm font-medium">
            Add a reply
          </label>

          {status === "RESOLVED" || status === "CLOSED" ? (
            <p className="text-xs text-muted-foreground">
              This ticket is marked {STATUS_LABELS[status].toLowerCase()}. Replying will
              reopen it.
            </p>
          ) : null}

          <Textarea
            id="portal-reply"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            required
            placeholder="Tell us more…"
          />

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" loading={sending} disabled={!body.trim()}>
              <Send /> Send reply
            </Button>
            {sent && (
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle2 className="size-4" /> Sent — we&apos;ll be in touch.
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            You can also simply reply to any of our emails and it will land here.
          </p>
        </form>
      </main>

      <footer className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        Powered by Deskly
      </footer>
    </div>
  );
}
