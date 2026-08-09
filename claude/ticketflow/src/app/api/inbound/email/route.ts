import { json, withPublic } from "@/lib/api";
import { prisma, tenantDb } from "@/lib/db";
import { env } from "@/lib/env";
import {
  normaliseSubject,
  parseInboundEmail,
  subdomainFromRecipient,
  ticketIdFromMessageId,
  ticketNumberFromSubject,
} from "@/lib/email/inbound";
import { sendTicketReceipt } from "@/lib/email/send";
import { storeAttachment } from "@/lib/storage";
import { htmlToText, stripQuotedReply } from "@/lib/sanitize";
import { addMessage, createTicket } from "@/lib/tickets";

export const runtime = "nodejs";

/**
 * POST /api/inbound/email — webhook for Postmark, SendGrid Inbound Parse or
 * Resend.
 *
 * Threading strategy, most reliable first:
 *   1. our own Message-ID echoed back in In-Reply-To / References — these embed
 *      the ticket id, so they survive subject edits;
 *   2. a `[#42]` marker in the subject;
 *   3. otherwise a new ticket.
 *
 * Authentication is a shared secret (`?secret=` or `X-TicketFlow-Secret`), because
 * the providers differ too much on signature schemes to support all three.
 */
export const POST = withPublic(
  { name: "inbound-email", limit: 120, windowMs: 60_000 },
  async (req) => {
    const url = new URL(req.url);
    const provided = url.searchParams.get("secret") ?? req.headers.get("x-ticketflow-secret");

    if (provided !== env().INBOUND_WEBHOOK_SECRET) {
      return json({ error: "Invalid webhook secret." }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Webhook body must be JSON." }, { status: 400 });
    }

    const email = parseInboundEmail(payload);
    if (!email || !email.from) {
      return json({ error: "Unrecognised inbound email payload." }, { status: 422 });
    }

    // --- which workspace? ---
    const subdomain = subdomainFromRecipient(email.to, env().EMAIL_DOMAIN);
    if (!subdomain) {
      return json(
        {
          error: `No workspace could be resolved from ${email.to.join(", ") || "(no recipient)"}.`,
        },
        { status: 404 },
      );
    }

    const workspace = await prisma.workspace.findUnique({
      where: { subdomain },
      select: { id: true },
    });
    if (!workspace) {
      return json({ error: `No workspace with subdomain "${subdomain}".` }, { status: 404 });
    }

    const db = tenantDb(workspace.id);

    // Providers retry; ignore a Message-ID we have already stored.
    if (email.messageId) {
      const seen = await db.message.findFirst({
        where: { emailMessageId: email.messageId },
        select: { id: true, ticketId: true },
      });
      if (seen) {
        return json({ ok: true, duplicate: true, ticketId: seen.ticketId });
      }
    }

    // --- body ---
    const rawText = email.text || (email.html ? htmlToText(email.html) : "");
    const body = stripQuotedReply(rawText) || "(empty message)";

    // --- attachments ---
    const attachments = [];
    for (const file of email.attachments) {
      try {
        const stored = await storeAttachment({
          workspaceId: workspace.id,
          filename: file.filename,
          mimeType: file.contentType,
          content: Buffer.from(file.contentBase64, "base64"),
        });
        attachments.push(stored);
      } catch (err) {
        // A rejected attachment must not lose the message it came with.
        console.warn("[inbound] attachment rejected:", (err as Error).message);
      }
    }

    // --- existing ticket? ---
    const candidates = [email.inReplyTo, ...email.references.slice().reverse()];
    let ticketId: string | null = null;

    for (const candidate of candidates) {
      const id = ticketIdFromMessageId(candidate, env().EMAIL_DOMAIN);
      if (!id) continue;
      const found = await db.ticket.findUnique({ where: { id }, select: { id: true } });
      if (found) {
        ticketId = found.id;
        break;
      }
    }

    if (!ticketId) {
      const number = ticketNumberFromSubject(email.subject);
      if (number !== null) {
        const found = await db.ticket.findUnique({
          where: { workspaceId_number: { workspaceId: workspace.id, number } },
          select: { id: true, customer: { select: { email: true } } },
        });
        // Only thread by subject when the sender matches — otherwise anyone
        // could inject a message into someone else's ticket by guessing "#42".
        if (found && found.customer.email === email.from) ticketId = found.id;
      }
    }

    if (ticketId) {
      const { message } = await addMessage({
        workspaceId: workspace.id,
        ticketId,
        authorType: "CUSTOMER",
        authorName: email.fromName ?? email.from,
        body,
        bodyHtml: email.html,
        emailMessageId: email.messageId,
        emailInReplyTo: email.inReplyTo,
        emailReferences: email.references.join(" ") || null,
        attachments,
      });

      return json({ ok: true, ticketId, messageId: message.id, threaded: true });
    }

    // --- new ticket ---
    const ticket = await createTicket({
      workspaceId: workspace.id,
      subject: normaliseSubject(email.subject) || "(no subject)",
      body,
      bodyHtml: email.html,
      channel: "EMAIL",
      customer: { email: email.from, name: email.fromName },
      emailMessageId: email.messageId,
      emailInReplyTo: email.inReplyTo,
      emailReferences: email.references.join(" ") || null,
      attachments,
    });

    // Acknowledge receipt so the customer has a ticket number immediately.
    await sendTicketReceipt({ workspaceId: workspace.id, ticketId: ticket.id }).catch(
      (err) => console.error("[inbound] receipt failed", err),
    );

    return json(
      { ok: true, ticketId: ticket.id, number: ticket.number, created: true },
      { status: 201 },
    );
  },
);
